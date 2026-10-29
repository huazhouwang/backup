package com.x0finch.q5home

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * 应用内更新：从 GitHub Releases（x0finch/audi-q5-launcher）检查新版本，下载 APK 并安装。
 *
 * Release 的 tag 是 v1.0.<提交数>（回退发布是 v1.0.<提交数>.<n>），换算成 versionCode 比大小就知道新旧。
 * 安装前校验：GitHub 给的 sha256、包名一致、版本号更大；签名不一致系统也会拒绝安装。
 */
class Updates(private val context: Context, private val apiUrl: String = DEFAULT_API) {

    class Release(
        val versionCode: Long,
        val versionName: String,
        val notes: String,
        val apkUrl: String,
        val apkSize: Long,
        val sha256: String?,
        val publishedAt: String,
    ) {
        fun toJson(): JSONObject = JSONObject()
            .put("versionCode", versionCode).put("versionName", versionName).put("notes", notes)
            .put("apkUrl", apkUrl).put("apkSize", apkSize).put("sha256", sha256 ?: JSONObject.NULL)
            .put("publishedAt", publishedAt)

        companion object {
            fun fromJson(o: JSONObject) = Release(
                o.getLong("versionCode"), o.getString("versionName"), o.optString("notes"),
                o.getString("apkUrl"), o.optLong("apkSize"), o.optString("sha256").ifBlank { null }
                    ?.takeIf { it != "null" }, o.optString("publishedAt"),
            )
        }
    }

    private val prefs = context.getSharedPreferences("updates", Context.MODE_PRIVATE)

    val currentVersionCode: Long
        get() = context.packageManager.getPackageInfo(context.packageName, 0).versionCodeCompat
    val currentVersionName: String
        get() = context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: ""

    /** 上次检查到的最新 Release（没有发布过、或还没检查过为 null）。 */
    val latest: Release?
        get() = prefs.getString(KEY_LATEST, null)?.let { runCatching { Release.fromJson(JSONObject(it)) }.getOrNull() }
    val lastCheckedAt: Long get() = prefs.getLong(KEY_CHECKED_AT, 0)
    val lastError: String? get() = prefs.getString(KEY_ERROR, null)
    var autoCheck: Boolean
        get() = prefs.getBoolean(KEY_AUTO, true)
        set(value) = prefs.edit().putBoolean(KEY_AUTO, value).apply()

    val hasUpdate: Boolean get() = (latest?.versionCode ?: 0) > currentVersionCode

    /** 联网检查一次并记下结果。在后台线程调用。 */
    fun check(): Release? {
        return try {
            val release = fetchLatest()
            prefs.edit()
                .putString(KEY_LATEST, release?.toJson()?.toString())
                .putLong(KEY_CHECKED_AT, System.currentTimeMillis())
                .remove(KEY_ERROR)
                .apply()
            release
        } catch (e: Exception) {
            prefs.edit().putLong(KEY_CHECKED_AT, System.currentTimeMillis())
                .putString(KEY_ERROR, e.message ?: e.toString()).apply()
            throw e
        }
    }

    /** 读 GitHub 的 latest release；没有发布过返回 null。 */
    fun fetchLatest(): Release? {
        val conn = open(apiUrl).apply { setRequestProperty("Accept", "application/vnd.github+json") }
        try {
            if (conn.responseCode == 404) return null
            if (conn.responseCode !in 200..299) throw IOException("GitHub 返回 HTTP ${conn.responseCode}")
            return parse(conn.inputStream.bufferedReader().use { it.readText() })
        } finally {
            conn.disconnect()
        }
    }

    /** 下载 APK（显示进度），校验 sha256。在后台线程调用。 */
    fun download(release: Release, onProgress: (Int) -> Unit = {}): File {
        if (release.apkSize > MAX_APK_BYTES) throw IOException("安装包太大：${release.apkSize} 字节")
        val dir = File(context.cacheDir, "updates").apply { mkdirs() }
        dir.listFiles()?.forEach { it.delete() } // 只留这一份
        val target = File(dir, "q5home-${release.versionName}.apk")
        val digest = MessageDigest.getInstance("SHA-256")
        val conn = open(release.apkUrl)
        try {
            if (conn.responseCode !in 200..299) throw IOException("下载失败：HTTP ${conn.responseCode}")
            val total = conn.contentLengthLong.takeIf { it > 0 } ?: release.apkSize
            conn.inputStream.use { input ->
                target.outputStream().use { out ->
                    val buf = ByteArray(32 * 1024)
                    var done = 0L
                    var lastPercent = -1
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        done += n
                        if (done > MAX_APK_BYTES) throw IOException("安装包太大")
                        out.write(buf, 0, n)
                        digest.update(buf, 0, n)
                        if (total > 0) {
                            val p = (done * 100 / total).toInt().coerceAtMost(100)
                            if (p != lastPercent) { lastPercent = p; onProgress(p) }
                        }
                    }
                }
            }
        } catch (e: Exception) {
            target.delete()
            throw e
        } finally {
            conn.disconnect()
        }
        release.sha256?.let { expected ->
            val actual = digest.digest().joinToString("") { "%02x".format(it) }
            if (!actual.equals(expected, ignoreCase = true)) {
                target.delete()
                throw IOException("校验失败：文件不完整或被篡改")
            }
        }
        return target
    }

    /** 安装前再确认：是本应用、版本更新。 */
    fun verify(apk: File): String? {
        val info = context.packageManager.getPackageArchiveInfo(apk.path, 0) ?: return "不是有效的安装包"
        if (info.packageName != context.packageName) return "安装包不是 Q5 Home（${info.packageName}）"
        if (info.versionCodeCompat <= currentVersionCode) return "安装包版本不比当前新"
        return null
    }

    /** 交给系统安装（会弹出系统的确认界面）；结果由 [InstallReceiver] 接收。 */
    fun install(apk: File) {
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(context.packageName)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        }
        val id = installer.createSession(params)
        installer.openSession(id).use { session ->
            session.openWrite("q5home.apk", 0, apk.length()).use { out ->
                apk.inputStream().use { it.copyTo(out) }
                session.fsync(out)
            }
            val intent = Intent(context, InstallReceiver::class.java)
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
            session.commit(PendingIntent.getBroadcast(context, id, intent, flags).intentSender)
        }
    }

    fun recordInstallError(message: String) = prefs.edit().putString(KEY_ERROR, message).apply()

    private fun open(url: String): HttpURLConnection =
        (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 30_000
            instanceFollowRedirects = true
            setRequestProperty("User-Agent", "q5home")
        }

    companion object {
        const val REPO = "x0finch/audi-q5-launcher"
        const val DEFAULT_API = "https://api.github.com/repos/$REPO/releases/latest"
        const val MAX_APK_BYTES = 50L * 1024 * 1024
        private const val KEY_LATEST = "latest"
        private const val KEY_CHECKED_AT = "checked_at"
        private const val KEY_ERROR = "error"
        private const val KEY_AUTO = "auto_check"

        /**
         * tag → versionCode：v1.0.57 → 570；回退发布 v1.0.57.1 → 571（和 app/build.gradle 的规则一致）。
         */
        fun versionCodeOf(tag: String): Long? {
            val parts = tag.removePrefix("v").split('.')
            val count = parts.getOrNull(2)?.toLongOrNull() ?: return null
            val patch = parts.getOrNull(3)?.toLongOrNull() ?: 0
            if (patch !in 0..9) return null
            return count * 10 + patch
        }

        /** 解析 GitHub release JSON；没有 APK 附件返回 null。 */
        fun parse(json: String): Release? {
            val o = JSONObject(json)
            val tag = o.getString("tag_name").removePrefix("v")
            val code = versionCodeOf(tag) ?: return null
            val assets = o.optJSONArray("assets") ?: return null
            for (i in 0 until assets.length()) {
                val a = assets.getJSONObject(i)
                if (!a.getString("name").endsWith(".apk")) continue
                return Release(
                    versionCode = code,
                    versionName = tag,
                    notes = o.optString("body").trim(),
                    apkUrl = a.getString("browser_download_url"),
                    apkSize = a.optLong("size"),
                    sha256 = a.optString("digest").takeIf { it.startsWith("sha256:") }?.removePrefix("sha256:"),
                    publishedAt = o.optString("published_at"),
                )
            }
            return null
        }
    }
}

/** versionCode：安卓 9 起是 long，之前是 int（minSdk 26 要兼容）。 */
private val android.content.pm.PackageInfo.versionCodeCompat: Long
    get() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) longVersionCode
    else @Suppress("DEPRECATION") versionCode.toLong()

/** 接收系统安装结果：需要用户确认时弹出系统确认界面；失败时记下原因，设置页会显示。 */
class InstallReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT) ?: return
                context.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
            PackageInstaller.STATUS_SUCCESS -> Unit // 新版本会重新启动桌面
            else -> Updates(context).recordInstallError(
                "安装失败：" + (intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "未知原因"))
        }
    }
}

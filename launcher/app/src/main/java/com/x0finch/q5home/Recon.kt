package com.x0finch.q5home

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import java.io.File
import java.net.InetSocketAddress
import java.net.Socket
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 车机摸底（只读，不改车机任何状态）：在车上直接查 tools/recon.sh 要查的东西，不需要 adb。
 *  - 系统信息、调试 / root 线索（构建类型、su 文件、adb 端口）；
 *  - 桌面、CarPlay、原车画面的候选组件；
 *  - 厂商应用（非 AOSP / Google）的入口、导出的 Activity 和广播接收器，用来找原车切换方式和隐藏的工厂 / USB 页面；
 *  - 其余应用只列包名。
 */
object Recon {

    /** 一个可以从桌面直接打开的组件（候选的原车 / CarPlay / 调试页面）。 */
    data class Candidate(val kind: String, val label: String, val spec: String)

    data class Report(
        val markdown: String,
        /** 设置页上显示的几行要点：(标题, 内容)。 */
        val facts: List<Pair<String, String>>,
        val candidates: List<Candidate>,
        val title: String,
    )

    private val SU_PATHS = listOf(
        "/system/bin/su", "/system/xbin/su", "/sbin/su", "/system/sbin/su", "/vendor/bin/su",
        "/su/bin/su", "/data/local/xbin/su", "/data/local/bin/su", "/system/app/Superuser.apk",
    )
    private val PROPS = listOf(
        "ro.build.type", "ro.debuggable", "ro.secure", "ro.adb.secure", "ro.boot.selinux",
        "service.adb.tcp.port", "persist.adb.tcp.port", "persist.sys.usb.config", "sys.usb.config", "sys.usb.state",
        "ro.board.platform", "ro.hardware", "ro.product.board", "ro.soc.model", "ro.product.cpu.abi",
        "ro.build.display.id", "ro.build.version.incremental", "ro.build.date",
    )
    private val AOSP_PREFIXES = listOf("android", "com.android.", "com.google.", "androidx.")
    /** 名字像调试 / 工厂 / USB 设置的组件，可能是被隐藏的开关。 */
    private val DEBUG_WORDS = Regex("adb|usb|debug|develop|factory|engineer|wireless|otg|工厂|调试", RegexOption.IGNORE_CASE)
    private val OEM_WORDS = Regex("原车|原厂|oem|origin|mmi|canbus|can_|carinfo|avm|camera|reverse|aux", RegexOption.IGNORE_CASE)
    private val CARPLAY_WORDS = Regex("zlink|carplay|diplay|autokit|carlink|androidauto", RegexOption.IGNORE_CASE)
    private const val PER_PACKAGE_LIMIT = 40
    /** 要读 APK 字符串的厂商应用（除了所有桌面应用）。 */
    private val DIG_PACKAGES = Regex("\\.main$|mainui|black|carmanager|canbus|\\.oem|avin")
    private const val DIG_LIMIT = 250

    fun collect(context: Context, ports: List<Int> = listOf(5555)): Report {
        val pm = context.packageManager
        val props = PROPS.associateWith { prop(it) }
        val md = StringBuilder()
        val candidates = mutableListOf<Candidate>()
        val now = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).format(Date())
        val version = runCatching { pm.getPackageInfo(context.packageName, 0).versionName }.getOrNull() ?: "?"

        md.appendLine("<!-- q5home-recon v1 -->")
        md.appendLine("由 Q5 Home $version 在车上生成（$now），只读，没有改动车机。")
        md.appendLine()

        // ---- 系统 ----
        md.appendLine("## 系统")
        md.appendLine("| 项 | 值 |")
        md.appendLine("|---|---|")
        listOf(
            "厂商 / 型号" to "${Build.MANUFACTURER} / ${Build.MODEL}",
            "品牌 / 设备 / 产品" to "${Build.BRAND} / ${Build.DEVICE} / ${Build.PRODUCT}",
            "硬件 / 主板" to "${Build.HARDWARE} / ${Build.BOARD}",
            "安卓" to "${Build.VERSION.RELEASE}（API ${Build.VERSION.SDK_INT}${realVersionNote()}），安全补丁 ${Build.VERSION.SECURITY_PATCH}",
            "构建" to "${Build.DISPLAY} · ${Build.TYPE} · ${Build.TAGS}",
            "Fingerprint" to Build.FINGERPRINT,
        ).forEach { (k, v) -> md.appendLine("| $k | ${cell(v)} |") }
        props.forEach { (k, v) -> md.appendLine("| `$k` | ${cell(v.ifEmpty { "—" })} |") }
        md.appendLine()

        // ---- 调试 / root 线索 ----
        val su = SU_PATHS.filter { runCatching { File(it).exists() }.getOrDefault(false) }
        val adbPorts = (ports + listOfNotNull(props["service.adb.tcp.port"]?.toIntOrNull(), props["persist.adb.tcp.port"]?.toIntOrNull()))
            .filter { it in 1..65535 }.distinct()
        val portState = adbPorts.associateWith { probe(it) }
        val usbDebug = DebugAccess.usbDebuggingOn(context)
        val wifiDebug = DebugAccess.wirelessDebuggingOn(context)
        val devOptions = Settings.Global.getInt(context.contentResolver, Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0) == 1
        md.appendLine("## 调试 / root 线索")
        md.appendLine("- 开发者选项：${onOff(devOptions)}；USB 调试：${onOff(usbDebug)}；无线调试：${onOff(wifiDebug)}")
        md.appendLine("- 构建类型 `${Build.TYPE}`，ro.debuggable=`${props["ro.debuggable"].orEmpty()}`，ro.secure=`${props["ro.secure"].orEmpty()}`")
        md.appendLine("- su 文件：${if (su.isEmpty()) "没找到" else su.joinToString { "`$it`" }}")
        md.appendLine("- 本机 adb 端口：" + portState.entries.joinToString { (p, open) -> "$p ${if (open) "在监听" else "没监听"}" })
        md.appendLine("- 本机 IP：${DebugAccess.ipAddress(context) ?: "未联网"}")
        md.appendLine()

        // ---- 桌面 ----
        val homes = pm.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), 0)
        md.appendLine("## 桌面（HOME）")
        md.appendLine("当前默认：${HomeRole.currentHomeLabel(context) ?: "没有固定"}")
        homes.forEach { md.appendLine("- ${cell(it.loadLabel(pm).toString())} `${it.activityInfo.packageName}/${it.activityInfo.name}`") }
        md.appendLine()

        // ---- 应用 ----
        val packages = installedPackages(pm)
        val (vendor, aosp) = packages.partition { p -> AOSP_PREFIXES.none { p.packageName == it || p.packageName.startsWith(it) } }
        val launchable = Targets.launchableApps(context).groupBy { it.activityInfo.packageName }

        md.appendLine("## 厂商应用（${vendor.size} 个）")
        md.appendLine("格式：名称 `包名` 版本 · 系统/用户 · 启用/停用。入口 = 桌面图标；Activity / 广播 = 导出的组件（可从外部打开）。")
        md.appendLine()
        for (p in vendor.sortedBy { it.packageName }) {
            val app = p.applicationInfo
            val label = app?.loadLabel(pm)?.toString() ?: p.packageName
            val system = app != null && app.flags and ApplicationInfo.FLAG_SYSTEM != 0
            val enabled = app?.enabled ?: true
            md.appendLine("### ${cell(label)} `${p.packageName}`")
            md.appendLine("${p.versionName ?: "?"} · ${if (system) "系统" else "用户"} · ${if (enabled) "启用" else "已停用"}")
            launchable[p.packageName]?.forEach { md.appendLine("- 入口：`${it.activityInfo.name}`") }
            val activities = p.activities.orEmpty().filter { it.exported }
            activities.take(PER_PACKAGE_LIMIT).forEach { md.appendLine("- Activity：`${it.name}`") }
            if (activities.size > PER_PACKAGE_LIMIT) md.appendLine("- …还有 ${activities.size - PER_PACKAGE_LIMIT} 个 Activity")
            val receivers = p.receivers.orEmpty().filter { it.exported }
            receivers.take(PER_PACKAGE_LIMIT).forEach { md.appendLine("- 广播：`${it.name}`") }
            if (receivers.size > PER_PACKAGE_LIMIT) md.appendLine("- …还有 ${receivers.size - PER_PACKAGE_LIMIT} 个广播接收器")
            md.appendLine()

            val text = "$label ${p.packageName}"
            if (enabled) {
                launchable[p.packageName]?.forEach { info ->
                    val spec = Targets.specOf(info)
                    when {
                        CARPLAY_WORDS.containsMatchIn(text) -> candidates += Candidate("CarPlay", label, spec)
                        OEM_WORDS.containsMatchIn(text) -> candidates += Candidate("原车", label, spec)
                    }
                }
                activities.filter { DEBUG_WORDS.containsMatchIn(it.name) }.take(10).forEach {
                    candidates += Candidate("调试", label, "${p.packageName}/${it.name}")
                }
            }
        }

        // 关键厂商应用（原厂桌面、main / mainui / black / carmanager / canbus）APK 里的字符串常量：
        // 切原车画面多半是发广播或给 MCU 发指令，名字就在代码常量里。只读 APK 文件，不运行任何东西。
        val homePackages = homes.map { it.activityInfo.packageName }.toSet()
        val dig = vendor.filter { p ->
            p.packageName != context.packageName && p.applicationInfo?.sourceDir != null &&
                (p.packageName in homePackages || DIG_PACKAGES.containsMatchIn(p.packageName))
        }.sortedBy { it.packageName }
        md.appendLine("## 关键厂商应用里的字符串（找原车切换方式，${dig.size} 个应用）")
        md.appendLine("从 APK 代码里挑出像广播动作、或含 原车 / oem / avin / canbus 等字样的常量。")
        md.appendLine()
        for (p in dig) {
            val apk = File(p.applicationInfo!!.sourceDir)
            val strings = ApkStrings.fromApk(apk, limit = DIG_LIMIT)
            md.appendLine("### `${p.packageName}`（${apk.length() / 1024} KB，${strings.size} 条）")
            if (strings.isEmpty()) md.appendLine("（没读到，或没有匹配的字符串）")
            else md.appendLine(strings.joinToString("\n") { "- `$it`" })
            md.appendLine()
        }

        // 系统设置里名字和 USB / adb / 开发者有关的页面（WY 可能只是把入口藏了）。
        val settings = packages.firstOrNull { it.packageName == "com.android.settings" }
        val settingsHits = settings?.activities.orEmpty().filter { it.exported && DEBUG_WORDS.containsMatchIn(it.name) }
        md.appendLine("## 系统设置里和调试有关的页面（${settingsHits.size} 个）")
        settingsHits.forEach {
            md.appendLine("- `${it.name}`")
            candidates += Candidate("调试", "设置 · ${it.name.substringAfterLast('.').substringAfterLast('$')}",
                "com.android.settings/${it.name}")
        }
        md.appendLine()

        md.appendLine("## AOSP / Google 应用（${aosp.size} 个，只列包名，* = 已停用）")
        md.appendLine(aosp.sortedBy { it.packageName }.joinToString(" ") { p ->
            "`${p.packageName}`" + if (p.applicationInfo?.enabled == false) "*" else ""
        })

        val facts = listOf(
            "车机" to "${Build.MANUFACTURER} ${Build.MODEL} · ${Build.HARDWARE} · ${props["ro.board.platform"].orEmpty().ifEmpty { "?" }}",
            "系统" to "Android ${Build.VERSION.RELEASE}${realVersionNote()} · ${Build.TYPE} · ${Build.TAGS} · debuggable=${props["ro.debuggable"].orEmpty().ifEmpty { "?" }}",
            "root 线索（su 文件）" to su.ifEmpty { listOf("没找到") }.joinToString(),
            "adb" to "USB 调试 ${onOff(usbDebug)} · 无线调试 ${onOff(wifiDebug)} · " +
                portState.entries.joinToString { "端口 ${it.key} ${if (it.value) "在监听" else "没监听"}" },
            "应用" to "厂商 ${vendor.size} 个 · AOSP / Google ${aosp.size} 个",
        )

        return Report(md.toString(), facts, candidates.distinctBy { it.spec },
            "车机摸底 ${Build.MANUFACTURER} ${Build.MODEL} $now")
    }

    private fun installedPackages(pm: PackageManager): List<PackageInfo> {
        val flags = PackageManager.GET_ACTIVITIES or PackageManager.GET_RECEIVERS or PackageManager.MATCH_DISABLED_COMPONENTS
        // 一次全取可能超过 Binder 上限（应用很多时），失败就逐个取。
        return runCatching { pm.getInstalledPackages(flags) }.getOrElse {
            pm.getInstalledPackages(PackageManager.MATCH_DISABLED_COMPONENTS).map { p ->
                runCatching { pm.getPackageInfo(p.packageName, flags) }.getOrDefault(p)
            }
        }
    }

    /** 读系统属性（隐藏 API，读不到返回空字符串）。 */
    @SuppressLint("PrivateApi")
    fun prop(name: String): String = runCatching {
        Class.forName("android.os.SystemProperties").getMethod("get", String::class.java).invoke(null, name) as String
    }.getOrDefault("")

    /** 本机端口是否在监听（只尝试连接，马上断开）。 */
    fun probe(port: Int, timeoutMs: Int = 300): Boolean = runCatching {
        Socket().use { it.connect(InetSocketAddress("127.0.0.1", port), timeoutMs) }
    }.isSuccess

    /** 固件改过版本号时（比如写 12、实际 API 27）注明真实版本。 */
    private fun realVersionNote(): String {
        val real = DebugAccess.realAndroidVersion()
        return if (Build.VERSION.RELEASE.substringBefore('.') == real.substringBefore('.')) "" else "，实际是安卓 $real"
    }

    private fun onOff(on: Boolean) = if (on) "开" else "关"

    private fun cell(s: String) = s.replace("|", "\\|").replace("\n", " ")
}

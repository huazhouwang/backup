package com.x0finch.q5home

import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import android.graphics.drawable.Drawable

/**
 * 磁贴指向的目标，用一个字符串描述（方便写进 config.json）：
 *  - `包名`                       启动该应用的默认入口
 *  - `包名/类名` 或 `包名/.类名`   启动指定 Activity（原车切换可能不是普通入口）
 *  - `action:ACTION`              按 action 启动 Activity
 *  - `broadcast:ACTION[@包名]`    发广播（有的固件用广播切换原车画面）
 */
object Targets {

    /** 已知的 CarPlay 应用包名，按优先级排列。 */
    private val CARPLAY_PACKAGES = listOf(
        "com.zjinnova.zlink",
        "com.zjinnova.zlink5",
        "com.carconnect5.connect",
        "com.shihab.diplay",
    )
    private val CARPLAY_KEYWORDS = listOf("zlink", "carplay", "diplay", "autokit", "carlink")
    private val OEM_KEYWORDS = listOf("原车", "原厂", "oem", "original")

    fun intentFor(context: Context, spec: String?): Intent? {
        if (spec.isNullOrBlank()) return null
        if (spec.startsWith("action:")) return Intent(spec.removePrefix("action:"))
        if (spec.startsWith("broadcast:")) return null
        val slash = spec.indexOf('/')
        if (slash > 0) {
            val pkg = spec.substring(0, slash)
            var cls = spec.substring(slash + 1)
            if (cls.startsWith(".")) cls = pkg + cls
            return Intent(Intent.ACTION_MAIN).setComponent(ComponentName(pkg, cls))
        }
        return context.packageManager.getLaunchIntentForPackage(spec)
    }

    fun packageOf(spec: String?): String? {
        if (spec.isNullOrBlank()) return null
        if (spec.startsWith("action:")) return null
        if (spec.startsWith("broadcast:")) return spec.substringAfter('@', "").ifEmpty { null }
        return spec.substringBefore('/')
    }

    fun isAvailable(context: Context, spec: String?): Boolean {
        if (spec.isNullOrBlank()) return false
        if (spec.startsWith("broadcast:")) return true
        val intent = intentFor(context, spec) ?: return false
        return context.packageManager.resolveActivity(intent, 0) != null
    }

    fun launch(context: Context, spec: String?): Boolean {
        if (spec.isNullOrBlank()) return false
        return try {
            if (spec.startsWith("broadcast:")) {
                val body = spec.removePrefix("broadcast:")
                val intent = Intent(body.substringBefore('@'))
                body.substringAfter('@', "").takeIf { it.isNotEmpty() }?.let { intent.setPackage(it) }
                context.sendBroadcast(intent)
                return true
            }
            val intent = intentFor(context, spec) ?: return false
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
            context.startActivity(intent)
            true
        } catch (e: ActivityNotFoundException) {
            false
        } catch (e: SecurityException) {
            false
        }
    }

    fun icon(context: Context, spec: String?): Drawable? {
        val pm = context.packageManager
        val intent = intentFor(context, spec)
        return try {
            when {
                intent?.component != null -> pm.getActivityIcon(intent.component!!)
                packageOf(spec) != null -> pm.getApplicationIcon(packageOf(spec)!!)
                else -> null
            }
        } catch (e: PackageManager.NameNotFoundException) {
            null
        }
    }

    fun label(context: Context, spec: String?): String? {
        val pm = context.packageManager
        val intent = intentFor(context, spec)
        return try {
            val info = intent?.let { pm.resolveActivity(it, 0) }
            when {
                info != null -> info.loadLabel(pm).toString()
                packageOf(spec) != null ->
                    pm.getApplicationLabel(pm.getApplicationInfo(packageOf(spec)!!, 0)).toString()
                else -> null
            }
        } catch (e: PackageManager.NameNotFoundException) {
            null
        }
    }

    /** 车机上所有能从桌面启动的应用（不含本桌面），按名称排序。 */
    fun launchableApps(context: Context): List<ResolveInfo> {
        val pm = context.packageManager
        val main = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        return pm.queryIntentActivities(main, 0)
            .filter { it.activityInfo.packageName != context.packageName }
            .sortedBy { it.loadLabel(pm).toString().lowercase() }
    }

    fun specOf(info: ResolveInfo): String =
        "${info.activityInfo.packageName}/${info.activityInfo.name}"

    /** 自动找 CarPlay 应用：先按已知包名，再按名称关键词。 */
    fun findCarPlay(context: Context): String? {
        CARPLAY_PACKAGES.firstOrNull { isAvailable(context, it) }?.let { return it }
        return findByKeywords(context, CARPLAY_KEYWORDS)
    }

    /** 自动找原车应用：按名称关键词。找不到时由用户长按指定，或用 config.json 配置。 */
    fun findOem(context: Context): String? = findByKeywords(context, OEM_KEYWORDS)

    private fun findByKeywords(context: Context, keywords: List<String>): String? {
        val pm = context.packageManager
        return launchableApps(context).firstOrNull { info ->
            val label = info.loadLabel(pm).toString().lowercase()
            val pkg = info.activityInfo.packageName.lowercase()
            keywords.any { label.contains(it) || pkg.contains(it) }
        }?.let { specOf(it) }
    }
}

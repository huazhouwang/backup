package com.x0finch.q5home

import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings

/**
 * 默认桌面（HOME）：不用 adb，在车上就能切换。
 *  - 设为默认：安卓 10+ 用 RoleManager 请求"桌面"角色，系统弹确认框；更老的系统打开主屏幕应用设置。
 *  - 恢复原厂：打开系统的"主屏幕应用"设置页，让用户选回原厂桌面（原厂桌面从不停用）。
 */
object HomeRole {

    /** Q5 Home 现在是不是默认桌面。 */
    fun isDefault(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val rm = context.getSystemService(RoleManager::class.java)
            if (rm != null && rm.isRoleAvailable(RoleManager.ROLE_HOME)) return rm.isRoleHeld(RoleManager.ROLE_HOME)
        }
        return currentHomePackage(context) == context.packageName
    }

    /** 当前默认桌面的名称；没有固定默认桌面（每次都会问）时返回 null。 */
    fun currentHomeLabel(context: Context): String? {
        val pm = context.packageManager
        val info = pm.resolveActivity(homeIntent(), PackageManager.MATCH_DEFAULT_ONLY) ?: return null
        if (info.activityInfo.packageName == "android") return null // 系统的选择框，说明没有固定默认
        return info.loadLabel(pm).toString()
    }

    private fun currentHomePackage(context: Context): String? =
        context.packageManager.resolveActivity(homeIntent(), PackageManager.MATCH_DEFAULT_ONLY)
            ?.activityInfo?.packageName

    /** 请求成为默认桌面用的 Intent（交给 startActivityForResult）。 */
    fun requestIntent(context: Context): Intent {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val rm = context.getSystemService(RoleManager::class.java)
            if (rm != null && rm.isRoleAvailable(RoleManager.ROLE_HOME)) {
                return rm.createRequestRoleIntent(RoleManager.ROLE_HOME)
            }
        }
        return homeSettingsIntent(context)
    }

    /** 系统的"主屏幕应用"设置页；没有就退到默认应用设置，再退到系统设置。 */
    fun homeSettingsIntent(context: Context): Intent {
        val pm = context.packageManager
        return listOf(
            Intent(Settings.ACTION_HOME_SETTINGS),
            Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS),
            Intent(Settings.ACTION_SETTINGS),
        ).first { it.resolveActivity(pm) != null || it.action == Settings.ACTION_SETTINGS }
    }

    private fun homeIntent() = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
}

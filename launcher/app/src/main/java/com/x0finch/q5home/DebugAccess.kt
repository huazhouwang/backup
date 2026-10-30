package com.x0finch.q5home

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.os.Build
import android.provider.Settings
import java.net.Inet4Address

/**
 * 帮忙打开 adb（车机没法用电脑先连上时）。安卓 12 原版没有能直接跳进"无线调试"页面的入口
 * （AOSP Settings 里它只是开发者选项里的一项），所以按顺序尝试：
 *  1. 个别 ROM 提供的直达 action；
 *  2. 开发者选项，并让"无线调试"那一项滚动到位、高亮（:settings:fragment_args_key = toggle_adb_wireless）；
 *  3. 开发者选项没解锁：打开"关于"，提示连点版本号。
 */
object DebugAccess {

    const val DIRECT_ACTION = "android.settings.WIRELESS_DEBUGGING_SETTINGS"
    private const val EXTRA_HIGHLIGHT = ":settings:fragment_args_key"
    private const val KEY_WIRELESS = "toggle_adb_wireless"

    /** 无线调试是安卓 11（API 30）才有的。 */
    fun hasWirelessDebugging(sdk: Int = Build.VERSION.SDK_INT) = sdk >= 30

    /**
     * 按 API 级别算真实的安卓版本。有的车机固件把版本号改成"12"，实际是旧系统
     * （比如这台 WY / WWC2 车机写着 12，API 是 27 = 安卓 8.1）。
     */
    fun realAndroidVersion(sdk: Int = Build.VERSION.SDK_INT): String = when (sdk) {
        26 -> "8.0"; 27 -> "8.1"; 28 -> "9"; 29 -> "10"; 30 -> "11"; 31 -> "12"; 32 -> "12L"
        33 -> "13"; 34 -> "14"; 35 -> "15"; 36 -> "16"
        else -> "API $sdk"
    }

    /** 打开最合适的页面，返回给用户看的提示。 */
    fun openWirelessDebugging(context: Context, sdk: Int = Build.VERSION.SDK_INT): String {
        val pm = context.packageManager
        if (!hasWirelessDebugging(sdk)) {
            val dev = Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS)
            if (dev.resolveActivity(pm) != null && start(context, dev)) {
                return "这台车机实际是安卓 ${realAndroidVersion(sdk)}，没有无线调试；已打开开发者选项"
            }
            start(context, Intent(Settings.ACTION_DEVICE_INFO_SETTINGS))
            return "这台车机实际是安卓 ${realAndroidVersion(sdk)}，没有无线调试；开发者选项没打开时连点 7 次「版本号」"
        }
        val direct = Intent(DIRECT_ACTION)
        if (direct.resolveActivity(pm) != null && start(context, direct)) {
            return "已打开无线调试页面"
        }
        val dev = Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS).putExtra(EXTRA_HIGHLIGHT, KEY_WIRELESS)
        if (dev.resolveActivity(pm) != null && start(context, dev)) {
            return "已打开开发者选项：找高亮的「无线调试」，打开后点进去看 IP 和端口"
        }
        if (start(context, Intent(Settings.ACTION_DEVICE_INFO_SETTINGS))) {
            return "开发者选项还没打开：在这页连续点 7 次「版本号」，再回来点一次"
        }
        return "车机没有提供这些设置页面"
    }

    fun usbDebuggingOn(context: Context) =
        Settings.Global.getInt(context.contentResolver, Settings.Global.ADB_ENABLED, 0) == 1

    /** 安卓 11+ 的无线调试开关（Settings.Global.ADB_WIFI_ENABLED 是隐藏常量）。 */
    fun wirelessDebuggingOn(context: Context) =
        Settings.Global.getInt(context.contentResolver, "adb_wifi_enabled", 0) == 1

    /** 车机当前网络的 IPv4 地址（adb connect 要用）。 */
    fun ipAddress(context: Context): String? {
        val cm = context.getSystemService(ConnectivityManager::class.java) ?: return null
        val props = cm.getLinkProperties(cm.activeNetwork) ?: return null
        return props.linkAddresses.map { it.address }.firstOrNull { it is Inet4Address && !it.isLoopbackAddress }
            ?.hostAddress
    }

    private fun start(context: Context, intent: Intent): Boolean = runCatching {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }.isSuccess
}

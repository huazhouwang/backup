package com.x0finch.q5home

import android.app.Application
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.pm.ApplicationInfo
import android.content.pm.ResolveInfo
import android.provider.Settings
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config as RC

@RunWith(RobolectricTestRunner::class)
@RC(sdk = [31])
class DebugAccessTest {
    private val app: Application = ApplicationProvider.getApplicationContext()

    private fun register(action: String) {
        val info = ActivityInfo().apply {
            packageName = "com.android.settings"; name = "com.android.settings.Settings\$X"; exported = true
            applicationInfo = ApplicationInfo().apply { packageName = "com.android.settings" }
        }
        shadowOf(app.packageManager).addResolveInfoForIntent(Intent(action), ResolveInfo().apply { activityInfo = info })
    }

    @Test
    fun opensDeveloperOptionsWithWirelessHighlighted() {
        register(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS)
        val msg = DebugAccess.openWirelessDebugging(app)
        val started = shadowOf(app).nextStartedActivity
        assertEquals(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS, started.action)
        assertEquals("toggle_adb_wireless", started.getStringExtra(":settings:fragment_args_key"))
        assertTrue(msg.contains("无线调试"))
    }

    @Test
    fun prefersDirectPageWhenTheRomHasOne() {
        register(DebugAccess.DIRECT_ACTION)
        register(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS)
        DebugAccess.openWirelessDebugging(app)
        assertEquals(DebugAccess.DIRECT_ACTION, shadowOf(app).nextStartedActivity.action)
    }

    @Test
    fun fallsBackToAboutWhenDeveloperOptionsLocked() {
        val msg = DebugAccess.openWirelessDebugging(app)
        assertEquals(Settings.ACTION_DEVICE_INFO_SETTINGS, shadowOf(app).nextStartedActivity.action)
        assertTrue(msg.contains("版本号"))
    }

    @Test
    fun readsDebugStatus() {
        Settings.Global.putInt(app.contentResolver, Settings.Global.ADB_ENABLED, 1)
        Settings.Global.putInt(app.contentResolver, "adb_wifi_enabled", 0)
        assertTrue(DebugAccess.usbDebuggingOn(app))
        assertTrue(!DebugAccess.wirelessDebuggingOn(app))
    }
}

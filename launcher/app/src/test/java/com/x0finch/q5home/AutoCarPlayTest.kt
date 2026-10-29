package com.x0finch.q5home

import android.content.Context
import android.os.Looper
import android.provider.Settings
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config as RC
import java.time.Duration

/** 开机自动进入 CarPlay：每次开机只一次，桌面重启（比如崩溃后）不会再打开。 */
@RunWith(RobolectricTestRunner::class)
@RC(sdk = [31])
class AutoCarPlayTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    private fun launchHomeAndGetStarted(): String? {
        val activity = Robolectric.buildActivity(MainActivity::class.java).setup().get()
        shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(3))
        return shadowOf(activity).nextStartedActivity?.component?.packageName
    }

    @Test
    fun oncePerBoot() {
        FakeApps.installCar(context)
        Config(context).setAutoCarplay(true)
        Settings.Global.putInt(context.contentResolver, Settings.Global.BOOT_COUNT, 7)

        assertEquals("com.zjinnova.zlink", launchHomeAndGetStarted())
        // 同一次开机里桌面重启：不再自动打开
        assertNull(launchHomeAndGetStarted())
        // 下一次开机：又会打开
        Settings.Global.putInt(context.contentResolver, Settings.Global.BOOT_COUNT, 8)
        assertEquals("com.zjinnova.zlink", launchHomeAndGetStarted())
    }
}

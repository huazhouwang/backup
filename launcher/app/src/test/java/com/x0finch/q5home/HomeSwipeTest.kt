package com.x0finch.q5home

import android.content.Context
import android.os.Looper
import android.os.SystemClock
import android.view.MotionEvent
import android.view.View
import android.widget.HorizontalScrollView
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config as RC

/** 在首页不可点的卡片（时钟、GPS）上左右滑动，底部应用卡跟着滚。 */
@RunWith(RobolectricTestRunner::class)
@RC(sdk = [31])
class HomeSwipeTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @Test
    fun swipeOnBlankAreaScrollsTiles() {
        RuntimeEnvironment.setQualifiers("w1280dp-h480dp-land-mdpi")
        FakeApps.installCar(context)
        // 常用应用多放几个，让磁贴超出屏幕宽度。
        Config(context).apply { repeat(9) { i -> setDock(dock + DockItem("nav", "${FakeApps.NAVI}$i")) } }
        val home = Robolectric.buildActivity(MainActivity::class.java).setup().visible().get()
        shadowOf(Looper.getMainLooper()).idle()
        val root = home.findViewById<View>(R.id.root)
        val scroll = home.findViewById<HorizontalScrollView>(R.id.tileScroll)
        assertTrue("磁贴要超出屏幕", scroll.getChildAt(0).width > scroll.width)

        // 从 GPS 卡拖到时钟卡（都不可点），往左 600px。
        val y = root.height * 0.35f
        val t = SystemClock.uptimeMillis()
        fun send(action: Int, x: Float, dt: Long) {
            val e = MotionEvent.obtain(t, t + dt, action, x, y, 0)
            root.dispatchTouchEvent(e)
            e.recycle()
        }
        send(MotionEvent.ACTION_DOWN, 630f, 0)
        for (i in 1..12) send(MotionEvent.ACTION_MOVE, 630f - i * 50f, i * 16L)
        send(MotionEvent.ACTION_UP, 30f, 13 * 16L)
        shadowOf(Looper.getMainLooper()).idle()
        assertTrue("磁贴列表应该滚动了，scrollX=${scroll.scrollX}", scroll.scrollX > 300)
    }
}

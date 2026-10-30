package com.x0finch.q5home

import android.content.Context
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config as RC

/** 磁贴名称：图标和应用对得上时用统一中文名，否则用应用自己的名字。 */
@RunWith(RobolectricTestRunner::class)
@RC(sdk = [31])
class HomeTilesTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    private fun titles(dock: List<DockItem>): List<String> {
        RuntimeEnvironment.setQualifiers("w1280dp-h480dp-land-mdpi")
        FakeApps.installCar(context)
        Config(context).setDock(dock)
        val home = Robolectric.buildActivity(MainActivity::class.java).setup().visible().get()
        shadowOf(Looper.getMainLooper()).idle()
        val tiles = home.findViewById<ViewGroup>(R.id.tiles)
        // 每个磁贴里字号最大的那行就是标题。
        return (0 until tiles.childCount).map { i ->
            texts(tiles.getChildAt(i)).maxByOrNull { it.textSize }?.text?.toString().orEmpty()
        }
    }

    private fun texts(v: View): List<TextView> = when (v) {
        is TextView -> listOf(v)
        is ViewGroup -> (0 until v.childCount).flatMap { texts(v.getChildAt(it)) }
        else -> emptyList()
    }

    @Test
    fun matchingIconUsesUnifiedName() {
        val t = titles(listOf(DockItem("settings", Targets.SYSTEM_SETTINGS), DockItem("nav", FakeApps.NAVI)))
        assertEquals(listOf("系统设置", "导航"), t.subList(2, 4))
    }

    @Test
    fun mismatchedOrAppIconUsesAppName() {
        val t = titles(listOf(DockItem("nav", Targets.SYSTEM_SETTINGS), DockItem(null, FakeApps.NAVI)))
        assertEquals(listOf("Settings", "高德地图车机版"), t.subList(2, 4))
    }
}

package com.x0finch.q5home

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config as RC
import java.util.Calendar

@RunWith(RobolectricTestRunner::class)
@RC(sdk = [31])
class WallpapersTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private fun day(n: Int) = Calendar.getInstance().apply { set(Calendar.DAY_OF_YEAR, n) }

    @Test
    fun dailyRotates() {
        assertNotEquals(
            Wallpapers.current(context, Wallpapers.DAILY, day(10))!!.key,
            Wallpapers.current(context, Wallpapers.DAILY, day(11))!!.key,
        )
    }

    @Test
    fun fixedAndNone() {
        assertEquals("city", Wallpapers.current(context, "city")!!.key)
        assertNull(Wallpapers.current(context, Wallpapers.NONE))
        assertEquals("纯黑", Wallpapers.label(context, Wallpapers.NONE))
        // 指定的在线壁纸被清理掉之后，退回每日轮换而不是空白。
        assertNotNull(Wallpapers.current(context, "u:gone"))
    }

    @Test
    fun builtinsDecode() {
        for (w in Wallpapers.BUILTIN) assertNotNull(w.key, Wallpapers.decode(context, w, 1280))
    }
}

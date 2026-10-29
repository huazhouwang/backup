package com.x0finch.q5home

import androidx.test.core.app.ApplicationProvider
import android.content.Context
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
    private fun day(n: Int) = Calendar.getInstance().apply { set(Calendar.DAY_OF_YEAR, n) }

    @Test
    fun dailyRotates() {
        assertNotEquals(Wallpapers.current(Wallpapers.DAILY, day(10))!!.key, Wallpapers.current(Wallpapers.DAILY, day(11))!!.key)
    }

    @Test
    fun fixedAndNone() {
        assertEquals("city", Wallpapers.current("city")!!.key)
        assertNull(Wallpapers.current(Wallpapers.NONE))
        assertEquals("纯黑", Wallpapers.label(Wallpapers.NONE))
    }

    @Test
    fun allDecode() {
        val res = ApplicationProvider.getApplicationContext<Context>().resources
        for (w in Wallpapers.ALL) assertNotNull(w.key, Wallpapers.decode(res, w, 1280))
    }
}

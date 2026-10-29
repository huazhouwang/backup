package com.x0finch.q5home

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config as RC

@RunWith(RobolectricTestRunner::class)
@RC(sdk = [31])
class TargetsTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @Test
    fun packageOfHandlesEveryForm() {
        assertEquals("com.a", Targets.packageOf("com.a"))
        assertEquals("com.a", Targets.packageOf("com.a/.Main"))
        assertEquals("com.b", Targets.packageOf("broadcast:com.x.SWITCH@com.b"))
        assertNull(Targets.packageOf("broadcast:com.x.SWITCH"))
        assertNull(Targets.packageOf("action:android.settings.SETTINGS"))
        assertNull(Targets.packageOf(""))
    }

    @Test
    fun shortClassNameIsExpanded() {
        val intent = Targets.intentFor(context, "com.a/.ui.Main")!!
        assertEquals("com.a.ui.Main", intent.component!!.className)
    }

    @Test
    fun detectsCarPlayOemAndFiles() {
        FakeApps.installCar(context)
        assertEquals("com.zjinnova.zlink", Targets.findCarPlay(context)!!.substringBefore('/'))
        assertEquals(FakeApps.OEM, Targets.findOem(context))
        assertEquals(FakeApps.FILES, Targets.findFiles(context))
    }

    @Test
    fun availability() {
        FakeApps.installCar(context)
        assertTrue(Targets.isAvailable(context, FakeApps.OEM))
        assertTrue(Targets.isAvailable(context, "broadcast:anything"))
        assertFalse(Targets.isAvailable(context, "com.not.installed"))
        assertFalse(Targets.isAvailable(context, null))
    }
}

package com.x0finch.q5home

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 用真的 dex（test/resources/oem-switch.dex，由 oem-switch.java.txt 用 javac + d8 编出来）验证反汇编：
 * 和 dexdump 的结果对得上。
 */
class DexScanTest {
    private val dex = javaClass.classLoader!!.getResourceAsStream("oem-switch.dex")!!.readBytes()

    @Test
    fun findsMethodsUsingTargetStringsInOrder() {
        val methods = DexScan.scanDex(dex, { it.contains("original_screen") })
        assertEquals(1, methods.size)
        assertEquals("com.wwc2.fake.OemSwitch.enterOriginalMedia", methods[0].name)
        assertEquals(listOf(
            "int 1",
            "call Integer.valueOf",
            "str \"original_screen\"",
            "call Map.put",
            "str \"content://com.wwc2.canmcusdk.CanbusProvider/original_screen\"",
            "put com.wwc2.fake.OemSwitch.sink",
            "get System.out",
            "str \"enter_original_media\"",
            "call PrintStream.println",
        ), methods[0].events)
    }

    @Test
    fun noMatchAndGarbageAreSafe() {
        assertTrue(DexScan.scanDex(dex, { it == "not-there" }).isEmpty())
        assertTrue(DexScan.scanDex(ByteArray(10), { true }).isEmpty())
        // 截断的 dex 不应该崩。
        assertTrue(runCatching { DexScan.scanDex(dex.copyOf(300), { true }) }.isSuccess)
    }
}

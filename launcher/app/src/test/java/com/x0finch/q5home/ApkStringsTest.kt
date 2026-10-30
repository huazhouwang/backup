package com.x0finch.q5home

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

class ApkStringsTest {

    companion object {
        /** 拼一个只有字符串表的最小 dex（够 ApkStrings 读）。 */
        fun fakeDex(strings: List<String>): ByteArray {
            val header = 0x70
            val idsOff = header
            val data = ByteArrayOutputStream()
            val offsets = mutableListOf<Int>()
            val dataStart = idsOff + strings.size * 4
            for (s in strings) {
                offsets += dataStart + data.size()
                val utf16 = s.length
                var v = utf16
                do { var b = v and 0x7F; v = v ushr 7; if (v != 0) b = b or 0x80; data.write(b) } while (v != 0)
                // 测试字符串都在 BMP 内且不含 \u0000，标准 UTF-8 和 MUTF-8 一样。
                data.write(s.toByteArray(Charsets.UTF_8)); data.write(0)
            }
            val out = ByteBuffer.allocate(dataStart + data.size()).order(ByteOrder.LITTLE_ENDIAN)
            out.put("dex\n035\u0000".toByteArray(Charsets.ISO_8859_1))
            out.putInt(0x38, strings.size)
            out.putInt(0x3C, idsOff)
            offsets.forEachIndexed { i, o -> out.putInt(idsOff + i * 4, o) }
            out.position(dataStart)
            out.put(data.toByteArray())
            return out.array()
        }

        fun fakeApk(file: File, vararg dexes: List<String>): File {
            ZipOutputStream(file.outputStream()).use { zip ->
                dexes.forEachIndexed { i, strings ->
                    zip.putNextEntry(ZipEntry(if (i == 0) "classes.dex" else "classes${i + 1}.dex"))
                    zip.write(fakeDex(strings))
                    zip.closeEntry()
                }
                zip.putNextEntry(ZipEntry("AndroidManifest.xml")); zip.write(ByteArray(8)); zip.closeEntry()
            }
            return file
        }
    }

    @Test
    fun readsDexStringTable() {
        val strings = listOf("hello", "com.wwc2.main.ACTION_SWITCH_OEM", "原车", "Lcom/wwc2/launcher/YuancheView;")
        assertEquals(strings, ApkStrings.dexStrings(fakeDex(strings)))
        assertEquals(emptyList<String>(), ApkStrings.dexStrings(ByteArray(10)))
    }

    @Test
    fun picksActionsAndKeywords() {
        assertTrue(ApkStrings.interesting("com.wwc2.main.ACTION_SWITCH_OEM"))
        assertTrue(ApkStrings.interesting("android.intent.action.BOOT_COMPLETED"))
        assertTrue(ApkStrings.interesting("Lcom/wwc2/launcher/YuancheView;"))
        assertTrue(ApkStrings.interesting("原车"))
        assertTrue(ApkStrings.interesting("key_avin_mode"))
        assertFalse(ApkStrings.interesting("hello"))
        assertFalse(ApkStrings.interesting("com.wwc2.main.MainActivity"))
        assertFalse(ApkStrings.interesting("android.permission.CAMERA"))
        assertFalse(ApkStrings.interesting("a long sentence with oem in it"))
        // 库代码里碰巧含关键词的不要。
        assertFalse(ApkStrings.interesting("\$this\$reversed"))
        assertFalse(ApkStrings.interesting("Lkotlin/collections/ReversedList;"))
        assertFalse(ApkStrings.interesting("Landroidx/camera/core/Origin;"))
        assertFalse(ApkStrings.interesting("kotlin.collections.REVERSED"))
        assertTrue(ApkStrings.interesting("Lcom/wwc2/main/OemSwitch;"))
        assertFalse(ApkStrings.interesting("asReversed"))
        assertFalse(ApkStrings.interesting("origin1"))
        assertTrue(ApkStrings.interesting("ACTION_REVERSE_CAR"))
        assertFalse(ApkStrings.interestingDeep("DEFAULT_SOURCE"))
        assertFalse(ApkStrings.interestingDeep("DEFAULT_TARGET"))
    }

    @Test
    fun deepFilterAlsoKeepsExtraKeys() {
        assertTrue(ApkStrings.interestingDeep("start_page"))
        assertTrue(ApkStrings.interestingDeep("KEY_JUMP_TYPE"))
        assertFalse(ApkStrings.interestingDeep("startPage"))   // 驼峰多半是方法名，不要
        assertFalse(ApkStrings.interestingDeep("hello_world"))
    }

    @Test
    fun readsAllDexesInApk() {
        val apk = fakeApk(File.createTempFile("fake", ".apk"),
            listOf("noise", "com.wwc2.mainui.ACTION_OEM"), listOf("com.wwc2.main.SWITCH_AVIN", "noise2"))
        assertEquals(listOf("com.wwc2.main.SWITCH_AVIN", "com.wwc2.mainui.ACTION_OEM"), ApkStrings.fromApk(apk))
        assertEquals(emptyList<String>(), ApkStrings.fromApk(File("/nonexistent.apk")))
        apk.delete()
    }
}

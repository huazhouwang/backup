package com.x0finch.q5home

import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.zip.ZipFile

/**
 * 极简的只读 dex 反汇编：在 APK 里找出"用到了某些字符串"的方法，按顺序列出这些方法里
 * 出现的字符串、整数常量、调用的方法、读写的字段。用来看厂商桌面点「原车媒体」时到底做了什么
 * （往哪个接口写了什么值、发了什么广播），不运行任何代码，也不改任何东西。
 *
 * 只认指令长度和少数几种指令（const、const-string、invoke、iget/iput/sget/sput），够看调用顺序。
 */
object DexScan {

    class Method(val name: String, val events: List<String>)

    /** 在 APK 的所有 dex 里找引用了 [target] 命中的字符串的方法。 */
    fun scanApk(apk: File, target: (String) -> Boolean, maxMethods: Int = 15, maxEvents: Int = 60): List<Method> {
        val out = mutableListOf<Method>()
        runCatching {
            ZipFile(apk).use { zip ->
                zip.entries().asSequence()
                    .filter { Regex("classes\\d*\\.dex").matches(it.name) && it.size in 1..(64L shl 20) }
                    .forEach { e ->
                        if (out.size >= maxMethods) return@forEach
                        val bytes = zip.getInputStream(e).use { it.readBytes() }
                        out += scanDex(bytes, target, maxMethods - out.size, maxEvents)
                    }
            }
        }
        return out
    }

    /** 坏的 / 截断的 dex 不崩：返回已经找到的部分。 */
    fun scanDex(dex: ByteArray, target: (String) -> Boolean, maxMethods: Int = 15, maxEvents: Int = 60): List<Method> {
        val found = mutableListOf<Method>()
        runCatching { scan(dex, target, maxMethods, maxEvents, found) }
        return found
    }

    private fun scan(dex: ByteArray, target: (String) -> Boolean, maxMethods: Int, maxEvents: Int, found: MutableList<Method>) {
        val d = Dex(dex)
        if (!d.valid) return
        val wanted = (0 until d.stringCount).filter { target(d.string(it)) }.toHashSet()
        if (wanted.isEmpty()) return
        for (c in 0 until d.classCount) {
            val classDataOff = d.u4(d.classDefsOff + c * 32 + 24)
            if (classDataOff == 0) continue
            for ((methodIdx, codeOff) in d.methodsOf(classDataOff)) {
                if (codeOff == 0) continue
                val insns = d.instructions(codeOff) ?: continue
                if (insns.none { it.op in CONST_STRING && it.index in wanted }) continue
                val events = insns.mapNotNull { d.describe(it) }.take(maxEvents)
                found += Method(d.methodName(methodIdx), events)
                if (found.size >= maxMethods) return
            }
        }
    }

    private val CONST_STRING = setOf(0x1a, 0x1b)

    /** 一条指令：操作码 + 引用的索引（字符串 / 方法 / 字段）或常量。 */
    private class Insn(val op: Int, val index: Int, val literal: Long?)

    private class Dex(val b: ByteArray) {
        val bb: ByteBuffer = ByteBuffer.wrap(b).order(ByteOrder.LITTLE_ENDIAN)
        val valid = b.size > 0x70 && String(b, 0, 3, Charsets.ISO_8859_1) == "dex"
        val stringCount = if (valid) u4(0x38) else 0
        val stringIdsOff = if (valid) u4(0x3C) else 0
        val typeIdsOff = if (valid) u4(0x44) else 0
        val fieldIdsOff = if (valid) u4(0x54) else 0
        val methodIdsOff = if (valid) u4(0x5C) else 0
        val classCount = if (valid) u4(0x60) else 0
        val classDefsOff = if (valid) u4(0x64) else 0
        private val strings = HashMap<Int, String>()

        fun u2(off: Int) = bb.getShort(off).toInt() and 0xFFFF
        fun u4(off: Int) = bb.getInt(off)

        fun string(i: Int): String = strings.getOrPut(i) {
            runCatching {
                var p = u4(stringIdsOff + i * 4)
                while (b[p].toInt() and 0x80 != 0) p++
                p++
                val start = p
                while (b[p].toInt() != 0) p++
                String(b, start, p - start, Charsets.UTF_8)
            }.getOrDefault("?")
        }

        fun type(i: Int) = string(u4(typeIdsOff + i * 4))

        fun methodName(i: Int): String {
            val off = methodIdsOff + i * 8
            return "${shortClass(type(u2(off)))}.${string(u4(off + 4))}"
        }

        fun fieldName(i: Int): String {
            val off = fieldIdsOff + i * 8
            return "${shortClass(type(u2(off)))}.${string(u4(off + 4))}"
        }

        /** class_data 里所有方法：(method_idx, code_off)。 */
        fun methodsOf(off: Int): List<Pair<Int, Int>> {
            var p = off
            fun uleb(): Int {
                var result = 0; var shift = 0
                while (true) {
                    val x = b[p++].toInt() and 0xFF
                    result = result or ((x and 0x7F) shl shift)
                    if (x and 0x80 == 0) return result
                    shift += 7
                }
            }
            val staticFields = uleb(); val instanceFields = uleb()
            val direct = uleb(); val virtual = uleb()
            repeat(staticFields + instanceFields) { uleb(); uleb() }
            val out = mutableListOf<Pair<Int, Int>>()
            for (group in listOf(direct, virtual)) {
                var idx = 0
                repeat(group) {
                    idx += uleb(); uleb()
                    out += idx to uleb()
                }
            }
            return out
        }

        fun instructions(codeOff: Int): List<Insn>? = runCatching {
            val count = u4(codeOff + 12)
            val base = codeOff + 16
            val list = mutableListOf<Insn>()
            var pc = 0
            while (pc < count) {
                val unit = u2(base + pc * 2)
                val op = unit and 0xFF
                // 数据块（switch 表、数组数据）：按长度跳过。
                if (op == 0x00 && unit != 0) {
                    pc += when (unit) {
                        0x0100 -> u2(base + pc * 2 + 2) * 2 + 4
                        0x0200 -> u2(base + pc * 2 + 2) * 4 + 2
                        0x0300 -> {
                            val width = u2(base + pc * 2 + 2)
                            val size = u4(base + pc * 2 + 4)
                            (size * width + 1) / 2 + 4
                        }
                        else -> 1
                    }
                    continue
                }
                val len = LENGTH[op]
                val u1 = if (len > 1) u2(base + pc * 2 + 2) else 0
                val index = when (op) {
                    0x1b -> u4(base + pc * 2 + 2)
                    else -> u1
                }
                val literal: Long? = when (op) {
                    0x12 -> ((unit shl 16) shr 28).toLong() // const/4：高 4 位，带符号
                    0x13 -> u1.toShort().toLong()
                    0x14 -> u4(base + pc * 2 + 2).toLong()
                    0x15 -> (u1 shl 16).toLong()
                    else -> null
                }
                list += Insn(op, index, literal)
                pc += len
            }
            list
        }.getOrNull()

        fun describe(i: Insn): String? = when (i.op) {
            0x1a, 0x1b -> "str \"${string(i.index).take(100)}\""
            0x12, 0x13, 0x14, 0x15 -> "int ${i.literal}"
            in 0x6e..0x72, in 0x74..0x78 -> "call ${methodName(i.index)}"
            in 0x52..0x58 -> "get ${fieldName(i.index)}"
            in 0x59..0x5f -> "put ${fieldName(i.index)}"
            in 0x60..0x66 -> "get ${fieldName(i.index)}"
            in 0x67..0x6d -> "put ${fieldName(i.index)}"
            else -> null
        }

        /** java / android 的类只留类名，厂商的类保留完整包名。 */
        private fun shortClass(desc: String): String {
            val name = desc.removePrefix("L").removeSuffix(";").replace('/', '.')
            return if (name.startsWith("java.") || name.startsWith("android.")) name.substringAfterLast('.') else name
        }
    }

    /** 每个操作码的指令长度（16 位单元），按 Dalvik 指令格式表。 */
    private val LENGTH = IntArray(256) { 1 }.also { t ->
        fun set(range: IntRange, len: Int) = range.forEach { t[it] = len }
        set(0x02..0x02, 2); set(0x03..0x03, 3); set(0x05..0x05, 2); set(0x06..0x06, 3)
        set(0x08..0x08, 2); set(0x09..0x09, 3)
        set(0x13..0x13, 2); set(0x14..0x14, 3); set(0x15..0x16, 2); set(0x17..0x17, 3)
        set(0x18..0x18, 5); set(0x19..0x1a, 2); set(0x1b..0x1b, 3); set(0x1c..0x1c, 2)
        set(0x1f..0x20, 2); set(0x22..0x23, 2); set(0x24..0x26, 3)
        set(0x29..0x29, 2); set(0x2a..0x2c, 3); set(0x2d..0x3d, 2)
        set(0x44..0x6d, 2); set(0x6e..0x72, 3); set(0x74..0x78, 3)
        set(0x90..0xaf, 2); set(0xd0..0xe2, 2)
        set(0xfa..0xfb, 4); set(0xfc..0xfd, 3); set(0xfe..0xff, 2)
    }
}

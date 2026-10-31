package com.x0finch.q5home

import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.zip.ZipFile

/**
 * 从 APK 里读出代码中的字符串常量（classes*.dex 的字符串表），只读。
 * 用来找厂商应用切原车画面用的广播名 / 指令名：这些通常是明文常量，没有 adb 也能看到。
 */
object ApkStrings {

    /** 和原车切换可能有关的词（类名、常量里出现就保留）。 */
    private val KEYWORDS = Regex(
        // 只用车机行业里的专门词；reverse / origin / source 这类通用词在库代码里到处都是，会刷屏。
        "oem|yuanche|原车|原厂|original|orig_|avin|aux_?in|cvbs|lvds|canbus|carinfo|video_?source|source_?switch|" +
            "screen_?switch|mediabox|media_?box|backcar|reverse_?car|org_?car|ori_?car|^content://",
        RegexOption.IGNORE_CASE,
    )
    /** 像广播 / Intent 动作的字符串：至少三段的点分名，最后一段全大写（如 com.wwc2.main.ACTION_X）。 */
    private val ACTION_LIKE = Regex("^[a-z][a-z0-9_]*(\\.[A-Za-z0-9_]+){2,}$")

    /** 第三方库 / 编译器生成的字符串，和厂商逻辑无关，先排除（否则 kotlin 的 reversed 之类会刷屏）。 */
    private val LIBRARY = Regex(
        "^L?(kotlin|kotlinx|java|javax|androidx|android[./]support|com[./]google|okhttp3|okio|retrofit2|io[./]reactivex|org)[./]",
    )

    /**
     * 安卓自带的常量（媒体元数据、语音、附加参数等）和生成的类（资源 R$、数据绑定），
     * 每个应用都有一大堆，和厂商逻辑无关。android.intent.action.* 保留：厂商会自定义这种动作。
     */
    private val NOISE = Regex(
        "^(android\\.(media|speech|service|view|intent\\.extra|intent\\.category|hardware|car|wearable|net|provider)\\.|aios\\.|\\[L)" +
            "|/R\\$|/R;|/databinding/|/holdr/|/BuildConfig;",
    )

    /** 命中车机关键词（排在报告前面）。 */
    fun isKeyword(s: String) = KEYWORDS.containsMatchIn(s)

    fun interesting(s: String): Boolean {
        if (s.length !in 2..120 || s.any { it == ' ' || it == '\n' }) return false
        if (s.startsWith("\$this\$") || LIBRARY.containsMatchIn(s) || NOISE.containsMatchIn(s)) return false
        if (KEYWORDS.containsMatchIn(s)) return true
        if (!ACTION_LIKE.matches(s)) return false
        val last = s.substringAfterLast('.')
        return last.length >= 3 && last == last.uppercase() && last.any { it.isLetter() } &&
            !s.startsWith("android.permission.") && !s.startsWith("java.") && !s.startsWith("javax.")
    }

    /** 排除库代码 / 安卓自带常量后，再用 [pattern] 筛（重点报告里"相关字符串"用）。 */
    fun matching(pattern: Regex): (String) -> Boolean = { s ->
        s.length in 2..120 && s.none { it == ' ' || it == '\n' } && !s.startsWith("\$this\$") &&
            !LIBRARY.containsMatchIn(s) && !NOISE.containsMatchIn(s) && pattern.containsMatchIn(s)
    }

    /** 像 Intent 参数名的字符串（打开页面时带的 extra，比如 start_page、jump_type）。 */
    private val EXTRA_LIKE = Regex(
        "^[a-zA-Z][a-zA-Z0-9_]{2,40}$",
    )
    private val EXTRA_WORDS = Regex("page|jump|start_?type|open_?type|launch_?type|tab_?index|mode_?type|media_?type|enter_?mode", RegexOption.IGNORE_CASE)

    /** 关键应用用的宽一点的筛选：再加上像跳转参数的字段名。 */
    fun interestingDeep(s: String): Boolean =
        interesting(s) || (EXTRA_LIKE.matches(s) && EXTRA_WORDS.containsMatchIn(s) && s.contains('_'))

    /** APK 里所有 dex 的字符串，按 [filter] 筛选、去重、排序，最多 [limit] 条。读不了返回空。 */
    fun fromApk(apk: File, limit: Int = 200, filter: (String) -> Boolean = ::interesting): List<String> {
        val found = sortedSetOf<String>()
        runCatching {
            ZipFile(apk).use { zip ->
                zip.entries().asSequence()
                    .filter { Regex("classes\\d*\\.dex").matches(it.name) && it.size in 1..(64L shl 20) }
                    .forEach { entry ->
                        val bytes = zip.getInputStream(entry).use { it.readBytes() }
                        dexStrings(bytes).filterTo(found) { filter(it) }
                    }
            }
        }
        // 关键词命中的排前面，免得被截断。
        return found.sortedWith(compareBy({ !isKeyword(it) }, { it })).take(limit)
    }

    /** dex 字符串表：header 0x38 = 个数，0x3C = 偏移；每项是 uleb128 长度 + MUTF-8 + 0。 */
    fun dexStrings(dex: ByteArray): List<String> {
        if (dex.size < 0x70 || String(dex, 0, 3, Charsets.ISO_8859_1) != "dex") return emptyList()
        val bb = ByteBuffer.wrap(dex).order(ByteOrder.LITTLE_ENDIAN)
        val count = bb.getInt(0x38)
        val idsOff = bb.getInt(0x3C)
        if (count <= 0 || idsOff <= 0 || idsOff.toLong() + count * 4L > dex.size) return emptyList()
        val out = ArrayList<String>(count)
        for (i in 0 until count) {
            var p = bb.getInt(idsOff + i * 4)
            if (p !in 0 until dex.size) continue
            // 跳过 uleb128 的 UTF-16 长度。
            while (p < dex.size && dex[p].toInt() and 0x80 != 0) p++
            p++
            out += decodeMutf8(dex, p) ?: continue
        }
        return out
    }

    /** 解 MUTF-8（0 结尾；代理对按两个 3 字节序列分别解码，正好拼回 UTF-16）。 */
    private fun decodeMutf8(b: ByteArray, start: Int): String? {
        val sb = StringBuilder()
        var p = start
        while (p < b.size) {
            val c = b[p].toInt() and 0xFF
            when {
                c == 0 -> return sb.toString()
                c < 0x80 -> { sb.append(c.toChar()); p += 1 }
                c and 0xE0 == 0xC0 && p + 1 < b.size -> {
                    sb.append((((c and 0x1F) shl 6) or (b[p + 1].toInt() and 0x3F)).toChar()); p += 2
                }
                c and 0xF0 == 0xE0 && p + 2 < b.size -> {
                    sb.append((((c and 0x0F) shl 12) or ((b[p + 1].toInt() and 0x3F) shl 6) or
                        (b[p + 2].toInt() and 0x3F)).toChar()); p += 3
                }
                else -> return null
            }
            if (sb.length > 500) return null
        }
        return null
    }
}

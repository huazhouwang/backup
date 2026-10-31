package com.x0finch.q5home

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * 「重点报告」分析什么：哪些应用、找哪些代码、试读哪些接口。
 * 提交时从仓库的 config/recon-targets.json 下载最新的，下载不到就用内置的同一份。
 * 这样换分析方向只改仓库里的文件，车机不用更新。
 * 只能决定"读什么"：这里没有任何会写入或切换车机的东西。
 */
data class ReconTargets(
    val packages: List<String>,
    val code: List<CodeGroup>,
    /** 每个应用里再列出匹配这个正则的字符串常量；为空就不列。 */
    val strings: Regex?,
    /** 只读 query 的 content:// 地址（只接受 content://com.wwc2 开头的）。 */
    val providers: List<String>,
    val maxMethods: Int,
    val maxEvents: Int,
    /** 从哪来的：仓库 / 内置。 */
    val source: String,
) {
    class CodeGroup(val name: String, val pattern: Regex)

    companion object {
        const val URL = "https://raw.githubusercontent.com/x0finch/audi-q5-launcher/HEAD/config/recon-targets.json"
        private const val MAX_PACKAGES = 12
        private const val MAX_GROUPS = 8
        private const val MAX_PROVIDERS = 20

        /** 和仓库里 config/recon-targets.json 保持一致（下载失败时用）。 */
        val DEFAULT_JSON = """
            {
              "packages": ["com.wwc2.launcher", "com.wwc2.main", "com.wwc2.mainui", "com.wwc2.canmcusdk", "com.wwc2.canbusapk"],
              "code": [
                {"name": "原车画面切换", "pattern": "original_screen|enter_original|switch_original|original_unlock|source_avin|media_box"},
                {"name": "仪表 / 车辆数据（车速、转速、车门等）", "pattern": "car_info|getCanMcuCarInfo|CarInfoLogic|canbusDataFromMCU|notifyCarInfo|uri_carinfo"}
              ],
              "strings": "original|car_info|speed|rpm|engine|fuel|mileage|temperature",
              "providers": [
                "content://com.wwc2.canmcusdk.CanbusProvider/original_screen",
                "content://com.wwc2.canmcusdk.CanbusProvider/car_info",
                "content://com.wwc2.main.provider.logic/logic"
              ],
              "maxMethods": 15,
              "maxEvents": 60
            }
        """.trimIndent()

        val DEFAULT: ReconTargets get() = parse(DEFAULT_JSON, "内置")!!

        /** 解析；格式不对返回 null。正则写错的那一项跳过。数量和长度都有上限，免得报告爆掉。 */
        fun parse(json: String, source: String): ReconTargets? = runCatching {
            val o = JSONObject(json)
            fun regex(s: String?) = s?.takeIf { it.isNotBlank() && it.length <= 500 }
                ?.let { runCatching { Regex(it, RegexOption.IGNORE_CASE) }.getOrNull() }
            val packages = o.optJSONArray("packages")?.let { a -> (0 until a.length()).map { a.getString(it) } }.orEmpty()
                .filter { Regex("^[a-zA-Z0-9_.]{3,100}$").matches(it) }.distinct().take(MAX_PACKAGES)
            val code = o.optJSONArray("code")?.let { a ->
                (0 until a.length()).mapNotNull { i ->
                    val g = a.getJSONObject(i)
                    regex(g.optString("pattern"))?.let { CodeGroup(g.optString("name").ifBlank { "代码" }.take(40), it) }
                }
            }.orEmpty().take(MAX_GROUPS)
            val providers = o.optJSONArray("providers")?.let { a -> (0 until a.length()).map { a.getString(it) } }.orEmpty()
                .filter { it.startsWith("content://com.wwc2") && it.length <= 200 }.distinct().take(MAX_PROVIDERS)
            ReconTargets(
                packages, code, regex(o.optString("strings")), providers,
                o.optInt("maxMethods", 15).coerceIn(1, 40), o.optInt("maxEvents", 60).coerceIn(5, 200), source,
            )
        }.getOrNull()

        /** 下载仓库里的最新版本；失败就用内置的。在后台线程调用。 */
        fun load(url: String = URL): ReconTargets = runCatching {
            val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = 10_000
                readTimeout = 15_000
                setRequestProperty("User-Agent", "q5home")
            }
            try {
                if (conn.responseCode !in 200..299) null
                else parse(conn.inputStream.bufferedReader().use { it.readText() }, "仓库 config/recon-targets.json")
            } finally {
                conn.disconnect()
            }
        }.getOrNull() ?: DEFAULT
    }
}

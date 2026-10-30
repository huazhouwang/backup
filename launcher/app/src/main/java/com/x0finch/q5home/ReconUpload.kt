package com.x0finch.q5home

import android.content.Context
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * 把摸底报告发成仓库的一个 GitHub Issue。
 * 令牌由车主生成（细粒度令牌，只授权这个仓库的 Issues 读写），手机扫码后在车机的临时网页里粘贴进来；
 * 只存在本应用的私有存储里（不备份、不写进 current.json、不显示）。
 */
class ReconUpload(context: Context, private val apiBase: String = DEFAULT_API) {

    private val prefs = context.getSharedPreferences("secrets", Context.MODE_PRIVATE)

    val hasToken: Boolean get() = !prefs.getString(KEY_TOKEN, null).isNullOrBlank()

    fun saveToken(token: String) = prefs.edit().putString(KEY_TOKEN, token.trim()).apply()

    fun clearToken() = prefs.edit().remove(KEY_TOKEN).apply()

    /** 上次提交得到的 Issue 链接。 */
    var lastIssueUrl: String?
        get() = prefs.getString(KEY_LAST_URL, null)
        private set(value) = prefs.edit().putString(KEY_LAST_URL, value).apply()

    /** 新建 Issue，正文太长时剩下的分几条评论。返回 Issue 网页链接。在后台线程调用。 */
    fun submit(title: String, markdown: String): String {
        val token = prefs.getString(KEY_TOKEN, null)?.takeIf { it.isNotBlank() } ?: throw IOException("还没有令牌")
        val parts = split(markdown)
        val issue = post("$apiBase/repos/${Updates.REPO}/issues", token,
            JSONObject().put("title", title).put("body", parts.first()))
        val number = issue.getInt("number")
        parts.drop(1).forEachIndexed { i, part ->
            post("$apiBase/repos/${Updates.REPO}/issues/$number/comments", token,
                JSONObject().put("body", "（续 ${i + 2}/${parts.size}）\n\n$part"))
        }
        return issue.getString("html_url").also { lastIssueUrl = it }
    }

    private fun post(url: String, token: String, body: JSONObject): JSONObject {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 30_000
            requestMethod = "POST"
            doOutput = true
            setRequestProperty("User-Agent", "q5home")
            setRequestProperty("Accept", "application/vnd.github+json")
            setRequestProperty("Authorization", "Bearer $token")
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
        }
        try {
            conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            if (code !in 200..299) throw IOException(explain(code))
            return JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
        } finally {
            conn.disconnect()
        }
    }

    companion object {
        const val DEFAULT_API = "https://api.github.com"
        /** GitHub 正文上限 65536 字符，留点余量。 */
        const val MAX_BODY = 60_000
        /** 生成令牌的页面（细粒度令牌）。 */
        const val TOKEN_PAGE = "https://github.com/settings/personal-access-tokens/new"
        private const val KEY_TOKEN = "github_token"
        private const val KEY_LAST_URL = "recon_issue_url"

        fun explain(code: Int) = when (code) {
            401 -> "令牌无效或已过期（HTTP 401）"
            403, 404 -> "令牌没有 ${Updates.REPO} 的 Issues 写权限（HTTP $code）"
            410 -> "仓库关闭了 Issues（HTTP 410）"
            422 -> "GitHub 拒绝了内容（HTTP 422）"
            else -> "GitHub 返回 HTTP $code"
        }

        /** 按行切成不超过 [max] 字符的几段（单行超长时硬切）。 */
        fun split(text: String, max: Int = MAX_BODY): List<String> {
            val parts = mutableListOf<String>()
            val cur = StringBuilder()
            for (piece in text.lines().flatMap { "$it\n".chunked(max) }) {
                if (cur.length + piece.length > max) { parts += cur.toString(); cur.clear() }
                cur.append(piece)
            }
            if (cur.isNotEmpty() || parts.isEmpty()) parts += cur.toString()
            return parts
        }
    }
}

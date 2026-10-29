package com.x0finch.q5home

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * 在线壁纸：连上 Wi-Fi 时（由 [WallpaperJob] 调度，每天最多一次）下载新的 Unsplash 壁纸。
 *
 * 来源二选一：
 *  - 默认：仓库里的精选清单 wallpapers/feed.json（往清单里加图，车机下次连 Wi-Fi 就会下载）。
 *  - config.json 里填了 unsplashKey：用 Unsplash API 随机取新图（按 wallpaperQuery 搜索）。
 *
 * 占用控制：图片由 Unsplash 服务器按屏幕宽度裁好再下载（单张约 150–300 KB）；
 * 最多保留 [MAX_COUNT] 张、总共不超过 [MAX_BYTES]，超出删最旧的；剩余空间不足时不下载。
 */
class OnlineWallpapers(private val context: Context) {

    class Photo(
        val id: String,
        val author: String,
        val link: String,
        val downloadedAt: Long,
    ) {
        val key get() = "$KEY_PREFIX$id"
        fun toJson(): JSONObject = JSONObject()
            .put("id", id).put("author", author).put("link", link).put("downloadedAt", downloadedAt)

        companion object {
            fun fromJson(o: JSONObject) = Photo(
                o.getString("id"), o.optString("author"), o.optString("link"), o.optLong("downloadedAt"),
            )
        }
    }

    /** 下载候选：图片地址 + 署名信息；trackUrl 是 Unsplash API 要求的下载统计地址。 */
    class Candidate(val id: String, val imageUrl: String, val author: String, val link: String, val trackUrl: String?)

    val dir: File = File(context.filesDir, "wallpapers").apply { mkdirs() }
    private val indexFile = File(dir, "index.json")

    /** 已下载的壁纸，新的在前。 */
    fun list(): List<Photo> {
        if (!indexFile.isFile) return emptyList()
        return runCatching {
            val arr = JSONArray(indexFile.readText())
            (0 until arr.length()).map { Photo.fromJson(arr.getJSONObject(it)) }
                .filter { fileOf(it).isFile }
                .sortedByDescending { it.downloadedAt }
        }.getOrDefault(emptyList())
    }

    fun fileOf(photo: Photo) = File(dir, "${photo.id}.img")

    fun find(key: String): Photo? = list().firstOrNull { it.key == key }

    fun clear() {
        dir.listFiles()?.forEach { it.delete() }
    }

    private fun save(photos: List<Photo>) {
        indexFile.writeText(JSONArray(photos.map { it.toJson() }).toString())
    }

    /** 按数量和总大小删掉最旧的；同时清理索引里没有的残留文件。 */
    fun prune(maxCount: Int = MAX_COUNT, maxBytes: Long = MAX_BYTES) {
        val kept = mutableListOf<Photo>()
        var bytes = 0L
        for (p in list()) {
            val size = fileOf(p).length()
            if (kept.size < maxCount && bytes + size <= maxBytes) {
                kept += p; bytes += size
            } else {
                fileOf(p).delete()
            }
        }
        save(kept)
        val keepNames = kept.map { "${it.id}.img" }.toSet() + indexFile.name
        dir.listFiles()?.filter { it.name !in keepNames }?.forEach { it.delete() }
    }

    /**
     * 更新一次：取候选、跳过已有的、最多下载 [PER_RUN] 张，然后清理。返回新下载的张数。
     * 在后台线程调用。
     */
    fun update(config: Config, screenWidth: Int): Int {
        if (dir.usableSpace < MIN_FREE_BYTES) {
            // 空间紧张：不下载，只留最新 2 张。
            prune(maxCount = 2)
            return 0
        }
        val width = screenWidth.coerceIn(960, 1920)
        val height = width * 3 / 8
        val have = list().map { it.id }.toSet()
        val candidates = (config.unsplashKey?.let { unsplashCandidates(it, config.wallpaperQuery, width, height) }
            ?: feedCandidates(config.wallpaperFeed, width, height))
            .filter { it.id !in have }
            .take(PER_RUN)

        var added = 0
        val photos = list().toMutableList()
        for (c in candidates) {
            val tmp = File(dir, "${c.id}.part")
            try {
                download(c.imageUrl, tmp, MAX_FILE_BYTES)
                tmp.renameTo(File(dir, "${c.id}.img"))
                photos += Photo(c.id, c.author, c.link, System.currentTimeMillis())
                save(photos)
                added++
                c.trackUrl?.let { runCatching { get(it) } }
            } catch (e: IOException) {
                tmp.delete()
            }
        }
        prune()
        return added
    }

    private fun feedCandidates(feedUrl: String, width: Int, height: Int): List<Candidate> {
        val json = JSONObject(get(feedUrl))
        val arr = json.getJSONArray("photos")
        // 清单里越靠后的越新，优先下载新的。
        return (arr.length() - 1 downTo 0).map { i ->
            val o = arr.getJSONObject(i)
            val id = o.getString("id")
            // url 可省略：默认是 Unsplash 图片服务器上的原图。
            val raw = o.optString("url").ifBlank { "https://images.unsplash.com/photo-$id" }
            Candidate(id, imageUrl(raw, width, height),
                o.optString("author"), o.optString("link", "https://unsplash.com"), null)
        }
    }

    private fun unsplashCandidates(key: String, query: String, width: Int, height: Int): List<Candidate> {
        val q = URLEncoder.encode(query, "UTF-8")
        val arr = JSONArray(get(
            "https://api.unsplash.com/photos/random?count=$PER_RUN&orientation=landscape&content_filter=high&query=$q",
            mapOf("Authorization" to "Client-ID $key", "Accept-Version" to "v1"),
        ))
        return (0 until arr.length()).map { i ->
            val o = arr.getJSONObject(i)
            val user = o.getJSONObject("user")
            val download = o.getJSONObject("links").getString("download_location")
            Candidate(
                id = o.getString("id"),
                imageUrl = imageUrl(o.getJSONObject("urls").getString("raw"), width, height),
                author = user.optString("name"),
                link = o.getJSONObject("links").optString("html"),
                trackUrl = "$download${if ('?' in download) '&' else '?'}client_id=$key",
            )
        }
    }

    private fun get(url: String, headers: Map<String, String> = emptyMap()): String {
        val conn = open(url, headers)
        try {
            if (conn.responseCode !in 200..299) throw IOException("HTTP ${conn.responseCode}: $url")
            return conn.inputStream.bufferedReader().use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }

    private fun download(url: String, target: File, limit: Long) {
        val conn = open(url, emptyMap())
        try {
            if (conn.responseCode !in 200..299) throw IOException("HTTP ${conn.responseCode}: $url")
            conn.inputStream.use { input ->
                target.outputStream().use { out ->
                    val buf = ByteArray(16 * 1024)
                    var total = 0L
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        total += n
                        if (total > limit) throw IOException("图片太大，放弃：$url")
                        out.write(buf, 0, n)
                    }
                }
            }
        } finally {
            conn.disconnect()
        }
    }

    private fun open(url: String, headers: Map<String, String>): HttpURLConnection =
        (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 30_000
            headers.forEach { (k, v) -> setRequestProperty(k, v) }
        }

    companion object {
        const val KEY_PREFIX = "u:"
        const val MAX_COUNT = 8
        const val MAX_BYTES = 6L * 1024 * 1024
        const val MAX_FILE_BYTES = 1536L * 1024
        const val MIN_FREE_BYTES = 300L * 1024 * 1024
        const val PER_RUN = 2
        const val DEFAULT_FEED =
            "https://raw.githubusercontent.com/x0finch/audi-q5-launcher/HEAD/wallpapers/feed.json"
        const val DEFAULT_QUERY = "night landscape"

        /** Unsplash 图片服务器按尺寸裁好、转 WebP，下载量最小。 */
        fun imageUrl(raw: String, width: Int, height: Int): String =
            "$raw${if ('?' in raw) '&' else '?'}w=$width&h=$height&fit=crop&crop=entropy&fm=webp&q=60"
    }
}

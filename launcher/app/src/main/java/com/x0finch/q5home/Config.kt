package com.x0finch.q5home

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** 首页一个常用应用磁贴：图标 key（见 [Icons]，null 表示用应用自带图标）+ 目标应用（见 [Targets]）。 */
data class DockItem(val icon: String?, val target: String) {
    fun toJson(): JSONObject = JSONObject().put("icon", icon ?: JSONObject.NULL).put("target", target)

    companion object {
        /** 接受 `"目标"` 或 `{"icon": "files", "target": "目标"}` 两种写法。 */
        fun parse(value: Any): DockItem = when (value) {
            is JSONObject -> DockItem(
                value.optString("icon").ifBlank { null }?.takeIf { it != "null" },
                value.getString("target"),
            )
            else -> DockItem(null, value.toString())
        }
    }
}

/**
 * 桌面配置。保存在 SharedPreferences；车上长按磁贴的修改直接写这里。
 *
 * 也可以用 adb 推一个 config.json 来批量设置（比如摸底查到原车切换组件之后）：
 *   adb push config.json /sdcard/Android/data/com.x0finch.q5home/files/config.json
 * 文件有变化时，下次回到桌面会合并进来。当前生效的配置会写到同目录的 current.json，方便 adb pull 检查。
 * 字段见 launcher/config.example.json，目标的写法见 [Targets]。
 */
class Config(private val context: Context) {

    private val prefs = context.getSharedPreferences("home", Context.MODE_PRIVATE)

    var carplay: String? = null; private set
    var oem: String? = null; private set
    var dock: List<DockItem> = emptyList(); private set
    var autoCarplay = false; private set
    var wallpaper = Wallpapers.DAILY; private set
    /** 自动轮换的频率（分钟）。 */
    var wallpaperInterval = Wallpapers.DEFAULT_INTERVAL; private set
    /** 自动轮换时按日出日落分白天 / 夜晚壁纸。 */
    var wallpaperSun = false; private set
    /** 首页时钟下面显示 GPS 车速、方向、海拔。 */
    var homeGps = true; private set
    /** 连 Wi-Fi 时自动下载新壁纸。 */
    var onlineWallpapers = true; private set
    /** 填了就用 Unsplash API 随机取图；不填用仓库里的精选清单。只能通过 config.json 设置。 */
    var unsplashKey: String? = null; private set
    var wallpaperQuery = OnlineWallpapers.DEFAULT_QUERY; private set
    var wallpaperFeed = OnlineWallpapers.DEFAULT_FEED; private set
    var title = DEFAULT_TITLE; private set

    /** 读取配置。返回 config.json 的错误信息，没有错误返回 null。 */
    fun reload(): String? {
        val error = importFile()
        // 没有手动指定（或留空）时每次重新检测，这样后装的 ZLINK / DiPlay 也能被找到。
        carplay = prefs.getString(KEY_CARPLAY, null)?.ifBlank { null } ?: Targets.findCarPlay(context)
        oem = prefs.getString(KEY_OEM, null)?.ifBlank { null } ?: Targets.findOem(context)
        dock = prefs.getString(KEY_DOCK, null)?.let(::parseDock) ?: defaultDock()
        autoCarplay = prefs.getBoolean(KEY_AUTO_CARPLAY, false)
        wallpaper = prefs.getString(KEY_WALLPAPER, Wallpapers.DAILY)!!
        wallpaperInterval = prefs.getInt(KEY_INTERVAL, Wallpapers.DEFAULT_INTERVAL).coerceIn(5, 1440)
        wallpaperSun = prefs.getBoolean(KEY_SUN, false)
        homeGps = prefs.getBoolean(KEY_HOME_GPS, true)
        onlineWallpapers = prefs.getBoolean(KEY_ONLINE, true)
        unsplashKey = prefs.getString(KEY_UNSPLASH_KEY, null)?.ifBlank { null }
        wallpaperQuery = prefs.getString(KEY_QUERY, null)?.ifBlank { null } ?: OnlineWallpapers.DEFAULT_QUERY
        wallpaperFeed = prefs.getString(KEY_FEED, null)?.ifBlank { null } ?: OnlineWallpapers.DEFAULT_FEED
        title = prefs.getString(KEY_TITLE, DEFAULT_TITLE)!!
        writeCurrent()
        return error
    }

    /** 默认常用应用：文件、设置。 */
    private fun defaultDock(): List<DockItem> = listOfNotNull(
        Targets.findFiles(context)?.let { DockItem("files", it) },
        DockItem("settings", Targets.SYSTEM_SETTINGS),
    )

    fun setCarplay(spec: String) = edit { putString(KEY_CARPLAY, spec) }
    fun setOem(spec: String) = edit { putString(KEY_OEM, spec) }
    fun setAutoCarplay(on: Boolean) = edit { putBoolean(KEY_AUTO_CARPLAY, on) }
    fun setWallpaper(key: String) = edit { putString(KEY_WALLPAPER, key) }
    fun setWallpaperInterval(minutes: Int) = edit { putInt(KEY_INTERVAL, minutes) }
    fun setWallpaperSun(on: Boolean) = edit { putBoolean(KEY_SUN, on) }
    fun setHomeGps(on: Boolean) = edit { putBoolean(KEY_HOME_GPS, on) }
    fun setOnlineWallpapers(on: Boolean) = edit { putBoolean(KEY_ONLINE, on) }

    fun setDock(items: List<DockItem>) =
        edit { putString(KEY_DOCK, JSONArray(items.map { it.toJson() }).toString()) }
    fun addToDock(target: String) {
        if (dock.none { it.target == target }) {
            setDock(dock + DockItem(Icons.guess(Targets.packageOf(target), Targets.label(context, target)), target))
        }
    }
    /** 换应用但保留图标：这就是"以后只换 app id"。 */
    fun replaceTarget(index: Int, target: String) =
        setDock(dock.toMutableList().also { it[index] = it[index].copy(target = target) })
    fun setIcon(index: Int, icon: String?) =
        setDock(dock.toMutableList().also { it[index] = it[index].copy(icon = icon) })
    fun removeFromDock(index: Int) = setDock(dock.toMutableList().also { it.removeAt(index) })
    fun moveInDock(index: Int, delta: Int) =
        setDock(dock.toMutableList().also { it.add(index + delta, it.removeAt(index)) })

    /** 恢复默认：清空车上的手动设置，回到 config.json（如果有）和自动检测的结果。 */
    fun reset() {
        // 连导入记录一起清掉：config.json 还在的话会重新导入（Unsplash key 等不会丢）。
        prefs.edit().clear().apply()
        reload()
    }

    private inline fun edit(block: android.content.SharedPreferences.Editor.() -> Unit) {
        prefs.edit().apply(block).apply()
        reload()
    }

    private fun parseDock(json: String): List<DockItem> {
        val arr = JSONArray(json)
        return (0 until arr.length()).map { DockItem.parse(arr.get(it)) }
    }

    private fun importFile(): String? {
        val dir = context.getExternalFilesDir(null) ?: return null
        val file = File(dir, FILE)
        if (!file.isFile || file.lastModified() == prefs.getLong(KEY_IMPORTED, 0)) return null
        return try {
            val json = JSONObject(file.readText())
            val e = prefs.edit()
            if (json.has("carplay")) e.putString(KEY_CARPLAY, json.getString("carplay"))
            if (json.has("oem")) e.putString(KEY_OEM, json.getString("oem"))
            if (json.has("title")) e.putString(KEY_TITLE, json.getString("title"))
            if (json.has("wallpaper")) e.putString(KEY_WALLPAPER, json.getString("wallpaper"))
            if (json.has("wallpaperInterval")) e.putInt(KEY_INTERVAL, json.getInt("wallpaperInterval"))
            if (json.has("wallpaperSun")) e.putBoolean(KEY_SUN, json.getBoolean("wallpaperSun"))
            if (json.has("homeGps")) e.putBoolean(KEY_HOME_GPS, json.getBoolean("homeGps"))
            if (json.has("onlineWallpapers")) e.putBoolean(KEY_ONLINE, json.getBoolean("onlineWallpapers"))
            if (json.has("unsplashKey")) e.putString(KEY_UNSPLASH_KEY, json.getString("unsplashKey"))
            if (json.has("wallpaperQuery")) e.putString(KEY_QUERY, json.getString("wallpaperQuery"))
            if (json.has("wallpaperFeed")) e.putString(KEY_FEED, json.getString("wallpaperFeed"))
            if (json.has("autoCarplay")) e.putBoolean(KEY_AUTO_CARPLAY, json.getBoolean("autoCarplay"))
            if (json.has("dock")) {
                // 先完整解析一遍，格式不对就整体不导入。
                val items = parseDock(json.getJSONArray("dock").toString())
                e.putString(KEY_DOCK, JSONArray(items.map { it.toJson() }).toString())
            }
            e.putLong(KEY_IMPORTED, file.lastModified()).apply()
            null
        } catch (ex: Exception) {
            // 记下时间戳，避免每次回桌面都重复报同一个错误。
            prefs.edit().putLong(KEY_IMPORTED, file.lastModified()).apply()
            ex.message ?: ex.toString()
        }
    }

    private fun writeCurrent() {
        val dir = context.getExternalFilesDir(null) ?: return
        val json = JSONObject()
            .put("carplay", carplay ?: JSONObject.NULL)
            .put("oem", oem ?: JSONObject.NULL)
            .put("dock", JSONArray(dock.map { it.toJson() }))
            .put("autoCarplay", autoCarplay)
            .put("wallpaper", wallpaper)
            .put("wallpaperInterval", wallpaperInterval)
            .put("wallpaperSun", wallpaperSun)
            .put("homeGps", homeGps)
            .put("onlineWallpapers", onlineWallpapers)
            // 不把 key 原文写出来，只说明有没有配置。
            .put("unsplashKey", if (unsplashKey != null) "(已配置)" else JSONObject.NULL)
            .put("wallpaperQuery", wallpaperQuery)
            .put("wallpaperFeed", wallpaperFeed)
            .put("title", title)
        runCatching { File(dir, CURRENT_FILE).writeText(json.toString(2)) }
    }

    companion object {
        const val FILE = "config.json"
        const val CURRENT_FILE = "current.json"
        private const val DEFAULT_TITLE = "AUDI Q5"
        private const val KEY_CARPLAY = "carplay"
        private const val KEY_OEM = "oem"
        private const val KEY_DOCK = "dock_v2"
        private const val KEY_AUTO_CARPLAY = "auto_carplay"
        private const val KEY_WALLPAPER = "wallpaper"
        private const val KEY_INTERVAL = "wallpaper_interval_min"
        private const val KEY_SUN = "wallpaper_sun"
        private const val KEY_HOME_GPS = "home_gps"
        private const val KEY_TITLE = "title"
        private const val KEY_ONLINE = "online_wallpapers"
        private const val KEY_UNSPLASH_KEY = "unsplash_key"
        private const val KEY_QUERY = "wallpaper_query"
        private const val KEY_FEED = "wallpaper_feed"
        private const val KEY_IMPORTED = "imported_mtime"
    }
}

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

    /** 恢复默认：清空所有手动设置（不影响 config.json 文件本身）。 */
    fun reset() {
        val imported = prefs.getLong(KEY_IMPORTED, 0)
        prefs.edit().clear().putLong(KEY_IMPORTED, imported).apply()
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
        private const val KEY_TITLE = "title"
        private const val KEY_IMPORTED = "imported_mtime"
    }
}

package com.x0finch.q5home

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * 桌面配置。保存在 SharedPreferences；车上长按磁贴的修改直接写这里。
 *
 * 也可以用 adb 推一个 config.json 来批量设置（比如摸底查到原车切换组件之后）：
 *   adb push config.json /sdcard/Android/data/com.x0finch.q5home/files/config.json
 * 文件有变化时，下次回到桌面会合并进来。当前生效的配置会写到同目录的 current.json，方便 adb pull 检查。
 *
 * config.json 的字段（都可省略）：
 *   { "carplay": "包名或目标", "oem": "目标", "dock": ["目标", ...],
 *     "autoCarplay": false, "title": "AUDI Q5" }
 * 目标的写法见 [Targets]。
 */
class Config(private val context: Context) {

    private val prefs = context.getSharedPreferences("home", Context.MODE_PRIVATE)

    var carplay: String? = null; private set
    var oem: String? = null; private set
    var dock: List<String> = emptyList(); private set
    var autoCarplay = false; private set
    var title = DEFAULT_TITLE; private set

    /** 读取配置。返回 config.json 的错误信息，没有错误返回 null。 */
    fun reload(): String? {
        val error = importFile()
        // 没有手动指定时每次重新检测，这样后装的 ZLINK / DiPlay 也能被找到。
        // 留空（""）也算没有指定。
        carplay = prefs.getString(KEY_CARPLAY, null)?.ifBlank { null } ?: Targets.findCarPlay(context)
        oem = prefs.getString(KEY_OEM, null)?.ifBlank { null } ?: Targets.findOem(context)
        dock = prefs.getString(KEY_DOCK, "")!!.split('\n').filter { it.isNotBlank() }
        autoCarplay = prefs.getBoolean(KEY_AUTO_CARPLAY, false)
        title = prefs.getString(KEY_TITLE, DEFAULT_TITLE)!!
        writeCurrent()
        return error
    }

    fun setCarplay(spec: String) = edit { putString(KEY_CARPLAY, spec) }
    fun setOem(spec: String) = edit { putString(KEY_OEM, spec) }
    fun setAutoCarplay(on: Boolean) = edit { putBoolean(KEY_AUTO_CARPLAY, on) }

    fun setDock(specs: List<String>) = edit { putString(KEY_DOCK, specs.joinToString("\n")) }
    fun addToDock(spec: String) { if (spec !in dock) setDock(dock + spec) }
    fun replaceInDock(index: Int, spec: String) =
        setDock(dock.toMutableList().also { it[index] = spec })
    fun removeFromDock(index: Int) = setDock(dock.toMutableList().also { it.removeAt(index) })

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
            if (json.has("autoCarplay")) e.putBoolean(KEY_AUTO_CARPLAY, json.getBoolean("autoCarplay"))
            if (json.has("dock")) {
                val arr = json.getJSONArray("dock")
                e.putString(KEY_DOCK, (0 until arr.length()).joinToString("\n") { arr.getString(it) })
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
            .put("dock", JSONArray(dock))
            .put("autoCarplay", autoCarplay)
            .put("title", title)
        runCatching { File(dir, CURRENT_FILE).writeText(json.toString(2)) }
    }

    companion object {
        const val FILE = "config.json"
        const val CURRENT_FILE = "current.json"
        private const val DEFAULT_TITLE = "AUDI Q5"
        private const val KEY_CARPLAY = "carplay"
        private const val KEY_OEM = "oem"
        private const val KEY_DOCK = "dock"
        private const val KEY_AUTO_CARPLAY = "auto_carplay"
        private const val KEY_TITLE = "title"
        private const val KEY_IMPORTED = "imported_mtime"
    }
}

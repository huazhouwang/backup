package com.x0finch.q5home

import android.app.Application
import android.content.Context
import android.os.Build
import org.json.JSONArray

/**
 * 崩溃保护：记录每次崩溃（版本号 + 时间），同一版本 [WINDOW_MS] 内崩溃 [LIMIT] 次就进入安全模式，
 * 避免桌面一启动就崩、按 HOME 反复崩溃、什么都点不了。
 *
 * 只统计当前版本：装了修复或回退版本后自动恢复正常；超过时间窗口的旧崩溃也不再算。
 */
object CrashGuard {
    const val LIMIT = 3
    const val WINDOW_MS = 10 * 60_000L
    private const val PREFS = "crash_guard"
    private const val KEY_CRASHES = "crashes"
    private const val KEY_LAST = "last_error"

    fun install(app: Application) {
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            // 进程马上会被杀掉，必须同步写入（commit，不是 apply）。
            runCatching { record(app, error) }
            previous?.uncaughtException(thread, error)
        }
    }

    fun record(context: Context, error: Throwable, now: Long = System.currentTimeMillis()) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val list = recent(context, now).toMutableList()
        list += now
        val version = versionCode(context)
        val arr = JSONArray(list.map { "$version:$it" })
        val trace = error.stackTraceToString().lineSequence().take(12).joinToString("\n")
        prefs.edit().putString(KEY_CRASHES, arr.toString()).putString(KEY_LAST, trace).commit()
    }

    /** 当前版本在时间窗口内的崩溃时间。 */
    fun recent(context: Context, now: Long = System.currentTimeMillis()): List<Long> {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_CRASHES, "[]")
        val version = versionCode(context)
        val arr = runCatching { JSONArray(raw) }.getOrElse { JSONArray() }
        return (0 until arr.length()).mapNotNull { i ->
            val (v, t) = arr.getString(i).split(':').let { it[0].toLong() to it[1].toLong() }
            t.takeIf { v == version && now - t <= WINDOW_MS }
        }
    }

    fun shouldEnterSafeMode(context: Context, now: Long = System.currentTimeMillis()) = recent(context, now).size >= LIMIT

    fun lastError(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_LAST, null)

    /** 用户在安全模式里选"再试一次"，或者新版本稳定运行后清零。 */
    fun reset(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().commit()
    }

    private fun versionCode(context: Context): Long {
        val info = context.packageManager.getPackageInfo(context.packageName, 0)
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode
        else @Suppress("DEPRECATION") info.versionCode.toLong()
    }
}

class Q5App : Application() {
    override fun onCreate() {
        super.onCreate()
        CrashGuard.install(this)
    }
}

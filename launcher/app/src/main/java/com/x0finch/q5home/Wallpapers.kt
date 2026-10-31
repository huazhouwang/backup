package com.x0finch.q5home

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.io.File
import java.util.Calendar

/** 壁纸：内置的（Unsplash，来源见仓库 CREDITS.md）+ 连 Wi-Fi 后自动下载的（[OnlineWallpapers]）。 */
object Wallpapers {

    class Wallpaper(
        val key: String,
        val name: String,
        val res: Int = 0,
        val file: File? = null,
        /** 在线壁纸的摄影师，显示在右下角。 */
        val author: String? = null,
        /** 夜景（日出日落模式里晚上用）；null = 按图片亮度判断。 */
        val night: Boolean? = null,
    )

    /** 自动轮换（key 沿用旧名 daily，轮换频率见 [INTERVALS]）。 */
    const val DAILY = "daily"
    const val NONE = "none"

    /** 可选的轮换频率（分钟）和名称；默认每天。 */
    val INTERVALS = listOf(30 to "30 分钟", 60 to "每小时", 180 to "3 小时", 1440 to "每天")
    const val DEFAULT_INTERVAL = 1440

    fun intervalName(minutes: Int) = INTERVALS.firstOrNull { it.first == minutes }?.second ?: "每 $minutes 分钟"

    val BUILTIN = listOf(
        Wallpaper("stars", "星空雪山", R.drawable.wall_stars, night = true),
        Wallpaper("city", "城市夜景", R.drawable.wall_city, night = true),
        Wallpaper("road", "峡谷公路", R.drawable.wall_road, night = false),
        Wallpaper("clouds", "云海", R.drawable.wall_clouds, night = false),
        Wallpaper("lake", "湖畔黄昏", R.drawable.wall_lake, night = true),
        Wallpaper("forest", "雾林", R.drawable.wall_forest, night = false),
    )

    /** 全部可选壁纸：在线下载的（新的在前）+ 内置的。 */
    fun available(context: Context): List<Wallpaper> {
        val store = OnlineWallpapers(context)
        val online = store.list().mapIndexed { i, p ->
            Wallpaper(p.key, "在线 · ${p.author.ifBlank { "#${i + 1}" }}", file = store.fileOf(p), author = p.author)
        }
        return online + BUILTIN
    }

    fun label(context: Context, setting: String, intervalMinutes: Int = DEFAULT_INTERVAL): String = when (setting) {
        DAILY -> "自动轮换 · ${intervalName(intervalMinutes)}"
        NONE -> "纯黑"
        else -> available(context).firstOrNull { it.key == setting }?.name ?: "自动轮换 · ${intervalName(intervalMinutes)}"
    }

    /**
     * 当前设置对应的壁纸；纯黑返回 null。自动轮换按时间段在全部壁纸里取：
     * 每天 = 一年中的第几天（和旧版本一样）；更短的频率 = 今年过去的分钟数 ÷ 频率。
     */
    fun current(context: Context, setting: String, calendar: Calendar = Calendar.getInstance(),
                intervalMinutes: Int = DEFAULT_INTERVAL, daylight: Boolean? = null): Wallpaper? {
        if (setting == NONE) return null
        val all = available(context)
        all.firstOrNull { it.key == setting }?.let { return it }
        // 自动轮换，或者指定的在线壁纸已被清理掉。日出日落模式：白天只轮换白天的，晚上只轮换夜景。
        val pool = daylight?.let { day -> all.filter { isNight(context, it) != day } }?.ifEmpty { null } ?: all
        return pool[slot(calendar, intervalMinutes) % pool.size]
    }

    /** 夜景还是白天：内置的写死；在线的按缩略图平均亮度判断一次，记下来。 */
    fun isNight(context: Context, w: Wallpaper): Boolean {
        w.night?.let { return it }
        val prefs = context.getSharedPreferences("wallpaper_night", Context.MODE_PRIVATE)
        if (prefs.contains(w.key)) return prefs.getBoolean(w.key, false)
        val night = brightness(context, w)?.let { it < NIGHT_BRIGHTNESS } ?: false
        prefs.edit().putBoolean(w.key, night).apply()
        return night
    }

    /** 平均亮度 0–1（缩成几十像素宽再算，很快）。 */
    fun brightness(context: Context, w: Wallpaper): Float? {
        val bmp = decode(context, w, 48) ?: return null
        val px = IntArray(bmp.width * bmp.height)
        bmp.getPixels(px, 0, bmp.width, 0, 0, bmp.width, bmp.height)
        if (px.isEmpty()) return null
        val sum = px.sumOf { c ->
            (0.2126 * ((c shr 16) and 0xFF) + 0.7152 * ((c shr 8) and 0xFF) + 0.0722 * (c and 0xFF)) / 255.0
        }
        return (sum / px.size).toFloat()
    }

    /** 平均亮度低于这个算夜景。 */
    const val NIGHT_BRIGHTNESS = 0.3f

    fun slot(calendar: Calendar, intervalMinutes: Int): Int {
        val day = calendar.get(Calendar.DAY_OF_YEAR)
        if (intervalMinutes >= 1440) return day
        val minutes = (day - 1) * 1440 + calendar.get(Calendar.HOUR_OF_DAY) * 60 + calendar.get(Calendar.MINUTE)
        return minutes / intervalMinutes.coerceAtLeast(1)
    }

    /** 按屏幕宽度缩小解码，16 位色，一张 1920×720 约 2.7 MB 内存。 */
    fun decode(context: Context, wallpaper: Wallpaper, targetWidth: Int): Bitmap? {
        val res = context.resources
        fun decodeWith(opts: BitmapFactory.Options): Bitmap? = when {
            wallpaper.file != null -> BitmapFactory.decodeFile(wallpaper.file.path, opts)
            else -> BitmapFactory.decodeResource(res, wallpaper.res, opts)
        }
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        decodeWith(bounds)
        if (bounds.outWidth <= 0) return null
        var sample = 1
        while (targetWidth > 0 && bounds.outWidth / (sample * 2) >= targetWidth) sample *= 2
        return decodeWith(BitmapFactory.Options().apply {
            inSampleSize = sample
            inPreferredConfig = Bitmap.Config.RGB_565
        })
    }
}

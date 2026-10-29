package com.x0finch.q5home

import android.content.res.Resources
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.util.Calendar

/** 内置壁纸（Unsplash，来源见仓库 CREDITS.md）。 */
object Wallpapers {

    class Wallpaper(val key: String, val name: String, val res: Int)

    const val DAILY = "daily"
    const val NONE = "none"

    val ALL = listOf(
        Wallpaper("stars", "星空雪山", R.drawable.wall_stars),
        Wallpaper("city", "城市夜景", R.drawable.wall_city),
        Wallpaper("road", "峡谷公路", R.drawable.wall_road),
        Wallpaper("clouds", "云海", R.drawable.wall_clouds),
        Wallpaper("lake", "湖畔黄昏", R.drawable.wall_lake),
        Wallpaper("forest", "雾林", R.drawable.wall_forest),
    )

    fun label(setting: String): String = when (setting) {
        DAILY -> "每日轮换"
        NONE -> "纯黑"
        else -> ALL.firstOrNull { it.key == setting }?.name ?: "每日轮换"
    }

    /** 当前设置对应的壁纸；纯黑返回 null。每日轮换按一年中的第几天取。 */
    fun current(setting: String, calendar: Calendar = Calendar.getInstance()): Wallpaper? = when (setting) {
        NONE -> null
        DAILY -> ALL[calendar.get(Calendar.DAY_OF_YEAR) % ALL.size]
        else -> ALL.firstOrNull { it.key == setting } ?: ALL[calendar.get(Calendar.DAY_OF_YEAR) % ALL.size]
    }

    /** 按屏幕宽度缩小解码，省内存。 */
    fun decode(res: Resources, wallpaper: Wallpaper, targetWidth: Int): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeResource(res, wallpaper.res, bounds)
        var sample = 1
        while (targetWidth > 0 && bounds.outWidth / (sample * 2) >= targetWidth) sample *= 2
        return BitmapFactory.decodeResource(res, wallpaper.res, BitmapFactory.Options().apply { inSampleSize = sample })
    }
}

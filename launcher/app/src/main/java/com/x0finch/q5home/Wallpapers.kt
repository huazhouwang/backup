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
    )

    const val DAILY = "daily"
    const val NONE = "none"

    val BUILTIN = listOf(
        Wallpaper("stars", "星空雪山", R.drawable.wall_stars),
        Wallpaper("city", "城市夜景", R.drawable.wall_city),
        Wallpaper("road", "峡谷公路", R.drawable.wall_road),
        Wallpaper("clouds", "云海", R.drawable.wall_clouds),
        Wallpaper("lake", "湖畔黄昏", R.drawable.wall_lake),
        Wallpaper("forest", "雾林", R.drawable.wall_forest),
    )

    /** 全部可选壁纸：在线下载的（新的在前）+ 内置的。 */
    fun available(context: Context): List<Wallpaper> {
        val store = OnlineWallpapers(context)
        val online = store.list().mapIndexed { i, p ->
            Wallpaper(p.key, "在线 · ${p.author.ifBlank { "#${i + 1}" }}", file = store.fileOf(p), author = p.author)
        }
        return online + BUILTIN
    }

    fun label(context: Context, setting: String): String = when (setting) {
        DAILY -> "每日轮换"
        NONE -> "纯黑"
        else -> available(context).firstOrNull { it.key == setting }?.name ?: "每日轮换"
    }

    /** 当前设置对应的壁纸；纯黑返回 null。每日轮换按一年中的第几天在全部壁纸里取。 */
    fun current(context: Context, setting: String, calendar: Calendar = Calendar.getInstance()): Wallpaper? {
        if (setting == NONE) return null
        val all = available(context)
        all.firstOrNull { it.key == setting }?.let { return it }
        // 每日轮换，或者指定的在线壁纸已被清理掉。
        return all[calendar.get(Calendar.DAY_OF_YEAR) % all.size]
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

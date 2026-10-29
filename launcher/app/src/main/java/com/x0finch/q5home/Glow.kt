package com.x0finch.q5home

import android.content.res.Resources
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import kotlin.math.sqrt

/** 环境光和磁贴配色。参考 CleanYourTV：用一张很小的位图拉伸成全屏光晕，比全屏渐变省资源。 */
object Glow {

    const val FALLBACK = 0xFF4F8CFF.toInt()

    /** 取图标的主色：只统计不透明、饱和度够的像素，按饱和度加权平均。 */
    fun dominantColor(icon: Drawable?): Int {
        if (icon == null) return FALLBACK
        val size = 24
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        icon.setBounds(0, 0, size, size)
        icon.draw(Canvas(bmp))
        var r = 0.0; var g = 0.0; var b = 0.0; var weight = 0.0
        val hsv = FloatArray(3)
        for (y in 0 until size) for (x in 0 until size) {
            val c = bmp.getPixel(x, y)
            if (Color.alpha(c) < 200) continue
            Color.colorToHSV(c, hsv)
            if (hsv[1] < 0.25f || hsv[2] < 0.2f) continue
            val w = hsv[1].toDouble()
            r += Color.red(c) * w; g += Color.green(c) * w; b += Color.blue(c) * w; weight += w
        }
        bmp.recycle()
        if (weight < 1.0) return FALLBACK
        val avg = Color.rgb((r / weight).toInt(), (g / weight).toInt(), (b / weight).toInt())
        // 提亮到统一的明度，避免暗色图标出来一团黑。
        Color.colorToHSV(avg, hsv)
        hsv[2] = maxOf(hsv[2], 0.85f)
        return Color.HSVToColor(hsv)
    }

    /** 把颜色压暗，用作磁贴底色。 */
    fun darken(color: Int, factor: Float): Int =
        Color.rgb(
            (Color.red(color) * factor).toInt(),
            (Color.green(color) * factor).toInt(),
            (Color.blue(color) * factor).toInt(),
        )

    /** 从左下角晕开的光，用 48x27 的位图拉伸到全屏。 */
    fun ambient(res: Resources, color: Int): Drawable {
        val w = 48; val h = 27
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val cx = w * 0.22f; val cy = h * 1.05f
        val radius = w * 0.75f
        for (y in 0 until h) for (x in 0 until w) {
            val dx = x - cx; val dy = (y - cy) * (w.toFloat() / h) * 0.6f
            val d = (sqrt(dx * dx + dy * dy) / radius).coerceAtMost(1f)
            val a = ((1f - d) * (1f - d) * 0.45f * 255).toInt()
            bmp.setPixel(x, y, Color.argb(a, Color.red(color), Color.green(color), Color.blue(color)))
        }
        return BitmapDrawable(res, bmp).apply { isFilterBitmap = true }
    }
}

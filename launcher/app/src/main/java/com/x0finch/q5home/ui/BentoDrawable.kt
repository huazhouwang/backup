package com.x0finch.q5home.ui

import android.graphics.Bitmap
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorFilter
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.drawable.Drawable
import android.util.LruCache

/**
 * Bento 卡片：质感来自三样东西——
 *  1. 多重投影（一层贴近的细影 + 几层大而柔、往下偏的影）；
 *  2. 1px 描边；
 *  3. 顶部内发光（卡片上沿一条亮边，往下渐隐）。
 *
 * 两种样式：
 *  - [Style.LIFTED] 抬起：投影扩散更大、y 更往下，像卡片浮起来（首页磁贴、弹出卡片）；
 *  - [Style.RESTING] 贴合：投影很浅，描边微微加深，卡片背景更亮（设置分组、按钮、按下时）。
 *
 * 投影在卡片外面画（需要父布局 clipChildren=false）。安卓 8.1 的硬件加速不支持形状的模糊阴影，
 * 所以投影先按 1/4 尺寸画成 ALPHA_8 小图（软件画布）缓存起来，再放大贴上，很省内存和 CPU。
 */
class BentoDrawable(
    private val radiusPx: Float,
    private val style: Style,
    private val density: Float,
    /** 卡片底色；null 用主题色。 */
    private val fill: Int? = null,
) : Drawable() {

    enum class Style { LIFTED, RESTING }

    /** 一层投影：y 偏移、模糊半径（dp）、不透明度。 */
    private class Shadow(val dy: Float, val blur: Float, val alpha: Float)

    private val dark = Ui.dark
    private val shadows = when (style) {
        Style.LIFTED -> listOf(Shadow(1f, 2f, 0.06f), Shadow(10f, 22f, 0.08f), Shadow(26f, 48f, 0.10f))
        Style.RESTING -> listOf(Shadow(1f, 2f, 0.05f), Shadow(4f, 10f, 0.05f))
    }.map { if (dark) Shadow(it.dy, it.blur, (it.alpha * 3f).coerceAtMost(0.45f)) else it }

    private val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG).apply { color = Color.BLACK }
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val rect = RectF()
    private val src = Rect()
    private val dst = RectF()
    private var shadowBitmap: Bitmap? = null
    private var alphaMul = 255
    private var strokeAlpha = 255

    /** 投影超出卡片的最大距离（px），父布局要留出这么多不裁剪的空间。 */
    val shadowExtent: Int get() = ((shadows.maxOf { it.dy + it.blur }) * density).toInt()

    override fun onBoundsChange(bounds: Rect) {
        super.onBoundsChange(bounds)
        shadowBitmap = if (bounds.isEmpty) null else shadowFor(bounds.width(), bounds.height())
        val w = Ui.cardColors(dark, style, fill)
        fillPaint.shader = LinearGradient(0f, bounds.top.toFloat(), 0f, bounds.bottom.toFloat(),
            w.top, w.bottom, Shader.TileMode.CLAMP)
        strokePaint.color = w.stroke
        strokeAlpha = Color.alpha(w.stroke)
        strokePaint.strokeWidth = density.coerceAtLeast(1f) // 1dp ≈ 1.5px，车机上看起来正好是一条细线
        // 内发光：上沿亮，往下 1/3 渐隐到透明。
        glowPaint.strokeWidth = density * 1.5f
        glowPaint.shader = LinearGradient(0f, bounds.top.toFloat(), 0f, bounds.top + bounds.height() / 3f,
            w.glow, Color.TRANSPARENT, Shader.TileMode.CLAMP)
    }

    private fun shadowFor(w: Int, h: Int): Bitmap {
        val key = "$w×$h×$radiusPx×$style×$dark"
        cache.get(key)?.let { return it }
        val pad = shadowExtent
        val bw = ((w + pad * 2) / SCALE).coerceAtLeast(1)
        val bh = ((h + pad * 2) / SCALE).coerceAtLeast(1)
        val bmp = Bitmap.createBitmap(bw, bh, Bitmap.Config.ALPHA_8)
        val c = Canvas(bmp)
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        for (s in shadows) {
            val blur = s.blur * density / SCALE
            p.maskFilter = if (blur >= 0.5f) BlurMaskFilter(blur, BlurMaskFilter.Blur.NORMAL) else null
            p.alpha = (s.alpha * 255).toInt()
            val r = radiusPx / SCALE
            val dy = s.dy * density / SCALE
            c.drawRoundRect(RectF(pad / SCALE.toFloat(), pad / SCALE.toFloat() + dy,
                (pad + w) / SCALE.toFloat(), (pad + h) / SCALE.toFloat() + dy), r, r, p)
        }
        cache.put(key, bmp)
        return bmp
    }

    override fun draw(canvas: Canvas) {
        val b = bounds
        rect.set(b)
        shadowBitmap?.let { bmp ->
            val pad = shadowExtent.toFloat()
            src.set(0, 0, bmp.width, bmp.height)
            dst.set(b.left - pad, b.top - pad, b.right + pad, b.bottom + pad)
            shadowPaint.alpha = alphaMul
            canvas.drawBitmap(bmp, src, dst, shadowPaint)
        }
        fillPaint.alpha = alphaMul
        canvas.drawRoundRect(rect, radiusPx, radiusPx, fillPaint)
        // 描边和内发光画在 0.5px 内侧，线条才清楚。
        val inset = strokePaint.strokeWidth / 2
        rect.inset(inset, inset)
        val r = radiusPx - inset
        glowPaint.alpha = alphaMul
        canvas.drawRoundRect(rect, r, r, glowPaint)
        strokePaint.alpha = strokeAlpha * alphaMul / 255
        canvas.drawRoundRect(rect, r, r, strokePaint)
    }

    override fun setAlpha(alpha: Int) { alphaMul = alpha; invalidateSelf() }
    override fun setColorFilter(colorFilter: ColorFilter?) {}
    @Deprecated("Deprecated in Java")
    override fun getOpacity() = PixelFormat.TRANSLUCENT

    companion object {
        /** 投影小图按 1/4 尺寸画（本来就是模糊的，放大看不出来）。 */
        private const val SCALE = 4
        private val cache = LruCache<String, Bitmap>(48)
    }
}

package com.x0finch.q5home.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.view.View

/**
 * 首页左边车辆卡里的"行车视图"（参考理想的智驾可视化）：三条车道往远处收拢，
 * 本车道一条蓝色轨迹，底部是自己的车（俯视）。纯装饰，不代表真实路况；车动起来时轨迹更亮。
 */
class RoadView(context: Context) : View(context) {

    private val density = resources.displayMetrics.density
    private val surface = Paint(Paint.ANTI_ALIAS_FLAG)
    private val lane = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val track = Paint(Paint.ANTI_ALIAS_FLAG)
    private val body = Paint(Paint.ANTI_ALIAS_FLAG)
    private val glass = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF2A2E35.toInt() }
    private val fade = Paint()
    private val fadeBottom = Paint()
    private val path = Path()
    private val rect = RectF()
    private var moving = false

    fun setMoving(value: Boolean) {
        if (value != moving) { moving = value; invalidate() }
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        surface.shader = LinearGradient(0f, 0f, 0f, h.toFloat(), 0x00FFFFFF, 0x0DFFFFFF, Shader.TileMode.CLAMP)
        body.shader = LinearGradient(0f, h * 0.6f, 0f, h.toFloat(), 0xFFE4E7EC.toInt(), 0xFF9CA3AD.toInt(), Shader.TileMode.CLAMP)
        // 上沿淡出到卡片底色，看起来路伸向远处。
        fade.shader = LinearGradient(0f, 0f, 0f, h * 0.35f, Ui.CARD, Ui.CARD and 0x00FFFFFF, Shader.TileMode.CLAMP)
        fadeBottom.shader = LinearGradient(0f, h * 0.82f, 0f, h.toFloat(), Ui.CARD and 0x00FFFFFF, Ui.CARD, Shader.TileMode.CLAMP)
    }

    override fun onDraw(canvas: Canvas) {
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0 || h <= 0) return
        val cx = w / 2
        val top = 0f
        val bottom = h
        val laneW = minOf(w * 0.27f, h * 0.55f)
        /** 车道线 k（-1.5..1.5）在 t（0 = 远处，1 = 近处）的 x。 */
        fun x(k: Float, t: Float) = cx + k * laneW * (0.08f + 0.92f * t)
        fun y(t: Float) = top + (bottom - top) * t

        // 路面
        path.reset()
        path.moveTo(x(-1.5f, 0f), y(0f)); path.lineTo(x(1.5f, 0f), y(0f))
        path.lineTo(x(1.5f, 1f), y(1f)); path.lineTo(x(-1.5f, 1f), y(1f)); path.close()
        canvas.drawPath(path, surface)

        // 本车道的蓝色轨迹：近处亮、远处淡。
        val trackAlpha = if (moving) 0xCC else 0x88
        track.shader = LinearGradient(0f, y(0.05f), 0f, y(1f),
            Ui.ACCENT and 0x00FFFFFF, (trackAlpha shl 24) or (Ui.ACCENT and 0x00FFFFFF), Shader.TileMode.CLAMP)
        path.reset()
        path.moveTo(x(-0.32f, 0.05f), y(0.05f)); path.lineTo(x(0.32f, 0.05f), y(0.05f))
        path.lineTo(x(0.32f, 1f), y(1f)); path.lineTo(x(-0.32f, 1f), y(1f)); path.close()
        canvas.drawPath(path, track)

        // 车道线：两边实线，中间两条虚线（越近越长越宽）。
        for (k in floatArrayOf(-1.5f, 1.5f)) strip(canvas, k, 0f, 1f, 0x38FFFFFF, ::x, ::y)
        for (k in floatArrayOf(-0.5f, 0.5f)) {
            var t = 0.02f
            while (t < 1f) {
                val len = 0.03f + 0.09f * t
                strip(canvas, k, t, (t + len).coerceAtMost(1f), 0x4DFFFFFF, ::x, ::y)
                t += len * 2.1f
            }
        }

        // 自己的车（俯视）：圆角车身 + 前挡 / 后挡。
        val carW = laneW * 0.4f
        val carH = carW * 1.9f
        val carBottom = h * 0.86f
        rect.set(cx - carW / 2, carBottom - carH, cx + carW / 2, carBottom)
        val r = carW * 0.32f
        canvas.drawRoundRect(rect, r, r, body)
        rect.set(cx - carW * 0.38f, carBottom - carH * 0.74f, cx + carW * 0.38f, carBottom - carH * 0.56f)
        canvas.drawRoundRect(rect, carW * 0.12f, carW * 0.12f, glass)
        rect.set(cx - carW * 0.36f, carBottom - carH * 0.2f, cx + carW * 0.36f, carBottom - carH * 0.1f)
        canvas.drawRoundRect(rect, carW * 0.1f, carW * 0.1f, glass)

        canvas.drawRect(0f, 0f, w, h * 0.35f, fade)
        canvas.drawRect(0f, h * 0.82f, w, h, fadeBottom)
    }

    /** 车道线的一段（梯形，近处宽）。 */
    private fun strip(canvas: Canvas, k: Float, t0: Float, t1: Float, color: Int,
                      x: (Float, Float) -> Float, y: (Float) -> Float) {
        lane.color = color
        val w0 = density * (0.4f + 2.2f * t0) / 2
        val w1 = density * (0.4f + 2.2f * t1) / 2
        path.reset()
        path.moveTo(x(k, t0) - w0, y(t0)); path.lineTo(x(k, t0) + w0, y(t0))
        path.lineTo(x(k, t1) + w1, y(t1)); path.lineTo(x(k, t1) - w1, y(t1)); path.close()
        canvas.drawPath(path, lane)
    }
}

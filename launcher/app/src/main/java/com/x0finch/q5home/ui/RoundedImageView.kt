package com.x0finch.q5home.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Path
import android.graphics.RectF
import android.widget.ImageView

/** 圆角图片（自己裁剪，不依赖硬件加速的 outline 裁剪，安卓 8.1 和截图测试里都一样）。 */
class RoundedImageView(context: Context, private val radiusDp: Float) : ImageView(context) {
    private val path = Path()
    private val rect = RectF()

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        val r = radiusDp * resources.displayMetrics.density
        rect.set(0f, 0f, w.toFloat(), h.toFloat())
        path.reset()
        path.addRoundRect(rect, r, r, Path.Direction.CW)
    }

    override fun onDraw(canvas: Canvas) {
        val save = canvas.save()
        canvas.clipPath(path)
        super.onDraw(canvas)
        canvas.restoreToCount(save)
    }
}

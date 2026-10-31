package com.x0finch.q5home.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Typeface
import android.view.View
import com.x0finch.q5home.HomeGps
import com.x0finch.q5home.R
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * 首页右边卡片的指南针（参考理想的天气卡）：表盘随车头方向转，正上方是车头朝向；
 * 中间大字方向 + 度数，北方标红。没有方向数据时表盘不转、中间显示"—"。
 */
class CompassView(context: Context) : View(context) {

    private val density = resources.displayMetrics.density
    private val scaled = resources.displayMetrics.scaledDensity
    private val light = runCatching { resources.getFont(R.font.outfit_light) }.getOrNull() ?: Typeface.DEFAULT
    private val regular = runCatching { resources.getFont(R.font.outfit_regular) }.getOrNull() ?: Typeface.DEFAULT
    private val tick = Paint(Paint.ANTI_ALIAS_FLAG).apply { strokeCap = Paint.Cap.ROUND }
    private val number = Paint(Paint.ANTI_ALIAS_FLAG).apply { textAlign = Paint.Align.CENTER; typeface = regular }
    private val cardinal = Paint(Paint.ANTI_ALIAS_FLAG).apply { textAlign = Paint.Align.CENTER }
    private val center = Paint(Paint.ANTI_ALIAS_FLAG).apply { textAlign = Paint.Align.CENTER }
    private val degrees = Paint(Paint.ANTI_ALIAS_FLAG).apply { textAlign = Paint.Align.CENTER; typeface = light }
    private val marker = Paint(Paint.ANTI_ALIAS_FLAG)
    private val path = Path()

    private var heading: Float? = null
    private var centerText = "—"
    private var degreeText = ""

    fun setHeading(value: Float?) {
        val v = value?.let { ((it % 360) + 360) % 360 }
        if (v != null && heading != null && kotlin.math.abs(v - heading!!) < 1f) return
        if (v == null && heading == null) return
        heading = v
        centerText = v?.let { HomeGps.compass(it) } ?: "—"
        degreeText = v?.let { "${it.roundToInt() % 360}°" } ?: "等待方向"
        contentDescription = if (v == null) "方向未知" else "朝向 $centerText $degreeText"
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        val cx = width / 2f
        val cy = height / 2f
        val outer = min(width, height) / 2f - 2 * density
        if (outer < 30 * density) return
        number.textSize = 10 * scaled
        val numberR = outer - number.textSize * 0.6f
        val tickOuter = numberR - number.textSize - 2 * density
        val rot = heading ?: 0f

        // 刻度：每 5°一格，每 30°长一点。
        for (deg in 0 until 360 step 5) {
            val a = Math.toRadians((deg - rot).toDouble() - 90)
            val major = deg % 30 == 0
            val len = if (major) 7 * density else 4 * density
            tick.strokeWidth = if (major) 1.5f * density else 1f * density
            tick.color = if (major) Ui.TEXT_DIM else Ui.TEXT_FAINT
            val c = cos(a).toFloat(); val s = sin(a).toFloat()
            canvas.drawLine(cx + c * tickOuter, cy + s * tickOuter, cx + c * (tickOuter - len), cy + s * (tickOuter - len), tick)
            // 正上方是指示线和北方小三角，那里的数字不画，免得挤在一起。
            val atTop = kotlin.math.abs((((deg - rot) % 360) + 540) % 360 - 180) < 15
            if (major && !atTop) {
                number.color = Ui.TEXT_FAINT
                canvas.drawText("$deg", cx + c * numberR, cy + s * numberR + number.textSize * 0.35f, number)
            }
        }

        // 东南西北，北标红。
        cardinal.textSize = 12 * scaled
        val cardR = tickOuter - 24 * density
        for ((deg, label) in listOf(0 to "北", 90 to "东", 180 to "南", 270 to "西")) {
            val a = Math.toRadians((deg - rot).toDouble() - 90)
            cardinal.color = if (deg == 0) 0xFFFF5A52.toInt() else Ui.TEXT_DIM
            canvas.drawText(label, cx + cos(a).toFloat() * cardR, cy + sin(a).toFloat() * cardR + cardinal.textSize * 0.36f, cardinal)
        }

        // 正上方的指示线（车头方向）。
        marker.color = Ui.TEXT
        marker.strokeWidth = 2 * density
        canvas.drawLine(cx, cy - tickOuter - 2 * density, cx, cy - tickOuter + 9 * density, marker)
        // 北方的小红三角（在表盘外沿）。
        val na = Math.toRadians((0 - rot).toDouble() - 90)
        val nx = cx + cos(na).toFloat() * (tickOuter + 3 * density)
        val ny = cy + sin(na).toFloat() * (tickOuter + 3 * density)
        path.reset()
        path.moveTo(nx + cos(na).toFloat() * 5 * density, ny + sin(na).toFloat() * 5 * density)
        val pa = na + Math.PI / 2
        path.lineTo(nx + cos(pa).toFloat() * 3.5f * density, ny + sin(pa).toFloat() * 3.5f * density)
        path.lineTo(nx - cos(pa).toFloat() * 3.5f * density, ny - sin(pa).toFloat() * 3.5f * density)
        path.close()
        marker.color = 0xFFFF5A52.toInt()
        canvas.drawPath(path, marker)

        // 中间：方向大字 + 度数。
        center.typeface = regular
        center.color = Ui.TEXT
        center.textSize = (if (centerText.length > 1) 20 else 26) * scaled
        canvas.drawText(centerText, cx, cy + center.textSize * 0.1f, center)
        degrees.color = Ui.TEXT_DIM
        degrees.textSize = 13 * scaled
        canvas.drawText(degreeText, cx, cy + center.textSize * 0.1f + degrees.textSize + 6 * density, degrees)
    }
}

package com.x0finch.q5home.ui

import android.app.Activity
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import com.x0finch.q5home.Config
import com.x0finch.q5home.R
import com.x0finch.q5home.Sun
import com.x0finch.q5home.Wallpapers

/**
 * 桌面里统一的界面风格（不用系统弹窗）：磨砂深色卡片、圆角、Outfit 字体、绿色强调色。
 * 车上操作：行高至少 56dp，字号偏大；旋钮 / 方向键选中时有白色描边。
 */
object Ui {
    const val ACCENT = 0xFF8EF0B0.toInt()
    const val DANGER = 0xFFFF6961.toInt()
    const val TEXT = 0xFFFFFFFF.toInt()
    const val TEXT_DIM = 0x99FFFFFF.toInt()
    const val TEXT_FAINT = 0x66FFFFFF
    const val CARD = 0xF21C1C1E.toInt()
    const val GROUP = 0xB31C1C1E.toInt()
    const val STROKE = 0x26FFFFFF
    const val DIVIDER = 0x1AFFFFFF
    const val SCRIM = 0x99000000.toInt()

    fun dp(context: Context, v: Number): Int = (v.toFloat() * context.resources.displayMetrics.density).toInt()

    fun rounded(context: Context, color: Int, radiusDp: Number, strokeColor: Int = 0, strokeDp: Number = 0): GradientDrawable =
        GradientDrawable().apply {
            setColor(color)
            cornerRadius = dp(context, radiusDp).toFloat()
            if (strokeColor != 0) setStroke(dp(context, strokeDp).coerceAtLeast(1), strokeColor)
        }

    fun card(context: Context, radiusDp: Number = 24): Drawable = rounded(context, CARD, radiusDp, STROKE, 1)

    /** 可点的一行：按下变亮；旋钮选中时白色描边。 */
    fun rowBackground(context: Context, radiusDp: Number = 14, selected: Boolean = false): Drawable =
        StateListDrawable().apply {
            addState(intArrayOf(android.R.attr.state_focused),
                rounded(context, 0x1FFFFFFF, radiusDp, 0xF2FFFFFF.toInt(), 2))
            addState(intArrayOf(android.R.attr.state_pressed), rounded(context, 0x26FFFFFF, radiusDp))
            addState(intArrayOf(), if (selected) rounded(context, 0x1FFFFFFF, radiusDp) else ColorDrawable(Color.TRANSPARENT))
        }

    enum class Font(val res: Int) { LIGHT(R.font.outfit_light), REGULAR(R.font.outfit_regular), MEDIUM(R.font.outfit_medium) }

    fun text(context: Context, value: CharSequence, sizeSp: Float, color: Int = TEXT, font: Font = Font.REGULAR,
             singleLine: Boolean = true): TextView = TextView(context).apply {
        text = value
        setTextColor(color)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
        typeface = context.resources.getFont(font.res)
        includeFontPadding = false
        if (singleLine) {
            isSingleLine = true
            ellipsize = TextUtils.TruncateAt.END
        } else {
            setLineSpacing(0f, 1.25f)
        }
    }

    fun glyph(context: Context, res: Int, sizeDp: Number, tint: Int = TEXT): ImageView = ImageView(context).apply {
        setImageResource(res)
        imageTintList = ColorStateList.valueOf(tint)
        layoutParams = LinearLayout.LayoutParams(dp(context, sizeDp), dp(context, sizeDp))
    }

    enum class PillStyle { PRIMARY, SECONDARY, DANGER }

    /** 胶囊按钮。 */
    fun pill(context: Context, label: String, style: PillStyle = PillStyle.SECONDARY, onClick: () -> Unit): TextView {
        val (bg, fg) = when (style) {
            PillStyle.PRIMARY -> ACCENT to 0xFF0B2A17.toInt()
            PillStyle.SECONDARY -> 0x26FFFFFF to TEXT
            PillStyle.DANGER -> 0x33FF6961 to DANGER
        }
        return text(context, label, 16f, fg, Font.MEDIUM).apply {
            gravity = Gravity.CENTER
            minWidth = dp(context, 88)
            setPadding(dp(context, 22), 0, dp(context, 22), 0)
            background = StateListDrawable().apply {
                addState(intArrayOf(android.R.attr.state_focused), rounded(context, bg, 24, 0xF2FFFFFF.toInt(), 2))
                addState(intArrayOf(android.R.attr.state_pressed), rounded(context, bg, 24).apply { alpha = 170 })
                addState(intArrayOf(), rounded(context, bg, 24))
            }
            isFocusable = true
            isClickable = true
            setOnClickListener { onClick() }
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(context, 48))
        }
    }

    /**
     * 设置页、应用列表等整页的背景：当前壁纸 + 较重的暗色遮罩，和首页连成一体。
     * 返回放内容的容器。
     */
    fun pageRoot(activity: Activity): FrameLayout {
        val root = FrameLayout(activity).apply { setBackgroundColor(Color.BLACK) }
        root.addView(ImageView(activity).apply { scaleType = ImageView.ScaleType.CENTER_CROP }, FrameLayout.LayoutParams(-1, -1))
        root.addView(View(activity).apply { setBackgroundColor(0xD9000000.toInt()) }, FrameLayout.LayoutParams(-1, -1))
        refreshPageWallpaper(activity, root)
        return root
    }

    /** 换壁纸后刷新整页背景（背景图是 [pageRoot] 的第一个子 View）。 */
    fun refreshPageWallpaper(activity: Activity, root: FrameLayout) {
        val image = root.getChildAt(0) as? ImageView ?: return
        val config = Config(activity).also { it.reload() }
        val bmp = Wallpapers.current(activity, config.wallpaper, intervalMinutes = config.wallpaperInterval,
            daylight = if (config.wallpaperSun) Sun.isDaylight(activity) else null)
            ?.let { Wallpapers.decode(activity, it, activity.resources.displayMetrics.widthPixels / 2) }
        image.setImageBitmap(bmp)
    }
}

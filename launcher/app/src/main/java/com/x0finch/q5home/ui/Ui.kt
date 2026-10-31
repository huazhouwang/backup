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
 * 桌面里统一的界面风格（不用系统弹窗），参考理想汽车车机：近黑页面、扁平深灰圆角卡片（不用投影和描边）、
 * 蓝色强调色、细字大数字。车上操作：行高至少 56dp，字号偏大；旋钮 / 方向键选中时有蓝色描边。
 */
object Ui {
    const val ACCENT = 0xFF3B76F6.toInt()
    /** 强调色上的文字 / 图形。 */
    const val ON_ACCENT = 0xFFFFFFFF.toInt()
    const val DANGER = 0xFFFF5A52.toInt()
    const val TEXT = 0xFFF2F3F5.toInt()
    const val TEXT_DIM = 0x99F2F3F5.toInt()
    const val TEXT_FAINT = 0x5CF2F3F5
    /** 页面底色（卡片之间的缝）。 */
    const val PAGE = 0xFF0A0B0D.toInt()
    /** 卡片 / 弹出层底色。 */
    const val CARD = 0xFF1A1C20.toInt()
    /** 卡片里再分一层（选中项、输入框、按钮底）。 */
    const val RAISED = 0xFF26292E.toInt()
    const val GROUP = 0xFF16181B.toInt()
    const val STROKE = 0x0FFFFFFF
    const val DIVIDER = 0x14FFFFFF
    const val SCRIM = 0xB3000000.toInt()

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
                rounded(context, RAISED, radiusDp, ACCENT, 2))
            addState(intArrayOf(android.R.attr.state_pressed), rounded(context, RAISED, radiusDp))
            addState(intArrayOf(), if (selected) rounded(context, RAISED, radiusDp) else ColorDrawable(Color.TRANSPARENT))
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

    /** 旋钮 / 方向键选中时的蓝色描边（叠在 foreground 上）。 */
    fun focusRing(context: Context, radiusDp: Number): Drawable = StateListDrawable().apply {
        addState(intArrayOf(android.R.attr.state_focused), rounded(context, Color.TRANSPARENT, radiusDp, ACCENT, 2))
        addState(intArrayOf(), ColorDrawable(Color.TRANSPARENT))
    }

    /** 胶囊按钮。 */
    fun pill(context: Context, label: String, style: PillStyle = PillStyle.SECONDARY, onClick: () -> Unit): TextView {
        val (bg, fg) = when (style) {
            PillStyle.PRIMARY -> ACCENT to ON_ACCENT
            PillStyle.SECONDARY -> RAISED to TEXT
            PillStyle.DANGER -> 0x33FF5A52 to DANGER
        }
        return text(context, label, 16f, fg, Font.REGULAR).apply {
            gravity = Gravity.CENTER
            minWidth = dp(context, 88)
            setPadding(dp(context, 22), 0, dp(context, 22), 0)
            // 理想的按钮是小圆角矩形，不是胶囊。
            background = StateListDrawable().apply {
                addState(intArrayOf(android.R.attr.state_focused), rounded(context, bg, 10, if (style == PillStyle.PRIMARY) TEXT else ACCENT, 2))
                addState(intArrayOf(android.R.attr.state_pressed), rounded(context, bg, 10).apply { alpha = 170 })
                addState(intArrayOf(), rounded(context, bg, 10))
            }
            isFocusable = true
            isClickable = true
            setOnClickListener { onClick() }
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(context, 48))
        }
    }

    /** 设置页、应用列表等整页的背景：和理想车机一样是纯色近黑（不再铺壁纸）。返回放内容的容器。 */
    fun pageRoot(activity: Activity): FrameLayout = FrameLayout(activity).apply { setBackgroundColor(PAGE) }
}

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
 * 桌面里统一的界面风格（不用系统弹窗）：极简 Bento 卡片（见 [BentoDrawable]）、圆角、Outfit 字体、蓝色强调色。
 * 白天浅色、夜里深色（按日出日落自动切换，也可以固定，见 [Config.appearance]）——车里夜间全白太刺眼。
 * 车上操作：行高至少 56dp，字号偏大；旋钮 / 方向键选中时有强调色描边。
 */
object Ui {
    /** 当前是不是深色。每个页面 onCreate 时用 [applyTheme] 定下来。 */
    @Volatile var dark = true
        private set

    /** 按设置算出该用深色还是浅色（auto = 日落后深色）。 */
    fun resolveDark(context: Context, appearance: String = Config(context).also { it.reload() }.appearance): Boolean =
        when (appearance) {
            Config.APPEARANCE_LIGHT -> false
            Config.APPEARANCE_DARK -> true
            else -> !Sun.isDaylight(context)
        }

    /** 定下当前页面的主题；返回是否和之前不同（首页据此 recreate）。 */
    fun applyTheme(context: Context, appearance: String? = null): Boolean {
        val d = if (appearance != null) resolveDark(context, appearance) else resolveDark(context)
        val changed = d != dark
        dark = d
        return changed
    }

    /** 测试 / 截图用。 */
    fun forceDark(value: Boolean) { dark = value }

    // ---- 颜色（随主题变）----
    val ACCENT get() = if (dark) 0xFF6E7DFF.toInt() else 0xFF2F48F5.toInt()
    val ON_ACCENT get() = 0xFFFFFFFF.toInt()
    val DANGER get() = if (dark) 0xFFFF6961.toInt() else 0xFFE5484D.toInt()
    val TEXT get() = if (dark) 0xFFFFFFFF.toInt() else 0xFF141414.toInt()
    val TEXT_DIM get() = if (dark) 0x99FFFFFF.toInt() else 0xFF6E6E6E.toInt()
    val TEXT_FAINT get() = if (dark) 0x66FFFFFF else 0xFF9C9C9C.toInt()
    /** 页面底色（设置、应用列表）。 */
    val PAGE get() = if (dark) 0xFF0F0F11.toInt() else 0xFFECEBE8.toInt()
    val DIVIDER get() = if (dark) 0x14FFFFFF else 0x12000000
    /** 弹出卡片后面压暗的遮罩。 */
    val SCRIM get() = if (dark) 0x99000000.toInt() else 0x59000000
    /** 进度条、开关关闭时的底色。 */
    val TRACK get() = if (dark) 0x26FFFFFF else 0x1A000000
    /** 按下时的高亮。 */
    val PRESSED get() = if (dark) 0x1FFFFFFF else 0x0F000000

    /** 卡片的上下渐变、描边、内发光颜色。贴合样式：背景更亮、描边更深。 */
    class CardColors(val top: Int, val bottom: Int, val stroke: Int, val glow: Int)

    fun cardColors(dark: Boolean, style: BentoDrawable.Style, fill: Int?): CardColors {
        val resting = style == BentoDrawable.Style.RESTING
        return if (dark) {
            val base = fill ?: if (resting) 0xFF232327.toInt() else 0xFF1C1C1F.toInt()
            CardColors(lighten(base, 0.05f), base, if (resting) 0x24FFFFFF else 0x17FFFFFF, 0x24FFFFFF)
        } else {
            val base = fill ?: if (resting) 0xFFFBFAF8.toInt() else 0xFFF4F3F0.toInt()
            CardColors(lighten(base, 0.6f), base, if (resting) 0x24000000 else 0x14000000, 0xE6FFFFFF.toInt())
        }
    }

    /**
     * 磨砂玻璃卡片的颜色：半透明底（后面是模糊的壁纸）、白色细边（玻璃边缘反光）、更亮的顶部内发光。
     * 贴合 RESTING 更不透明一点（按下 / 分组更"实"）。
     */
    fun glassColors(dark: Boolean, style: BentoDrawable.Style): CardColors {
        val resting = style == BentoDrawable.Style.RESTING
        return if (dark) {
            if (resting) CardColors(0x992C2C31.toInt(), 0x8C202024.toInt(), 0x2EFFFFFF, 0x3DFFFFFF)
            else CardColors(0x80292A2E.toInt(), 0x6B1A1A1D, 0x24FFFFFF, 0x38FFFFFF)
        } else {
            if (resting) CardColors(0xE0FFFFFF.toInt(), 0xCCFBFAF8.toInt(), 0xB3FFFFFF.toInt(), 0xFFFFFFFF.toInt())
            else CardColors(0xCCFFFFFF.toInt(), 0xA8F6F5F2.toInt(), 0x99FFFFFF.toInt(), 0xFFFFFFFF.toInt())
        }
    }

    private fun lighten(c: Int, t: Float) = Color.rgb(
        (Color.red(c) + (255 - Color.red(c)) * t).toInt(),
        (Color.green(c) + (255 - Color.green(c)) * t).toInt(),
        (Color.blue(c) + (255 - Color.blue(c)) * t).toInt(),
    )

    fun dp(context: Context, v: Number): Int = (v.toFloat() * context.resources.displayMetrics.density).toInt()

    fun rounded(context: Context, color: Int, radiusDp: Number, strokeColor: Int = 0, strokeDp: Number = 0): GradientDrawable =
        GradientDrawable().apply {
            setColor(color)
            cornerRadius = dp(context, radiusDp).toFloat()
            if (strokeColor != 0) setStroke(dp(context, strokeDp).coerceAtLeast(1), strokeColor)
        }

    /** Bento 卡片背景。抬起 = 首页磁贴、弹出卡片；贴合 = 设置分组、按钮。 */
    fun bento(context: Context, radiusDp: Number = 24, style: BentoDrawable.Style = BentoDrawable.Style.LIFTED,
              fill: Int? = null): BentoDrawable =
        BentoDrawable(dp(context, radiusDp).toFloat(), style, context.resources.displayMetrics.density, fill)

    /** 弹出卡片（菜单、确认框）。 */
    fun card(context: Context, radiusDp: Number = 24): Drawable = bento(context, radiusDp)

    /** 设置分组。 */
    fun group(context: Context, radiusDp: Number = 22): Drawable = bento(context, radiusDp, BentoDrawable.Style.RESTING)

    /** 旋钮 / 方向键选中时的强调色描边（叠在卡片上当 foreground）。 */
    fun focusRing(context: Context, radiusDp: Number): Drawable = StateListDrawable().apply {
        addState(intArrayOf(android.R.attr.state_focused),
            rounded(context, Color.TRANSPARENT, radiusDp, ACCENT, 2.5f))
        addState(intArrayOf(), ColorDrawable(Color.TRANSPARENT))
    }

    /** 可点的一行：按下变暗一点；选中（左侧分类）是一张贴合小卡片；旋钮选中时强调色描边。 */
    fun rowBackground(context: Context, radiusDp: Number = 14, selected: Boolean = false): Drawable =
        StateListDrawable().apply {
            addState(intArrayOf(android.R.attr.state_focused),
                rounded(context, if (selected) cardColors(dark, BentoDrawable.Style.RESTING, null).bottom else PRESSED,
                    radiusDp, ACCENT, 2))
            addState(intArrayOf(android.R.attr.state_pressed), rounded(context, PRESSED, radiusDp))
            addState(intArrayOf(), if (selected) bento(context, radiusDp, BentoDrawable.Style.RESTING)
                else ColorDrawable(Color.TRANSPARENT))
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

    /**
     * 胶囊按钮背景：普通的是一张抬起的小卡片，按下变成贴合（像被按下去）；主按钮是强调色实心。
     * 首页右上角的胶囊（叠在壁纸上）也用它。
     */
    fun pillBackground(context: Context, style: PillStyle = PillStyle.SECONDARY): Drawable {
        val r = 24
        return StateListDrawable().apply {
            when (style) {
                PillStyle.PRIMARY -> {
                    addState(intArrayOf(android.R.attr.state_focused), rounded(context, ACCENT, r, TEXT, 2))
                    addState(intArrayOf(android.R.attr.state_pressed), rounded(context, ACCENT, r).apply { alpha = 190 })
                    addState(intArrayOf(), bento(context, r, BentoDrawable.Style.LIFTED, fill = ACCENT))
                }
                PillStyle.DANGER -> {
                    val tint = DANGER and 0x00FFFFFF or (if (dark) 0x33000000 else 0x1F000000)
                    addState(intArrayOf(android.R.attr.state_focused), rounded(context, tint, r, ACCENT, 2))
                    addState(intArrayOf(android.R.attr.state_pressed), rounded(context, tint, r).apply { alpha = 170 })
                    addState(intArrayOf(), rounded(context, tint, r))
                }
                PillStyle.SECONDARY -> {
                    addState(intArrayOf(android.R.attr.state_focused),
                        rounded(context, cardColors(dark, BentoDrawable.Style.RESTING, null).bottom, r, ACCENT, 2))
                    addState(intArrayOf(android.R.attr.state_pressed), bento(context, r, BentoDrawable.Style.RESTING))
                    addState(intArrayOf(), bento(context, r, BentoDrawable.Style.LIFTED))
                }
            }
        }
    }

    fun pillText(style: PillStyle) = when (style) {
        PillStyle.PRIMARY -> ON_ACCENT
        PillStyle.SECONDARY -> TEXT
        PillStyle.DANGER -> DANGER
    }

    /** 胶囊按钮。 */
    fun pill(context: Context, label: String, style: PillStyle = PillStyle.SECONDARY, onClick: () -> Unit): TextView =
        text(context, label, 16f, pillText(style), Font.MEDIUM).apply {
            gravity = Gravity.CENTER
            minWidth = dp(context, 88)
            setPadding(dp(context, 22), 0, dp(context, 22), 0)
            background = pillBackground(context, style)
            isFocusable = true
            isClickable = true
            setOnClickListener { onClick() }
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(context, 48))
            // 按钮的投影画在自己外面：放进行 / 卡片后，往上两层不裁剪，否则投影被切成方块。
            addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
                override fun onViewAttachedToWindow(v: View) {
                    var p = v.parent
                    repeat(2) { (p as? ViewGroup)?.let { g -> g.clipChildren = false; g.clipToPadding = false }; p = p?.parent }
                }
                override fun onViewDetachedFromWindow(v: View) {}
            })
        }

    /** 让投影画到自己范围外面：卡片所在的各层容器都要关掉裁剪。 */
    fun allowShadows(vararg views: ViewGroup) = views.forEach { it.clipChildren = false; it.clipToPadding = false }

    /**
     * 设置页、应用列表等整页的背景：当前壁纸 + 很重的遮罩（浅色是米白、深色是黑），和首页连成一体又不抢内容。
     * 返回放内容的容器。
     */
    fun pageRoot(activity: Activity): FrameLayout {
        val root = FrameLayout(activity).apply { setBackgroundColor(PAGE) }
        root.addView(ImageView(activity).apply { scaleType = ImageView.ScaleType.CENTER_CROP }, FrameLayout.LayoutParams(-1, -1))
        root.addView(View(activity).apply {
            // 壁纸透出来（卡片是磨砂玻璃），但标题直接写在背景上，所以还是压一层。
            setBackgroundColor(if (dark) 0xBF0F0F11.toInt() else 0xC7ECEBE8.toInt())
        }, FrameLayout.LayoutParams(-1, -1))
        refreshPageWallpaper(activity, root)
        return root
    }

    /** 换壁纸后刷新整页背景（背景图是 [pageRoot] 的第一个子 View）。 */
    fun refreshPageWallpaper(activity: Activity, root: FrameLayout) {
        val image = root.getChildAt(0) as? ImageView ?: return
        val config = Config(activity).also { it.reload() }
        val wallpaper = Wallpapers.current(activity, config.wallpaper, intervalMinutes = config.wallpaperInterval,
            daylight = if (config.wallpaperSun) Sun.isDaylight(activity) else null)
        val bmp = wallpaper?.let { Wallpapers.decode(activity, it, activity.resources.displayMetrics.widthPixels / 2) }
        image.setImageBitmap(bmp)
        image.post {
            Glass.update(image, bmp, wallpaper?.key + "/half")
            Glass.invalidateTree(root)
        }
    }
}

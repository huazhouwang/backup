package com.x0finch.q5home

import android.app.Activity
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.drawable.Drawable
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.x0finch.q5home.ui.Menus
import com.x0finch.q5home.ui.Overlay
import com.x0finch.q5home.ui.Toggle
import com.x0finch.q5home.ui.Ui
import java.util.Locale

/** 整页设置：左边分类，右边内容。和首页同一套视觉，不用系统弹窗。 */
class SettingsActivity : Activity() {

    private lateinit var config: Config
    private lateinit var root: FrameLayout
    private lateinit var overlay: Overlay
    private lateinit var nav: LinearLayout
    private lateinit var content: LinearLayout
    private lateinit var scroll: ScrollView
    private var section = SECTION_WALLPAPER

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        config = Config(this).also { it.reload() }
        section = intent.getStringExtra(EXTRA_SECTION) ?: SECTION_WALLPAPER
        root = Ui.pageRoot(this)
        overlay = Overlay(root)

        val page = LinearLayout(this).apply {
            setPadding(dp(32), dp(24), dp(32), 0)
        }
        nav = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        page.addView(nav, LinearLayout.LayoutParams(dp(230), -1))
        scroll = ScrollView(this).apply { isVerticalScrollBarEnabled = false; clipToPadding = false }
        content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(8), dp(6), dp(8), dp(32))
        }
        scroll.addView(content)
        page.addView(scroll, LinearLayout.LayoutParams(0, -1, 1f).apply { marginStart = dp(24) })
        root.addView(page, FrameLayout.LayoutParams(-1, -1))
        setContentView(root)
        render()
    }

    override fun onResume() {
        super.onResume()
        config.reload()
        render()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (overlay.isShowing) overlay.dismiss() else super.onBackPressed()
    }

    private fun render() {
        renderNav()
        content.removeAllViews()
        when (section) {
            SECTION_CARPLAY -> renderCarPlay()
            SECTION_ADVANCED -> renderAdvanced()
            else -> renderWallpaper()
        }
    }

    // ---- 左侧分类 ----

    private fun renderNav() {
        nav.removeAllViews()
        nav.addView(Ui.text(this, "设置", 34f, Ui.TEXT, Ui.Font.LIGHT),
            LinearLayout.LayoutParams(-2, -2).apply { bottomMargin = dp(20); marginStart = dp(6) })
        navItem(SECTION_WALLPAPER, "壁纸", R.drawable.ui_wallpaper)
        navItem(SECTION_CARPLAY, "CarPlay 与原车", R.drawable.glyph_carplay)
        navItem(SECTION_ADVANCED, "高级", R.drawable.ui_tune)
        nav.addView(View(this), LinearLayout.LayoutParams(1, 0, 1f))
        nav.addView(Ui.pill(this, "返回桌面") { finish() },
            LinearLayout.LayoutParams(-2, dp(48)).apply { bottomMargin = dp(24) })
    }

    private fun navItem(key: String, label: String, icon: Int) {
        val selected = key == section
        val color = if (selected) Ui.ACCENT else Ui.TEXT_DIM
        nav.addView(LinearLayout(this).apply {
            gravity = Gravity.CENTER_VERTICAL
            minimumHeight = dp(56)
            setPadding(dp(14), 0, dp(14), 0)
            background = Ui.rowBackground(this@SettingsActivity, 16, selected)
            isFocusable = true
            isClickable = true
            addView(Ui.glyph(this@SettingsActivity, icon, 22, color).apply {
                (layoutParams as LinearLayout.LayoutParams).marginEnd = dp(14)
            })
            addView(Ui.text(this@SettingsActivity, label, 17f, if (selected) Ui.TEXT else Ui.TEXT_DIM,
                if (selected) Ui.Font.MEDIUM else Ui.Font.REGULAR))
            setOnClickListener {
                section = key
                scroll.scrollTo(0, 0)
                render()
            }
        }, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(4) })
    }

    // ---- 壁纸 ----

    private fun renderWallpaper() {
        header("壁纸", "当前：${Wallpapers.label(this, config.wallpaper)}")

        val all = Wallpapers.available(this)
        val strip = LinearLayout(this).apply { setPadding(0, dp(4), 0, dp(4)) }
        val today = Wallpapers.current(this, Wallpapers.DAILY)
        strip.addView(thumb(Wallpapers.DAILY, "每日轮换", today, badge = "每日"))
        all.forEach { strip.addView(thumb(it.key, it.name, it)) }
        strip.addView(thumb(Wallpapers.NONE, "纯黑", null))
        content.addView(HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            clipToPadding = false
            addView(strip)
        })

        subheader("在线壁纸")
        val store = OnlineWallpapers(this)
        val photos = store.list()
        val bytes = store.dir.listFiles()?.sumOf { it.length() } ?: 0L
        group(
            toggleRow(R.drawable.ui_wifi, "连 Wi-Fi 自动更新", "每天最多 ${OnlineWallpapers.PER_RUN} 张，只用 Wi-Fi，新图加入每日轮换",
                config.onlineWallpapers) { on ->
                config.setOnlineWallpapers(on)
                if (on) WallpaperJob.schedule(this) else WallpaperJob.cancel(this)
            },
            row(R.drawable.ui_refresh, "立即更新", "下次连上 Wi-Fi 时马上在后台下载",
                Ui.pill(this, "更新") {
                    if (!config.onlineWallpapers) config.setOnlineWallpapers(true)
                    WallpaperJob.schedule(this)
                    WallpaperJob.runSoon(this)
                    overlay.snackbar("已安排：连上 Wi-Fi 后在后台下载")
                    render()
                }),
            storageRow(photos.size, bytes),
        )
    }

    /** 壁纸缩略图：当前用的那张有绿色描边和对勾。 */
    private fun thumb(key: String, name: String, wallpaper: Wallpapers.Wallpaper?, badge: String? = null): View {
        val selected = key == config.wallpaper
        val w = dp(176); val h = w * 3 / 8
        val cell = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(4), dp(4), dp(4), dp(4))
            background = Ui.rowBackground(this@SettingsActivity, 18)
            isFocusable = true
            isClickable = true
            setOnClickListener {
                config.setWallpaper(key)
                Ui.refreshPageWallpaper(this@SettingsActivity, root)
                render()
            }
        }
        val frame = FrameLayout(this).apply {
            background = Ui.rounded(this@SettingsActivity, Color.BLACK, 14, Ui.STROKE, 1)
            clipToOutline = true
            foreground = if (selected) Ui.rounded(this@SettingsActivity, Color.TRANSPARENT, 14, Ui.ACCENT, 3) else null
        }
        wallpaper?.let { wp ->
            Wallpapers.decode(this, wp, w)?.let { bmp ->
                frame.addView(ImageView(this).apply {
                    setImageBitmap(bmp); scaleType = ImageView.ScaleType.CENTER_CROP
                }, FrameLayout.LayoutParams(-1, -1))
            }
        }
        badge?.let {
            frame.addView(Ui.text(this, it, 11f, Ui.TEXT, Ui.Font.MEDIUM).apply {
                background = Ui.rounded(this@SettingsActivity, 0x99000000.toInt(), 8)
                setPadding(dp(8), dp(3), dp(8), dp(3))
            }, FrameLayout.LayoutParams(-2, -2, Gravity.START or Gravity.BOTTOM).apply {
                setMargins(dp(8), 0, 0, dp(8))
            })
        }
        if (selected) {
            frame.addView(Ui.glyph(this, R.drawable.ui_check, 16, 0xFF0B2A17.toInt()).apply {
                background = Ui.rounded(this@SettingsActivity, Ui.ACCENT, 11)
                setPadding(dp(3), dp(3), dp(3), dp(3))
            }, FrameLayout.LayoutParams(dp(22), dp(22), Gravity.END or Gravity.TOP).apply {
                setMargins(0, dp(8), dp(8), 0)
            })
        }
        cell.addView(frame, LinearLayout.LayoutParams(w, h))
        cell.addView(Ui.text(this, name, 13f, if (selected) Ui.ACCENT else Ui.TEXT_DIM,
            if (selected) Ui.Font.MEDIUM else Ui.Font.REGULAR),
            LinearLayout.LayoutParams(w, -2).apply { topMargin = dp(8); bottomMargin = dp(2) })
        cell.layoutParams = LinearLayout.LayoutParams(-2, -2).apply { marginEnd = dp(6) }
        return cell
    }

    private fun storageRow(count: Int, bytes: Long): View {
        val mb = bytes / 1024.0 / 1024.0
        val maxMb = OnlineWallpapers.MAX_BYTES / 1024.0 / 1024.0
        val texts = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        texts.addView(Ui.text(this, "已下载 $count 张", 17f))
        texts.addView(Ui.text(this, String.format(Locale.US, "占用 %.1f MB，上限 %.0f MB / %d 张，空间不足时自动停止",
            mb, maxMb, OnlineWallpapers.MAX_COUNT), 13f, Ui.TEXT_DIM),
            LinearLayout.LayoutParams(-2, -2).apply { topMargin = dp(4) })
        texts.addView(Meter(this, (bytes.toFloat() / OnlineWallpapers.MAX_BYTES).coerceIn(0f, 1f)),
            LinearLayout.LayoutParams(-1, dp(6)).apply { topMargin = dp(10) })
        val clear = Ui.pill(this, "清除", Ui.PillStyle.DANGER) {
            Menus.confirm(overlay, this, "清除在线壁纸", "删除已下载的 $count 张在线壁纸？内置壁纸不受影响。", "清除", danger = true) {
                OnlineWallpapers(this).clear()
                if (config.wallpaper.startsWith(OnlineWallpapers.KEY_PREFIX)) config.setWallpaper(Wallpapers.DAILY)
                Ui.refreshPageWallpaper(this, root)
                overlay.snackbar("已清除")
                render()
            }
        }
        clear.isEnabled = count > 0
        clear.alpha = if (count > 0) 1f else 0.4f
        return rowWith(R.drawable.ui_delete, texts, clear)
    }

    /** 存储占用条。 */
    private class Meter(context: android.content.Context, private val fraction: Float) : View(context) {
        private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        override fun onDraw(canvas: Canvas) {
            val r = height / 2f
            paint.color = 0x26FFFFFF
            canvas.drawRoundRect(RectF(0f, 0f, width.toFloat(), height.toFloat()), r, r, paint)
            paint.color = if (fraction > 0.85f) Ui.DANGER else Ui.ACCENT
            canvas.drawRoundRect(RectF(0f, 0f, width * fraction, height.toFloat()), r, r, paint)
        }
    }

    // ---- CarPlay 与原车 ----

    private fun renderCarPlay() {
        header("CarPlay 与原车", "首页两个固定入口打开哪个应用")
        group(
            appRow("carplay", "CarPlay 应用", config.carplay, "没找到 ZLINK / DiPlay，点更换手动选") { pick(REQ_CARPLAY) },
            toggleRow(R.drawable.ui_power, "开机自动进入 CarPlay", "开机后第一次回到桌面时自动打开", config.autoCarplay) { on ->
                config.setAutoCarplay(on)
            },
        )
        subheader("原车")
        group(
            appRow("oem", "原车入口", config.oem, "摸底查到切换方式后用 config.json 配置") { pick(REQ_OEM) },
        )
        hint("如果原车画面是用广播切换的，只能通过 config.json 的 oem 字段配置（写法见 README）。")
    }

    private fun appRow(iconKey: String, title: String, spec: String?, emptyHint: String, onChange: () -> Unit): View {
        val available = Targets.isAvailable(this, spec)
        val sub = when {
            spec == null -> emptyHint
            !available -> "找不到：$spec"
            else -> Targets.label(this, spec)?.let { "$it  ·  ${spec.substringBefore('/')}" } ?: spec
        }
        val icon: Drawable = Icons.badge(this, Icons.byKey(iconKey)!!)
        val texts = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        texts.addView(Ui.text(this, title, 17f))
        texts.addView(Ui.text(this, sub, 13f, if (spec != null && !available) Ui.DANGER else Ui.TEXT_DIM),
            LinearLayout.LayoutParams(-2, -2).apply { topMargin = dp(4) })
        return rowWith(null, texts, Ui.pill(this, "更换") { onChange() }, leading = ImageView(this).apply {
            setImageDrawable(icon)
            layoutParams = LinearLayout.LayoutParams(dp(40), dp(40))
        })
    }

    private fun pick(requestCode: Int) {
        startActivityForResult(Intent(this, LibraryActivity::class.java).putExtra(LibraryActivity.EXTRA_PICK, true), requestCode)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        val spec = data?.getStringExtra(LibraryActivity.EXTRA_SPEC)
        if (resultCode != RESULT_OK || spec == null) return
        when (requestCode) {
            REQ_CARPLAY -> config.setCarplay(spec)
            REQ_OEM -> config.setOem(spec)
        }
        overlay.snackbar("已更换为 ${Targets.label(this, spec) ?: spec}")
        render()
    }

    // ---- 高级 ----

    private fun renderAdvanced() {
        header("高级", "系统设置、恢复默认、配置文件")
        group(
            row(R.drawable.glyph_settings, "系统设置", "打开安卓自带的设置", chevron()) {
                runCatching { startActivity(Intent(Settings.ACTION_SETTINGS)) }
                    .onFailure { overlay.snackbar("车机不支持这个页面") }
            },
            row(R.drawable.ui_restart, "恢复默认布局", "清空车上的手动设置，回到 config.json 和自动检测", chevron(), danger = true) {
                Menus.confirm(overlay, this, "恢复默认布局",
                    "会清空手动设置的 CarPlay、原车入口、常用应用和壁纸选择。", "恢复", danger = true) {
                    config.reset()
                    Ui.refreshPageWallpaper(this, root)
                    overlay.snackbar("已恢复默认")
                    render()
                }
            },
        )

        subheader("配置文件")
        val dir = getExternalFilesDir(null)?.absolutePath ?: "(不可用)"
        group(
            info("推送配置（adb push）", "$dir/${Config.FILE}"),
            info("当前生效（adb pull）", "$dir/${Config.CURRENT_FILE}"),
            info("CarPlay", config.carplay ?: "未设置"),
            info("原车", config.oem ?: "未设置"),
            info("在线壁纸来源", if (config.unsplashKey != null) "Unsplash API（${config.wallpaperQuery}）" else config.wallpaperFeed),
        )

        subheader("关于")
        val version = runCatching { packageManager.getPackageInfo(packageName, 0).versionName }.getOrNull() ?: ""
        group(
            info("Q5 Home", "版本 $version"),
            info("致谢", "壁纸 Unsplash · 图标 Material Symbols · 字体 Outfit · 风格参考 CleanYourTV"),
        )
    }

    // ---- 通用小组件 ----

    private fun header(title: String, sub: String) {
        content.addView(Ui.text(this, title, 30f, Ui.TEXT, Ui.Font.LIGHT))
        content.addView(Ui.text(this, sub, 14f, Ui.TEXT_DIM),
            LinearLayout.LayoutParams(-2, -2).apply { topMargin = dp(8); bottomMargin = dp(18) })
    }

    private fun subheader(title: String) {
        content.addView(Ui.text(this, title, 13f, Ui.TEXT_DIM, Ui.Font.MEDIUM).apply { letterSpacing = 0.12f },
            LinearLayout.LayoutParams(-2, -2).apply { topMargin = dp(26); bottomMargin = dp(10); marginStart = dp(6) })
    }

    private fun hint(text: String) {
        content.addView(Ui.text(this, text, 13f, Ui.TEXT_FAINT, singleLine = false),
            LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(12); marginStart = dp(6) })
    }

    /** 圆角分组，行之间有分隔线。 */
    private fun group(vararg rows: View) {
        val g = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = Ui.rounded(this@SettingsActivity, Ui.GROUP, 20, Ui.STROKE, 1)
            setPadding(dp(6), dp(6), dp(6), dp(6))
        }
        rows.forEachIndexed { i, r ->
            if (i > 0) g.addView(View(this).apply { setBackgroundColor(Ui.DIVIDER) },
                LinearLayout.LayoutParams(-1, 1).apply { setMargins(dp(14), dp(2), dp(14), dp(2)) })
            g.addView(r)
        }
        content.addView(g)
    }

    private fun row(icon: Int?, title: String, sub: String?, trailing: View?, danger: Boolean = false,
                    onClick: (() -> Unit)? = null): View {
        val texts = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        texts.addView(Ui.text(this, title, 17f, if (danger) Ui.DANGER else Ui.TEXT))
        sub?.let {
            texts.addView(Ui.text(this, it, 13f, Ui.TEXT_DIM), LinearLayout.LayoutParams(-2, -2).apply { topMargin = dp(4) })
        }
        return rowWith(icon, texts, trailing, onClick = onClick, danger = danger)
    }

    private fun rowWith(icon: Int?, texts: View, trailing: View?, leading: View? = null,
                        onClick: (() -> Unit)? = null, danger: Boolean = false): View =
        LinearLayout(this).apply {
            gravity = Gravity.CENTER_VERTICAL
            minimumHeight = dp(68)
            setPadding(dp(14), dp(10), dp(14), dp(10))
            val lead = leading ?: icon?.let { Ui.glyph(this@SettingsActivity, it, 24, if (danger) Ui.DANGER else Ui.TEXT_DIM) }
            lead?.let {
                addView(it)
                (it.layoutParams as LinearLayout.LayoutParams).marginEnd = dp(16)
            }
            addView(texts, LinearLayout.LayoutParams(0, -2, 1f))
            trailing?.let {
                addView(it)
                (it.layoutParams as? LinearLayout.LayoutParams)?.marginStart = dp(12)
            }
            if (onClick != null) {
                background = Ui.rowBackground(this@SettingsActivity, 14)
                isFocusable = true
                isClickable = true
                setOnClickListener { onClick() }
            }
        }

    private fun toggleRow(icon: Int, title: String, sub: String, checked: Boolean, onChange: (Boolean) -> Unit): View {
        val toggle = Toggle(this).apply { setChecked(checked, animate = false) }
        return row(icon, title, sub, toggle) {
            toggle.setChecked(!toggle.checked)
            onChange(toggle.checked)
        }
    }

    private fun info(title: String, value: String): View {
        val texts = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        texts.addView(Ui.text(this, title, 13f, Ui.TEXT_DIM))
        texts.addView(Ui.text(this, value, 15f, Ui.TEXT, singleLine = false).apply { setTextIsSelectable(true) },
            LinearLayout.LayoutParams(-2, -2).apply { topMargin = dp(4) })
        return rowWith(null, texts, null).apply { minimumHeight = dp(56) }
    }

    private fun chevron(): View = Ui.glyph(this, R.drawable.ui_chevron, 24, Ui.TEXT_FAINT)

    private fun dp(v: Int) = Ui.dp(this, v)

    companion object {
        const val EXTRA_SECTION = "section"
        const val SECTION_WALLPAPER = "wallpaper"
        const val SECTION_CARPLAY = "carplay"
        const val SECTION_ADVANCED = "advanced"
        private const val REQ_CARPLAY = 1
        private const val REQ_OEM = 2
    }
}

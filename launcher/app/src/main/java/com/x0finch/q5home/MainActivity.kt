package com.x0finch.q5home

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import com.x0finch.q5home.ui.MenuItem
import com.x0finch.q5home.ui.Menus
import com.x0finch.q5home.ui.Overlay
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

class MainActivity : Activity() {

    private enum class Slot { CARPLAY, OEM, DOCK, ADD }

    private class Tile(
        val slot: Slot,
        val index: Int,
        val spec: String?,
        val icon: Icons.Icon?,
        val title: String,
        val sub: String,
        val wide: Boolean,
    )

    /** 挂在磁贴 View 上，供焦点 / 触摸时更新顶部信息。 */
    private class TileInfo(val tile: Tile, val color: Int)

    private lateinit var config: Config
    private lateinit var root: View
    private lateinit var wallpaperView: ImageView
    private lateinit var scrim: View
    private lateinit var credit: TextView
    private lateinit var ambient: View
    private lateinit var tiles: LinearLayout
    private lateinit var tileScroll: HorizontalScrollView
    private lateinit var heroName: TextView
    private lateinit var heroSub: TextView
    private lateinit var greeting: TextView
    private lateinit var date: TextView

    private val handler = Handler(Looper.getMainLooper())
    private var tileHeight = 0
    private var ambientColor = 0
    private var shownWallpaper: String? = null
    private lateinit var overlay: Overlay
    private var started = false

    private val timeReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            updateGreeting()
            updateWallpaper()
        }
    }

    private val packageReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            config.reload()
            rebuild()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // 这个版本最近连续崩溃：先进安全模式，别让桌面卡死在反复崩溃里。
        if (CrashGuard.shouldEnterSafeMode(this)) {
            startActivity(Intent(this, SafeModeActivity::class.java))
            finish()
            return
        }
        maybeCrashForTest(intent)
        setContentView(R.layout.activity_main)
        root = findViewById(R.id.root)
        wallpaperView = findViewById(R.id.wallpaper)
        scrim = findViewById(R.id.scrim)
        credit = findViewById(R.id.credit)
        ambient = findViewById(R.id.ambient)
        tiles = findViewById(R.id.tiles)
        tileScroll = findViewById(R.id.tileScroll)
        heroName = findViewById(R.id.heroName)
        heroSub = findViewById(R.id.heroSub)
        greeting = findViewById(R.id.greeting)
        date = findViewById(R.id.date)

        overlay = Overlay(root as FrameLayout)
        config = Config(this)
        config.reload()?.let { toast("config.json 有误：$it") }

        findViewById<View>(R.id.pillApps).setOnClickListener {
            startActivity(Intent(this, LibraryActivity::class.java))
        }
        findViewById<View>(R.id.pillSettings).setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }

        // 磁贴大小跟着安卓区域的高度走：车机分辨率和 WY 侧栏占位还没摸清，先做成自适应。
        root.addOnLayoutChangeListener { _, _, top, _, bottom, _, oldTop, _, oldBottom ->
            if (bottom - top != oldBottom - oldTop) {
                val h = (bottom - top) * 0.36f
                val newHeight = h.toInt().coerceIn(dp(96), dp(170))
                if (newHeight != tileHeight) {
                    tileHeight = newHeight
                    handler.post { rebuild() }
                }
            }
        }

        registerReceiver(packageReceiver, IntentFilter().apply {
            addAction(Intent.ACTION_PACKAGE_ADDED)
            addAction(Intent.ACTION_PACKAGE_REMOVED)
            addAction(Intent.ACTION_PACKAGE_CHANGED)
            addDataScheme("package")
        })
        registerReceiver(timeReceiver, IntentFilter().apply {
            addAction(Intent.ACTION_TIME_TICK)
            addAction(Intent.ACTION_TIME_CHANGED)
            addAction(Intent.ACTION_TIMEZONE_CHANGED)
        })

        if (config.onlineWallpapers) WallpaperJob.schedule(this)
        if (Updates(this).autoCheck) UpdateJob.schedule(this)
        findViewById<View>(R.id.pillUpdate).setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java)
                .putExtra(SettingsActivity.EXTRA_SECTION, SettingsActivity.SECTION_UPDATE))
        }

        maybeAutoStartCarPlay()
        started = true
    }

    /**
     * CI 用来验证安全模式：带 crash_test 参数启动、且外部文件目录里有 crash-test 标记文件（只有 adb 能放）时故意崩溃。
     */
    private fun maybeCrashForTest(intent: Intent?) {
        if (intent?.getBooleanExtra("crash_test", false) == true &&
            java.io.File(getExternalFilesDir(null), "crash-test").exists()) {
            throw IllegalStateException("crash_test：故意崩溃，用来测试安全模式")
        }
    }

    override fun onDestroy() {
        if (!started) { super.onDestroy(); return }
        unregisterReceiver(timeReceiver)
        unregisterReceiver(packageReceiver)
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

    override fun onResume() {
        super.onResume()
        if (!started) return // 已经转去安全模式，没有初始化界面
        config.reload()?.let { toast("config.json 有误：$it") }
        updateGreeting()
        updateWallpaper()
        updateBadge()
        rebuild()
    }

    /** 有新版本时右上角显示绿色胶囊。 */
    private fun updateBadge() {
        val updates = Updates(this)
        val pill = findViewById<TextView>(R.id.pillUpdate)
        val latest = updates.latest
        pill.visibility = if (updates.hasUpdate && latest != null) View.VISIBLE else View.GONE
        if (latest != null) pill.text = "新版本 ${latest.versionName}"
    }

    /** 已经在桌面时再按 HOME：回到最左边，关掉弹窗。 */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        maybeCrashForTest(intent)
        overlay.dismiss(animate = false)
        // 清掉焦点再回到最左边，否则获得焦点的磁贴会把滚动位置拉回去。
        currentFocus?.clearFocus()
        tileScroll.scrollTo(0, 0)
        tileScroll.post {
            tileScroll.scrollTo(0, 0)
            // 用旋钮 / 方向键时，回到桌面后焦点落在 CarPlay 上。
            if (!root.isInTouchMode) findViewById<View>(R.id.firstTile)?.requestFocus()
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // 桌面上按返回只关闭弹出的卡片，不做别的。
        overlay.dismiss()
    }

    /** 开机后第一次显示桌面时，按设置自动打开 CarPlay。 */
    private fun maybeAutoStartCarPlay() {
        if (bootHandled) return
        bootHandled = true
        if (!config.autoCarplay || SystemClock.elapsedRealtime() > 5 * 60_000) return
        handler.postDelayed({ Targets.launch(this, config.carplay) }, 2500)
    }

    private fun updateGreeting() {
        val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
        val hello = when (hour) {
            in 5..10 -> "早上好"
            in 11..12 -> "中午好"
            in 13..17 -> "下午好"
            in 18..22 -> "晚上好"
            else -> "夜深了"
        }
        greeting.text = "$hello  ·  ${config.title}"
        date.text = SimpleDateFormat("M月d日 EEEE", Locale.CHINA).format(Date())
    }

    /** 壁纸只在变化时重新解码（每日轮换在跨天后的下一分钟切换；新下载的在线壁纸也会进轮换）。 */
    private fun updateWallpaper() {
        val wallpaper = Wallpapers.current(this, config.wallpaper)
        if (wallpaper?.key == shownWallpaper && (wallpaper != null || wallpaperView.drawable == null)) return
        shownWallpaper = wallpaper?.key
        val bitmap = wallpaper?.let { Wallpapers.decode(this, it, resources.displayMetrics.widthPixels) }
        wallpaperView.setImageBitmap(bitmap)
        scrim.visibility = if (bitmap != null) View.VISIBLE else View.GONE
        val author = wallpaper?.author
        credit.text = if (author.isNullOrBlank()) "" else "Photo · $author / Unsplash"
        credit.visibility = if (bitmap != null && !author.isNullOrBlank()) View.VISIBLE else View.GONE
    }

    // ---- 磁贴 ----

    private fun buildTiles(): List<Tile> {
        val list = mutableListOf<Tile>()
        val carplayLabel = Targets.label(this, config.carplay)
        list += Tile(
            Slot.CARPLAY, 0, config.carplay, Icons.byKey("carplay"), getString(R.string.carplay),
            if (Targets.isAvailable(this, config.carplay)) carplayLabel ?: "" else getString(R.string.not_set),
            wide = true,
        )
        list += Tile(
            Slot.OEM, 0, config.oem, Icons.byKey("oem"), getString(R.string.oem),
            if (Targets.isAvailable(this, config.oem)) getString(R.string.oem_sub) else getString(R.string.not_set),
            wide = false,
        )
        config.dock.forEachIndexed { i, item ->
            val icon = Icons.byKey(item.icon)
            val label = Targets.label(this, item.target)
            val title = icon?.name ?: label ?: item.target.substringBefore('/')
            val sub = when {
                !Targets.isAvailable(this, item.target) -> "未安装 · 长按更换"
                icon != null && label != null && label != icon.name -> label
                else -> ""
            }
            list += Tile(Slot.DOCK, i, item.target, icon, title, sub, wide = false)
        }
        list += Tile(Slot.ADD, 0, null, null, getString(R.string.add), "", wide = false)
        return list
    }

    private fun rebuild() {
        if (tileHeight == 0) return
        tiles.removeAllViews()
        val gap = dp(14)
        for (tile in buildTiles()) {
            val view = makeTileView(tile)
            val lp = LinearLayout.LayoutParams(
                if (tile.wide) tileHeight * 3 + gap else (tileHeight * 1.5f).toInt(),
                tileHeight,
            )
            lp.marginEnd = gap
            tiles.addView(view, lp)
        }
        // 默认展示 CarPlay 的信息和光晕。
        tiles.getChildAt(0)?.let { first ->
            showHero(first.tag as TileInfo)
            // 旋钮 / 方向键：从右上角按钮往下，先到 CarPlay，而不是离得最近的最右边磁贴。
            first.id = R.id.firstTile
            // 第一次按方向键 / 转旋钮时直接选中 CarPlay，而不是右上角的按钮。
            first.isFocusedByDefault = true
            findViewById<View>(R.id.pillApps).nextFocusDownId = R.id.firstTile
            findViewById<View>(R.id.pillSettings).nextFocusDownId = R.id.firstTile
        }
    }

    /** 磁贴的图标：画好的统一图标优先，没有就用应用自带图标。 */
    private fun iconFor(tile: Tile): Drawable? =
        tile.icon?.let { Icons.badge(this, it) } ?: Targets.icon(this, tile.spec)

    private fun makeTileView(tile: Tile): View {
        val available = tile.slot == Slot.ADD || Targets.isAvailable(this, tile.spec)
        val icon = if (tile.slot == Slot.ADD) null else iconFor(tile)
        val color = tile.icon?.top ?: Glow.dominantColor(icon)

        val card = FrameLayout(this)
        card.background = GradientDrawable().apply {
            cornerRadius = dp(20).toFloat()
            when {
                !available || tile.slot == Slot.ADD -> {
                    setColor(0x99141416.toInt())
                    setStroke(dp(1), 0x38FFFFFF, dp(6).toFloat(), dp(5).toFloat())
                }
                tile.wide -> {
                    orientation = GradientDrawable.Orientation.TL_BR
                    colors = intArrayOf(Glow.darken(color, 0.55f), Glow.darken(color, 0.16f) and 0xE6FFFFFF.toInt())
                }
                // 半透明深色：叠在壁纸上像磨砂卡片。
                else -> setColor(0xCC1C1C1E.toInt())
            }
        }
        card.foreground = getDrawable(R.drawable.tile_focus)
        card.isFocusable = true
        card.isClickable = true
        card.tag = TileInfo(tile, color)
        val pad = dp(16)

        if (tile.slot == Slot.ADD) {
            card.addView(TextView(this).apply {
                text = "+"
                setTextColor(0x99FFFFFF.toInt())
                setTextSize(TypedValue.COMPLEX_UNIT_PX, tileHeight * 0.32f)
                typeface = resources.getFont(R.font.outfit_light)
                gravity = Gravity.CENTER
            }, FrameLayout.LayoutParams(-1, -1))
        } else {
            if (icon != null) {
                val size = (tileHeight * (if (tile.wide) 0.42f else 0.36f)).toInt()
                card.addView(ImageView(this).apply {
                    setImageDrawable(icon)
                    if (!available) alpha = 0.4f
                }, FrameLayout.LayoutParams(size, size, Gravity.TOP or Gravity.START).apply {
                    setMargins(pad, pad, 0, 0)
                })
            }
            val texts = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
            texts.addView(TextView(this).apply {
                text = tile.title
                setTextColor(Color.WHITE)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, if (tile.wide) 26f else 17f)
                typeface = resources.getFont(if (tile.wide) R.font.outfit_light else R.font.outfit_medium)
                isSingleLine = true
                ellipsize = TextUtils.TruncateAt.END
            })
            if (tile.sub.isNotEmpty()) {
                texts.addView(TextView(this).apply {
                    text = tile.sub
                    setTextColor(0x99FFFFFF.toInt())
                    setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
                    typeface = resources.getFont(R.font.outfit_regular)
                    isSingleLine = true
                    ellipsize = TextUtils.TruncateAt.END
                })
            }
            card.addView(texts, FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM or Gravity.START).apply {
                setMargins(pad, 0, pad, pad)
            })
        }

        card.setOnClickListener { onTileClick(tile, available) }
        card.setOnLongClickListener { v -> onTileLongClick(tile, v); true }
        card.setOnFocusChangeListener { v, focused ->
            v.animate().scaleX(if (focused) 1.05f else 1f).scaleY(if (focused) 1.05f else 1f)
                .setDuration(150).start()
            if (focused) {
                showHero(v.tag as TileInfo)
                keepVisible(v)
            }
        }
        card.setOnTouchListener { v, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    v.animate().scaleX(0.96f).scaleY(0.96f).setDuration(90).start()
                    showHero(v.tag as TileInfo)
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    val s = if (v.isFocused) 1.05f else 1f
                    v.animate().scaleX(s).scaleY(s).setDuration(120).start()
                }
            }
            false
        }
        return card
    }

    /** 选中的磁贴（放大 5% 加描边）完整留在屏幕里，两边留出边距。 */
    private fun keepVisible(v: View) {
        tileScroll.post {
            val margin = dp(40)
            val left = v.left - tileScroll.scrollX
            val right = v.right - tileScroll.scrollX
            when {
                left < margin -> tileScroll.smoothScrollTo((v.left - margin).coerceAtLeast(0), 0)
                right > tileScroll.width - margin -> tileScroll.smoothScrollTo(v.right + margin - tileScroll.width, 0)
            }
        }
    }

    private fun showHero(info: TileInfo) {
        val tile = info.tile
        heroName.text = if (tile.slot == Slot.ADD) "添加常用应用" else tile.title
        heroSub.text = when (tile.slot) {
            Slot.CARPLAY -> if (tile.sub.isNotEmpty()) "${tile.sub}  ·  轻触进入" else ""
            Slot.OEM -> tile.sub
            Slot.DOCK -> tile.sub.ifEmpty { "轻触打开  ·  长按管理" }
            Slot.ADD -> "从全部应用里挑选"
        }
        val color = if (tile.slot == Slot.ADD) Glow.FALLBACK else info.color
        if (color != ambientColor) {
            ambientColor = color
            ambient.background = Glow.ambient(resources, color)
            ambient.alpha = 0.4f
            ambient.animate().alpha(1f).setDuration(500).start()
        }
    }

    private fun onTileClick(tile: Tile, available: Boolean) {
        when {
            tile.slot == Slot.ADD -> pick(REQ_ADD)
            !available -> pick(requestCodeFor(tile))
            !Targets.launch(this, tile.spec) -> toast("无法打开：${tile.spec}")
        }
    }

    private fun onTileLongClick(tile: Tile, view: View) {
        if (tile.slot == Slot.ADD) { pick(REQ_ADD); return }
        val items = mutableListOf(MenuItem("更换应用", R.drawable.ui_swap) { pick(requestCodeFor(tile)) })
        if (tile.slot == Slot.DOCK) {
            items += MenuItem("更换图标", R.drawable.ui_palette) { pickIcon(tile) }
            if (tile.index > 0) items += MenuItem("向左移", R.drawable.ui_left) { config.moveInDock(tile.index, -1); rebuild() }
            if (tile.index < config.dock.size - 1) {
                items += MenuItem("向右移", R.drawable.ui_right) { config.moveInDock(tile.index, 1); rebuild() }
            }
        }
        Targets.packageOf(tile.spec)?.let { pkg -> items += MenuItem("应用信息", R.drawable.ui_info) { openAppInfo(pkg) } }
        if (tile.slot == Slot.DOCK) {
            items += MenuItem("从桌面移除", R.drawable.ui_delete, danger = true) {
                config.removeFromDock(tile.index); rebuild()
                overlay.snackbar("已移除「${tile.title}」")
            }
        }
        Menus.menu(overlay, this, tile.title, items, anchor = view, titleIcon = iconFor(tile))
    }

    private fun pickIcon(tile: Tile) {
        Menus.iconPicker(overlay, this, tile.icon?.key, Targets.icon(this, tile.spec)) { key ->
            config.setIcon(tile.index, key)
            rebuild()
        }
    }

    private fun requestCodeFor(tile: Tile) = when (tile.slot) {
        Slot.CARPLAY -> REQ_CARPLAY
        Slot.OEM -> REQ_OEM
        Slot.DOCK -> REQ_REPLACE_BASE + tile.index
        Slot.ADD -> REQ_ADD
    }

    private fun pick(requestCode: Int) {
        startActivityForResult(
            Intent(this, LibraryActivity::class.java).putExtra(LibraryActivity.EXTRA_PICK, true),
            requestCode,
        )
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        val spec = data?.getStringExtra(LibraryActivity.EXTRA_SPEC)
        if (resultCode != RESULT_OK || spec == null) return
        when {
            requestCode == REQ_CARPLAY -> config.setCarplay(spec)
            requestCode == REQ_OEM -> config.setOem(spec)
            requestCode == REQ_ADD -> config.addToDock(spec)
            requestCode >= REQ_REPLACE_BASE && requestCode - REQ_REPLACE_BASE < config.dock.size ->
                config.replaceTarget(requestCode - REQ_REPLACE_BASE, spec)
        }
        rebuild()
    }

    private fun openAppInfo(pkg: String) {
        launchOrToast(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", pkg, null)))
    }

    private fun launchOrToast(intent: Intent) {
        try {
            startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: Exception) {
            toast("车机不支持这个页面")
        }
    }

    private fun toast(msg: String) = overlay.snackbar(msg)

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    companion object {
        /** 进程级：只在开机后第一次创建桌面时自动打开 CarPlay。 */
        private var bootHandled = false

        private const val REQ_CARPLAY = 1
        private const val REQ_OEM = 2
        private const val REQ_ADD = 3
        private const val REQ_REPLACE_BASE = 100
    }
}

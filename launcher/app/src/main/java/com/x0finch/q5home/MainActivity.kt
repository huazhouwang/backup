package com.x0finch.q5home

import android.annotation.SuppressLint
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.res.ColorStateList
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import com.x0finch.q5home.ui.CompassView
import com.x0finch.q5home.ui.MenuItem
import com.x0finch.q5home.ui.Menus
import com.x0finch.q5home.ui.Overlay
import com.x0finch.q5home.ui.RoadView
import com.x0finch.q5home.ui.RoundedImageView
import com.x0finch.q5home.ui.Ui
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlin.math.roundToInt

/**
 * 首页，参考理想汽车车机：近黑底上三列扁平卡片 + 底部两段底栏（布局见 activity_main.xml）。
 */
class MainActivity : Activity() {

    private enum class Slot { CARPLAY, OEM, DOCK, ADD, APPS, SETTINGS }

    private class Tile(
        val slot: Slot,
        val index: Int,
        val spec: String?,
        val icon: Icons.Icon?,
        val title: String,
        val sub: String,
    )

    private lateinit var config: Config
    private lateinit var root: View
    private lateinit var wallpaperView: ImageView
    private lateinit var credit: TextView
    private lateinit var wallName: TextView
    private lateinit var tiles: LinearLayout
    private lateinit var sysBar: LinearLayout
    private lateinit var tileScroll: HorizontalScrollView
    private lateinit var greeting: TextView
    private lateinit var date: TextView
    private lateinit var speed: TextView
    private lateinit var gpsStatus: TextView
    private lateinit var altitude: TextView
    private lateinit var accuracy: TextView
    private lateinit var sunRow: LinearLayout
    private lateinit var road: RoadView
    private lateinit var compass: CompassView
    private lateinit var carplayCard: View
    private lateinit var art: ImageView
    private lateinit var carplaySub: TextView
    private lateinit var gps: HomeGps
    /** 定位过时（进隧道）就换成提示：每 5 秒看一次。 */
    private val tripTicker = object : Runnable {
        override fun run() {
            updateTrip()
            handler.postDelayed(this, 5000)
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private var shownWallpaper: String? = null
    private lateinit var overlay: Overlay
    private var started = false

    private val timeReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            updateGreeting()
            updateWallpaper()
            updateSun()
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
        // 画框里的壁纸要圆角：换成自己裁剪的 RoundedImageView（放在原来的位置）。
        wallpaperView = RoundedImageView(this, 16f).apply { scaleType = ImageView.ScaleType.CENTER_CROP }
        findViewById<FrameLayout>(R.id.frameCard).addView(wallpaperView, 0, FrameLayout.LayoutParams(-1, -1))
        credit = findViewById(R.id.credit)
        wallName = findViewById(R.id.wallName)
        tiles = findViewById(R.id.tiles)
        sysBar = findViewById(R.id.sysBar)
        tileScroll = findViewById(R.id.tileScroll)
        greeting = findViewById(R.id.greeting)
        date = findViewById(R.id.date)
        speed = findViewById(R.id.speed)
        gpsStatus = findViewById(R.id.gpsStatus)
        altitude = findViewById(R.id.altitude)
        accuracy = findViewById(R.id.accuracy)
        sunRow = findViewById(R.id.sunRow)
        carplayCard = findViewById(R.id.firstTile)
        art = findViewById(R.id.art)
        carplaySub = findViewById(R.id.carplaySub)
        road = RoadView(this)
        findViewById<FrameLayout>(R.id.roadHolder).addView(road, FrameLayout.LayoutParams(-1, -1))
        compass = CompassView(this)
        findViewById<FrameLayout>(R.id.compassHolder).addView(compass, FrameLayout.LayoutParams(-1, -1))
        gps = HomeGps(this) { updateTrip() }

        overlay = Overlay(findViewById(android.R.id.content))
        config = Config(this)
        config.reload()?.let { toast("config.json 有误：$it") }

        styleCards()
        forwardSwipesToTiles()

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
        updateSun()
        rebuild()
        if (config.homeGps) gps.start() else gps.stop()
        handler.removeCallbacks(tripTicker)
        handler.post(tripTicker)
    }

    override fun onPause() {
        super.onPause()
        if (!started) return
        gps.stop()
        handler.removeCallbacks(tripTicker)
    }

    /** 卡片底色、圆角；CarPlay 媒体条的封面圆角和播放键。 */
    private fun styleCards() {
        root.setBackgroundColor(Ui.PAGE)
        findViewById<View>(R.id.carCard).background = Ui.rounded(this, Ui.CARD, 16)
        // 时间卡上沿一点夜空蓝（理想天气卡的感觉）。
        findViewById<View>(R.id.timeCard).background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
            intArrayOf(0xFF1D2433.toInt(), Ui.CARD, Ui.CARD)).apply { cornerRadius = dp(16).toFloat() }
        findViewById<View>(R.id.frameCard).background = Ui.rounded(this, Ui.CARD, 16)
        // 画框底部渐暗，名字看得清（同样的圆角）。
        findViewById<View>(R.id.scrim).background = GradientDrawable(GradientDrawable.Orientation.BOTTOM_TOP,
            intArrayOf(0xCC000000.toInt(), 0x00000000, 0x00000000)).apply { cornerRadius = dp(16).toFloat() }
        carplayCard.background = pressable(Ui.RAISED, 12)
        carplayCard.foreground = Ui.focusRing(this, 12)
        art.setImageDrawable(Icons.byKey("carplay")?.let { Icons.badge(this, it) })
        findViewById<ImageView>(R.id.carplayGo).apply {
            background = Ui.rounded(this@MainActivity, Ui.TEXT, 22)
            imageTintList = ColorStateList.valueOf(Ui.PAGE)
        }
        findViewById<View>(R.id.pillUpdate).background = Ui.rounded(this, Ui.ACCENT, 8)
        sysBar.background = Ui.rounded(this, Ui.CARD, 14)
        tileScroll.background = Ui.rounded(this, Ui.CARD, 14)
        tileScroll.clipToOutline = true

        carplayCard.setOnClickListener {
            if (Targets.isAvailable(this, config.carplay)) {
                if (!Targets.launch(this, config.carplay)) toast("无法打开：${config.carplay}")
            } else {
                pick(REQ_CARPLAY)
            }
        }
        carplayCard.setOnLongClickListener { v -> onTileLongClick(carplayTile(), v); true }
        pressScale(carplayCard)
    }

    /** 按下时底色变亮一点（理想的按钮没有投影，只变色）。 */
    private fun pressable(color: Int, radiusDp: Int): Drawable = android.graphics.drawable.StateListDrawable().apply {
        addState(intArrayOf(android.R.attr.state_pressed), Ui.rounded(this@MainActivity, 0xFF32363C.toInt(), radiusDp))
        addState(intArrayOf(), Ui.rounded(this@MainActivity, color, radiusDp))
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun pressScale(v: View) {
        v.setOnTouchListener { view, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> view.animate().scaleX(0.97f).scaleY(0.97f).setDuration(90).start()
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> view.animate().scaleX(1f).scaleY(1f).setDuration(120).start()
            }
            false
        }
    }

    /** GPS：左边车速 + 行车视图，右边指南针、海拔、精度。没有新鲜定位时显示提示。 */
    private fun updateTrip() {
        val l = gps.last?.takeIf { config.homeGps && System.currentTimeMillis() - it.time <= HomeGps.STALE_MS }
        val kmh = l?.takeIf { it.hasSpeed() }?.let { (it.speed * 3.6f).roundToInt() }
        setText(speed, kmh?.toString() ?: "—")
        speed.setTextColor(if (kmh == null) Ui.TEXT_FAINT else Ui.TEXT)
        road.setMoving((kmh ?: 0) >= 5)
        setText(gpsStatus, when {
            l != null -> "GPS 已定位"
            !config.homeGps -> "首页 GPS 已关闭"
            !gps.hasPermission() -> "没有定位权限 · 设置 → GPS 与 4G"
            else -> "等待 GPS 定位…"
        })
        // 方向：车动起来才准；停车时保留最后一次的方向。
        val bearing = l?.takeIf { it.hasBearing() && it.hasSpeed() && it.speed >= 1.5f }?.bearing
        if (bearing != null || l == null) compass.setHeading(bearing ?: lastBearing)
        if (bearing != null) lastBearing = bearing
        setText(altitude, l?.takeIf { it.hasAltitude() }?.let { "海拔 ${it.altitude.roundToInt()} m" } ?: "海拔 —")
        setText(accuracy, l?.takeIf { it.hasAccuracy() }?.let { "精度 ±${it.accuracy.roundToInt()} m" } ?: "")
    }

    private var lastBearing: Float? = null

    private fun setText(v: TextView, text: String) {
        if (v.text.toString() != text) v.text = text
    }

    /** 日出 / 日落 / 昼长：按 GPS 粗略位置本地计算；没定位过显示约数。 */
    private fun updateSun() {
        val now = System.currentTimeMillis()
        val loc = Sun.location(this)
        val times = loc?.let { Sun.times(it.first, it.second, now) }
        val fmt = SimpleDateFormat("HH:mm", Locale.US)
        val cells = if (times != null) {
            val len = (times.second - times.first) / 60_000
            listOf("日出" to fmt.format(Date(times.first)), "日落" to fmt.format(Date(times.second)),
                "昼长" to "${len / 60}h${(len % 60).toString().padStart(2, '0')}")
        } else {
            listOf("日出" to "约 07:00", "日落" to "约 19:00", "昼长" to "等定位")
        }
        val daylight = Sun.isDaylight(this, now)
        sunRow.removeAllViews()
        cells.forEachIndexed { i, (label, value) ->
            val cell = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL }
            // 当前所处阶段（白天看日落、晚上看日出）的值用亮色。
            val active = (i == 1 && daylight) || (i == 0 && !daylight)
            cell.addView(Ui.text(this, label, 12f, Ui.TEXT_DIM))
            cell.addView(Ui.text(this, value, 16f, if (active) Ui.TEXT else Ui.TEXT_DIM, Ui.Font.REGULAR).apply {
                setPadding(0, dp(6), 0, 0)
            })
            sunRow.addView(cell, LinearLayout.LayoutParams(0, -2, 1f))
        }
    }

    /** 有新版本时时间旁边显示蓝色小按钮。 */
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
        // 清掉焦点再回到最左边，否则获得焦点的按钮会把滚动位置拉回去。
        currentFocus?.clearFocus()
        tileScroll.scrollTo(0, 0)
        tileScroll.post {
            tileScroll.scrollTo(0, 0)
            // 用旋钮 / 方向键时，回到桌面后焦点落在 CarPlay 上。
            if (!root.isInTouchMode) carplayCard.requestFocus()
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // 桌面上按返回只关闭弹出的卡片，不做别的。
        overlay.dismiss()
    }

    /**
     * 开机后第一次显示桌面时，按设置自动打开 CarPlay。每次开机只做一次：记下系统的开机次数，
     * 桌面因为崩溃、更新而重启时不会再自动打开（只记在内存里的话，进程一重启就会忘）。
     */
    private fun maybeAutoStartCarPlay() {
        val boot = Settings.Global.getInt(contentResolver, Settings.Global.BOOT_COUNT, -1)
        val prefs = getSharedPreferences("session", MODE_PRIVATE)
        if (boot >= 0) {
            if (prefs.getInt(KEY_AUTO_BOOT, -1) == boot) return
            prefs.edit().putInt(KEY_AUTO_BOOT, boot).apply()
        } else {
            if (bootHandled) return // 读不到开机次数的系统：退回按进程记
            bootHandled = true
        }
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
        greeting.text = "$hello · ${config.title}"
        date.text = SimpleDateFormat("M月d日 EEEE", Locale.CHINA).format(Date())
    }

    /** 壁纸只在变化时重新解码（每分钟检查一次，自动轮换到点就换；新下载的在线壁纸也会进轮换）。 */
    private fun updateWallpaper() {
        val wallpaper = Wallpapers.current(this, config.wallpaper, intervalMinutes = config.wallpaperInterval,
            daylight = if (config.wallpaperSun) Sun.isDaylight(this) else null)
        if (wallpaper?.key == shownWallpaper && (wallpaper != null || wallpaperView.drawable == null)) return
        shownWallpaper = wallpaper?.key
        // 画框只占三分之一宽，按一半屏宽解码就够清楚。
        val bitmap = wallpaper?.let { Wallpapers.decode(this, it, resources.displayMetrics.widthPixels / 2) }
        wallpaperView.setImageBitmap(bitmap)
        findViewById<View>(R.id.scrim).visibility = if (bitmap != null) View.VISIBLE else View.GONE
        wallName.text = if (bitmap != null) wallpaper.name else "纯黑"
        val author = wallpaper?.author
        credit.text = when {
            bitmap == null -> "设置 → 壁纸 里可以换"
            !author.isNullOrBlank() -> "Photo · $author / Unsplash"
            config.wallpaper == Wallpapers.DAILY -> Wallpapers.label(this, config.wallpaper, config.wallpaperInterval)
            else -> "壁纸"
        }
    }

    // ---- 底栏 ----

    private fun carplayTile(): Tile = Tile(
        Slot.CARPLAY, 0, config.carplay, Icons.byKey("carplay"), getString(R.string.carplay),
        if (Targets.isAvailable(this, config.carplay)) Targets.label(this, config.carplay) ?: "" else getString(R.string.not_set),
    )

    private fun oemTile(): Tile = Tile(
        Slot.OEM, 0, config.oem, Icons.byKey("oem"), getString(R.string.oem),
        when {
            !Targets.isAvailable(this, config.oem) -> getString(R.string.not_set)
            // WWC2 原厂主页只能到"安卓盒子"桌面，提示下一步。
            Targets.packageOf(config.oem) == Targets.WWC2_HOME -> getString(R.string.oem_sub_wwc2)
            else -> getString(R.string.oem_sub)
        },
    )

    private fun dockTiles(): List<Tile> = config.dock.mapIndexed { i, item ->
        val icon = Icons.byKey(item.icon)
        val label = Targets.label(this, item.target)
        // 图标和应用对得上（比如设置用齿轮）时用统一的中文名；换成不相干的图标时名称仍按应用来，
        // 免得"导航"图标其实打开的是设置。
        val iconFits = icon != null && Icons.guess(Targets.packageOf(item.target), label) == icon.key
        val title = (if (iconFits) icon?.name else label) ?: icon?.name ?: item.target.substringBefore('/')
        val sub = if (!Targets.isAvailable(this, item.target)) "未安装 · 长按更换" else label.orEmpty()
        Tile(Slot.DOCK, i, item.target, icon, title, sub)
    }

    private fun rebuild() {
        val carplay = carplayTile()
        carplaySub.text = if (Targets.isAvailable(this, config.carplay))
            listOf(carplay.sub, "轻触进入").filter { it.isNotEmpty() }.joinToString(" · ") else carplay.sub
        carplayCard.contentDescription = "CarPlay"

        // 底栏左段：固定入口，只有图标（理想左下角那一组）。
        sysBar.removeAllViews()
        val fixed = listOf(
            carplay,
            oemTile(),
            Tile(Slot.APPS, 0, null, null, getString(R.string.all_apps), ""),
            Tile(Slot.SETTINGS, 0, null, null, getString(R.string.settings), ""),
            Tile(Slot.ADD, 0, null, null, getString(R.string.add), ""),
        )
        for (tile in fixed) sysBar.addView(barIcon(tile), LinearLayout.LayoutParams(0, dp(48), 1f))

        // 底栏右段：常用应用，图标 + 名字（理想右下角那一组）。
        tiles.removeAllViews()
        for (tile in dockTiles()) tiles.addView(barItem(tile), LinearLayout.LayoutParams(-2, dp(48)))
    }

    private fun glyphFor(slot: Slot): Int = when (slot) {
        Slot.CARPLAY -> R.drawable.glyph_carplay
        Slot.OEM -> R.drawable.glyph_oem
        Slot.APPS -> R.drawable.glyph_apps
        Slot.SETTINGS -> R.drawable.ui_tune
        else -> R.drawable.ui_add
    }

    /** 底栏左段的图标按钮（单色，理想风格）。 */
    private fun barIcon(tile: Tile): View {
        val available = tile.slot !in listOf(Slot.CARPLAY, Slot.OEM) || Targets.isAvailable(this, tile.spec)
        val frame = FrameLayout(this)
        frame.addView(Ui.glyph(this, glyphFor(tile.slot), 26, if (available) Ui.TEXT else Ui.TEXT_FAINT),
            FrameLayout.LayoutParams(dp(26), dp(26), Gravity.CENTER))
        setupBarButton(frame, tile, available)
        return frame
    }

    /** 底栏右段的常用应用：单色图标（有统一图标时）+ 名字。 */
    private fun barItem(tile: Tile): View {
        val available = Targets.isAvailable(this, tile.spec)
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(14), 0, dp(16), 0)
        }
        val tint = if (available) Ui.TEXT else Ui.TEXT_FAINT
        val icon = tile.icon
        if (icon != null) {
            row.addView(Ui.glyph(this, icon.glyph, 24, tint))
        } else {
            row.addView(ImageView(this).apply {
                setImageDrawable(Targets.icon(this@MainActivity, tile.spec))
                if (!available) alpha = 0.4f
            }, LinearLayout.LayoutParams(dp(28), dp(28)))
        }
        row.addView(Ui.text(this, tile.title, 15f, tint).apply { setPadding(dp(10), 0, 0, 0) })
        setupBarButton(row, tile, available)
        return row
    }

    private fun setupBarButton(v: View, tile: Tile, available: Boolean) {
        v.background = pressable(0x00000000, 10)
        v.foreground = Ui.focusRing(this, 10)
        v.isFocusable = true
        v.isClickable = true
        v.contentDescription = tile.title
        v.setOnClickListener { onTileClick(tile, available) }
        v.setOnLongClickListener { onTileLongClick(tile, it); true }
        v.setOnFocusChangeListener { view, focused -> if (focused && view.parent == tiles) keepVisible(view) }
    }

    /** 磁贴菜单标题旁的图标：画好的统一图标优先，没有就用应用自带图标。 */
    private fun iconFor(tile: Tile): Drawable? =
        tile.icon?.let { Icons.badge(this, it) } ?: Targets.icon(this, tile.spec)

    /**
     * 在首页不可点的地方（画框、时间卡、车辆卡）左右滑动，也滚动底栏的常用应用：车上不用非得对准那一窄条。
     */
    @SuppressLint("ClickableViewAccessibility")
    private fun forwardSwipesToTiles() {
        val rootPos = IntArray(2)
        val scrollPos = IntArray(2)
        root.setOnTouchListener { _, event ->
            root.getLocationInWindow(rootPos)
            tileScroll.getLocationInWindow(scrollPos)
            val forwarded = MotionEvent.obtain(event)
            forwarded.offsetLocation((rootPos[0] - scrollPos[0]).toFloat(), (rootPos[1] - scrollPos[1]).toFloat())
            tileScroll.onTouchEvent(forwarded)
            forwarded.recycle()
            true
        }
    }

    /** 选中的按钮完整留在底栏里。 */
    private fun keepVisible(v: View) {
        tileScroll.post {
            val margin = dp(24)
            val left = v.left - tileScroll.scrollX
            val right = v.right - tileScroll.scrollX
            when {
                left < margin -> tileScroll.smoothScrollTo((v.left - margin).coerceAtLeast(0), 0)
                right > tileScroll.width - margin -> tileScroll.smoothScrollTo(v.right + margin - tileScroll.width, 0)
            }
        }
    }

    private fun onTileClick(tile: Tile, available: Boolean) {
        when {
            tile.slot == Slot.ADD -> pick(REQ_ADD)
            tile.slot == Slot.APPS -> startActivity(Intent(this, LibraryActivity::class.java))
            tile.slot == Slot.SETTINGS -> startActivity(Intent(this, SettingsActivity::class.java))
            !available -> pick(requestCodeFor(tile))
            !Targets.launch(this, tile.spec) -> toast("无法打开：${tile.spec}")
        }
    }

    private fun onTileLongClick(tile: Tile, view: View) {
        if (tile.slot == Slot.ADD) { pick(REQ_ADD); return }
        if (tile.slot == Slot.APPS || tile.slot == Slot.SETTINGS) { onTileClick(tile, true); return }
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
        Slot.ADD, Slot.APPS, Slot.SETTINGS -> REQ_ADD
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
        /** 读不到开机次数时的后备：进程级记录。 */
        private var bootHandled = false
        private const val KEY_AUTO_BOOT = "auto_carplay_boot"

        private const val REQ_CARPLAY = 1
        private const val REQ_OEM = 2
        private const val REQ_ADD = 3
        private const val REQ_REPLACE_BASE = 100
    }
}

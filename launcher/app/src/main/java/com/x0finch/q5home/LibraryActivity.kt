package com.x0finch.q5home

import android.app.Activity
import android.content.Intent
import android.content.pm.ResolveInfo
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.BaseAdapter
import android.widget.FrameLayout
import android.widget.GridView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import com.x0finch.q5home.ui.MenuItem
import com.x0finch.q5home.ui.Menus
import com.x0finch.q5home.ui.Overlay
import com.x0finch.q5home.ui.Ui

/** 全部应用。带 [EXTRA_PICK] 启动时作为选择器，选中后把目标返回给调用方。 */
class LibraryActivity : Activity() {

    private val picking by lazy { intent.getBooleanExtra(EXTRA_PICK, false) }
    private lateinit var apps: List<ResolveInfo>
    private lateinit var overlay: Overlay

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        apps = Targets.launchableApps(this)

        val root = Ui.pageRoot(this)
        overlay = Overlay(root)
        val page = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(40), dp(24), dp(40), 0)
        }

        val header = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
        val titles = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        titles.addView(Ui.text(this, getString(if (picking) R.string.pick_app else R.string.all_apps), 30f, Ui.TEXT, Ui.Font.LIGHT))
        titles.addView(Ui.text(this, if (picking) "点一下选择" else "${apps.size} 个应用  ·  长按可加到桌面", 13f, Ui.TEXT_DIM),
            LinearLayout.LayoutParams(-2, -2).apply { topMargin = dp(6) })
        header.addView(titles, LinearLayout.LayoutParams(0, -2, 1f))
        header.addView(Ui.pill(this, getString(R.string.close)) { finish() })
        page.addView(header)

        val grid = GridView(this).apply {
            numColumns = GridView.AUTO_FIT
            columnWidth = dp(112)
            stretchMode = GridView.STRETCH_COLUMN_WIDTH
            verticalSpacing = dp(10)
            horizontalSpacing = dp(10)
            selector = Ui.rowBackground(this@LibraryActivity, 18)
            setDrawSelectorOnTop(true)
            clipToPadding = false
            setPadding(0, dp(18), 0, dp(24))
            adapter = AppAdapter()
            setOnItemClickListener { _, _, position, _ -> onPick(apps[position]) }
            setOnItemLongClickListener { _, view, position, _ -> onLongPick(apps[position], view); true }
        }
        page.addView(grid, LinearLayout.LayoutParams(-1, 0, 1f))
        root.addView(page, FrameLayout.LayoutParams(-1, -1))
        setContentView(root)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (overlay.isShowing) overlay.dismiss() else super.onBackPressed()
    }

    private fun onPick(info: ResolveInfo) {
        val spec = Targets.specOf(info)
        if (picking) {
            setResult(RESULT_OK, Intent().putExtra(EXTRA_SPEC, spec))
            finish()
        } else if (!Targets.launch(this, spec)) {
            overlay.snackbar("无法打开：$spec")
        }
    }

    private fun onLongPick(info: ResolveInfo, view: View) {
        if (picking) { onPick(info); return }
        val spec = Targets.specOf(info)
        val config = Config(this).also { it.reload() }
        val pkg = info.activityInfo.packageName
        val label = info.loadLabel(packageManager).toString()
        Menus.menu(overlay, this, label, listOf(
            MenuItem("加到桌面", R.drawable.ui_add) { config.addToDock(spec); overlay.snackbar("已把「$label」加到桌面") },
            MenuItem("设为 CarPlay 入口", R.drawable.glyph_carplay) { config.setCarplay(spec); overlay.snackbar("CarPlay 入口已改为「$label」") },
            MenuItem("设为原车入口", R.drawable.glyph_oem) { config.setOem(spec); overlay.snackbar("原车入口已改为「$label」") },
            MenuItem("应用信息", R.drawable.ui_info) {
                runCatching {
                    startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", pkg, null)))
                }.onFailure { overlay.snackbar("车机不支持这个页面") }
            },
        ), anchor = view, titleIcon = info.loadIcon(packageManager))
    }

    private inner class AppAdapter : BaseAdapter() {
        override fun getCount() = apps.size
        override fun getItem(position: Int) = apps[position]
        override fun getItemId(position: Int) = position.toLong()

        override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
            val cell = (convertView as? LinearLayout) ?: LinearLayout(this@LibraryActivity).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_HORIZONTAL
                setPadding(dp(8), dp(14), dp(8), dp(12))
                background = Ui.rounded(this@LibraryActivity, Ui.CARD, 14)
                addView(ImageView(context), LinearLayout.LayoutParams(dp(56), dp(56)))
                addView(Ui.text(context, "", 13f, 0xE6FFFFFF.toInt()).apply { gravity = Gravity.CENTER },
                    LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) })
            }
            val info = apps[position]
            (cell.getChildAt(0) as ImageView).setImageDrawable(info.loadIcon(packageManager))
            (cell.getChildAt(1) as TextView).text = info.loadLabel(packageManager)
            return cell
        }
    }

    private fun dp(v: Int) = Ui.dp(this, v)

    companion object {
        const val EXTRA_PICK = "pick"
        const val EXTRA_SPEC = "spec"
    }
}

package com.x0finch.q5home

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.ResolveInfo
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.BaseAdapter
import android.widget.GridView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

/** 全部应用。带 [EXTRA_PICK] 启动时作为选择器，选中后把目标返回给桌面。 */
class LibraryActivity : Activity() {

    private val picking by lazy { intent.getBooleanExtra(EXTRA_PICK, false) }
    private lateinit var apps: List<ResolveInfo>

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        apps = Targets.launchableApps(this)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.BLACK)
            setPadding(dp(40), dp(24), dp(40), 0)
        }

        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        header.addView(TextView(this).apply {
            text = getString(if (picking) R.string.pick_app else R.string.all_apps)
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 30f)
            typeface = resources.getFont(R.font.outfit_light)
        }, LinearLayout.LayoutParams(0, -2, 1f))
        header.addView(TextView(this, null, 0, R.style.Pill).apply {
            text = getString(R.string.close)
            setOnClickListener { finish() }
        }, LinearLayout.LayoutParams(-2, dp(44)))
        root.addView(header)

        val grid = GridView(this).apply {
            numColumns = GridView.AUTO_FIT
            columnWidth = dp(112)
            stretchMode = GridView.STRETCH_COLUMN_WIDTH
            verticalSpacing = dp(8)
            horizontalSpacing = dp(8)
            selector = getDrawable(R.drawable.tile_focus)
            setDrawSelectorOnTop(true)
            clipToPadding = false
            setPadding(0, dp(16), 0, dp(24))
            adapter = AppAdapter()
            setOnItemClickListener { _, _, position, _ -> onPick(apps[position]) }
            setOnItemLongClickListener { _, _, position, _ -> onLongPick(apps[position]); true }
        }
        root.addView(grid, LinearLayout.LayoutParams(-1, 0, 1f))
        setContentView(root)
    }

    private fun onPick(info: ResolveInfo) {
        val spec = Targets.specOf(info)
        if (picking) {
            setResult(RESULT_OK, Intent().putExtra(EXTRA_SPEC, spec))
            finish()
        } else if (!Targets.launch(this, spec)) {
            Toast.makeText(this, "无法打开：$spec", Toast.LENGTH_LONG).show()
        }
    }

    private fun onLongPick(info: ResolveInfo) {
        if (picking) { onPick(info); return }
        val spec = Targets.specOf(info)
        val config = Config(this).also { it.reload() }
        val pkg = info.activityInfo.packageName
        val actions = listOf<Pair<String, () -> Unit>>(
            "加到桌面" to { config.addToDock(spec); Toast.makeText(this, "已加到桌面", Toast.LENGTH_SHORT).show() },
            "设为 CarPlay 入口" to { config.setCarplay(spec) },
            "设为原车入口" to { config.setOem(spec) },
            "应用信息" to {
                startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", pkg, null)))
            },
        )
        AlertDialog.Builder(this)
            .setTitle(info.loadLabel(packageManager))
            .setItems(actions.map { it.first }.toTypedArray()) { _, which ->
                runCatching { actions[which].second() }
            }
            .show()
    }

    private inner class AppAdapter : BaseAdapter() {
        override fun getCount() = apps.size
        override fun getItem(position: Int) = apps[position]
        override fun getItemId(position: Int) = position.toLong()

        override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
            val cell = (convertView as? LinearLayout) ?: LinearLayout(this@LibraryActivity).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_HORIZONTAL
                setPadding(dp(8), dp(12), dp(8), dp(12))
                background = GradientDrawable().apply {
                    cornerRadius = dp(18).toFloat()
                    setColor(0xFF141416.toInt())
                }
                addView(ImageView(context), LinearLayout.LayoutParams(dp(56), dp(56)))
                addView(TextView(context).apply {
                    setTextColor(0xE6FFFFFF.toInt())
                    setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
                    typeface = resources.getFont(R.font.outfit_regular)
                    gravity = Gravity.CENTER
                    isSingleLine = true
                    ellipsize = TextUtils.TruncateAt.END
                }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) })
            }
            val info = apps[position]
            (cell.getChildAt(0) as ImageView).setImageDrawable(info.loadIcon(packageManager))
            (cell.getChildAt(1) as TextView).text = info.loadLabel(packageManager)
            return cell
        }
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    companion object {
        const val EXTRA_PICK = "pick"
        const val EXTRA_SPEC = "spec"
    }
}

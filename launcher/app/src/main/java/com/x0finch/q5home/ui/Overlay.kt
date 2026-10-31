package com.x0finch.q5home.ui

import android.graphics.Rect
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout

/**
 * 在页面内部弹出卡片（代替系统 AlertDialog / Toast）：背景压暗，点外面或按返回关闭。
 * 传了 anchor 时卡片贴着它弹出（比如长按的磁贴上方），否则居中。
 */
class Overlay(private val host: FrameLayout) {

    private var layer: FrameLayout? = null
    private var snack: View? = null
    private val handler = Handler(Looper.getMainLooper())
    private val context get() = host.context

    val isShowing get() = layer != null

    fun show(card: View, anchor: View? = null, widthDp: Int? = null) {
        dismiss(animate = false)
        val l = FrameLayout(context).apply {
            setBackgroundColor(Ui.SCRIM)
            isClickable = true
            setOnClickListener { dismiss() }
        }
        card.isClickable = true // 点卡片本身不关闭
        val width = widthDp?.let { Ui.dp(context, it) } ?: ViewGroup.LayoutParams.WRAP_CONTENT
        val lp = FrameLayout.LayoutParams(width, ViewGroup.LayoutParams.WRAP_CONTENT)
        if (anchor == null) lp.gravity = Gravity.CENTER
        l.addView(card, lp)
        host.addView(l, FrameLayout.LayoutParams(-1, -1))
        layer = l

        if (anchor != null) {
            card.alpha = 0f
            card.post { placeNear(card, anchor); reveal(card) }
        } else {
            reveal(card)
        }
        l.alpha = 0f
        l.animate().alpha(1f).setDuration(140).start()
        if (!host.isInTouchMode) card.post { card.focusSearch(View.FOCUS_DOWN)?.requestFocus() ?: card.requestFocus() }
    }

    private fun reveal(card: View) {
        card.scaleX = 0.96f; card.scaleY = 0.96f
        card.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(160).start()
    }

    /**
     * 卡片不遮住锚点：优先放在上方，其次下方；上下都放不下（车机屏幕矮）就放在锚点旁边，
     * 锚点在右半屏放左边，否则放右边。
     */
    private fun placeNear(card: View, anchor: View) {
        val a = Rect()
        anchor.getGlobalVisibleRect(a)
        val h = Rect()
        host.getGlobalVisibleRect(h)
        a.offset(-h.left, -h.top)
        val margin = Ui.dp(context, 16)
        val gap = Ui.dp(context, 12)
        val maxX = (host.width - card.width - margin).coerceAtLeast(margin)
        val maxY = (host.height - card.height - margin).coerceAtLeast(margin)
        val (x, y) = when {
            a.top - card.height - gap >= margin -> a.left.coerceIn(margin, maxX) to a.top - card.height - gap
            a.bottom + gap + card.height <= host.height - margin -> a.left.coerceIn(margin, maxX) to a.bottom + gap
            else -> {
                val side = if (a.centerX() > host.width / 2) a.left - card.width - gap else a.right + gap
                side.coerceIn(margin, maxX) to (a.centerY() - card.height / 2).coerceIn(margin, maxY)
            }
        }
        card.x = x.toFloat()
        card.y = y.toFloat()
    }

    fun dismiss(animate: Boolean = true) {
        val l = layer ?: return
        layer = null
        if (animate) l.animate().alpha(0f).setDuration(120).withEndAction { host.removeView(l) }.start()
        else host.removeView(l)
    }

    /** 底部胶囊提示，2.5 秒后消失（代替 Toast）。 */
    fun snackbar(message: String) {
        snack?.let { host.removeView(it) }
        val v = Ui.text(context, message, 15f, Ui.TEXT, Ui.Font.MEDIUM, singleLine = false).apply {
            background = Ui.card(context, 22)
            setPadding(Ui.dp(context, 22), Ui.dp(context, 13), Ui.dp(context, 22), Ui.dp(context, 13))
            gravity = Gravity.CENTER
        }
        host.addView(v, FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL).apply {
            bottomMargin = Ui.dp(context, 28)
        })
        snack = v
        v.alpha = 0f
        v.translationY = Ui.dp(context, 12).toFloat()
        v.animate().alpha(1f).translationY(0f).setDuration(180).start()
        handler.removeCallbacksAndMessages(null)
        handler.postDelayed({
            v.animate().alpha(0f).setDuration(200).withEndAction {
                host.removeView(v)
                if (snack === v) snack = null
            }.start()
        }, 2500)
    }
}

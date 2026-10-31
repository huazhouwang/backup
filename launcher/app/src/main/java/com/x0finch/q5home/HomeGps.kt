package com.x0finch.q5home

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Looper
import kotlin.math.roundToInt

/**
 * 首页时钟下面那行 GPS 信息：车速、方向、海拔。只在首页显示时监听，离开就停。
 * 没有位置权限（在「GPS 与 4G」页授权）或设置里关掉时什么都不做。
 * 顺便把粗略位置（小数点后 1 位，约 10 公里）记下来，给日出日落壁纸用。
 */
class HomeGps(private val context: Context, private val onChange: (Location?) -> Unit) {

    private val lm = context.getSystemService(LocationManager::class.java)
    private var listener: LocationListener? = null
    var last: Location? = null; private set

    fun hasPermission() =
        context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    @SuppressLint("MissingPermission")
    fun start() {
        if (listener != null || lm == null || !hasPermission()) return
        // 安卓 8.1 的 LocationListener 四个方法都是抽象的，必须全部实现。
        val l = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                last = location
                Sun.remember(context, location)
                onChange(location)
            }
            @Deprecated("Deprecated in Java")
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
            override fun onProviderEnabled(provider: String) {}
            override fun onProviderDisabled(provider: String) { onChange(null) }
        }
        runCatching {
            lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f, l, Looper.getMainLooper())
            listener = l
            lm.getLastKnownLocation(LocationManager.GPS_PROVIDER)?.let { last = it; Sun.remember(context, it) }
        }
    }

    fun stop() {
        listener?.let { runCatching { lm?.removeUpdates(it) } }
        listener = null
    }

    companion object {
        /** 超过这么久没更新就不显示（隧道、地库）。 */
        const val STALE_MS = 15_000L
        private val DIRECTIONS = listOf("北", "东北", "东", "东南", "南", "西南", "西", "西北")

        fun compass(bearing: Float): String = DIRECTIONS[(((bearing % 360 + 360) % 360 + 22.5f) / 45f).toInt() % 8]

        /** 首页那一行；没有新鲜的定位返回 null（隐藏）。方向只在车动起来时显示（静止时 GPS 方向不准）。 */
        fun text(location: Location?, nowMs: Long = System.currentTimeMillis()): String? {
            val l = location ?: return null
            if (nowMs - l.time > STALE_MS) return null
            val parts = listOfNotNull(
                if (l.hasSpeed()) "${(l.speed * 3.6f).roundToInt()} km/h" else null,
                if (l.hasBearing() && l.hasSpeed() && l.speed >= 1.5f) "${compass(l.bearing)} ${l.bearing.roundToInt() % 360}°" else null,
                if (l.hasAltitude()) "海拔 ${l.altitude.roundToInt()} m" else null,
            )
            return parts.takeIf { it.isNotEmpty() }?.joinToString("  ·  ")
        }
    }
}

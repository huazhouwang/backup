package com.x0finch.q5home

import android.app.Activity
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.os.Looper
import androidx.test.core.app.ApplicationProvider
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.GraphicsMode
import org.robolectric.annotation.Config as RC
import java.io.File

/** 按几种常见车机分辨率渲染首页，输出 PNG（CI 会作为附件上传）。 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@RC(sdk = [31])
class ScreenshotTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val outDir = File(System.getProperty("screenshots.dir") ?: "build/screenshots").apply { mkdirs() }

    private fun shoot(activity: Activity, name: String) {
        shadowOf(Looper.getMainLooper()).idle()
        val v = activity.window.decorView
        val bmp = Bitmap.createBitmap(v.width, v.height, Bitmap.Config.ARGB_8888)
        bmp.eraseColor(Color.BLACK)
        v.draw(Canvas(bmp))
        File(outDir, "$name.png").outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    private fun home(qualifiers: String, name: String, wallpaper: String = "stars") {
        RuntimeEnvironment.setQualifiers(qualifiers)
        FakeApps.installCar(context)
        Config(context).apply {
            setWallpaper(wallpaper)
            addToDock(FakeApps.NAVI)
        }
        shoot(Robolectric.buildActivity(MainActivity::class.java).setup().get(), name)
    }

    @Test fun home1280x480() = home("w1280dp-h480dp-land-mdpi", "home-1280x480")
    @Test fun home1920x720() = home("w1280dp-h480dp-land-hdpi", "home-1920x720", "city")
    @Test fun home1024x600() = home("w1024dp-h600dp-land-mdpi", "home-1024x600", "road")
    @Test fun homeBlack() = home("w1280dp-h480dp-land-mdpi", "home-black", Wallpapers.NONE)

    @Test
    fun library() {
        RuntimeEnvironment.setQualifiers("w1280dp-h480dp-land-mdpi")
        FakeApps.installCar(context)
        shoot(Robolectric.buildActivity(LibraryActivity::class.java).setup().get(), "library")
    }
}

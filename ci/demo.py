#!/usr/bin/env python3
"""CI 演示：在模拟器上安装桌面和假应用，按步骤点一遍，截图并录屏。

用法：python3 ci/demo.py --launcher app-release.apk --fake zlink.apk --fake oem.apk --out demo-out
任何一步找不到要点的文字就失败（截图和录屏仍会保留，方便排查）。
"""
import argparse
import os
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

PKG = "com.x0finch.q5home"
HOME = f"{PKG}/.MainActivity"


def adb(*args, check=True, capture=False):
    result = subprocess.run(["adb", *args], check=check, capture_output=capture, text=capture)
    return result.stdout if capture else None


def shell(cmd, check=True):
    return adb("shell", cmd, check=check, capture=True)


class Demo:
    def __init__(self, out):
        self.out = out
        self.step = 0
        os.makedirs(out, exist_ok=True)

    def shot(self, name):
        self.step += 1
        path = os.path.join(self.out, f"{self.step:02d}-{name}.png")
        with open(path, "wb") as f:
            subprocess.run(["adb", "exec-out", "screencap", "-p"], stdout=f, check=True)
        print(f"  截图 {path}")

    def nodes(self):
        """当前界面上所有带文字的元素：(文字, 中心 x, 中心 y)。"""
        for _ in range(5):
            shell("uiautomator dump /sdcard/ui.xml", check=False)
            xml = shell("cat /sdcard/ui.xml", check=False)
            if xml and xml.strip().startswith("<?xml"):
                break
            time.sleep(1)
        else:
            raise RuntimeError("uiautomator dump 失败")
        found = []
        for node in ET.fromstring(xml).iter("node"):
            text = node.get("text") or ""
            m = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.get("bounds", ""))
            if text and m:
                x1, y1, x2, y2 = map(int, m.groups())
                found.append((text, (x1 + x2) // 2, (y1 + y2) // 2))
        return found

    def find(self, text, which="last", prefix=False):
        """同一文字可能出现多次（顶部名称和磁贴标题）：last 取最靠下的，first 取最靠上的。"""
        for _ in range(5):
            hits = [n for n in self.nodes() if (n[0].startswith(text) if prefix else n[0] == text)]
            if hits:
                hits.sort(key=lambda n: n[2])
                return hits[-1] if which == "last" else hits[0]
            time.sleep(1)
        raise RuntimeError(f"界面上找不到：{text}")

    def tap(self, text, **kw):
        _, x, y = self.find(text, **kw)
        print(f"点击 {text} ({x},{y})")
        shell(f"input tap {x} {y}")
        time.sleep(1.5)

    def long_press(self, text, **kw):
        _, x, y = self.find(text, **kw)
        print(f"长按 {text} ({x},{y})")
        shell(f"input swipe {x} {y} {x} {y} 1200")
        time.sleep(1.5)

    def key(self, code, times=1):
        for _ in range(times):
            shell(f"input keyevent {code}")
            time.sleep(0.6)

    def home(self):
        self.key("KEYCODE_HOME")
        time.sleep(1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--launcher", required=True)
    ap.add_argument("--fake", action="append", default=[])
    ap.add_argument("--out", default="demo-out")
    args = ap.parse_args()

    adb("wait-for-device")
    adb("install", "-r", args.launcher)
    for apk in args.fake:
        adb("install", "-r", apk)
    # 车机常见密度；分辨率由模拟器的 -skin 1920x720 决定。
    shell("wm density 240")
    shell("settings put system screen_off_timeout 1800000")
    shell("svc power stayon true")
    shell(f"cmd package set-home-activity {HOME}")
    shell("input keyevent KEYCODE_WAKEUP")
    shell("wm dismiss-keyguard", check=False)

    demo = Demo(args.out)
    recorder = subprocess.Popen(["adb", "shell", "screenrecord", "--bit-rate", "8000000", "/sdcard/demo.mp4"])
    time.sleep(1)
    failed = None
    try:
        demo.home()
        time.sleep(2)
        demo.shot("home")

        demo.tap("CarPlay")                       # 磁贴（最靠下的那个）
        demo.find("ZLINK（模拟）")
        demo.shot("carplay-opened")
        demo.home()

        demo.tap("原车")
        demo.find("原车 MMI 画面（模拟）")
        demo.shot("oem-opened")
        demo.home()

        demo.long_press("设置")                   # 设置磁贴
        demo.shot("tile-menu")
        demo.tap("更换图标…")
        demo.shot("icon-picker")
        demo.key("KEYCODE_BACK")

        demo.tap("应用", which="first")           # 右上角胶囊
        demo.shot("library")
        demo.key("KEYCODE_BACK")

        demo.tap("设置", which="first")           # 右上角胶囊
        demo.shot("settings")
        demo.tap("壁纸", prefix=True)
        demo.shot("wallpaper-picker")
        demo.tap("城市夜景")
        time.sleep(1)
        demo.shot("wallpaper-city")

        # 旋钮 / 方向键：焦点在磁贴间移动。
        demo.key("KEYCODE_DPAD_DOWN", 2)
        demo.key("KEYCODE_DPAD_RIGHT", 2)
        demo.shot("dpad-focus")
        demo.home()
        demo.shot("home-again")
    except Exception as e:  # noqa: BLE001 - 失败也要保留录屏
        failed = e
        demo.shot("failure")
    finally:
        shell("pkill -INT screenrecord", check=False)
        try:
            recorder.wait(timeout=20)
        except subprocess.TimeoutExpired:
            recorder.kill()
        time.sleep(2)
        adb("pull", "/sdcard/demo.mp4", os.path.join(args.out, "demo.mp4"), check=False)

    crashes = shell("logcat -d -b crash", check=False) or ""
    with open(os.path.join(args.out, "crash.log"), "w") as f:
        f.write(crashes)
    if PKG in crashes:
        print("桌面发生崩溃，见 crash.log", file=sys.stderr)
        sys.exit(1)
    if failed:
        print(f"演示失败：{failed}", file=sys.stderr)
        sys.exit(1)
    print("演示完成")


if __name__ == "__main__":
    main()

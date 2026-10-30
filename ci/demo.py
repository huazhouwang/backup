#!/usr/bin/env python3
"""CI 演示：在模拟器上安装桌面和假应用，按步骤点一遍，截图并录屏。

- 每一步写一条中文字幕（captions.srt），按键类操作（HOME、返回、方向键）也有字幕。
- 每次点击 / 长按记到 taps.json；模拟器对脚本注入的点击不显示系统触点，由 ci/render_video.py 画圆环。
- 每张截图上用红圈标出这一步点击的位置（需要 Pillow，没有就跳过）。

用法：python3 ci/demo.py --launcher app-release.apk --fake zlink.apk --fake oem.apk --out demo-out
任何一步找不到要点的文字就失败（截图和录屏仍会保留，方便排查）。
"""
import argparse
import json
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


def srt_time(t):
    t = max(t, 0)
    h, rem = divmod(int(t * 1000), 3600_000)
    m, rem = divmod(rem, 60_000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


class Demo:
    def __init__(self, out):
        self.out = out
        self.shots = 0
        self.t0 = None
        self.captions = []  # (开始秒, 文字)
        self.last_touch = None  # (x, y, 说明)
        self.taps = []  # 给 render_video.py 画圆环用
        os.makedirs(out, exist_ok=True)

    # ---- 字幕 ----

    def caption(self, text):
        print(f"[字幕] {text}")
        if self.t0 is not None:
            self.captions.append((time.time() - self.t0, text))

    def write_srt(self, end):
        lines = []
        for i, (start, text) in enumerate(self.captions):
            stop = self.captions[i + 1][0] if i + 1 < len(self.captions) else end
            lines += [str(i + 1), f"{srt_time(start)} --> {srt_time(stop)}", text, ""]
        with open(os.path.join(self.out, "captions.srt"), "w", encoding="utf-8") as f:
            f.write("\n".join(lines))

    # ---- 截图（标出点击位置） ----

    def shot(self, name):
        self.shots += 1
        path = os.path.join(self.out, f"{self.shots:02d}-{name}.png")
        with open(path, "wb") as f:
            subprocess.run(["adb", "exec-out", "screencap", "-p"], stdout=f, check=True)
        if self.last_touch:
            mark(path, *self.last_touch)
        print(f"  截图 {path}")

    # ---- 界面查找和操作 ----

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

    def exists(self, text):
        return any(n[0] == text for n in self.nodes())

    def find(self, text, which="last", prefix=False, tries=5):
        """同一文字可能出现多次（顶部名称和磁贴标题）：last 取最靠下的，first 取最靠上的。"""
        for _ in range(tries):
            hits = [n for n in self.nodes() if (n[0].startswith(text) if prefix else n[0] == text)]
            if hits:
                hits.sort(key=lambda n: n[2])
                return hits[-1] if which == "last" else hits[0]
            time.sleep(1)
        raise RuntimeError(f"界面上找不到：{text}")

    def tap(self, text, caption, **kw):
        _, x, y = self.find(text, **kw)
        self.caption(caption)
        time.sleep(0.9)  # 先给字幕和圆环一点时间，看清要点哪里
        self.last_touch = (x, y, "点击")
        self.log_tap(x, y, "tap")
        shell(f"input tap {x} {y}")
        time.sleep(1.8)

    def long_press(self, text, caption, **kw):
        _, x, y = self.find(text, **kw)
        self.caption(caption)
        time.sleep(0.9)
        self.last_touch = (x, y, "长按")
        self.log_tap(x, y, "hold")
        shell(f"input swipe {x} {y} {x} {y} 1200")
        time.sleep(1.8)

    def log_tap(self, x, y, kind):
        if self.t0 is not None:
            self.taps.append({"t": round(time.time() - self.t0, 2), "x": x, "y": y, "kind": kind})

    def write_taps(self):
        with open(os.path.join(self.out, "taps.json"), "w") as f:
            json.dump(self.taps, f)

    def key(self, code, caption, times=1):
        self.caption(caption)
        self.last_touch = None
        for _ in range(times):
            shell(f"input keyevent {code}")
            time.sleep(0.7)
        time.sleep(0.8)

    def home(self):
        self.key("KEYCODE_HOME", "按键：HOME，回到桌面")


def check_share(demo, out):
    """从截图里识别二维码，经 adb forward 打开车机上的临时网页，确认网页和报告能访问（报告存下来当样例）。"""
    import urllib.request
    import urllib.parse
    try:
        import cv2
    except ImportError:
        print("没有 OpenCV，跳过二维码识别")
        return
    shot = sorted(f for f in os.listdir(out) if f.endswith("settings-recon-qr.png"))[-1]
    url = ""
    for detector in (cv2.QRCodeDetector(), getattr(cv2, "QRCodeDetectorAruco", cv2.QRCodeDetector)()):
        url = detector.detectAndDecode(cv2.imread(os.path.join(out, shot)))[0]
        if url:
            break
    if not url:
        raise RuntimeError("截图里识别不出二维码")
    print(f"  二维码：{url}")
    parsed = urllib.parse.urlparse(url)
    adb("forward", "tcp:18765", f"tcp:{parsed.port}")
    local = f"http://127.0.0.1:18765{parsed.path}"
    page = urllib.request.urlopen(local, timeout=10).read().decode("utf-8")
    report = urllib.request.urlopen(local + "report.md", timeout=10).read().decode("utf-8")
    if "车机摸底" not in page or "## 系统" not in report:
        raise RuntimeError("临时网页内容不对")
    with open(os.path.join(out, "recon-page.html"), "w", encoding="utf-8") as f:
        f.write(page)
    with open(os.path.join(out, "recon-report.md"), "w", encoding="utf-8") as f:
        f.write(report)
    print(f"  临时网页正常，报告 {len(report)} 字符")


CJK_FONTS = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
]


def mark(path, x, y, label):
    """在截图上画一个红圈，标出这一步点击的位置。"""
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        return
    font = None
    for f in CJK_FONTS:
        if os.path.exists(f):
            font = ImageFont.truetype(f, 26)
            break
    if font is None:  # 没有中文字体就用英文标签
        label = {"点击": "TAP", "长按": "HOLD"}.get(label, label)
        font = ImageFont.load_default()
    im = Image.open(path).convert("RGB")
    d = ImageDraw.Draw(im)
    r = 36
    d.ellipse((x - r - 2, y - r - 2, x + r + 2, y + r + 2), outline=(0, 0, 0), width=8)
    d.ellipse((x - r, y - r, x + r, y + r), outline=(255, 59, 48), width=5)
    d.ellipse((x - 7, y - 7, x + 7, y + 7), fill=(255, 59, 48))
    box = d.textbbox((0, 0), label, font=font)
    w, h = box[2] - box[0], box[3] - box[1]
    lx = x + r + 10 if x + r + 10 + w + 20 <= im.width else x - r - 30 - w
    d.rounded_rectangle((lx, y - h // 2 - 8, lx + w + 20, y + h // 2 + 10), radius=8, fill=(255, 59, 48))
    d.text((lx + 10, y - h // 2 - box[1]), label, fill=(255, 255, 255), font=font)
    im.save(path)


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
    # 录屏里显示触点。
    shell("settings put system show_touches 1")
    # 安全模式演示里会故意崩溃，隐藏系统的"应用停止运行"弹窗。
    shell("settings put global hide_error_dialogs 1", check=False)
    # 设为默认桌面：安卓 10+ 用"桌面"角色，旧方法兜底；否则按 HOME 会弹系统的选择框。
    shell(f"cmd role add-role-holder --user 0 android.app.role.HOME {PKG}", check=False)
    shell(f"cmd package set-home-activity {HOME}", check=False)
    shell("input keyevent KEYCODE_WAKEUP")
    shell("wm dismiss-keyguard", check=False)
    shell("input keyevent KEYCODE_HOME")
    for _ in range(10):  # 等桌面真正出现在前台再开始录
        if PKG in (shell("dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity'", check=False) or ""):
            break
        time.sleep(1)
    else:
        print("警告：桌面没有出现在前台", file=sys.stderr)
    time.sleep(2)

    demo = Demo(args.out)
    recorder = subprocess.Popen(
        ["adb", "shell", "screenrecord", "--time-limit", "180", "--bit-rate", "8000000", "/sdcard/demo.mp4"])
    demo.t0 = time.time()  # 录屏大约在这之后零点几秒开始，字幕会比动作稍早一点出现
    failed = None
    try:
        time.sleep(1)
        demo.caption("① 首页：CarPlay、原车、文件、设置")
        time.sleep(2)
        demo.shot("home")

        demo.tap("CarPlay", "② 点击 CarPlay 磁贴 → 打开 ZLINK（模拟）")
        demo.find("ZLINK（模拟）")
        demo.shot("carplay-opened")
        demo.home()

        demo.tap("原车", "③ 点击「原车」磁贴 → 打开原车画面（模拟）")
        demo.find("原车 MMI 画面（模拟）")
        demo.shot("oem-opened")
        demo.home()

        demo.long_press("设置", "④ 长按「设置」磁贴 → 弹出操作菜单")
        demo.shot("tile-menu")
        demo.tap("更换图标", "⑤ 点「更换图标」→ 图标网格")
        demo.shot("icon-picker")
        demo.tap("导航", "⑥ 选「导航」图标：只换图标，打开的应用不变")
        demo.shot("icon-changed")

        demo.tap("应用", "⑦ 点右上角「应用」→ 全部应用", which="first")
        demo.shot("library")
        demo.key("KEYCODE_BACK", "按键：返回")

        demo.tap("设置", "⑧ 点右上角「设置」→ 整页设置", which="first")
        demo.shot("settings-wallpaper")
        demo.tap("城市夜景", "⑨ 点缩略图「城市夜景」换壁纸")
        demo.shot("settings-wallpaper-city")
        demo.tap("CarPlay 与原车", "⑩ 左侧切到「CarPlay 与原车」")
        demo.shot("settings-carplay")
        demo.tap("开机自动进入 CarPlay", "⑪ 打开「开机自动进入 CarPlay」开关")
        demo.shot("settings-toggle")
        demo.tap("高级", "⑫ 左侧切到「高级」")
        demo.shot("settings-advanced")
        demo.tap("恢复默认布局", "⑬ 点「恢复默认布局」→ 确认卡片")
        demo.shot("confirm")
        demo.tap("取消", "⑭ 点「取消」")
        demo.tap("版本更新", "⑮ 左侧切到「版本更新」→ 检查 GitHub Release", prefix=True)
        time.sleep(3)  # 等检查结果
        demo.shot("settings-update")
        demo.tap("车机摸底", "⑯ 左侧切到「车机摸底」→ 只读查系统、调试线索、原车 / CarPlay 组件")
        demo.find("要点")  # 摸底在后台跑，出现要点说明完成了
        demo.shot("settings-recon")
        demo.tap("生成二维码", "⑰ 点「生成二维码」→ 车机开临时网页，手机扫码看报告、粘贴 GitHub 令牌")
        demo.shot("settings-recon-qr")
        check_share(demo, args.out)
        demo.tap("返回桌面", "⑱ 点「返回桌面」")
        demo.shot("home-city")

        # 旋钮 / 方向键：焦点在磁贴间移动。
        demo.key("KEYCODE_DPAD_DOWN", "⑲ 方向键 ↓（模拟旋钮）：焦点从 CarPlay 开始")
        demo.key("KEYCODE_DPAD_RIGHT", "⑳ 方向键 →：焦点移到下一个磁贴", times=4)
        demo.shot("dpad-focus")
        demo.home()

        # 安全模式：让桌面故意连续崩溃 3 次（只有放了标记文件才会崩，见 MainActivity.maybeCrashForTest）
        marker = f"/sdcard/Android/data/{PKG}/files/crash-test"
        shell(f"touch {marker}")
        demo.caption("㉑ 测试：让桌面故意连续崩溃 3 次")
        for _ in range(3):
            shell(f"am start -n {HOME} --ez crash_test true", check=False)
            time.sleep(2.5)
        shell(f"rm -f {marker}")
        demo.caption("㉒ 第 3 次崩溃后，桌面自动进入安全模式（不会卡在反复崩溃里）")
        time.sleep(2)
        # 默认桌面反复崩溃时，安卓自己会取消默认桌面、让用户重新选（车上也一样，这时也可以选原厂桌面）。
        if demo.exists("Select a Home app") or demo.exists("Q5 Home"):
            demo.tap("Q5 Home", "安卓发现桌面反复崩溃，让你重新选桌面：选 Q5 Home")
            for label in ("Always", "始终", "总是"):
                if demo.exists(label):
                    demo.tap(label, "选「始终」")
                    break
        demo.find("安全模式")
        time.sleep(1)
        demo.shot("safe-mode")
        demo.tap("再试一次正常启动", "㉓ 点「再试一次正常启动」→ 回到正常桌面")
        demo.find("CarPlay")
        demo.shot("home-after-safe-mode")
        demo.caption("演示结束")
        time.sleep(2)
    except Exception as e:  # noqa: BLE001 - 失败也要保留录屏
        failed = e
        demo.caption(f"失败：{e}")
        demo.shot("failure")
    finally:
        end = time.time() - demo.t0
        shell("pkill -INT screenrecord", check=False)
        try:
            recorder.wait(timeout=20)
        except subprocess.TimeoutExpired:
            recorder.kill()
        time.sleep(2)
        adb("pull", "/sdcard/demo.mp4", os.path.join(args.out, "demo-raw.mp4"), check=False)
        demo.write_srt(end)
        demo.write_taps()

    crashes = shell("logcat -d -b crash", check=False) or ""
    with open(os.path.join(args.out, "crash.log"), "w") as f:
        f.write(crashes)
    # 按 "FATAL EXCEPTION" 分段；故意制造的 crash_test 崩溃不算，其它桌面崩溃都算失败。
    real = [b for b in crashes.split("FATAL EXCEPTION")[1:] if PKG in b and "crash_test" not in b]
    if real:
        print(f"桌面发生了 {len(real)} 次意外崩溃，见 crash.log", file=sys.stderr)
        sys.exit(1)
    if failed:
        print(f"演示失败：{failed}", file=sys.stderr)
        sys.exit(1)
    print("演示完成")


if __name__ == "__main__":
    main()

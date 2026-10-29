#!/usr/bin/env python3
"""把 demo.py 录的原始视频加工成带说明的演示视频。

- 视频下方加一条黑色字幕栏，中文步骤字幕放在栏里，不挡住界面。
- 在每次点击 / 长按的位置画圆环（模拟器对脚本注入的点击不显示系统触点，所以自己画）：
  点击是白色圆环，长按是橙色圆环且停留更久。

用法：python3 ci/render_video.py demo-out   （读 demo-raw.mp4、captions.srt、taps.json，写 demo.mp4）
"""
import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw

STRIP = 120  # 字幕栏高度（像素）
RING = 120   # 圆环直径
FONT = os.environ.get("CAPTION_FONT", "Noto Sans CJK SC")


def ring(path, color):
    """半透明实心圆 + 粗圆环 + 黑色描边，任何背景上都看得清。"""
    im = Image.new("RGBA", (RING, RING), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((4, 4, RING - 4, RING - 4), fill=color[:3] + (70,), outline=(0, 0, 0, 200), width=10)
    d.ellipse((8, 8, RING - 8, RING - 8), outline=color, width=6)
    d.ellipse((RING // 2 - 9, RING // 2 - 9, RING // 2 + 9, RING // 2 + 9), fill=color)
    im.save(path)


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "demo-out"
    raw = os.path.join(out, "demo-raw.mp4")
    srt = os.path.join(out, "captions.srt")
    taps_path = os.path.join(out, "taps.json")
    if not (os.path.exists(raw) and os.path.exists(srt)):
        print("没有原始录屏或字幕，跳过")
        return
    taps = json.load(open(taps_path)) if os.path.exists(taps_path) else []

    probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                            "stream=width,height", "-of", "csv=p=0", raw], capture_output=True, text=True, check=True)
    width, height = map(int, probe.stdout.strip().split(","))

    tap_png = os.path.join(out, ".ring-tap.png")
    hold_png = os.path.join(out, ".ring-hold.png")
    ring(tap_png, (255, 255, 255, 255))
    ring(hold_png, (255, 159, 10, 255))

    taps_short = [t for t in taps if t["kind"] == "tap"]
    taps_long = [t for t in taps if t["kind"] == "hold"]
    # screenrecord 是可变帧率（画面不动时不出帧），先转成固定 30fps，字幕和圆环的时间才对得上。
    parts = [f"[0:v]fps=30,pad=iw:ih+{STRIP}:0:0:color=black[v0]"]
    if taps_short:
        parts.append(f"[1:v]split={len(taps_short)}" + "".join(f"[t{i}]" for i in range(len(taps_short))))
    if taps_long:
        parts.append(f"[2:v]split={len(taps_long)}" + "".join(f"[h{i}]" for i in range(len(taps_long))))
    cur = "v0"
    n = 0
    # 圆环在点下去之前 0.7 秒就出现（界面一点就变，之后再画会落在下一个画面上），长按期间一直显示。
    for label, group, before, after in (("t", taps_short, 0.7, 0.25), ("h", taps_long, 0.7, 1.3)):
        for i, t in enumerate(group):
            n += 1
            nxt = f"v{n}"
            x, y = t["x"] - RING // 2, t["y"] - RING // 2
            start, end = max(t["t"] - before, 0), t["t"] + after
            parts.append(f"[{cur}][{label}{i}]overlay={x}:{y}:shortest=1:enable='between(t,{start:.2f},{end:.2f})'[{nxt}]")
            cur = nxt
    # 字幕的字号和边距按 288 行高的坐标算（libass 默认），换算成实际像素：字高约 52px，放在底部字幕栏中间。
    scale = 288 / (height + STRIP)
    font_px, margin_px = 52, (STRIP - 52) // 2
    style = (f"FontName={FONT},FontSize={font_px * scale:.1f},PrimaryColour=&H00FFFFFF,BorderStyle=1,"
             f"Outline=0,Shadow=0,Alignment=2,MarginV={margin_px * scale:.1f}")
    srt_escaped = srt.replace(":", "\\:")
    parts.append(f"[{cur}]subtitles={srt_escaped}:original_size={width}x{height + STRIP}:force_style='{style}'[out]")
    script = os.path.join(out, ".filter.txt")
    with open(script, "w") as f:
        f.write(";\n".join(parts))

    cmd = ["ffmpeg", "-loglevel", "error", "-y", "-i", raw,
           "-loop", "1", "-i", tap_png, "-loop", "1", "-i", hold_png,
           "-filter_complex_script", script, "-map", "[out]",
           "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p",
           os.path.join(out, "demo.mp4")]
    subprocess.run(cmd, check=True)
    for f in (tap_png, hold_png, script):
        os.remove(f)
    print(f"已生成 {out}/demo.mp4（{len(taps)} 处点击标记）")


if __name__ == "__main__":
    main()

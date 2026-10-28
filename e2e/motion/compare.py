"""Compares two motion runs (sheet.motion.ts) frame by frame.

For every scenario: each frozen frame's pixels and the sheet's geometry in trace.json, and
a side-by-side picture of the frames that differ. With ffmpeg, also a side-by-side video of
each scenario (before left, after right).

Usage: python3 -I compare.py <before-dir> <after-dir> <report-dir>
Exits 1 when any frame differs beyond font antialiasing.
"""

import json
import os
import subprocess
import sys

from PIL import Image, ImageChops

# A pixel counts as changed past this per-channel difference; a frame differs when more
# than this share of its pixels changed (antialiasing alone stays far below it).
PIXEL_THRESHOLD = 24
FRAME_TOLERANCE = 0.002

before, after, report = sys.argv[1:4]
os.makedirs(report, exist_ok=True)


def changed_share(a, b):
    if a.size != b.size:
        return 1.0
    diff = ImageChops.difference(a.convert('RGB'), b.convert('RGB')).convert('L')
    changed = sum(diff.point(lambda value: 255 if value > PIXEL_THRESHOLD else 0).histogram()[255:])
    return changed / (a.size[0] * a.size[1])


def videos(run):
    """Scenario folder name → its video, by the test title Playwright puts in the path."""
    found = {}
    root = os.path.join(run, 'videos')
    for folder, _, files in os.walk(root) if os.path.isdir(root) else []:
        for name in files:
            if name.endswith('.webm'):
                found[os.path.basename(folder)] = os.path.join(folder, name)
    return found


failures = []
lines = []
for scenario in sorted(os.listdir(before)):
    old_dir, new_dir = os.path.join(before, scenario), os.path.join(after, scenario)
    if scenario == 'videos' or not os.path.isdir(old_dir):
        continue
    if not os.path.isdir(new_dir):
        failures.append(f'{scenario}: missing after')
        continue
    old_trace = json.load(open(os.path.join(old_dir, 'trace.json')))
    new_trace = json.load(open(os.path.join(new_dir, 'trace.json')))
    for old, new in zip(old_trace, new_trace):
        frame = old['frame']
        share = changed_share(
            Image.open(os.path.join(old_dir, f'{frame}.png')),
            Image.open(os.path.join(new_dir, f"{new['frame']}.png")),
        )
        geometry = {key: (old[key], new.get(key)) for key in old if key != 'frame' and old[key] != new.get(key)}
        status = 'ok' if share <= FRAME_TOLERANCE and not geometry else 'DIFF'
        lines.append(f'{status:4} {scenario}/{frame}: {share:.4%} pixels' + (f', {geometry}' if geometry else ''))
        if status != 'ok':
            failures.append(f'{scenario}/{frame}')
            pair = Image.new('RGB', (780, 844), 'white')
            pair.paste(Image.open(os.path.join(old_dir, f'{frame}.png')).convert('RGB').resize((390, 844)), (0, 0))
            pair.paste(Image.open(os.path.join(new_dir, f"{new['frame']}.png")).convert('RGB').resize((390, 844)), (390, 0))
            pair.save(os.path.join(report, f'{scenario}-{frame}.png'))
    if len(old_trace) != len(new_trace):
        failures.append(f'{scenario}: {len(old_trace)} frames before, {len(new_trace)} after')

old_videos, new_videos = videos(before), videos(after)
for name, old_video in sorted(old_videos.items()):
    new_video = new_videos.get(name)
    if new_video:
        subprocess.run(
            ['ffmpeg', '-v', 'error', '-y', '-i', old_video, '-i', new_video, '-filter_complex', 'hstack=2',
             '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', os.path.join(report, f'{name}.mp4')],
            check=False,
        )

open(os.path.join(report, 'report.txt'), 'w').write('\n'.join(lines) + '\n')
print('\n'.join(lines))
print(f'\n{len(failures)} differing: {failures}' if failures else '\nall frames match')
sys.exit(1 if failures else 0)

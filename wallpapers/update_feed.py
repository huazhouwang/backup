#!/usr/bin/env python3
"""每天给 wallpapers/feed.json 追加几张 Unsplash 新壁纸（GitHub Actions 定时运行，见 .github/workflows/wallpapers.yml）。

- 只要横图（宽高比 ≥ 1.4），按日期轮流用几个主题搜，跳过清单里已有的。
- 记下摄影师名字和照片页面（Unsplash 要求署名），图片地址用 Unsplash 图片服务器原图（车机下载时按屏幕尺寸裁）。
- 按 Unsplash API 规范，加入清单时调用一次 download_location。
- 清单最多保留 MAX_PHOTOS 张，旧的从前面删掉（车机优先下载靠后的新图）。

用法：UNSPLASH_ACCESS_KEY=... python3 wallpapers/update_feed.py [--count 3] [--feed wallpapers/feed.json]
测试：python3 wallpapers/update_feed.py --fixture response.json（不联网，用保存好的 API 返回）
"""
import argparse
import datetime
import json
import os
import sys
import urllib.parse
import urllib.request

API = "https://api.unsplash.com"
MAX_PHOTOS = 60
MIN_RATIO = 1.4
# 偏暗、适合车里看的主题，按日期轮流。
QUERIES = ["night landscape", "mountain sunset", "city night", "road trip landscape", "aurora", "foggy forest", "ocean dusk"]


def api_get(path, key):
    req = urllib.request.Request(API + path, headers={"Authorization": f"Client-ID {key}", "Accept-Version": "v1"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def pick(photos, have, count):
    """从 API 返回里挑横图、去重，最多 count 张。"""
    out = []
    for p in photos:
        if p["id"] in have or any(o["id"] == p["id"] for o in out):
            continue
        if p.get("height") and p["width"] / p["height"] < MIN_RATIO:
            continue
        user = p.get("user") or {}
        out.append({
            "id": p["id"],
            "author": user.get("name", ""),
            "link": (p.get("links") or {}).get("html", "https://unsplash.com"),
            "url": p["urls"]["raw"],
            "added": datetime.date.today().isoformat(),
            "_track": (p.get("links") or {}).get("download_location"),
        })
        if len(out) >= count:
            break
    return out


def write_feed(path, feed):
    """一张照片一行，diff 好看。"""
    head = {k: v for k, v in feed.items() if k != "photos"}
    lines = ["{"] + [f"  {json.dumps(k, ensure_ascii=False)}: {json.dumps(v, ensure_ascii=False)}," for k, v in head.items()]
    lines.append('  "photos": [')
    rows = [f"    {json.dumps(p, ensure_ascii=False, separators=(', ', ': '))}" for p in feed["photos"]]
    lines.append(",\n".join(rows))
    lines += ["  ]", "}"]
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--feed", default=os.path.join(os.path.dirname(__file__), "feed.json"))
    ap.add_argument("--count", type=int, default=3)
    ap.add_argument("--fixture", help="用保存好的 API 返回代替联网（测试用）")
    args = ap.parse_args()

    with open(args.feed, encoding="utf-8") as f:
        feed = json.load(f)
    have = {p["id"] for p in feed["photos"]}

    key = os.environ.get("UNSPLASH_ACCESS_KEY", "")
    if args.fixture:
        with open(args.fixture, encoding="utf-8") as f:
            photos = json.load(f)
    elif not key:
        print("::notice::没有配置 UNSPLASH_ACCESS_KEY，跳过壁纸清单更新")
        return
    else:
        query = QUERIES[datetime.date.today().toordinal() % len(QUERIES)]
        q = urllib.parse.urlencode({"query": query, "orientation": "landscape", "content_filter": "high",
                                    "count": 10})
        photos = api_get(f"/photos/random?{q}", key)
        print(f"主题：{query}，返回 {len(photos)} 张")

    new = pick(photos, have, args.count)
    for p in new:
        track = p.pop("_track")
        if track and key and not args.fixture:
            try:
                api_get(urllib.parse.urlparse(track).path + "?" + urllib.parse.urlparse(track).query, key)
            except Exception as e:  # noqa: BLE001 - 统计失败不影响加图
                print(f"download_location 调用失败：{e}")
        print(f"加入 {p['id']}  {p['author']}")

    feed["photos"] = (feed["photos"] + new)[-MAX_PHOTOS:]
    write_feed(args.feed, feed)
    print(f"新增 {len(new)} 张，清单共 {len(feed['photos'])} 张")
    if "GITHUB_OUTPUT" in os.environ:
        with open(os.environ["GITHUB_OUTPUT"], "a") as f:
            f.write(f"added={len(new)}\n")


if __name__ == "__main__":
    sys.exit(main())

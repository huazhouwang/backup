#!/usr/bin/env bash
# 找车机上开着的 adb 端口。只读：只探测端口、尝试 adb connect，不改车机上的任何东西。
# 用法：tools/find-adb.sh 172.20.10.2
#
# 依次尝试：
#   1. mDNS：安卓 11+ 的"无线调试"打开时会广播自己的 IP 和端口
#   2. 常见端口：5555–5585（adb tcpip 默认）
#   3. 全端口扫描（需要 nmap：brew install nmap），无线调试的端口是随机的
# 找到开着的端口就逐个 adb connect，看哪个是 adb。
set -uo pipefail

ip="${1:-}"
if [ -z "$ip" ]; then
  echo "用法：tools/find-adb.sh <车机IP>" >&2
  exit 1
fi
ADB="${ADB:-adb}"
command -v "$ADB" >/dev/null || { echo "找不到 adb：brew install android-platform-tools" >&2; exit 1; }

try_connect() {
  local target="$1"
  out="$("$ADB" connect "$target" 2>&1)"
  case "$out" in
    *"connected to"*)
      state="$("$ADB" -s "$target" get-state 2>&1)"
      echo "  ✅ $target 是 adb（状态：$state）"
      if [ "$state" != "device" ]; then
        echo "     车机屏幕上应该弹出了「允许调试」，点允许后再执行：adb -s $target get-state"
      fi
      echo
      echo "下一步：tools/recon.sh $target"
      exit 0 ;;
    *) echo "  $target：不是 adb（$out）" ;;
  esac
}

echo "== 1. mDNS（无线调试广播） =="
mdns="$("$ADB" mdns services 2>/dev/null | grep -F "$ip" || true)"
if [ -n "$mdns" ]; then
  echo "$mdns"
  for target in $(echo "$mdns" | grep -oE "$ip:[0-9]+" | sort -u); do try_connect "$target"; done
else
  echo "  没有广播（无线调试没打开，或固件没有这个功能）"
fi

echo "== 2. 常见端口 5555–5585 =="
open=""
for port in $(seq 5555 5585); do
  if nc -z -G 1 "$ip" "$port" 2>/dev/null || nc -z -w 1 "$ip" "$port" 2>/dev/null; then
    open="$open $port"
  fi
done
if [ -n "$open" ]; then
  for port in $open; do try_connect "$ip:$port"; done
else
  echo "  都没开"
fi

echo "== 3. 全端口扫描 =="
if command -v nmap >/dev/null; then
  echo "  扫描 1–65535，大约一两分钟…"
  ports="$(nmap -Pn -p- --min-rate 3000 -T4 "$ip" -oG - 2>/dev/null \
    | grep -oE '[0-9]+/open' | cut -d/ -f1 | tr '\n' ' ')"
  if [ -n "$ports" ]; then
    echo "  开着的端口：$ports"
    for port in $ports; do try_connect "$ip:$port"; done
  else
    echo "  一个开着的端口都没有"
  fi
else
  echo "  没装 nmap，跳过（brew install nmap 后再运行一次）"
fi

echo
echo "没找到 adb 端口：车机上的调试服务没有在网络上监听。打开方法见 README「连不上车机」。"
exit 1

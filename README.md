# audi-q5-launcher

2014 款奥迪 Q5（8R）安卓宽屏车机（WY 固件，Android 12）的简洁桌面和精简工具。

目标：
- 以 CarPlay 为主的简洁桌面，保留"原车"入口。
- 用 ADB 停用（不卸载）不需要的预装应用，可一键恢复。思路参考 [CleanYourTV](https://github.com/Gathin23/cleanyourtv)。

## 现在的进度：第一步，只读摸底

### 1. Mac 上准备 adb

```bash
brew install android-platform-tools
```

### 2. 连接车机（二选一）

**无线调试（推荐）**：车机和 Mac 连同一个 Wi-Fi（例如都连 iPhone 热点；
摸底时先断开无线 CarPlay，避免抢 Wi-Fi）。车机：开发者选项 → 无线调试 → 使用配对码配对。

```bash
adb pair <车机IP>:<配对端口>      # 输入车机上显示的配对码
adb connect <车机IP>:<调试端口>   # 无线调试页面上显示的端口
```

**USB**：用数据线连 Mac 和车机的 USB 口，车机上点"允许 USB 调试"。
（有些车机的 USB 口只能接 U 盘，不能调试，这种情况用无线。）

连好后 `adb devices` 应能看到设备。

### 3. 运行摸底

在本仓库目录打开 Claude Code，把 [PROMPT.md](PROMPT.md) 里的内容粘贴进去即可。
也可以手动执行：

```bash
tools/recon.sh                 # 已连接时
tools/recon.sh 192.168.x.x:端口  # 顺便连接
```

这个脚本只读，不会改动车机。输出在 `recon/`，含设备序列号，已被 git 忽略。

安全规则见 [CLAUDE.md](CLAUDE.md)。

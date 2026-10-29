# audi-q5-launcher

2014 款奥迪 Q5（8R）安卓宽屏车机（WY 固件，Android 12）的简洁桌面和精简工具。

目标：
- 以 CarPlay 为主的简洁桌面，保留"原车"入口。
- 用 ADB 停用（不卸载）不需要的预装应用，可一键恢复。思路参考 [CleanYourTV](https://github.com/Gathin23/cleanyourtv)。

## 进度

1. 只读摸底：`tools/recon.sh`（见下文）
2. 桌面应用：`launcher/`（Kotlin，见下文"桌面应用"）
3. 精简：待摸底完成后再做

## 第一步：只读摸底

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

## 第二步：桌面应用（launcher/）

仿 [CleanYourTV](https://github.com/Gathin23/cleanyourtv) 桌面风格：黑底、大时钟、磨砂胶囊按钮、
选中磁贴的名称和环境光。Kotlin + 传统 View，无第三方依赖，APK 约 100 KB。

![桌面预览](docs/preview-home.png)
（1280×480 预览图，用 Robolectric 渲染，应用图标是占位图。）

- **CarPlay 大磁贴**：自动找 ZLINK / DiPlay，找不到时长按指定。
- **原车磁贴**：自动按名称找"原车"应用；摸底查到真正的切换组件后，用 config.json 指定。
- **常用应用**：点"+"添加，长按可换、移动、移除。
- 右上角"应用"是全部应用列表；"设置"里有系统设置、开机自动进入 CarPlay、恢复默认布局。
- 支持触摸，也支持旋钮/方向键选中（白色描边）。

### 安装

需要 JDK 17 和 Android SDK（装 Android Studio 最省事），然后：

```bash
launcher/build-and-install.sh            # 编译、安装、打开试用，不改默认桌面
launcher/build-and-install.sh --set-home # 试用没问题后，设为默认桌面（会确认并打印回滚命令）
```

不想在 Mac 上装 SDK：GitHub Actions 每次推送都会编译，在仓库 Actions 页面下载 `q5home-apk`，
然后 `launcher/build-and-install.sh --apk 下载的.apk`。

### 用 config.json 配置

```bash
adb push config.json /sdcard/Android/data/com.x0finch.q5home/files/config.json
adb pull /sdcard/Android/data/com.x0finch.q5home/files/current.json   # 查看当前生效的配置
```

字段见 [launcher/config.example.json](launcher/config.example.json)。目标的写法：
`包名`、`包名/类名`、`action:动作`、`broadcast:动作@包名`。

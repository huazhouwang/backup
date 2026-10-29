# 第一步：只读摸底（把下面这段粘贴给 Mac 上的 Claude Code）

```
请先阅读本仓库的 CLAUDE.md，严格遵守其中的安全规则。

本次任务只做只读摸底，不要修改车机上的任何东西：
1. 检查 adb 是否已安装，没有就提示我执行 brew install android-platform-tools。
2. 帮我连上车机（我会告诉你 IP，或者我已经用 USB 连上）。
3. 运行 tools/recon.sh 收集信息。
4. 阅读 recon/ 下的输出和截图，整理一份报告给我：
   - 屏幕分辨率、密度，以及安卓区域大概的位置和大小
   - 当前默认桌面是哪个包、哪个 Activity
   - ZLINK 的包名和启动 Activity
   - "原车"画面切换是由哪个包/组件负责的（推测并说明依据）
   - 倒车影像、CAN、MCU、侧栏分别可能对应哪些包
   - 预装应用分成三类：必须保留 / 可能可以停用 / 不确定
5. 把报告写到 recon/REPORT.md，并把其中不含序列号等隐私信息的部分在对话里给我看。
```

# 第二步：安装桌面（摸底完成后）

```
请先阅读 CLAUDE.md 和 README.md 的"桌面应用"部分。
1. 根据 recon/REPORT.md，写一个 config.json：carplay 填 ZLINK 的组件，oem 填原车切换的组件
   （如果原车是广播切换，用 broadcast: 写法）。把内容给我确认。
2. 运行 launcher/build-and-install.sh（不带 --set-home），安装并打开试用。
3. 确认后用 adb push 推送 config.json，再 pull current.json 核对。
4. 我在车上试用没问题后，再运行 launcher/build-and-install.sh --set-home。
每一步改动车机之前都先把命令给我看。
```

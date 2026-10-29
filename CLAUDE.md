# 项目说明（给 Claude Code 看的）

为一台 2014 款奥迪 Q5（8R）的安卓宽屏车机做简洁桌面和精简。
车机：Android 12，WY 固件（OS_v1.0.0_WY20_2，APP WY_006_20_1.0.63_230322_GSM，
MCU CM_23.02.08_02.21，CAN A81xAQ5_00_0033_N2105）。左侧是原车 MMI 画面，右侧是安卓侧栏。
CarPlay 目前用 ZLINK。用户用 Mac 通过 adb 连车机。

## 安全规则（必须遵守）

1. **默认只读**。`tools/recon.sh` 之外的任何会改变车机状态的命令
  （`pm disable-user`、`pm enable`、`cmd package set-home-activity`、`settings put`、
   `install`/`uninstall`、`am force-stop`、`pm clear` 等），执行前都要先把完整命令列给用户，
   等用户明确同意。
2. **只停用，不卸载**：只用 `pm disable-user --user 0 <包名>`，禁止 `pm uninstall`、
   `pm clear`、root、刷机、改分区。
3. **改动前先有基线**：`recon/` 下最早的一次输出是出厂基线，不得删除或覆盖。
   每次改动前再跑一次 `tools/recon.sh` 留档。
4. **分小批**：每批最多 3–5 个包，每批之后让用户实车验证下面的检查清单，通过再继续。
5. **原厂桌面永远保留**：WY 原厂桌面不得停用，它是我们桌面出问题时的后备。
   只有在新桌面能正常响应 HOME 之后，才可以切换默认桌面。
6. 不确定用途的包，一律不动，先问用户。

## 绝对不能停用的类别

找到对应包名后补充到这里：
- 倒车影像 / 360 / 摄像头相关（行车安全）
- CAN 协议盒、MCU 通讯、车辆信息服务
- 原车 MMI 画面切换（左侧画面、"原车"入口）
- 右侧侧栏（中控锁、安全带图标）和 SystemUI
- 音频通道切换、蓝牙、收音机、方向盘按键、MMI 旋钮映射
- ZLINK（以及试装的 DiPlay）
- WY 原厂桌面、系统设置、工厂设置
- 所有 `android`、`com.android.*` 核心组件（除非用户逐个确认）

## 每次改动后的实车检查清单

- [ ] 挂倒挡：倒车影像正常出现、退出
- [ ] 原车 MMI 画面能切换、旋钮可用
- [ ] 侧栏中控锁、安全带图标正常
- [ ] CarPlay（ZLINK）能连上，声音、通话、Siri 正常
- [ ] 方向盘按键、音量正常
- [ ] 熄火重启后上述项目仍正常

## 目录

- `tools/recon.sh`：只读摸底，输出到 `recon/<时间戳>/`（已 gitignore）。
- `launcher/`：桌面 APK，Kotlin + 传统 View（不用 Compose，车机 CPU 弱），无第三方依赖。
  - `build-and-install.sh`：编译安装；`--set-home` 切换默认桌面前会确认、记录并可回滚。
  - 配置：SharedPreferences + 可用 adb 推送的 `config.json`（见 `Config.kt`、`Targets.kt`）。
  - 摸底查到原车切换组件后，写进 config.json 的 `oem` 字段，不要硬编码进代码。
  - 首页图标在 `Icons.kt`（Material Symbols 矢量图），磁贴 = 图标 key + 目标；换应用只改目标。
  - 壁纸在 `res/drawable-nodpi/wall_*.webp`，来源记在 `CREDITS.md`，新增壁纸要同步更新。
  - 测试：`./gradlew :app:testDebugUnitTest`（Robolectric，含截图输出到 `app/build/screenshots`）。
  - `fakeapps/` 是 CI 录屏用的假 ZLINK / 原车应用，绝不能装到车机上（包名和真 ZLINK 相同）。
- `ci/demo.py`：CI 模拟器演示脚本（截图 + 录屏），由 `.github/workflows/launcher.yml` 调用。
- 后续计划：`tools/disable.sh` / `tools/restore.sh`、`examples/wy20/debloat.txt`。结构参考 CleanYourTV（MIT）。

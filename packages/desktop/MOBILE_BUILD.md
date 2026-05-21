# Increa Reader — 移动端构建配置说明

## 目录结构

```
src-tauri/
├── tauri.conf.json       # 主配置（含 iOS/Android bundle 配置）
├── Cargo.toml            # Rust 依赖（含 mobile_entry_point）
├── capabilities/
│   ├── default.json      # 桌面端权限（Linux/macOS/Windows）
│   └── mobile.json       # 移动端权限（iOS/Android）
├── icons/
│   ├── AppIcon-*.png     # iOS App Store 图标
│   ├── android-icons/    # Android 自适应图标
│   │   ├── mipmap-hdpi/
│   │   ├── mipmap-mdpi/
│   │   ├── mipmap-xhdpi/
│   │   ├── mipmap-xxhdpi/
│   │   └── mipmap-xxxhdpi/
│   ├── icon.icns         # macOS 图标
│   └── icon.ico          # Windows 图标
├── proguard-rules.pro    # Android R8/ProGuard 混淆规则
└── ExportOptions.plist   # iOS App Store 导出选项
```

## 构建 Bundle Targets 说明

`tauri.conf.json` 中的 `bundle.targets` 明确指定了所有平台的打包格式：

| Target     | 平台    | 说明                |
|------------|---------|---------------------|
| `app`      | macOS   | .app 应用包         |
| `dmg`      | macOS   | DMG 安装镜像        |
| `nsis`     | Windows | NSIS 安装程序       |
| `deb`      | Linux   | Debian/Ubuntu 包    |
| `appimage` | Linux   | AppImage 便携包     |
| `updater`  | 全平台  | 增量更新元数据      |
| `ios`      | iOS     | .ipa 应用包         |
| `apk`      | Android | APK 安装包（调试用） |
| `aab`      | Android | AAB 发布包（Play Store） |

> ⚠️ 移动端构建依赖本机 SDK（Xcode / Android Studio），
> 在没有对应 SDK 的机器上 `tauri build` 会自动跳过移动端 target。
> 也可以通过 `tauri ios build` / `tauri android build` 单独构建。

## 桌面端脚本统一说明

桌面端现在也与移动端一样，优先通过统一脚本入口构建：

- `pnpm --filter @increa-reader/desktop dev`
- `pnpm --filter @increa-reader/desktop dev:desktop`
- `pnpm --filter @increa-reader/desktop build`
- `pnpm --filter @increa-reader/desktop build:desktop`

这些命令都会先走 `build.sh`，从而自动补齐 sidecar 构建与前置检查，避免直接执行 `tauri dev/build` 时出现“应用壳能启动，但安装包里漏掉 Python sidecar”的交付漂移。

另外，`build.sh` / `build-mobile.sh` 里的 pnpm 解析逻辑现在会优先读取仓库 `packageManager` 声明，并回退扫描本机 Corepack 缓存中的可用 pnpm 版本，不再写死某个历史版本号。这样当仓库升级 pnpm、CI 预装版本变化、或开发机只缓存了新版本 pnpm 时，打包脚本仍能稳定找到正确的 CLI。

若只是排查底层 Tauri CLI 行为，可额外使用 `dev:desktop:raw` / `build:desktop:raw`。

此外，桌面端 `build.sh` 与移动端 `build-mobile.sh` 现在都不是只“生成清单”就算完成：归档结束后会立刻校验 `manifest.json` / `SHA256SUMS.txt` 与真实产物是否一致，覆盖产物数量、文件类型、大小和 SHA256。这样 CI 或人工发包时如果遇到归档目录残留旧文件、checksum 没更新、或脚本复制不完整，会在打包阶段直接失败，而不是把坏包继续往下游传递。

## iOS 构建流程

> `./build-mobile.sh check` 现在不会因为缺少 Apple Team ID 而提前失败；它只做环境体检。真正执行 `init:ios` / `dev:ios` / `ios` 时，脚本才会强制要求 `INCREA_IOS_TEAM_ID` 或 `TAURI_IOS_TEAM_ID`，更适合 CI、自助排障和新机器初始化。

1. **初始化**（首次）: `./build-mobile.sh init:ios`
   - 生成 Xcode 项目到 `src-tauri/gen/apple/`
   - 需要 macOS + Xcode 15+

2. **开发调试**: `./build-mobile.sh dev:ios`
   - 启动 iOS 模拟器
   - 热重载前端代码

3. **发布构建**: `./build-mobile.sh ios`
   - 生成 .ipa 到 `src-tauri/target/ios/release/`
   - 脚本会额外从 Xcode/Tauri 默认输出目录自动归档 IPA 到上述稳定目录
   - 使用 `ExportOptions.plist` 配置导出选项
   - 需通过 `INCREA_IOS_TEAM_ID` 或 `TAURI_IOS_TEAM_ID` 提供 Team ID，脚本会临时注入签名配置并自动还原

### iOS 配置要点

- **最低版本**: iOS 15.0 (`bundle.iOS.minimumSystemVersion`)
- **开发团队**: 通过环境变量 `INCREA_IOS_TEAM_ID`（或兼容 `TAURI_IOS_TEAM_ID`）注入，避免手动修改 `tauri.conf.json` / `ExportOptions.plist`
- **前置检查行为**: `./build-mobile.sh check` 不强依赖 Team ID，便于先验证 Xcode/Rust 环境；但 `init:ios` / `dev:ios` / `ios` 仍会强制校验 Team ID，避免真正发包时才发现签名参数缺失
- **方向支持**: iPhone 竖屏+横屏，iPad 全方向
- **文件关联**: 支持 PDF 和 Markdown 文件打开
- **ATS**: 允许本地网络和任意加载（用于连接本地后端）
- **加密声明**: `ITSAppUsesNonExemptEncryption: false`（避免出口合规问题）

## Android 构建流程

1. **初始化**（首次）: `./build-mobile.sh init:android`
   - 生成 Gradle 项目到 `src-tauri/gen/android/`
   - 需要 Android SDK + NDK 25+

2. **开发调试**: `./build-mobile.sh dev:android`
   - 启动 Android 模拟器
   - 热重载前端代码

3. **发布构建**: `./build-mobile.sh android`
   - 生成 APK/AAB 到 `src-tauri/target/android/release/`
   - 脚本会额外从 `src-tauri/gen/android/app/build/outputs/` 自动归档 APK/AAB 到上述稳定目录
   - ProGuard 规则在 `src-tauri/proguard-rules.pro`
   - 会自动同步 `src-tauri/gradle.properties` / `keystore.properties` 到 `src-tauri/gen/android/`

4. **签名**: `./build-mobile.sh sign:android`
   - 使用 debug keystore 签名（测试用）
   - 生产签名需配置自己的 keystore
   - CI 可直接使用 `INCREA_ANDROID_KEYSTORE_B64`、`INCREA_ANDROID_KEYSTORE_PASSWORD`、`INCREA_ANDROID_KEY_ALIAS`、`INCREA_ANDROID_KEY_PASSWORD` 自动落盘为 `keystore.properties`

### Android 配置要点

- **最低 SDK**: 26 (Android 8.0)
- **目标 SDK**: 34 (Android 14)
- **ABI 过滤**: `arm64-v8a`, `x86_64`（排除 32-bit 减小体积；对应 Rust target 也必须安装 `aarch64-linux-android` 与 `x86_64-linux-android`）
- **自适应图标**: 前景/背景图层分离
- **备份**: 禁用 `allowBackup`（避免数据泄露）
- **Split modules**: 禁用 `splitModulesEnabled`（保持单 APK 简化分发）
- **构建稳定性**: 统一通过 `build-mobile.sh` 准备签名文件与 `gradle.properties`，避免 Tauri 重新生成 `gen/android/` 后丢失配置
- **产物路径稳定性**: 统一把原生输出目录中的安装包归档到 `src-tauri/target/{ios,android}/release/`，便于 CI 上传、人工分发和后续脚本复用
- **归档即校验**: `build:ios:stage` / `build:android:stage` 在生成 `manifest.json` 与 `SHA256SUMS.txt` 后，会立即校验平台字段、产物数量、文件大小、后缀类型和 checksum 映射，防止“清单写出来了但与实际安装包不一致”这类静默分发错误

## 权限配置

桌面端和移动端使用不同的 capabilities 文件：

- `capabilities/default.json` — 桌面端（包含 shell spawn/execute、dialog save/confirm 等）
- `capabilities/mobile.json` — 移动端（移除危险权限，添加 deep-link、fullscreen 等）

移动端权限差异：
- ✅ 新增 `deep-link:default`（深度链接）
- ✅ 新增 `allow-set-fullscreen` / `allow-is-fullscreen`
- ❌ 移除 `shell:allow-spawn` / `shell:allow-execute`（安全限制）
- ❌ 移除 `dialog:allow-save` / `dialog:allow-confirm` / `dialog:allow-ask`
- ❌ 移除 `fs:allow-remove` / `fs:allow-rename` / `fs:allow-copy-file`

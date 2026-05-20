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

`tauri.conf.json` 中的 `bundle.targets` 明确指定了桌面端打包格式：

| Target   | 平台    | 说明                |
|----------|---------|---------------------|
| `app`    | macOS   | .app 应用包         |
| `dmg`    | macOS   | DMG 安装镜像        |
| `nsis`   | Windows | NSIS 安装程序       |
| `deb`    | Linux   | Debian/Ubuntu 包    |
| `appimage`| Linux  | AppImage 便携包     |
| `updater`| 全平台  | 增量更新元数据      |

> ⚠️ iOS (.ipa) 和 Android (.apk/.aab) 不在 `bundle.targets` 中，
> 需要通过 `tauri ios build` / `tauri android build` 单独构建。
> 原因：移动端构建依赖本机 SDK（Xcode/Android Studio），
> 无法在 CI 中跨平台构建。

## iOS 构建流程

1. **初始化**（首次）: `./build-mobile.sh init:ios`
   - 生成 Xcode 项目到 `src-tauri/gen/apple/`
   - 需要 macOS + Xcode 15+

2. **开发调试**: `./build-mobile.sh dev:ios`
   - 启动 iOS 模拟器
   - 热重载前端代码

3. **发布构建**: `./build-mobile.sh ios`
   - 生成 .ipa 到 `src-tauri/target/ios/release/`
   - 使用 `ExportOptions.plist` 配置导出选项

### iOS 配置要点

- **最低版本**: iOS 15.0 (`bundle.iOS.minimumSystemVersion`)
- **开发团队**: 需替换 `DEVELOPMENT_TEAM_ID` 为实际 Team ID
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
   - ProGuard 规则在 `src-tauri/proguard-rules.pro`

4. **签名**: `./build-mobile.sh sign:android`
   - 使用 debug keystore 签名（测试用）
   - 生产签名需配置自己的 keystore

### Android 配置要点

- **最低 SDK**: 26 (Android 8.0)
- **目标 SDK**: 34 (Android 14)
- **ABI 过滤**: `arm64-v8a`, `x86_64`（排除 32-bit 减小体积）
- **自适应图标**: 前景/背景图层分离
- **备份**: 禁用 `allowBackup`（避免数据泄露）
- **Split modules**: 禁用 `splitModulesEnabled`（保持单 APK 简化分发）

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

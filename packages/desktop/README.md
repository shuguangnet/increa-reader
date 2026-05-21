# Increa Reader Desktop & Mobile

基于 [Tauri v2](https://v2.tauri.app/) 的桌面/移动客户端，使用系统 WebView 渲染前端，后端 Python 服务作为 sidecar 自动管理。

## 架构

```
┌─────────────────────────────────┐
│         Tauri Shell (Rust)       │
│  ┌─────────────────────────┐    │
│  │   System WebView         │    │
│  │   (React + Vite 前端)     │    │
│  └─────────────────────────┘    │
│                                 │
│  ┌─────────────────────────┐    │
│  │  Python Sidecar           │    │
│  │  (FastAPI 后端)           │    │
│  └─────────────────────────┘    │
└─────────────────────────────────┘
```

**特点：**
- 🪶 安装包 < 10MB（vs Electron 的 150MB+）
- 🚀 内存占用低（使用系统 WebView）
- 🔄 Python 后端自动启停，用户无感知（Desktop）
- 📁 支持打开本地文件夹作为知识库
- 📱 iOS/Android 移动端构建支持

## 快速开始

### 前提条件

1. **Rust** — [安装 rustup](https://rustup.rs)
2. **系统依赖**（Linux）:
   ```bash
   sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf
   ```
3. **Node.js 18+** 和 **pnpm**

### 开发模式

```bash
# 在项目根目录
pnpm install
./packages/desktop/build.sh dev
```

### 构建生产版本（桌面）

```bash
./packages/desktop/build.sh build
# 或直接使用 workspace script（同样会先构建 sidecar）
pnpm --filter @increa-reader/desktop build
```

该命令现在会先自动构建当前平台的 Python sidecar，再执行 `tauri build`，避免安装包生成成功但运行时缺少后端二进制。

另外，`packages/desktop/package.json` 中的 `dev` / `dev:desktop` / `build` / `build:desktop` / `build:debug` / `build:ios` / `build:android` 已统一改为调用 `build.sh` / `build-mobile.sh`，这样无论是本地开发、CI 还是直接执行 pnpm script，都会复用同一条打包链路，减少“脚本能跑、实际发包漏步骤”的漂移风险。

如需绕过统一封装、直接调用 Tauri CLI 进行底层排障，可使用 `dev:desktop:raw` / `build:desktop:raw`。

构建产物在 `src-tauri/target/release/bundle/` 中：
- **Linux**: `.deb` 和 `.AppImage`
- **macOS**: `.dmg`
- **Windows**: `.msi` 和 `.exe`（NSIS 安装器）

为了让分发、CI 上传和人工验收都只依赖一个稳定入口，`build.sh build` / `build:debug` 现在会在 Tauri 原始 bundle 输出完成后，自动把安装包归档到 `src-tauri/target/{release,debug}/distribute/`，并额外生成：
- `manifest.json`：记录每个安装包的来源路径、文件大小、SHA256 与构建模式
- `SHA256SUMS.txt`：供发布页、下载站或运维脚本直接校验完整性

如果只是想在现有 bundle 基础上重新生成这份分发目录，而不重复跑整次打包，可执行：

```bash
pnpm --filter @increa-reader/desktop build:desktop:stage
# 或
./packages/desktop/build.sh stage:artifacts
```

### 清理构建产物

```bash
./packages/desktop/build.sh clean
```

## 移动端构建（iOS / Android）

### 前提条件

**iOS（仅限 macOS）：**
- Xcode 15+
- Rust targets: `rustup target add aarch64-apple-ios x86_64-apple-ios`
- Apple Developer 账号 + Team ID
- 通过环境变量 `INCREA_IOS_TEAM_ID`（或兼容 `TAURI_IOS_TEAM_ID`）传入 Team ID，避免手改仓库内配置文件

**Android：**
- Android Studio + NDK 25+
- 环境变量：`ANDROID_HOME` 和 `ANDROID_NDK_HOME`
- JDK 17+
- Rust targets: `rustup target add aarch64-linux-android x86_64-linux-android`

### 构建命令

```bash
# 检查构建前提条件（不强制要求先提供 iOS Team ID；真正 init/dev/build iOS 时才需要）
./build-mobile.sh check
# 或 pnpm --filter @increa-reader/desktop check:mobile

# 先配置 iOS Team ID（示例）
export INCREA_IOS_TEAM_ID=ABCDE12345

# 初始化移动端项目（首次；若跳过，Android 的 prepare/dev/build 也会自动补一次 init）
./build-mobile.sh init:ios
./build-mobile.sh init:android

# iOS 开发（模拟器）
./build-mobile.sh dev:ios

# Android 开发（模拟器）
./build-mobile.sh dev:android

# 发布构建
./build-mobile.sh ios
./build-mobile.sh android
# 或 pnpm --filter @increa-reader/desktop build:ios / build:android

# 仅重新归档已有移动端产物（不重新编译）
pnpm --filter @increa-reader/desktop build:ios:stage
pnpm --filter @increa-reader/desktop build:android:stage

# 同时构建两个平台
./build-mobile.sh all

# 生成所有平台图标
./build-mobile.sh icons
```

### 图标资源

移动端图标存放在 `src-tauri/icons/` 目录：

| 文件 | 用途 |
|------|------|
| `icon.png` | 源图标（512x512） |
| `AppIcon-*.png` | iOS AppIcon 各尺寸 |
| `android-icons/mipmap-*/` | Android 各密度图标 |
| `android-icons/mipmap-*/ic_launcher_foreground.png` | Android 自适应图标前景 |
| `android-icons/mipmap-*/ic_launcher_background.png` | Android 自适应图标背景 |

使用 `./build-mobile.sh icons` 从 `icon.png` 自动生成所有尺寸图标。

### iOS 配置说明

- **Team ID**：构建前通过 `INCREA_IOS_TEAM_ID`（或兼容 `TAURI_IOS_TEAM_ID`）传入，`build-mobile.sh` 会在当前构建过程临时注入 `src-tauri/tauri.conf.json` 和 `src-tauri/ExportOptions.plist`，结束后自动还原模板，避免占位符被误提交
- **前置检查更稳**：`./build-mobile.sh check` 只验证 iOS/Android SDK、Rust target 与基础环境；即使 CI 或新同事机器暂未配置 Apple Team ID，也能先跑完整体移动端环境检查，真正执行 `init:ios` / `dev:ios` / `ios` 时才强制要求 Team ID
- **启动屏幕**：已配置 `#1e40af` 蓝色背景（与品牌色一致）
- **方向支持**：iPhone 支持竖屏+横屏，iPad 支持全方向
- **隐私权限**：已声明相册、相机、文档、本地网络、FaceID 等权限描述

### Android 配置说明

- **最小 SDK**：26（Android 8.0）
- **目标 SDK**：34（Android 14）
- **自适应图标**：使用蓝色背景 + 居中图标前景
- **ABI / Rust target 对齐**：Android 安装包配置为 `arm64-v8a` + `x86_64`，构建前会同步检查并自动安装 `aarch64-linux-android` / `x86_64-linux-android` Rust target，避免模拟器或 CI 因 target 缺失而在链接阶段失败
- **Deep Link**：`increa.reader://open`
- **发布签名**：支持通过 `INCREA_ANDROID_KEYSTORE_B64`、`INCREA_ANDROID_KEYSTORE_PASSWORD`、`INCREA_ANDROID_KEY_ALIAS`、`INCREA_ANDROID_KEY_PASSWORD` 在 CI 中自动注入签名信息
- **Gradle 文件同步**：`build-mobile.sh init:android` / `android` / `dev:android` 会自动把 `src-tauri/gradle.properties` 和 `keystore.properties` 同步到 `src-tauri/gen/android/`，避免生成后的 Android 工程漏掉签名与内存配置
- **自动补齐初始化**：如果 `src-tauri/gen/android/` 被清理或 CI 是全新工作目录，`build-mobile.sh prepare:android` / `dev:android` / `android` 会先自动执行一次 `tauri android init`，再同步 Gradle/签名文件，减少“忘记 init 导致构建中断”的发包风险
- **产物归档稳定化**：`build-mobile.sh ios` / `android` 会在 Tauri 构建后自动把 IPA / APK / AAB 从原生工程输出目录归档到 `src-tauri/target/{ios,android}/release/`；即使 Tauri CLI 在不同版本里更换底层输出路径，CI 上传与人工分发入口仍保持不变
- **分发校验补齐**：移动端归档目录现在也会自动生成 `manifest.json` 与 `SHA256SUMS.txt`，并支持 `build:ios:stage` / `build:android:stage` 对已有构建结果重复归档，方便发布页上传、镜像同步和安装包完整性校验

## 工作原理

1. **启动时**：Tauri Rust 代码自动查找并启动 Python 后端（sidecar 模式，桌面端）
2. **运行中**：前端通过 `http://127.0.0.1:PORT` 与 Python 后端通信
3. **关闭时**：Tauri 自动停止 Python 进程

在移动端，应用通过远程 HTTP API 连接后端，不启动本地 sidecar。

前端代码通过 `getApiBase()` 函数自动判断运行环境：
- **Web 模式**：使用相对路径（Vite 代理到后端）
- **Desktop 模式**：使用 `http://127.0.0.1:PORT`
- **Mobile 模式**：使用配置的远程后端 URL

## 与 Web 版的区别

| 特性 | Web 版 | Desktop 版 | 移动版 |
|------|--------|-----------|--------|
| 安装 | 浏览器访问 | 原生安装 | App Store / Play Store |
| 后端 | 手动启动 | 自动启动 | 远程连接 |
| 文件访问 | 受限 | 完整本地访问 | 远程 API |
| 内存量 | 取决于浏览器 | 系统原生 | 系统原生 |
| 安装包 | 无 | < 10MB | 取决于平台 |
| Push 通知 | 无 | 系统 | APNs / FCM |

## 打包 Python Sidecar

桌面版依赖 Python sidecar 承载本地 FastAPI 后端。当前推荐方式：

```bash
cd packages/scripts
./build_sidecar.sh
```

脚本会自动：

1. 创建/复用 `packages/server/.venv`
2. 安装 `requirements.txt` 与 `pyinstaller`
3. 构建独立二进制
4. 复制到 `packages/desktop/src-tauri/binaries/python-server-<target-triple>`

同时，`packages/desktop/build.sh` 在 `dev/build/build:debug` 前会自动执行这一步；
`tauri.conf.json` 也已通过 `bundle.externalBin` 显式声明 sidecar，确保桌面安装包真正包含该后端二进制，而不仅是开发环境可运行。

## CI/CD

项目包含以下 GitHub Actions 工作流：

- **`ci.yml`** — 前端/后端检查、测试、Docker 构建校验，以及 GitHub Actions workflow 自检（actionlint）
- **`cd.yml`** — Docker 镜像构建和推送
- **`mobile.yml`** — iOS/Android 构建和检查

其中 Android 工作流已改为复用 `build-mobile.sh`，从而保证本地与 CI 的签名、Gradle 参数和构建步骤一致；并且在 `gen/android` 缺失时会自动补一次 `tauri android init`，避免全新环境或 clean 后因漏初始化而失败。iOS 也统一改为通过同一脚本注入 Team ID 并在构建后自动还原模板，减少签名配置漂移。

另外，移动端构建脚本现在会在构建完成后，把 IPA / APK / AAB 统一归档到 `src-tauri/target/{ios,android}/release/`，GitHub Actions 上传逻辑则同时兼容归档目录和原生工程默认输出目录，从而降低 Tauri CLI 版本升级后“构建成功但 CI 没抓到安装包”的风险。

在此基础上，归档目录也会附带生成 `manifest.json` 与 `SHA256SUMS.txt`，并可通过 `pnpm --filter @increa-reader/desktop build:ios:stage` / `build:android:stage` 对已有产物单独重建分发清单，便于后续发布、镜像同步与完整性校验。

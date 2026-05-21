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
```

该命令现在会先自动构建当前平台的 Python sidecar，再执行 `tauri build`，避免安装包生成成功但运行时缺少后端二进制。

构建产物在 `src-tauri/target/release/bundle/` 中：
- **Linux**: `.deb` 和 `.AppImage`
- **macOS**: `.dmg`
- **Windows**: `.msi` 和 `.exe`（NSIS 安装器）

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
- 在 `tauri.conf.json` 中设置 `bundle.iOS.developmentTeam` 为你的 Team ID

**Android：**
- Android Studio + NDK 25+
- 环境变量：`ANDROID_HOME` 和 `ANDROID_NDK_HOME`
- JDK 17+
- Rust targets: `rustup target add aarch64-linux-android armv7-linux-androideabi`

### 构建命令

```bash
# 检查构建前提条件
./build-mobile.sh check

# 初始化移动端项目（首次）
./build-mobile.sh init:ios
./build-mobile.sh init:android

# iOS 开发（模拟器）
./build-mobile.sh dev:ios

# Android 开发（模拟器）
./build-mobile.sh dev:android

# 发布构建
./build-mobile.sh ios
./build-mobile.sh android

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

- **Team ID**：编辑 `src-tauri/tauri.conf.json` 中 `bundle.iOS.developmentTeam`，将 `DEVELOPMENT_TEAM_ID` 替换为你的 Apple Developer Team ID
- **启动屏幕**：已配置 `#1e40af` 蓝色背景（与品牌色一致）
- **方向支持**：iPhone 支持竖屏+横屏，iPad 支持全方向
- **隐私权限**：已声明相册、相机、文档、本地网络、FaceID 等权限描述

### Android 配置说明

- **最小 SDK**：26（Android 8.0）
- **目标 SDK**：34（Android 14）
- **自适应图标**：使用蓝色背景 + 居中图标前景
- **ABI 过滤**：仅构建 `aarch64` / `arm64-v8a`
- **Deep Link**：`increa.reader://open`

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

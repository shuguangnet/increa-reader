# Increa Reader Desktop

基于 [Tauri v2](https://v2.tauri.app/) 的桌面客户端，使用系统 WebView 渲染前端，后端 Python 服务作为 sidecar 自动管理。

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
- 🔄 Python 后端自动启停，用户无感知
- 📁 支持打开本地文件夹作为知识库

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

### 构建生产版本

```bash
./packages/desktop/build.sh build
```

构建产物在 `src-tauri/target/release/bundle/` 中：
- **Linux**: `.deb` 和 `.AppImage`
- **macOS**: `.dmg`
- **Windows**: `.msi` 和 `.exe`（NSIS 安装器）

### 清理构建产物

```bash
./packages/desktop/build.sh clean
```

## 工作原理

1. **启动时**：Tauri Rust 代码自动查找并启动 Python 后端（sidecar 模式）
2. **运行中**：前端通过 `http://127.0.0.1:PORT` 与 Python 后端通信
3. **关闭时**：Tauri 自动停止 Python 进程

前端代码通过 `getApiBase()` 函数自动判断运行环境：
- **Web 模式**：使用相对路径（Vite 代理到后端）
- **Desktop 模式**：使用 `http://127.0.0.1:PORT`

## 与 Web 版的区别

| 特性 | Web 版 | Desktop 版 |
|------|--------|-----------|
| 安装 | 浏览器访问 | 原生安装 |
| 后端 | 手动启动 | 自动启动 |
| 文件访问 | 受限 | 完整本地访问 |
| 内存量 | 取决于浏览器 | 系统原生 |
| 安装包 | 无 | < 10MB |

## 打包 Python Sidecar

构建桌面版前，需要将 Python 后端打包为独立可执行文件：

```bash
cd packages/server
pip install pyinstaller
pyinstaller --onefile server.py --name increa-server
```

将生成的 `dist/increa-server` 放入 `src-tauri/sidecar/` 目录。
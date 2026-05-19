#!/usr/bin/env bash
# Increa Reader 移动端打包脚本 (Tauri iOS/Android)
# 需要 macOS (iOS) 或 Android SDK (Android) 环境
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== Increa Reader Mobile Build ==="

case "${1:-help}" in
  ios)
    echo "--- 构建 iOS 版本 ---"
    cargo tauri ios init 2>/dev/null || true
    cargo tauri ios build --release
    echo "✅ iOS 构建完成！IPA 在 src-tauri/target/ios/release/"
    ;;
  android)
    echo "--- 构建 Android 版本 ---"
    cargo tauri android init 2>/dev/null || true
    cargo tauri android build --release
    echo "✅ Android 构建完成！APK/AAB 在 src-tauri/target/android/release/"
    ;;
  dev:ios)
    echo "--- 启动 iOS 开发模拟器 ---"
    cargo tauri ios dev
    ;;
  dev:android)
    echo "--- 启动 Android 开发模拟器 ---"
    cargo tauri android dev
    ;;
  icons)
    echo "--- 生成所有平台图标 ---"
    npx @tauri-apps/cli icon
    ;;
  all)
    echo "--- 构建所有平台 ---"
    bash "$0" ios
    bash "$0" android
    ;;
  help|*)
    echo "用法: $0 {ios|android|dev:ios|dev:android|icons|all}"
    echo ""
    echo "  ios           构建 iOS 发布版本 (需 macOS + Xcode)"
    echo "  android       构建 Android 发布版本 (需 Android SDK)"
    echo "  dev:ios       启动 iOS 开发模拟器"
    echo "  dev:android   启动 Android 开发模拟器"
    echo "  icons         从源图标生成所有平台图标"
    echo "  all           构建 iOS + Android"
    exit 0
    ;;
esac

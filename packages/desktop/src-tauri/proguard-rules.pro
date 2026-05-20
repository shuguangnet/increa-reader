# Increa Reader — Android ProGuard / R8 Rules
#
# Applied when building Android release via `tauri android build --release`
# These rules preserve Tauri runtime classes while allowing R8 to shrink
# unused platform code for smaller APK/AAB size.

# ── Tauri Runtime ──────────────────────────────────────────────────
# Keep all Tauri core classes — the JNI bridge relies on these
-keep class app.tauri.** { *; }
-keep class com.increa.reader.** { *; }

# ── WebView ─────────────────────────────────────────────────────────
# Tauri uses WKWebView/WebView for rendering
-keep class android.webkit.** { *; }
-keepclassmembers class android.webkit.** {
    *;
}

# ── JavaScript Interface ────────────────────────────────────────────
# Keep any @JavascriptInterface annotated methods
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ── Rust FFI ────────────────────────────────────────────────────────
# Don't strip Rust .so libraries — Tauri needs them at runtime
-keep class **.RustLib { *; }
-keepclasseswithmembernames class * {
    native <methods>;
}

# ── AndroidX / Jetpack ──────────────────────────────────────────────
# Keep Activity and Service classes referenced in AndroidManifest.xml
-keep public class * extends android.app.Activity
-keep public class * extends android.app.Service
-keep public class * extends android.content.BroadcastReceiver

# ── Deep Link ───────────────────────────────────────────────────────
# Required for tauri-plugin-deep-link to work
-keep class com.increa.reader.DeepLinkActivity { *; }

# ── Serialization ───────────────────────────────────────────────────
# Gson / Moshi may use reflection
-dontwarn kotlinx.serialization.**
-keep class kotlinx.serialization.** { *; }

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder},
    App, Manager, Runtime,
};

/// Setup the system tray icon and menu.
///
/// Menu items:
///   - Show/Hide window
///   - Open repository
///   - Quit
///
/// Clicking the tray icon toggles the main window visibility.
pub fn setup_tray<R: Runtime>(app: &App<R>) -> Result<TrayIcon<R>, String> {
    let show = MenuItem::with_id(app, "show_hide", "显示/隐藏窗口", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let open_repo = MenuItem::with_id(app, "open_repo", "打开知识库", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let sep = PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)
        .map_err(|e| e.to_string())?;

    let menu = Menu::with_items(app, &[&show, &open_repo, &sep, &quit])
        .map_err(|e| e.to_string())?;

    let tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().cloned().unwrap_or_else(|| {
            // Fallback: try to load from the bundle; otherwise, let Tauri report the error
            panic!("No default window icon found. Ensure tauri.conf.json has a valid icon.");
        }))
        .tooltip("Increa Reader")
        .menu(&menu)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "show_hide" => {
                toggle_window_visibility(app);
            }
            "open_repo" => {
                let _ = app.emit("menu-action", "open-repo");
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // On double-click or left-click, toggle window
            if let tauri::tray::TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                toggle_window_visibility(app);
            }
        })
        .build(app)
        .map_err(|e| e.to_string())?;

    Ok(tray)
}

/// Toggle the main window visibility: show if minimized/hidden, hide if visible.
fn toggle_window_visibility<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_minimized().unwrap_or(false) {
            let _ = window.unminimize();
            let _ = window.set_focus();
        } else if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}
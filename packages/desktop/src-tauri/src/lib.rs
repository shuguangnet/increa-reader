/// Increa Reader — Library entry point
///
/// This module provides the shared Tauri builder that both desktop and mobile
/// targets use. The desktop `main.rs` calls `run()` on the returned builder
/// with tray/menu/server features. On iOS/Android the Tauri mobile runtime
/// calls `run()` via `lib.rs` directly and the same builder runs with mobile-
/// appropriate defaults (no tray, no system menu, no local backend server).
mod commands;
mod server;

#[cfg(desktop)]
mod menu;
#[cfg(desktop)]
mod tray;

use std::sync::Mutex;
use tauri::Manager;

/// Build and return the Tauri app builder.
///
/// This is the single source of truth for plugin registration, command handlers,
/// and app setup. Desktop `main.rs` calls `.run()` on the returned builder;
/// mobile builds call `.run()` via the Tauri mobile runtime.
pub fn build_app() -> tauri::Builder<tauri::Wry> {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .manage(Mutex::new(PythonServer::new()))
        .invoke_handler(tauri::generate_handler![
            commands::start_server,
            commands::stop_server,
            commands::get_server_status,
            commands::open_folder_dialog,
        ])
        .setup(|app| {
            #[cfg(desktop)]
            {
                // Desktop-only setup: system tray, native menu, backend server
                tray::setup_tray(app).expect("Failed to setup system tray");
                menu::setup_menu(app).expect("Failed to setup menu");

                // Forward menu events to the frontend
                let handle = app.handle().clone();
                app.on_menu_event(move |_app, event| {
                    let _ = handle.emit("menu-action", event.id().as_ref());
                });

                // Start the Python backend server
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let state = handle.state::<Mutex<PythonServer>>();
                    let mut server = state.lock().unwrap();
                    if let Err(e) = server.start(&handle).await {
                        eprintln!("Failed to start Python server: {e}");
                    }
                });
            }

            #[cfg(mobile)]
            {
                // Mobile setup: no tray, no menu, no local server.
                // The mobile app connects to a remote backend via the web API.
                eprintln!("[mobile] Increa Reader started — connecting to remote backend");
            }

            Ok(())
        })
}

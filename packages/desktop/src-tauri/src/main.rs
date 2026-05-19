mod server;
mod commands;
mod tray;
mod menu;

use server::PythonServer;
use std::sync::Mutex;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Mutex::new(PythonServer::new()))
        .invoke_handler(tauri::generate_handler![
            commands::start_server,
            commands::stop_server,
            commands::get_server_status,
            commands::open_folder_dialog,
        ])
        .setup(|app| {
            // Setup system tray
            tray::setup_tray(app).expect("Failed to setup system tray");

            // Setup native menu bar
            menu::setup_menu(app).expect("Failed to setup menu");

            // Setup menu event handler to forward events to frontend
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

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
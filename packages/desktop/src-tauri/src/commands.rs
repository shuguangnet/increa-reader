use crate::server::PythonServer;
use serde::Serialize;
use std::sync::Mutex;
use tauri::Manager;

#[derive(Serialize)]
pub struct ServerInfo {
    pub running: bool,
    pub port: Option<u16>,
    pub pid: Option<u32>,
}

#[tauri::command]
pub async fn start_server(
    state: tauri::State<'_, Mutex<PythonServer>>,
    app_handle: tauri::AppHandle,
) -> Result<ServerInfo, String> {
    let mut server = state.lock().map_err(|e| e.to_string())?;
    server
        .start(&app_handle)
        .await
        .map_err(|e| e.to_string())?;
    let status = server.status();
    Ok(ServerInfo {
        running: status.running,
        port: status.port,
        pid: status.pid,
    })
}

#[tauri::command]
pub fn stop_server(state: tauri::State<'_, Mutex<PythonServer>>) -> Result<ServerInfo, String> {
    let mut server = state.lock().map_err(|e| e.to_string())?;
    server.stop();
    Ok(ServerInfo {
        running: false,
        port: None,
        pid: None,
    })
}

#[tauri::command]
pub fn get_server_status(
    state: tauri::State<'_, Mutex<PythonServer>>,
) -> Result<ServerInfo, String> {
    let mut server = state.lock().map_err(|e| e.to_string())?;
    let status = server.status();
    Ok(ServerInfo {
        running: status.running,
        port: status.port,
        pid: status.pid,
    })
}

/// Open a native folder-picker dialog (desktop only).
/// On mobile this returns None — the app uses a remote backend instead.
#[tauri::command]
pub async fn open_folder_dialog(
    app_handle: tauri::AppHandle,
    title: String,
) -> Result<Option<String>, String> {
    #[cfg(desktop)]
    {
        use tauri::dialog::FileDialogBuilder;
        use tauri::Emitter;

        let (tx, rx) = tokio::sync::oneshot::channel();

        FileDialogBuilder::new(&app_handle)
            .set_title(&title)
            .set_directory(dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from(".")))
            .pick_folder(move |path| {
                let _ = tx.send(path.map(|p| p.to_string_lossy().to_string()));
            });

        rx.await
            .map_err(|e| e.to_string())
            .map(|opt| opt.flatten())
    }

    #[cfg(mobile)]
    {
        let _ = app_handle;
        let _ = title;
        // Mobile apps don't have local file system browsing in the same way;
        // they connect to a remote backend. Return None.
        Ok(None)
    }
}
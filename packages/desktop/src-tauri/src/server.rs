use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ServerStatus {
    pub running: bool,
    pub port: Option<u16>,
    pub pid: Option<u32>,
}

pub struct PythonServer {
    pub port: Option<u16>,
    pub child: Option<std::process::Child>,
}

impl PythonServer {
    pub fn new() -> Self {
        Self {
            port: None,
            child: None,
        }
    }

    pub async fn start(&mut self, app_handle: &tauri::AppHandle) -> Result<(), String> {
        // If already running, just return
        if self.child.is_some() && self.is_alive() {
            return Ok(());
        }

        let server_path = Self::find_server_script(app_handle)?;
        let python_path = Self::find_python()?;

        // Find available port
        let port = Self::find_available_port()?;

        let repo_path = Self::get_default_repo_path(app_handle);

        let mut cmd = std::process::Command::new(&python_path);
        cmd.arg(&server_path)
            .env("PORT", port.to_string())
            .env("INCREA_REPO", &repo_path)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());

        let child = cmd.spawn().map_err(|e| format!("Failed to start server: {e}"))?;
        let pid = child.id();

        self.child = Some(child);
        self.port = Some(port);

        // Wait for server to be ready
        let ready = Self::wait_for_server(port, 30).await?;
        if !ready {
            self.stop();
            return Err("Server failed to start within timeout".into());
        }

        println!("Python server started on port {port} (PID {pid})");
        Ok(())
    }

    pub fn stop(&mut self) {
        if let Some(ref mut child) = self.child {
            let _ = child.kill();
            let _ = child.wait();
        }
        self.child = None;
        self.port = None;
    }

    pub fn is_alive(&mut self) -> bool {
        if let Some(ref mut child) = self.child {
            matches!(child.try_wait(), Ok(Some(std::process::ExitStatus::default())) | Err(_))
                || matches!(child.try_wait(), Ok(None))
        } else {
            false
        }
    }

    pub fn status(&mut self) -> ServerStatus {
        let alive = self.is_alive();
        ServerStatus {
            running: alive,
            port: self.port,
            pid: self.child.as_ref().map(|c| c.id()),
        }
    }

    fn find_server_script(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
        // Try sidecar path first (when bundled)
        let sidecar_path = app_handle
            .path()
            .resource_dir()
            .map(|p| p.join("sidecar").join("server"))
            .ok();

        if let Some(ref p) = sidecar_path {
            // Try with .py extension
            let py_path = p.with_extension("py");
            if py_path.exists() {
                return Ok(py_path);
            }
        }

        // Try development path
        let dev_paths = vec![
            PathBuf::from("packages/server/server.py"),
            PathBuf::from("../server/server.py"),
        ];

        for path in &dev_paths {
            if path.exists() {
                return Ok(path.canonicalize().unwrap_or_else(|_| path.clone()));
            }
        }

        Err("Could not find server script".into())
    }

    fn find_python() -> Result<String, String> {
        // Try Python 3 first
        for cmd in &["python3", "python"] {
            if which::which(cmd).is_ok() {
                return Ok(cmd.to_string());
            }
        }
        Err("Could not find Python installation".into())
    }

    fn find_available_port() -> Result<u16, String> {
        // Try the configured port first, then find available
        let start_port: u16 = std::env::var("PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(3002);

        for port in start_port..(start_port + 100) {
            if Self::is_port_available(port) {
                return Ok(port);
            }
        }
        Err("No available port found".into())
    }

    fn is_port_available(port: u16) -> bool {
        std::net::TcpListener::bind(("127.0.0.1", port)).is_ok()
    }

    fn get_default_repo_path(app_handle: &tauri::AppHandle) -> String {
        // Use user data directory as default workspace
        app_handle
            .path()
            .app_data_dir()
            .map(|p| {
                let workspace = p.join("workspace");
                std::fs::create_dir_all(&workspace).ok();
                workspace.to_string_lossy().to_string()
            })
            .unwrap_or_else(|_| "./workspace".into())
    }

    async fn wait_for_server(port: u16, max_seconds: u64) -> Result<bool, String> {
        let client = reqwest::Client::new();
        let url = format!("http://127.0.0.1:{port}/api/workspace/repos");

        for _ in 0..(max_seconds * 2) {
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            if client.get(&url).send().await.is_ok() {
                return Ok(true);
            }
        }
        Ok(false)
    }
}
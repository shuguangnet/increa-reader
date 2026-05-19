use futures::StreamExt;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ServerStatus {
    pub running: bool,
    pub port: Option<u16>,
    pub pid: Option<u32>,
}

/// Holds the running sidecar process handle and the auto-assigned port.
pub struct PythonServer {
    pub port: Option<u16>,
    /// The sidecar child process (holds the PID and allows kill/detach).
    pub child: Option<tauri_plugin_shell::process::CommandChild>,
    /// PID from direct Python launch (development fallback)
    pub direct_pid: Option<u32>,
}

impl PythonServer {
    pub fn new() -> Self {
        Self {
            port: None,
            child: None,
            direct_pid: None,
        }
    }

    /// Start the Python backend via the Tauri sidecar mechanism.
    ///
    /// In development (when the sidecar binary doesn't exist at the expected
    /// path) we fall back to running `python3 server.py` directly so that
    /// `tauri dev` still works without a pre-built binary.
    pub async fn start(&mut self, app_handle: &tauri::AppHandle) -> Result<(), String> {
        // If already running, just return
        if (self.child.is_some() || self.direct_pid.is_some()) && self.is_alive() {
            return Ok(());
        }

        // Find available port before starting
        let port = Self::find_available_port()?;
        let repo_path = Self::get_default_repo_path(app_handle);

        // Try the sidecar path first (production / bundled app)
        match Self::start_sidecar(app_handle, port, &repo_path).await {
            Ok(child) => {
                self.child = Some(child);
                self.direct_pid = None;
                self.port = Some(port);

                // Wait for server to be ready
                let ready = Self::wait_for_server(port, 30).await?;
                if !ready {
                    self.stop();
                    return Err("Server failed to start within timeout (sidecar)".into());
                }

                println!("Python server started on port {port} (sidecar)");
                Ok(())
            }
            Err(sidecar_err) => {
                eprintln!(
                    "Sidecar start failed ({sidecar_err}), falling back to Python direct launch"
                );
                // Development fallback: launch python directly
                match Self::start_python_direct(port, &repo_path) {
                    Ok(pid) => {
                        self.child = None;
                        self.direct_pid = Some(pid);
                        self.port = Some(port);

                        let ready = Self::wait_for_server(port, 30).await?;
                        if !ready {
                            self.port = None;
                            self.direct_pid = None;
                            return Err("Server failed to start within timeout (python direct)".into());
                        }

                        println!("Python server started on port {port} (direct, PID {pid})");
                        Ok(())
                    }
                    Err(direct_err) => Err(format!(
                        "Failed to start server: sidecar error: {sidecar_err}, direct error: {direct_err}"
                    )),
                }
            }
        }
    }

    /// Stop the running server process.
    pub fn stop(&mut self) {
        if let Some(ref mut child) = self.child {
            let _ = child.kill();
        }
        // For direct Python process, try to kill by PID
        if let Some(pid) = self.direct_pid {
            #[cfg(unix)]
            {
                unsafe {
                    libc::kill(pid as i32, libc::SIGTERM);
                }
            }
            #[cfg(windows)]
            {
                let _ = std::process::Command::new("taskkill")
                    .args(["/PID", &pid.to_string(), "/F"])
                    .output();
            }
        }
        self.child = None;
        self.direct_pid = None;
        self.port = None;
    }

    pub fn is_alive(&mut self) -> bool {
        if self.child.is_some() {
            // We have a sidecar handle; treat as alive while held
            true
        } else if let Some(pid) = self.direct_pid {
            // For direct Python process, check if PID is running
            #[cfg(unix)]
            {
                // Send signal 0 to check if process exists
                unsafe { libc::kill(pid as i32, 0) == 0 }
            }
            #[cfg(windows)]
            {
                // On Windows, check if we can still connect to the port
                self.port.map_or(false, |p| !Self::is_port_available(p))
            }
        } else {
            false
        }
    }

    pub fn status(&mut self) -> ServerStatus {
        let alive = self.is_alive();
        let pid = self
            .direct_pid
            .or_else(|| self.child.as_ref().map(|_| 0));
        ServerStatus {
            running: alive,
            port: self.port,
            pid,
        }
    }

    // ── Sidecar launch (Tauri plugin-shell) ─────────────────────────────────

    async fn start_sidecar(
        app_handle: &tauri::AppHandle,
        port: u16,
        repo_path: &str,
    ) -> Result<tauri_plugin_shell::process::CommandChild, String> {
        let sidecar_command = app_handle
            .shell()
            .sidecar("python-server")
            .map_err(|e| format!("Failed to create sidecar command: {e}"))?;

        let (rx, child) = sidecar_command
            .args([
                "--port",
                &port.to_string(),
                "--repo",
                repo_path,
            ])
            .spawn()
            .map_err(|e| format!("Failed to spawn sidecar: {e}"))?;

        // Spawn a background task to log sidecar output
        let port_log = port;
        tauri::async_runtime::spawn(async move {
            use tauri_plugin_shell::process::CommandEvent;
            let mut stream = rx;

            while let Some(event) = stream.next().await {
                match event {
                    CommandEvent::Stdout(line) => {
                        println!("[sidecar:{}] {}", port_log, String::from_utf8_lossy(&line));
                    }
                    CommandEvent::Stderr(line) => {
                        eprintln!("[sidecar:{}] {}", port_log, String::from_utf8_lossy(&line));
                    }
                    CommandEvent::Terminated(status) => {
                        println!("[sidecar:{}] exited: {:?}", port_log, status);
                        break;
                    }
                    CommandEvent::Error(err) => {
                        eprintln!("[sidecar:{}] error: {}", port_log, err);
                        break;
                    }
                    _ => {}
                }
            }
        });

        Ok(child)
    }

    // ── Direct Python launch (development fallback) ──────────────────────────

    fn start_python_direct(port: u16, repo_path: &str) -> Result<u32, String> {
        let server_path = Self::find_server_script_dev()?;
        let python_path = Self::find_python()?;

        let mut cmd = std::process::Command::new(&python_path);
        cmd.arg(&server_path)
            .env("PORT", port.to_string())
            .env("INCREA_REPO", repo_path)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());

        let child = cmd.spawn().map_err(|e| format!("Failed to start server: {e}"))?;
        let pid = child.id();

        // Detach — we rely on port polling for health checks.
        // The child will be cleaned up when the Tauri app exits or via stop().
        Ok(pid)
    }

    fn find_server_script_dev() -> Result<PathBuf, String> {
        let dev_paths = vec![
            PathBuf::from("packages/server/server.py"),
            PathBuf::from("../server/server.py"),
        ];

        for path in &dev_paths {
            if path.exists() {
                return Ok(path.canonicalize().unwrap_or_else(|_| path.clone()));
            }
        }

        Err("Could not find server script for direct launch".into())
    }

    fn find_python() -> Result<String, String> {
        for cmd in &["python3", "python"] {
            if which::which(cmd).is_ok() {
                return Ok(cmd.to_string());
            }
        }
        Err("Could not find Python installation".into())
    }

    // ── Utilities ───────────────────────────────────────────────────────────

    fn find_available_port() -> Result<u16, String> {
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
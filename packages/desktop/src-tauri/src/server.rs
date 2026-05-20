use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ServerStatus {
    pub running: bool,
    pub port: Option<u16>,
    pub pid: Option<u32>,
}

/// Holds the running sidecar process handle and the auto-assigned port.
///
/// On desktop this manages a local Python backend (sidecar or direct launch).
/// On mobile this is a no-op — the app connects to a remote backend via HTTP.
pub struct PythonServer {
    pub port: Option<u16>,
    /// The sidecar child process (desktop only).
    #[cfg(desktop)]
    pub child: Option<tauri_plugin_shell::process::CommandChild>,
    /// PID from direct Python launch (desktop/dev fallback).
    #[cfg(desktop)]
    pub direct_pid: Option<u32>,
}

impl PythonServer {
    pub fn new() -> Self {
        Self {
            port: None,
            #[cfg(desktop)]
            child: None,
            #[cfg(desktop)]
            direct_pid: None,
        }
    }

    /// Start the Python backend.
    ///
    /// On desktop: starts via sidecar or direct Python launch.
    /// On mobile: no-op (always returns Ok with status running=false).
    pub async fn start(&mut self, app_handle: &tauri::AppHandle) -> Result<(), String> {
        #[cfg(desktop)]
        {
            self.start_desktop(app_handle).await
        }
        #[cfg(mobile)]
        {
            // Mobile: no local server, connect to remote backend
            let _ = app_handle;
            Ok(())
        }
    }

    /// Stop the running server process.
    pub fn stop(&mut self) {
        #[cfg(desktop)]
        {
            if let Some(ref mut child) = self.child {
                let _ = child.kill();
            }
            if let Some(pid) = self.direct_pid {
                #[cfg(unix)]
                unsafe {
                    libc::kill(pid as i32, libc::SIGTERM);
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
        }
        #[cfg(mobile)]
        {
            // Nothing to stop on mobile
        }
        self.port = None;
    }

    pub fn is_alive(&mut self) -> bool {
        #[cfg(desktop)]
        {
            if self.child.is_some() {
                true
            } else if let Some(pid) = self.direct_pid {
                #[cfg(unix)]
                {
                    unsafe { libc::kill(pid as i32, 0) == 0 }
                }
                #[cfg(windows)]
                {
                    self.port.map_or(false, |p| !Self::is_port_available(p))
                }
            } else {
                false
            }
        }
        #[cfg(mobile)]
        {
            // On mobile, we don't run a local server
            false
        }
    }

    pub fn status(&mut self) -> ServerStatus {
        let alive = self.is_alive();
        let pid = {
            #[cfg(desktop)]
            {
                self.direct_pid.or_else(|| self.child.as_ref().map(|_| 0))
            }
            #[cfg(mobile)]
            {
                None
            }
        };
        ServerStatus {
            running: alive,
            port: self.port,
            pid,
        }
    }

    // ── Desktop-only methods ──────────────────────────────────────────────

    fn is_port_available(port: u16) -> bool {
        std::net::TcpListener::bind(("127.0.0.1", port)).is_ok()
    }

    #[cfg(desktop)]
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

    #[cfg(desktop)]
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

    #[cfg(desktop)]
    async fn start_desktop(&mut self, app_handle: &tauri::AppHandle) -> Result<(), String> {
        use futures::StreamExt;
        use tauri_plugin_shell::ShellExt;

        // If already running, just return
        if (self.child.is_some() || self.direct_pid.is_some()) && self.is_alive() {
            return Ok(());
        }

        let port = Self::find_available_port()?;
        let repo_path = Self::get_default_repo_path(app_handle);

        // Try the sidecar path first (production / bundled app)
        match Self::start_sidecar(app_handle, port, &repo_path).await {
            Ok(child) => {
                self.child = Some(child);
                self.direct_pid = None;
                self.port = Some(port);

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

    #[cfg(desktop)]
    async fn start_sidecar(
        app_handle: &tauri::AppHandle,
        port: u16,
        repo_path: &str,
    ) -> Result<tauri_plugin_shell::process::CommandChild, String> {
        use futures::StreamExt;
        use tauri_plugin_shell::ShellExt;

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

    #[cfg(desktop)]
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

        Ok(pid)
    }

    #[cfg(desktop)]
    fn find_server_script_dev() -> Result<std::path::PathBuf, String> {
        let dev_paths = vec![
            std::path::PathBuf::from("packages/server/server.py"),
            std::path::PathBuf::from("../server/server.py"),
        ];

        for path in &dev_paths {
            if path.exists() {
                return Ok(path.canonicalize().unwrap_or_else(|_| path.clone()));
            }
        }

        Err("Could not find server script for direct launch".into())
    }

    #[cfg(desktop)]
    fn find_python() -> Result<String, String> {
        for cmd in &["python3", "python"] {
            if which::which(cmd).is_ok() {
                return Ok(cmd.to_string());
            }
        }
        Err("Could not find Python installation".into())
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

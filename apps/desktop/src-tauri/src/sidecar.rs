//! Sidecar lifecycle: spawn `ufclient-core`, read the `{port, token}` handshake from the
//! first stdout line, hand it to the frontend, restart on crash (max 3 times).
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

pub const MAX_RESTARTS: u32 = 3;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Handshake {
    pub port: u16,
    pub token: String,
}

/// Parse the sidecar's first stdout line.
pub fn parse_handshake(line: &str) -> Result<Handshake, String> {
    let hs: Handshake =
        serde_json::from_str(line.trim()).map_err(|e| format!("bad handshake: {e}"))?;
    if hs.port == 0 || hs.token.len() < 16 {
        return Err("bad handshake: invalid port or token".into());
    }
    Ok(hs)
}

#[derive(Default)]
struct Inner {
    handshake: Option<Handshake>,
    error: Option<String>,
    restarts: u32,
    shutting_down: bool,
}

#[derive(Clone, Default)]
pub struct Engine(Arc<(Mutex<Inner>, Condvar)>);

#[cfg(windows)]
fn hide_window(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide_window(_cmd: &mut Command) {}

/// Command used to start the engine.
/// 1. `UFCLIENT_CORE_CMD` (whitespace separated, e.g. `.venv/bin/python -m ufclient_core`, with legacy `UGCLIENT_CORE_CMD` fallback) for development;
/// 2. the bundled PyInstaller onedir build in the resource dir.
fn engine_command(app: &AppHandle) -> Result<Command, String> {
    let raw = std::env::var("UFCLIENT_CORE_CMD").or_else(|_| std::env::var("UGCLIENT_CORE_CMD"));
    if let Ok(cmd) = raw {
        let mut parts = cmd.split_whitespace();
        let prog = parts.next().ok_or("UFCLIENT_CORE_CMD is empty")?;
        let mut c = Command::new(prog);
        c.args(parts);
        return Ok(c);
    }
    let exe = if cfg!(windows) {
        "ufclient-core.exe"
    } else {
        "ufclient-core"
    };
    let res: PathBuf = app.path().resource_dir().map_err(|e| e.to_string())?;
    let path = res.join("ufclient-core").join(exe);
    if !path.is_file() {
        return Err(format!(
            "engine not found at {} (set UFCLIENT_CORE_CMD in development)",
            path.display()
        ));
    }
    Ok(Command::new(path))
}

impl Engine {
    pub fn start(&self, app: AppHandle) {
        let me = self.clone();
        std::thread::spawn(move || me.run(app));
    }

    fn run(&self, app: AppHandle) {
        loop {
            match self.spawn_once(&app) {
                Ok(mut child) => {
                    let status = child.wait();
                    let (lock, cvar) = &*self.0;
                    let mut g = lock.lock().unwrap();
                    g.handshake = None;
                    if g.shutting_down {
                        return;
                    }
                    if g.restarts >= MAX_RESTARTS {
                        g.error =
                            Some(format!("engine exited ({status:?}); restart limit reached"));
                        cvar.notify_all();
                        let _ = app.emit("engine://failed", g.error.clone());
                        return;
                    }
                    g.restarts += 1;
                    let _ = app.emit("engine://restarted", g.restarts);
                }
                Err(e) => {
                    let (lock, cvar) = &*self.0;
                    let mut g = lock.lock().unwrap();
                    g.error = Some(e.clone());
                    cvar.notify_all();
                    let _ = app.emit("engine://failed", e);
                    return;
                }
            }
            std::thread::sleep(Duration::from_millis(300));
        }
    }

    fn spawn_once(&self, app: &AppHandle) -> Result<Child, String> {
        let mut cmd = engine_command(app)?;
        hide_window(&mut cmd);
        cmd.stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .stdin(Stdio::null());
        let mut child = cmd
            .spawn()
            .map_err(|e| format!("failed to start engine: {e}"))?;
        let stdout = child.stdout.take().ok_or("no stdout")?;
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        reader.read_line(&mut line).map_err(|e| e.to_string())?;
        let hs = match parse_handshake(&line) {
            Ok(h) => h,
            Err(e) => {
                let _ = child.kill();
                return Err(e);
            }
        };
        // keep draining stdout so the engine never blocks on a full pipe
        std::thread::spawn(move || for _ in reader.lines() {});
        let (lock, cvar) = &*self.0;
        let mut g = lock.lock().unwrap();
        g.handshake = Some(hs.clone());
        g.error = None;
        let pid = child.id();
        cvar.notify_all();
        drop(g);
        let _ = app.emit("engine://ready", hs);
        // remember the pid for shutdown; the caller waits on the child
        PIDS.lock().unwrap().push(pid);
        Ok(child)
    }

    pub fn wait_handshake(&self, timeout: Duration) -> Result<Handshake, String> {
        let (lock, cvar) = &*self.0;
        let g = lock.lock().unwrap();
        let (g, _) = cvar
            .wait_timeout_while(g, timeout, |g| g.handshake.is_none() && g.error.is_none())
            .unwrap();
        if let Some(h) = &g.handshake {
            return Ok(h.clone());
        }
        Err(g
            .error
            .clone()
            .unwrap_or_else(|| "engine start timed out".into()))
    }

    pub fn shutdown(&self) {
        self.0 .0.lock().unwrap().shutting_down = true;
        for pid in PIDS.lock().unwrap().drain(..) {
            kill_pid(pid);
        }
    }
}

static PIDS: Mutex<Vec<u32>> = Mutex::new(Vec::new());

fn kill_pid(pid: u32) {
    #[cfg(unix)]
    let _ = Command::new("kill").arg(pid.to_string()).status();
    #[cfg(windows)]
    {
        let mut cmd = Command::new("taskkill");
        cmd.args(["/PID", &pid.to_string(), "/T", "/F"]);
        hide_window(&mut cmd);
        let _ = cmd.status();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_valid_handshake() {
        let h =
            parse_handshake("{\"port\": 50123, \"token\": \"0123456789abcdef0123456789abcdef\"}\n")
                .unwrap();
        assert_eq!(h.port, 50123);
    }

    #[test]
    fn rejects_bad_handshake() {
        assert!(parse_handshake("hello").is_err());
        assert!(parse_handshake("{\"port\": 0, \"token\": \"0123456789abcdef\"}").is_err());
        assert!(parse_handshake("{\"port\": 1, \"token\": \"short\"}").is_err());
    }
}

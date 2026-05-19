use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};

#[cfg(windows)]
fn strip_unc_prefix(p: PathBuf) -> PathBuf {
  let s = p.to_string_lossy();
  if let Some(rest) = s.strip_prefix(r"\\?\") {
    PathBuf::from(rest)
  } else {
    p
  }
}

#[cfg(not(windows))]
fn strip_unc_prefix(p: PathBuf) -> PathBuf {
  p
}

pub struct PySidecarState {
  pub port: Mutex<Option<u16>>,
  pub child: Mutex<Option<Child>>,
}

pub async fn start_py_sidecar(app: &AppHandle) -> Result<u16, String> {
  let resource_dir = app
    .path()
    .resource_dir()
    .map_err(|e| format!("resource_dir: {e}"))?;
  let py_dir = if cfg!(debug_assertions) {
    let raw = resource_dir.join("../../../py-sidecar");
    let canon = raw
      .canonicalize()
      .map_err(|e| format!("canonicalize py-sidecar dir {}: {e}", raw.display()))?;
    strip_unc_prefix(canon)
  } else {
    resource_dir.join("py-sidecar")
  };

  // Dev: a venv at .venv/ (uv sync). Prod: python-build-standalone
  // extracted into py-sidecar/python/ by the release workflow, with the
  // `server` package + deps pip-installed into its site-packages (no
  // venv — venvs hardcode absolute paths in pyvenv.cfg and don't
  // survive being copied to an end-user's machine).
  let python_exe = if cfg!(debug_assertions) {
    if cfg!(windows) {
      py_dir.join(".venv").join("Scripts").join("python.exe")
    } else {
      py_dir.join(".venv").join("bin").join("python")
    }
  } else {
    if cfg!(windows) {
      py_dir.join("python").join("python.exe")
    } else {
      py_dir.join("python").join("bin").join("python3")
    }
  };

  let mut child = Command::new(&python_exe)
    .arg("-m")
    .arg("server")
    .stdout(Stdio::piped())
    .stderr(Stdio::inherit())
    .current_dir(&py_dir)
    .spawn()
    .map_err(|e| format!("spawn py sidecar ({}): {e}", python_exe.display()))?;

  let stdout = child.stdout.take().ok_or("no stdout")?;
  let mut reader = BufReader::new(stdout).lines();

  let port = tokio::time::timeout(std::time::Duration::from_secs(60), async {
    while let Ok(Some(line)) = reader.next_line().await {
      if let Some(rest) = line.strip_prefix("SIDECAR_READY ") {
        return rest.trim().parse::<u16>().ok();
      }
    }
    None
  })
  .await
  .map_err(|_| "py sidecar startup timed out".to_string())?
  .ok_or("py sidecar did not announce port")?;

  let state = app.state::<PySidecarState>();
  *state.port.lock().unwrap() = Some(port);
  *state.child.lock().unwrap() = Some(child);
  Ok(port)
}

#[tauri::command]
pub fn py_sidecar_port(state: tauri::State<PySidecarState>) -> Option<u16> {
  *state.port.lock().unwrap()
}

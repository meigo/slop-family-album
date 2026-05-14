use std::process::Stdio;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};

pub struct SidecarState {
  pub port: Mutex<Option<u16>>,
  pub child: Mutex<Option<Child>>,
}

pub async fn start_sidecar(app: &AppHandle) -> Result<u16, String> {
  let resource_dir = app
    .path()
    .resource_dir()
    .map_err(|e| format!("resource_dir: {e}"))?;
  // In dev mode, sidecar/ lives next to src-tauri; in prod it's bundled in resources.
  // v1 ships dev-mode only — production bundling is Phase 2+.
  let sidecar_dir = if cfg!(debug_assertions) {
    resource_dir.join("../../../sidecar")
  } else {
    resource_dir.join("sidecar")
  };

  let mut child = Command::new("npx")
    .arg("tsx")
    .arg(sidecar_dir.join("src/server.ts"))
    .stdout(Stdio::piped())
    .stderr(Stdio::inherit())
    .current_dir(&sidecar_dir)
    .spawn()
    .map_err(|e| format!("spawn sidecar: {e}"))?;

  let stdout = child.stdout.take().ok_or("no stdout")?;
  let mut reader = BufReader::new(stdout).lines();

  // Wait up to 30s for SIDECAR_READY <port>
  let port = tokio::time::timeout(std::time::Duration::from_secs(30), async {
    while let Ok(Some(line)) = reader.next_line().await {
      if let Some(rest) = line.strip_prefix("SIDECAR_READY ") {
        return rest.trim().parse::<u16>().ok();
      }
    }
    None
  })
  .await
  .map_err(|_| "sidecar startup timed out".to_string())?
  .ok_or("sidecar did not announce port")?;

  let state = app.state::<SidecarState>();
  *state.port.lock().unwrap() = Some(port);
  *state.child.lock().unwrap() = Some(child);
  Ok(port)
}

#[tauri::command]
pub fn sidecar_port(state: tauri::State<SidecarState>) -> Option<u16> {
  *state.port.lock().unwrap()
}

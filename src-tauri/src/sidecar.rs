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

pub struct SidecarState {
  pub port: Mutex<Option<u16>>,
  pub child: Mutex<Option<Child>>,
}

pub async fn start_sidecar(app: &AppHandle) -> Result<u16, String> {
  let resource_dir = app
    .path()
    .resource_dir()
    .map_err(|e| format!("resource_dir: {e}"))?;
  // Dev: sidecar/ lives next to src-tauri/, `node` is on PATH.
  // Prod: sidecar/ is copied into resource_dir by tauri.conf.json
  // bundle.resources; a portable node.exe is staged into sidecar/ by
  // the release workflow and lives next to node_modules/.
  // Canonicalize the dev path so the `..` segments are resolved before we pass
  // anything to Node — `realpathSync` on Windows walks each segment and trips
  // on `D:` (no trailing backslash) when the path still contains `..`.
  let sidecar_dir = if cfg!(debug_assertions) {
    let raw = resource_dir.join("../../../sidecar");
    let canon = raw
      .canonicalize()
      .map_err(|e| format!("canonicalize sidecar dir {}: {e}", raw.display()))?;
    // On Windows, `canonicalize` returns a verbatim `\\?\D:\…` UNC path that
    // some tools (including older Node/tsx code paths) don't like. Strip the
    // `\\?\` prefix so the path is a plain `D:\…\sidecar`.
    strip_unc_prefix(canon)
  } else {
    resource_dir.join("sidecar")
  };

  // Bypass `npx` / `npx.cmd` entirely and invoke `node` with tsx's CLI as
  // the main script. This avoids the Windows .cmd argument-escaping mess
  // (post-BatBadBut, Rust's escaping for .cmd files can mangle paths
  // containing `:`, which truncates the script arg to `D:` on a Windows
  // drive — see node:fs EISDIR on lstat 'D:').
  let tsx_cli = sidecar_dir
    .join("node_modules")
    .join("tsx")
    .join("dist")
    .join("cli.mjs");
  let server_ts = sidecar_dir.join("src").join("server.ts");

  // Dev: trust PATH `node` (developer has it installed).
  // Prod: use the bundled node.exe shipped alongside node_modules.
  let node_cmd: std::ffi::OsString = if cfg!(debug_assertions) {
    "node".into()
  } else {
    sidecar_dir.join(if cfg!(windows) { "node.exe" } else { "node" }).into_os_string()
  };

  let mut child = Command::new(&node_cmd)
    .arg(&tsx_cli)
    .arg(&server_ts)
    .stdout(Stdio::piped())
    .stderr(Stdio::inherit())
    .current_dir(&sidecar_dir)
    .spawn()
    .map_err(|e| format!("spawn sidecar ({} {}): {e}", node_cmd.to_string_lossy(), tsx_cli.display()))?;

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

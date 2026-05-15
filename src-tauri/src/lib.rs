mod fs_ops;
mod sidecar;

use sidecar::{sidecar_port, start_sidecar, SidecarState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(SidecarState {
      port: Default::default(),
      child: Default::default(),
    })
    .plugin(
      tauri_plugin_sql::Builder::default()
        .add_migrations("sqlite:app.sqlite", migrations())
        .build(),
    )
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      sidecar_port,
      crate::fs_ops::walk_image_dir,
      crate::fs_ops::hash_file
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      let handle = app.handle().clone();
      tauri::async_runtime::spawn(async move {
        if let Err(e) = start_sidecar(&handle).await {
          eprintln!("Sidecar failed to start: {e}");
        }
      });
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

fn migrations() -> Vec<tauri_plugin_sql::Migration> {
  vec![
    tauri_plugin_sql::Migration {
      version: 1,
      description: "initial_phase_1_schema",
      sql: include_str!("../migrations/001_initial.sql"),
      kind: tauri_plugin_sql::MigrationKind::Up,
    },
    tauri_plugin_sql::Migration {
      version: 2,
      description: "cv_pipeline_blur_faces_phash_dups",
      sql: include_str!("../migrations/002_cv_pipeline.sql"),
      kind: tauri_plugin_sql::MigrationKind::Up,
    },
  ]
}

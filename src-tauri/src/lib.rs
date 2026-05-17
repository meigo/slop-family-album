mod fs_ops;
mod py_sidecar;
mod sidecar;

use py_sidecar::{py_sidecar_port, PySidecarState};
use sidecar::{sidecar_port, start_sidecar, SidecarState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(SidecarState {
      port: Default::default(),
      child: Default::default(),
    })
    .manage(PySidecarState {
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
      py_sidecar_port,
      crate::fs_ops::walk_image_dir,
      crate::fs_ops::hash_file,
      crate::fs_ops::write_pdf
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
      let handle2 = app.handle().clone();
      tauri::async_runtime::spawn(async move {
        if let Err(e) = py_sidecar::start_py_sidecar(&handle2).await {
          eprintln!("Py sidecar failed to start: {e}");
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
    tauri_plugin_sql::Migration {
      version: 3,
      description: "semantic_cv_embeddings_tags_faces",
      sql: include_str!("../migrations/003_semantic_cv.sql"),
      kind: tauri_plugin_sql::MigrationKind::Up,
    },
    tauri_plugin_sql::Migration {
      version: 4,
      description: "selection_album_calendar",
      sql: include_str!("../migrations/004_selection.sql"),
      kind: tauri_plugin_sql::MigrationKind::Up,
    },
    tauri_plugin_sql::Migration {
      version: 5,
      description: "selected_photo_notes",
      sql: include_str!("../migrations/005_selection_notes.sql"),
      kind: tauri_plugin_sql::MigrationKind::Up,
    },
    tauri_plugin_sql::Migration {
      version: 6,
      description: "pages_and_page_slots",
      sql: include_str!("../migrations/006_pages.sql"),
      kind: tauri_plugin_sql::MigrationKind::Up,
    },
    tauri_plugin_sql::Migration {
      version: 7,
      description: "selection_updated_at",
      sql: include_str!("../migrations/007_selection_updated_at.sql"),
      kind: tauri_plugin_sql::MigrationKind::Up,
    },
    tauri_plugin_sql::Migration {
      version: 8,
      description: "project_slot_gap_px",
      sql: include_str!("../migrations/008_slot_gap.sql"),
      kind: tauri_plugin_sql::MigrationKind::Up,
    },
    tauri_plugin_sql::Migration {
      version: 9,
      description: "project_page_padding_px",
      sql: include_str!("../migrations/009_page_padding.sql"),
      kind: tauri_plugin_sql::MigrationKind::Up,
    },
    tauri_plugin_sql::Migration {
      version: 10,
      description: "calendar_events_and_week_start",
      sql: include_str!("../migrations/010_calendar_events.sql"),
      kind: tauri_plugin_sql::MigrationKind::Up,
    },
    tauri_plugin_sql::Migration {
      version: 11,
      description: "page_text_overlays",
      sql: include_str!("../migrations/011_page_text.sql"),
      kind: tauri_plugin_sql::MigrationKind::Up,
    },
    tauri_plugin_sql::Migration {
      version: 12,
      description: "project_page_bg_color",
      sql: include_str!("../migrations/012_page_bg_color.sql"),
      kind: tauri_plugin_sql::MigrationKind::Up,
    },
    tauri_plugin_sql::Migration {
      version: 13,
      description: "project_page_aspect",
      sql: include_str!("../migrations/013_page_aspect.sql"),
      kind: tauri_plugin_sql::MigrationKind::Up,
    },
  ]
}

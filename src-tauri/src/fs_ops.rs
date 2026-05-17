use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{BufReader, Read, Write};
use std::path::Path;
use walkdir::WalkDir;

const EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "heic", "heif", "webp"];

/// Write a byte array to an absolute path. Used by the PDF export to
/// persist the jsPDF output after the user picks a destination via the
/// save dialog.
#[tauri::command]
pub fn write_pdf(path: String, bytes: Vec<u8>) -> Result<(), String> {
    let mut f = File::create(&path).map_err(|e| format!("create {path}: {e}"))?;
    f.write_all(&bytes).map_err(|e| format!("write {path}: {e}"))?;
    Ok(())
}

#[derive(Serialize)]
pub struct ScannedFile {
    pub path: String,
    pub size: u64,
    pub modified: i64,  // unix seconds
}

#[tauri::command]
pub fn walk_image_dir(dir: String) -> Result<Vec<ScannedFile>, String> {
    let mut out = Vec::new();
    for entry in WalkDir::new(&dir).follow_links(false).into_iter().filter_map(|e| e.ok()) {
        let p = entry.path();
        if !p.is_file() { continue; }
        let ext = p.extension().and_then(|s| s.to_str()).map(|s| s.to_ascii_lowercase()).unwrap_or_default();
        if !EXTENSIONS.contains(&ext.as_str()) { continue; }
        let meta = match entry.metadata() { Ok(m) => m, Err(_) => continue };
        let modified = meta.modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        out.push(ScannedFile {
            path: p.to_string_lossy().to_string(),
            size: meta.len(),
            modified,
        });
    }
    Ok(out)
}

#[tauri::command]
pub fn hash_file(path: String) -> Result<String, String> {
    let f = File::open(Path::new(&path)).map_err(|e| format!("open: {e}"))?;
    let mut reader = BufReader::with_capacity(1 << 20, f);
    let mut hasher = Sha256::new();
    // Heap-allocated buffer — Windows main-thread stack is ~1MB so a 1MB
    // stack array (`[0u8; 1 << 20]`) overflows on the first call.
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = reader.read(&mut buf).map_err(|e| format!("read: {e}"))?;
        if n == 0 { break; }
        hasher.update(&buf[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;

    #[test]
    fn hash_file_produces_known_hash() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("a.jpg");
        let mut f = File::create(&p).unwrap();
        f.write_all(b"hello").unwrap();
        let h = hash_file(p.to_string_lossy().to_string()).unwrap();
        // sha256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
        assert_eq!(h, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
    }

    #[test]
    fn walk_image_dir_filters_by_extension() {
        let dir = tempdir().unwrap();
        std::fs::write(dir.path().join("a.jpg"), b"x").unwrap();
        std::fs::write(dir.path().join("b.txt"), b"x").unwrap();
        std::fs::write(dir.path().join("c.PNG"), b"x").unwrap();
        let r = walk_image_dir(dir.path().to_string_lossy().to_string()).unwrap();
        let names: Vec<String> = r.iter().map(|s| {
            std::path::Path::new(&s.path).file_name().unwrap().to_string_lossy().to_string()
        }).collect();
        assert!(names.contains(&"a.jpg".to_string()));
        assert!(names.contains(&"c.PNG".to_string()));
        assert!(!names.contains(&"b.txt".to_string()));
    }
}

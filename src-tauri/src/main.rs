#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
struct ImagePayload {
    name: String,
    mime: String,
    data_url: String,
}

#[derive(Serialize)]
struct SaveResult {
    ok: bool,
    canceled: bool,
    path: String,
    name: String,
    fallback: bool,
    default_dir: bool,
    error: String,
}

fn program_export_dir() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|parent| parent.join("Exports")))
}

fn export_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    // The requested default: a portable Exports folder next to the executable.
    if let Some(dir) = program_export_dir() {
        dirs.push(dir);
    }
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        dirs.push(PathBuf::from(local).join("PinTu").join("Exports"));
    }
    if let Ok(profile) = std::env::var("USERPROFILE") {
        dirs.push(PathBuf::from(profile).join("Pictures").join("拼图工坊"));
    }
    dirs.push(std::env::temp_dir().join("PinTu").join("Exports"));
    dirs
}

fn preferred_dir() -> PathBuf {
    for dir in export_dirs() {
        if fs::create_dir_all(&dir).is_ok() {
            return dir;
        }
    }
    std::env::temp_dir()
}

fn unique_path(dir: &Path, name: &str, ext: &str) -> PathBuf {
    let safe_name = Path::new(name)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("拼图.png");
    let mut stem = Path::new(safe_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("拼图")
        .to_string();
    if stem.is_empty() {
        stem = "拼图".to_string();
    }
    let mut candidate = dir.join(format!("{stem}.{ext}"));
    let mut index = 2;
    while candidate.exists() {
        candidate = dir.join(format!("{stem}_{index}.{ext}"));
        index += 1;
    }
    candidate
}

fn decode_data_url(data: &str) -> Result<Vec<u8>, String> {
    let payload = data
        .split_once(',')
        .map(|(_, value)| value)
        .ok_or_else(|| "无效的图片数据".to_string())?;
    STANDARD
        .decode(payload)
        .map_err(|error| format!("图片编码无效：{error}"))
}

fn write_result(path: PathBuf, fallback: bool, default_dir: bool) -> SaveResult {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("拼图.png")
        .to_string();
    SaveResult {
        ok: true,
        canceled: false,
        path: path.to_string_lossy().to_string(),
        name,
        fallback,
        default_dir,
        error: String::new(),
    }
}

fn save_to_default(bytes: &[u8], name: &str, ext: &str) -> Result<PathBuf, String> {
    let mut last_error = String::new();
    for dir in export_dirs() {
        if fs::create_dir_all(&dir).is_err() {
            continue;
        }
        let path = unique_path(&dir, name, ext);
        match fs::write(&path, bytes) {
            Ok(_) => return Ok(path),
            Err(error) => last_error = error.to_string(),
        }
    }
    Err(if last_error.is_empty() {
        "没有可写入的导出目录".to_string()
    } else {
        last_error
    })
}

fn normalize_ext(ext: &str) -> &'static str {
    match ext.to_ascii_lowercase().as_str() {
        "jpg" | "jpeg" => "jpg",
        "webp" => "webp",
        _ => "png",
    }
}

fn export_dialog(name: &str, ext: &str) -> rfd::FileDialog {
    let mut dialog = rfd::FileDialog::new()
        .set_title("选择导出路径")
        .set_directory(preferred_dir())
        .set_file_name(name);
    dialog = match ext {
        "jpg" => dialog.add_filter("JPEG 图片", &["jpg", "jpeg"]),
        "webp" => dialog.add_filter("WebP 图片", &["webp"]),
        _ => dialog.add_filter("PNG 图片", &["png"]),
    };
    dialog
}

/// Step 1 of the two-step export: ask the OS file picker for a target path.
/// The image data is rendered and written only after this returns a path.
#[tauri::command]
fn choose_export_path(name: String, ext: String) -> Result<Option<String>, String> {
    let ext = normalize_ext(&ext);
    let fallback_name = if name.is_empty() {
        format!("拼图.{}", ext)
    } else {
        name
    };
    Ok(export_dialog(&fallback_name, ext)
        .save_file()
        .map(|path| path.to_string_lossy().to_string()))
}

#[tauri::command]
fn get_export_dir() -> Result<String, String> {
    let dir = program_export_dir().ok_or_else(|| "无法确定程序导出目录".to_string())?;
    fs::create_dir_all(&dir).map_err(|error| format!("无法创建导出目录：{error}"))?;
    Ok(dir.to_string_lossy().to_string())
}

/// Pick an export folder without invoking the shell's save-file validation.
/// This is the permission-safe picker: Windows validates file creation only
/// when the save dialog closes, which produced the "contact administrator"
/// message for protected locations.  Folder selection itself is harmless.
#[tauri::command]
fn choose_export_folder() -> Result<Option<String>, String> {
    Ok(rfd::FileDialog::new()
        .set_title("选择导出文件夹")
        .set_directory(preferred_dir())
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string()))
}

#[tauri::command]
fn open_export_folder(path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    let folder = if target.is_dir() {
        target.clone()
    } else {
        target
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| "导出路径没有父目录".to_string())?
    };
    if !folder.exists() {
        return Err(format!("导出目录不存在：{}", folder.display()));
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;

        fn wide(value: &std::ffi::OsStr) -> Vec<u16> {
            value.encode_wide().chain(std::iter::once(0)).collect()
        }

        let operation = wide(std::ffi::OsStr::new("open"));
        let path = wide(folder.as_os_str());
        let result = unsafe {
            windows_sys::Win32::UI::Shell::ShellExecuteW(
                std::ptr::null_mut(),
                operation.as_ptr(),
                path.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                1,
            )
        } as isize;
        if result <= 32 {
            return Err(format!("无法打开导出目录：ShellExecuteW 返回 {result}"));
        }
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&folder)
            .spawn()
            .map_err(|error| format!("无法打开导出目录：{error}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&folder)
            .spawn()
            .map_err(|error| format!("无法打开导出目录：{error}"))?;
    }
    Ok(())
}

fn temp_export_file() -> Result<PathBuf, String> {
    let dir = program_export_dir()
        .or_else(|| export_dirs().into_iter().next())
        .ok_or_else(|| "没有临时导出目录".to_string())?;
    fs::create_dir_all(&dir).map_err(|error| format!("无法创建临时目录：{error}"))?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    Ok(dir.join(format!(".pingtu-{}-{}.tmp", std::process::id(), stamp)))
}

#[cfg(windows)]
fn elevated_copy(source: &Path, target: &Path) -> bool {
    use std::os::windows::ffi::OsStrExt;

    fn wide(value: &std::ffi::OsStr) -> Vec<u16> {
        value.encode_wide().chain(std::iter::once(0)).collect()
    }

    let Ok(exe) = std::env::current_exe() else {
        return false;
    };
    let params = format!(
        "--elevated-copy \"{}\" \"{}\"",
        source.display(),
        target.display()
    );
    let operation = wide(std::ffi::OsStr::new("runas"));
    let exe_wide = wide(exe.as_os_str());
    let params_wide = wide(std::ffi::OsStr::new(&params));
    let started = unsafe {
        windows_sys::Win32::UI::Shell::ShellExecuteW(
            std::ptr::null_mut(),
            operation.as_ptr(),
            exe_wide.as_ptr(),
            params_wide.as_ptr(),
            std::ptr::null(),
            1,
        )
    } as isize;
    if started <= 32 {
        return false;
    }

    let before = fs::metadata(target).and_then(|meta| meta.modified()).ok();
    let expected = fs::metadata(source).map(|meta| meta.len()).unwrap_or(0);
    for _ in 0..240 {
        std::thread::sleep(std::time::Duration::from_millis(250));
        if let Ok(meta) = fs::metadata(target) {
            let changed = match (before, meta.modified().ok()) {
                (Some(old), Some(new)) => new > old,
                (None, _) => true,
                _ => false,
            };
            if changed && (expected == 0 || meta.len() == expected) {
                return true;
            }
        }
    }
    false
}

#[cfg(not(windows))]
fn elevated_copy(_source: &Path, _target: &Path) -> bool {
    false
}

/// Step 2 of the two-step export: write the already-rendered image bytes to
/// the selected path. The UI process stays non-elevated so Explorer drag/drop
/// keeps working; only a protected destination asks Windows for UAC once.
#[tauri::command]
fn write_image(data: String, path: String) -> Result<SaveResult, String> {
    let bytes = decode_data_url(&data)?;
    let target = PathBuf::from(path);
    let file_name = target
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("拼图.png")
        .to_string();
    let ext = target
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("png")
        .to_string();

    let temp = temp_export_file()?;
    if let Err(error) = fs::write(&temp, &bytes) {
        let _ = fs::remove_file(&temp);
        return Err(format!("无法写入临时文件：{error}"));
    }

    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() {
            let _ = fs::create_dir_all(parent);
        }
    }

    let direct = fs::copy(&temp, &target).is_ok();
    if direct {
        let _ = fs::remove_file(&temp);
        return Ok(write_result(target, false, false));
    }

    // Protected folder: launch this same signed binary with `runas` and copy
    // the already-rendered temp file. The main process remains non-elevated.
    if elevated_copy(&temp, &target) {
        let _ = fs::remove_file(&temp);
        return Ok(write_result(target, false, false));
    }

    // UAC declined or helper failed: never lose the image; save to the
    // program's writable Exports folder.
    let _ = fs::remove_file(&temp);
    let fallback = save_to_default(&bytes, &file_name, &ext)
        .map_err(|fallback_error| format!("写入目标目录失败；备用目录也失败：{fallback_error}"))?;
    Ok(write_result(fallback, true, false))
}

#[tauri::command]
fn save_image(data: String, name: String, ext: String, quick: bool) -> Result<SaveResult, String> {
    let bytes = decode_data_url(&data)?;
    let ext = normalize_ext(&ext);
    let fallback_name = if name.is_empty() {
        format!("拼图.{}", ext)
    } else {
        name
    };

    if quick {
        let path = save_to_default(&bytes, &fallback_name, ext)?;
        return Ok(write_result(path, false, true));
    }

    let default_dir = preferred_dir();
    let mut dialog = rfd::FileDialog::new()
        .set_title("导出作品")
        .set_directory(&default_dir)
        .set_file_name(fallback_name.as_str());
    dialog = match ext {
        "jpg" => dialog.add_filter("JPEG 图片", &["jpg", "jpeg"]),
        "webp" => dialog.add_filter("WebP 图片", &["webp"]),
        _ => dialog.add_filter("PNG 图片", &["png"]),
    };
    let Some(chosen) = dialog.save_file() else {
        return Ok(SaveResult {
            ok: false,
            canceled: true,
            path: String::new(),
            name: fallback_name,
            fallback: false,
            default_dir: false,
            error: String::new(),
        });
    };

    match fs::write(&chosen, &bytes) {
        Ok(_) => Ok(write_result(chosen, false, false)),
        Err(primary_error) => {
            let path = save_to_default(&bytes, &fallback_name, ext).map_err(|fallback_error| {
                format!("保存失败：{primary_error}；备用目录也失败：{fallback_error}")
            })?;
            let mut result = write_result(path, true, false);
            result.error = primary_error.to_string();
            Ok(result)
        }
    }
}

#[tauri::command]
fn read_images(paths: Vec<String>) -> Result<Vec<ImagePayload>, String> {
    let mut images = Vec::new();
    for raw in paths {
        let path = PathBuf::from(&raw);
        let bytes = fs::read(&path).map_err(|error| format!("无法读取 {}：{error}", raw))?;
        let mime = mime_guess::from_path(&path)
            .first_or_octet_stream()
            .to_string();
        if !mime.starts_with("image/") {
            continue;
        }
        let name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("图片")
            .to_string();
        images.push(ImagePayload {
            name,
            mime: mime.clone(),
            data_url: format!("data:{};base64,{}", mime, STANDARD.encode(bytes)),
        });
    }
    if images.is_empty() {
        Err("没有找到可读取的图片文件".to_string())
    } else {
        Ok(images)
    }
}

fn webview_data_dir() -> PathBuf {
    // The Windows sandbox may deny writes to LocalAppData.  Prefer the normal
    // per-user directory, then fall back to a folder next to the portable exe.
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let dir = PathBuf::from(local).join("PinTu").join("WebView2");
        if fs::create_dir_all(&dir).is_ok() {
            return dir;
        }
    }
    let dir = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|parent| parent.join("webview2-data")))
        .unwrap_or_else(|| PathBuf::from("webview2-data"));
    let _ = fs::create_dir_all(&dir);
    dir
}

fn main() {
    // Elevated one-shot helper. The main UI never runs as administrator, so
    // Explorer drag/drop keeps working; only protected exports request UAC.
    let args: Vec<String> = std::env::args().collect();
    if args.len() == 4 && args[1] == "--elevated-copy" {
        let source = PathBuf::from(&args[2]);
        let target = PathBuf::from(&args[3]);
        let ok = (|| -> std::io::Result<()> {
            if let Some(parent) = target.parent() {
                if !parent.as_os_str().is_empty() {
                    fs::create_dir_all(parent)?;
                }
            }
            fs::copy(source, target)?;
            Ok(())
        })()
        .is_ok();
        std::process::exit(if ok { 0 } else { 1 });
    }

    let data_dir = webview_data_dir();
    std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &data_dir);
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            choose_export_path,
            choose_export_folder,
            get_export_dir,
            open_export_folder,
            write_image,
            save_image,
            read_images
        ])
        .setup(move |app| {
            // Build explicitly so the WebView2 data directory is portable and
            // does not depend on the (possibly restricted) app-data folder.
            tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("拼图工坊")
            .inner_size(1460.0, 940.0)
            .min_inner_size(1100.0, 700.0)
            .center()
            .data_directory(data_dir.clone())
            .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running 拼图工坊");
}

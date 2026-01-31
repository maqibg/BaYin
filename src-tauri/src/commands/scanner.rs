use std::path::Path;
use std::fs;
use walkdir::WalkDir;
use serde::Serialize;

use crate::models::{ScanOptions, ScannedSong};
use crate::utils::audio::{is_audio_file, read_lyrics, read_metadata};

/// 目录项
#[derive(Debug, Serialize)]
pub struct DirectoryEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

/// 列出目录内容（仅目录）
#[tauri::command]
pub fn list_directories(path: String) -> Result<Vec<DirectoryEntry>, String> {
    let dir_path = Path::new(&path);

    if !dir_path.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    if !dir_path.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    let mut entries = Vec::new();

    match fs::read_dir(dir_path) {
        Ok(read_dir) => {
            for entry in read_dir.filter_map(|e| e.ok()) {
                let entry_path = entry.path();
                // 只返回目录
                if entry_path.is_dir() {
                    let name = entry_path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();

                    // 跳过隐藏目录
                    if name.starts_with('.') {
                        continue;
                    }

                    entries.push(DirectoryEntry {
                        name,
                        path: entry_path.to_string_lossy().to_string(),
                        is_dir: true,
                    });
                }
            }
        }
        Err(e) => {
            return Err(format!("Failed to read directory: {}", e));
        }
    }

    // 按名称排序
    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(entries)
}

/// 扫描指定目录中的音乐文件
#[tauri::command]
pub fn scan_music_files(options: ScanOptions) -> Result<Vec<ScannedSong>, String> {
    let skip_short = options.skip_short_audio.unwrap_or(false);
    let min_duration = options.min_duration.unwrap_or(30.0);

    let mut songs = Vec::new();

    for dir in &options.directories {
        let dir_path = Path::new(dir);
        if !dir_path.exists() {
            continue;
        }

        for entry in WalkDir::new(dir_path)
            .follow_links(true)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();

            // 只处理文件
            if !path.is_file() {
                continue;
            }

            // 过滤非音频文件
            if !is_audio_file(path) {
                continue;
            }

            // 读取元数据，失败时静默跳过
            match read_metadata(path) {
                Ok(song) => {
                    // 跳过短音频
                    if skip_short && song.duration < min_duration {
                        continue;
                    }
                    songs.push(song);
                }
                Err(_) => {
                    // 读取失败，静默跳过
                    continue;
                }
            }
        }
    }

    Ok(songs)
}

/// 获取单个音乐文件的元数据
#[tauri::command]
pub fn get_music_metadata(file_path: String) -> Result<Option<ScannedSong>, String> {
    let path = Path::new(&file_path);

    if !path.exists() || !path.is_file() {
        return Ok(None);
    }

    if !is_audio_file(path) {
        return Ok(None);
    }

    match read_metadata(path) {
        Ok(song) => Ok(Some(song)),
        Err(_) => Ok(None),
    }
}

/// 获取歌曲歌词
#[tauri::command]
pub fn get_lyrics(file_path: String) -> Result<Option<String>, String> {
    let path = Path::new(&file_path);

    if !path.exists() || !path.is_file() {
        return Ok(None);
    }

    Ok(read_lyrics(path))
}

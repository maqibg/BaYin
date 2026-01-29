use std::path::Path;
use walkdir::WalkDir;

use crate::models::{ScanOptions, ScannedSong};
use crate::utils::audio::{is_audio_file, read_lyrics, read_metadata};

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

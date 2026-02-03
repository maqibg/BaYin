use crate::models::{ConnectionTestResult, ScannedSong, StreamServerConfig};
use crate::utils::{jellyfin, subsonic};

// ============ 内部函数（供其他模块调用） ============

/// 从流媒体服务器获取所有歌曲（内部函数）
pub async fn fetch_stream_songs_internal(config: &StreamServerConfig) -> Result<Vec<ScannedSong>, String> {
    if config.is_subsonic() {
        subsonic::fetch_all_songs(config).await
    } else {
        jellyfin::fetch_all_songs(config).await
    }
}

// ============ 统一命令（新） ============

/// 测试流媒体服务器连接
#[tauri::command]
pub async fn test_stream_connection(config: StreamServerConfig) -> Result<ConnectionTestResult, String> {
    if config.is_subsonic() {
        Ok(subsonic::test_connection(&config).await)
    } else {
        Ok(jellyfin::test_connection(&config).await)
    }
}

/// 从流媒体服务器获取所有歌曲
#[tauri::command]
pub async fn fetch_stream_songs(config: StreamServerConfig) -> Result<Vec<ScannedSong>, String> {
    if config.is_subsonic() {
        subsonic::fetch_all_songs(&config).await
    } else {
        jellyfin::fetch_all_songs(&config).await
    }
}

/// 获取流媒体歌曲的流 URL
#[tauri::command]
pub fn get_stream_url(config: StreamServerConfig, song_id: String) -> String {
    if config.is_subsonic() {
        subsonic::get_stream_url(&config, &song_id)
    } else {
        jellyfin::get_stream_url(&config, &song_id)
    }
}

/// 获取流媒体歌曲歌词
#[tauri::command]
pub async fn get_stream_lyrics(config: StreamServerConfig, song_id: String) -> Option<String> {
    if config.is_subsonic() {
        subsonic::get_lyrics(&config, &song_id).await
    } else {
        jellyfin::get_lyrics(&config, &song_id).await
    }
}

/// Jellyfin/Emby 认证并返回 token 和 userId
#[tauri::command]
pub async fn jellyfin_authenticate(config: StreamServerConfig) -> Result<(String, String), String> {
    if config.is_jellyfin_like() {
        jellyfin::authenticate(&config).await
    } else {
        Err("此命令仅适用于 Jellyfin/Emby 服务器".to_string())
    }
}

// ============ 向后兼容的旧命令（Subsonic API） ============

/// 测试 Subsonic 服务器连接
#[tauri::command]
pub async fn test_subsonic_connection(config: StreamServerConfig) -> Result<ConnectionTestResult, String> {
    Ok(subsonic::test_connection(&config).await)
}

/// 从 Subsonic 服务器获取所有歌曲
#[tauri::command]
pub async fn fetch_subsonic_songs(config: StreamServerConfig) -> Result<Vec<ScannedSong>, String> {
    subsonic::fetch_all_songs(&config).await
}

/// 获取 Subsonic 歌曲流 URL
#[tauri::command]
pub fn get_subsonic_stream_url(config: StreamServerConfig, song_id: String) -> String {
    subsonic::get_stream_url(&config, &song_id)
}

/// 获取 Subsonic 歌曲歌词
#[tauri::command]
pub async fn get_subsonic_lyrics(config: StreamServerConfig, song_id: String) -> Option<String> {
    subsonic::get_lyrics(&config, &song_id).await
}

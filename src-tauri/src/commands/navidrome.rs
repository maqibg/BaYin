use crate::models::{ConnectionTestResult, NavidromeConfig, ScannedSong};
use crate::utils::navidrome;

/// 测试 Navidrome 服务器连接
#[tauri::command]
pub async fn test_navidrome_connection(config: NavidromeConfig) -> Result<ConnectionTestResult, String> {
    Ok(navidrome::test_connection(&config).await)
}

/// 从 Navidrome 获取所有歌曲
#[tauri::command]
pub async fn fetch_navidrome_songs(config: NavidromeConfig) -> Result<Vec<ScannedSong>, String> {
    navidrome::fetch_all_songs(&config).await
}

/// 获取 Navidrome 歌曲流 URL
#[tauri::command]
pub fn get_navidrome_stream_url(config: NavidromeConfig, song_id: String) -> String {
    navidrome::get_stream_url(&config, &song_id)
}

/// 获取 Navidrome 歌曲歌词
#[tauri::command]
pub async fn get_navidrome_lyrics(config: NavidromeConfig, song_id: String) -> Option<String> {
    navidrome::get_lyrics(&config, &song_id).await
}

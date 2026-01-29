//! Navidrome/Subsonic API 数据模型
#![allow(dead_code)]

use serde::{Deserialize, Serialize};

/// Navidrome/Subsonic 服务器配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NavidromeConfig {
    pub server_url: String,
    pub username: String,
    pub password: String,
}

/// 连接测试结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestResult {
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub server_version: Option<String>,
}

/// Subsonic API 响应包装
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubsonicResponse<T> {
    #[serde(rename = "subsonic-response")]
    pub subsonic_response: SubsonicResponseInner<T>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubsonicResponseInner<T> {
    pub status: String,
    pub version: String,
    #[serde(flatten)]
    pub data: Option<T>,
    pub error: Option<SubsonicError>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubsonicError {
    pub code: i32,
    pub message: String,
}

/// ping 响应（用于测试连接）
#[derive(Debug, Deserialize)]
pub struct PingResponse {}

/// 获取所有歌曲的响应
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetSongsResponse {
    pub random_songs: Option<RandomSongs>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RandomSongs {
    pub song: Option<Vec<SubsonicSong>>,
}

/// 搜索响应
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    pub search_result3: Option<SearchResult3>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult3 {
    pub song: Option<Vec<SubsonicSong>>,
}

/// Subsonic 歌曲信息
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubsonicSong {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub artist: Option<String>,
    #[serde(default)]
    pub album: Option<String>,
    #[serde(default)]
    pub duration: Option<u64>,
    #[serde(default)]
    pub size: Option<u64>,
    #[serde(default)]
    pub cover_art: Option<String>,
    #[serde(default)]
    pub suffix: Option<String>,
    #[serde(default)]
    pub bit_rate: Option<u32>,
    #[serde(default)]
    pub sampling_rate: Option<u32>,
    #[serde(default)]
    pub bit_depth: Option<u8>,
    #[serde(default)]
    pub path: Option<String>,
}

/// 获取专辑列表响应
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetAlbumListResponse {
    pub album_list2: Option<AlbumList2>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumList2 {
    pub album: Option<Vec<SubsonicAlbum>>,
}

/// Subsonic 专辑信息
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubsonicAlbum {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub artist: Option<String>,
    #[serde(default)]
    pub cover_art: Option<String>,
    #[serde(default)]
    pub song_count: Option<u32>,
    #[serde(default)]
    pub year: Option<u32>,
}

/// 获取专辑详情响应
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetAlbumResponse {
    pub album: Option<AlbumWithSongs>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumWithSongs {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub artist: Option<String>,
    #[serde(default)]
    pub cover_art: Option<String>,
    #[serde(default)]
    pub song_count: Option<u32>,
    #[serde(default)]
    pub year: Option<u32>,
    #[serde(default)]
    pub song: Option<Vec<SubsonicSong>>,
}

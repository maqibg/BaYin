use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use flate2::read::ZlibDecoder;
use regex::Regex;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::cmp::Ordering;
use std::collections::HashMap;
use std::io::Read;

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const KUGOU_KRC_KEY: [u8; 16] = [0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47, 0x51, 0x36, 0x31, 0x2d, 0xce, 0xd2, 0x6e, 0x69];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnlineLyricSearchRequest {
    pub title: String,
    pub artist: String,
    #[serde(default)]
    pub album: Option<String>,
    #[serde(default)]
    pub duration: Option<f64>,
    #[serde(default)]
    pub keyword: Option<String>,
    #[serde(default)]
    pub providers: Option<Vec<String>>,
    #[serde(default)]
    pub limit_per_source: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnlineLyricCandidate {
    pub source: String,
    pub title: String,
    pub artists: String,
    pub album: String,
    pub score: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub qq_song_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub netease_song_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kugou_song_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnlineLyricFetchRequest {
    pub source: String,
    #[serde(default)]
    pub qq_song_id: Option<i64>,
    #[serde(default)]
    pub netease_song_id: Option<String>,
    #[serde(default)]
    pub kugou_song_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnlineLyricFetchResult {
    pub lyric: String,
    pub format: String,
    pub provider: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw: Option<String>,
}

#[tauri::command]
pub async fn search_online_lyrics(request: OnlineLyricSearchRequest) -> Result<Vec<OnlineLyricCandidate>, String> {
    let client = Client::builder()
        .build()
        .map_err(|error| format!("初始化网络客户端失败：{error}"))?;

    let query = if let Some(keyword) = request.keyword.as_ref() {
        let trimmed = keyword.trim();
        if !trimmed.is_empty() {
            trimmed.to_string()
        } else {
            build_query(&request.title, &request.artist)
        }
    } else {
        build_query(&request.title, &request.artist)
    };

    if query.is_empty() {
        return Ok(Vec::new());
    }

    let providers = normalize_providers(request.providers.clone());
    let limit = request.limit_per_source.unwrap_or(15).clamp(1, 30);

    let mut candidates: Vec<OnlineLyricCandidate> = Vec::new();

    if providers.iter().any(|provider| provider == "kugou") {
        match search_kugou(&client, &request, &query, limit).await {
            Ok(mut list) => candidates.append(&mut list),
            Err(error) => eprintln!("[lyrics][kugou][search] {error}"),
        }
    }

    if providers.iter().any(|provider| provider == "netease") {
        match search_netease(&client, &request, &query, limit).await {
            Ok(mut list) => candidates.append(&mut list),
            Err(error) => eprintln!("[lyrics][netease][search] {error}"),
        }
    }

    if providers.iter().any(|provider| provider == "qq") {
        match search_qq(&client, &request, &query, limit).await {
            Ok(mut list) => candidates.append(&mut list),
            Err(error) => eprintln!("[lyrics][qq][search] {error}"),
        }
    }

    let target_duration_ms = request.duration.map(|seconds| (seconds * 1000.0).round() as i64);

    candidates.sort_by(|left, right| {
        let left_diff = duration_diff(left.duration_ms, target_duration_ms);
        let right_diff = duration_diff(right.duration_ms, target_duration_ms);
        left_diff
            .cmp(&right_diff)
            .then_with(|| right.score.partial_cmp(&left.score).unwrap_or(Ordering::Equal))
    });

    Ok(candidates)
}

#[tauri::command]
pub async fn fetch_online_lyric(request: OnlineLyricFetchRequest) -> Result<Option<OnlineLyricFetchResult>, String> {
    let client = Client::builder()
        .build()
        .map_err(|error| format!("初始化网络客户端失败：{error}"))?;

    let source = request.source.trim().to_lowercase();
    if source == "qq" {
        if let Some(song_id) = request.qq_song_id {
            return fetch_qq_lyric(&client, song_id).await;
        }
        return Ok(None);
    }

    if source == "kugou" {
        if let Some(song_hash) = request.kugou_song_hash.as_deref() {
            return fetch_kugou_lyric(&client, song_hash).await;
        }
        return Ok(None);
    }

    if source == "netease" {
        if let Some(song_id) = request.netease_song_id.as_deref() {
            return fetch_netease_lyric(&client, song_id).await;
        }
        return Ok(None);
    }

    Err(format!("不支持的歌词来源：{}", request.source))
}

async fn search_qq(
    client: &Client,
    request: &OnlineLyricSearchRequest,
    query: &str,
    limit: usize,
) -> Result<Vec<OnlineLyricCandidate>, String> {
    let payload = json!({
        "comm": {
            "mina": 1,
            "ct": 25
        },
        "req": {
            "method": "DoSearchForQQMusicMobile",
            "module": "music.search.SearchBrokerCgiServer",
            "param": {
                "search_type": 0,
                "query": query,
                "page_num": 1,
                "num_per_page": limit
            }
        }
    });

    let response = client
        .get("https://u.y.qq.com/cgi-bin/musicu.fcg")
        .query(&[("data", payload.to_string())])
        .header("User-Agent", USER_AGENT)
        .header("Referer", "https://y.qq.com/")
        .send()
        .await
        .map_err(|error| format!("QQ 搜索请求失败：{error}"))?;

    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("QQ 搜索响应读取失败：{error}"))?;
    let body = String::from_utf8_lossy(&bytes).to_string();
    let data: Value = serde_json::from_str(&body).map_err(|error| format!("QQ 搜索响应解析失败：{error}"))?;

    let list = data
        .pointer("/req/data/body/item_song")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let mut result: Vec<OnlineLyricCandidate> = Vec::new();

    for item in list {
        let title = value_as_str(item.get("name")).unwrap_or_default();
        let artists = item
            .get("singer")
            .and_then(Value::as_array)
            .map(|singers| {
                singers
                    .iter()
                    .filter_map(|singer| value_as_str(singer.get("name")))
                    .collect::<Vec<String>>()
                    .join("、")
            })
            .unwrap_or_default();
        let album = item
            .get("album")
            .and_then(|album_item| value_as_str(album_item.get("title")).or_else(|| value_as_str(album_item.get("name"))))
            .unwrap_or_default();

        let qq_song_id = value_as_i64(item.get("id"))
            .or_else(|| value_as_i64(item.get("songid")))
            .or_else(|| value_as_i64(item.get("mid")));
        let duration_ms = value_as_i64(item.get("interval")).map(|seconds| seconds * 1000);
        let cover_url = item
            .get("album")
            .and_then(|album_item| {
                value_as_str(album_item.get("mid"))
                    .or_else(|| value_as_str(album_item.get("pmid")))
                    .or_else(|| value_as_str(album_item.get("id")))
            })
            .map(|mid| format!("https://y.qq.com/music/photo_new/T002R500x500M000{mid}.jpg?max_age=2592000"));

        if title.is_empty() {
            continue;
        }

        result.push(OnlineLyricCandidate {
            source: "qq".to_string(),
            title: title.clone(),
            artists: artists.clone(),
            album: album.clone(),
            score: compute_score(request, &title, &artists, &album),
            duration_ms,
            qq_song_id,
            netease_song_id: None,
            kugou_song_hash: None,
            cover_url,
        });
    }

    Ok(result)
}

async fn search_kugou(
    client: &Client,
    request: &OnlineLyricSearchRequest,
    query: &str,
    limit: usize,
) -> Result<Vec<OnlineLyricCandidate>, String> {
    let response = client
        .get("http://mobilecdnbj.kugou.com/api/v3/search/song")
        .query(&[
            ("keyword", query.to_string()),
            ("page", "1".to_string()),
            ("pagesize", limit.to_string()),
        ])
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|error| format!("酷狗搜索请求失败：{error}"))?;

    let data: Value = response
        .json()
        .await
        .map_err(|error| format!("酷狗搜索响应解析失败：{error}"))?;

    let list = data
        .pointer("/data/info")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let mut result: Vec<OnlineLyricCandidate> = Vec::new();

    for item in list {
        let title = value_as_str(item.get("songname")).unwrap_or_default();
        let artists = value_as_str(item.get("singername")).unwrap_or_default();
        let album = value_as_str(item.get("album_name")).unwrap_or_default();

        let raw_duration = value_as_i64(item.get("duration"));
        let duration_ms = raw_duration.map(|value| if value < 10_000 { value * 1000 } else { value });

        let cover_url = value_as_str(item.get("album_img"))
            .or_else(|| value_as_str(item.get("imgurl")))
            .or_else(|| value_as_str(item.get("img")));

        if title.is_empty() {
            continue;
        }

        result.push(OnlineLyricCandidate {
            source: "kugou".to_string(),
            title: title.clone(),
            artists: artists.clone(),
            album: album.clone(),
            score: compute_score(request, &title, &artists, &album),
            duration_ms,
            qq_song_id: None,
            netease_song_id: None,
            kugou_song_hash: value_as_str(item.get("hash")),
            cover_url,
        });
    }

    Ok(result)
}

async fn search_netease(
    client: &Client,
    request: &OnlineLyricSearchRequest,
    query: &str,
    limit: usize,
) -> Result<Vec<OnlineLyricCandidate>, String> {
    let response = client
        .get("https://music.163.com/api/search/get/web")
        .query(&[
            ("csrf_token", "".to_string()),
            ("s", query.to_string()),
            ("type", "1".to_string()),
            ("offset", "0".to_string()),
            ("limit", limit.to_string()),
        ])
        .header("User-Agent", USER_AGENT)
        .header("Referer", "https://music.163.com/")
        .send()
        .await
        .map_err(|error| format!("网易云搜索请求失败：{error}"))?;

    let data: Value = response
        .json()
        .await
        .map_err(|error| format!("网易云搜索响应解析失败：{error}"))?;

    let list = data
        .pointer("/result/songs")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let mut result: Vec<OnlineLyricCandidate> = Vec::new();

    for item in list {
        let title = value_as_str(item.get("name")).unwrap_or_default();
        if title.is_empty() {
            continue;
        }

        let artist_list = item
            .get("artists")
            .and_then(Value::as_array)
            .cloned()
            .or_else(|| item.get("ar").and_then(Value::as_array).cloned())
            .unwrap_or_default();

        let artists = artist_list
            .iter()
            .filter_map(|artist| value_as_str(artist.get("name")))
            .collect::<Vec<String>>()
            .join("、");

        let album_object = item.get("album").or_else(|| item.get("al"));
        let album = album_object
            .and_then(|album_value| value_as_str(album_value.get("name")))
            .unwrap_or_default();

        let duration_ms = value_as_i64(item.get("duration")).or_else(|| value_as_i64(item.get("dt")));

        let cover_url = album_object
            .and_then(|album_value| value_as_str(album_value.get("picUrl")).or_else(|| value_as_str(album_value.get("pic_url"))));

        result.push(OnlineLyricCandidate {
            source: "netease".to_string(),
            title: title.clone(),
            artists: artists.clone(),
            album: album.clone(),
            score: compute_score(request, &title, &artists, &album),
            duration_ms,
            qq_song_id: None,
            netease_song_id: value_as_string(item.get("id")),
            kugou_song_hash: None,
            cover_url,
        });
    }

    Ok(result)
}

async fn fetch_qq_lyric(client: &Client, song_id: i64) -> Result<Option<OnlineLyricFetchResult>, String> {
    let response = client
        .get("https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg")
        .query(&[
            ("nobase64", "1".to_string()),
            ("format", "json".to_string()),
            ("musicid", song_id.to_string()),
        ])
        .header("User-Agent", USER_AGENT)
        .header("Referer", "https://y.qq.com/")
        .send()
        .await
        .map_err(|error| format!("QQ 歌词请求失败：{error}"))?;

    let data: Value = response
        .json()
        .await
        .map_err(|error| format!("QQ 歌词响应解析失败：{error}"))?;

    let lyric = data
        .get("lyric")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default();

    if lyric.is_empty() {
        return Ok(None);
    }

    let translation = data
        .get("trans")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|line| !line.is_empty());

    let merged = merge_lrc_translation(lyric, translation);

    Ok(Some(OnlineLyricFetchResult {
        lyric: merged,
        format: "lrc".to_string(),
        provider: "qq".to_string(),
        raw: Some(lyric.to_string()),
    }))
}

async fn fetch_kugou_lyric(client: &Client, song_hash: &str) -> Result<Option<OnlineLyricFetchResult>, String> {
    if song_hash.trim().is_empty() {
        return Ok(None);
    }

    let search_response = client
        .get("http://lyrics.kugou.com/search")
        .query(&[
            ("ver", "1".to_string()),
            ("man", "yes".to_string()),
            ("client", "pc".to_string()),
            ("keyword", "".to_string()),
            ("hash", song_hash.to_string()),
            ("timelength", "0".to_string()),
        ])
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|error| format!("酷狗歌词搜索请求失败：{error}"))?;

    let search_data: Value = search_response
        .json()
        .await
        .map_err(|error| format!("酷狗歌词搜索响应解析失败：{error}"))?;

    let first_candidate = search_data
        .get("candidates")
        .and_then(Value::as_array)
        .and_then(|items| items.first())
        .cloned();

    let Some(candidate) = first_candidate else {
        return Ok(None);
    };

    let lyric_id = value_as_string(candidate.get("id")).unwrap_or_default();
    let access_key = value_as_str(candidate.get("accesskey")).unwrap_or_default();

    if lyric_id.is_empty() || access_key.is_empty() {
        return Ok(None);
    }

    let download_response = client
        .get("http://lyrics.kugou.com/download")
        .query(&[
            ("ver", "1".to_string()),
            ("client", "pc".to_string()),
            ("id", lyric_id),
            ("accesskey", access_key),
            ("fmt", "krc".to_string()),
            ("charset", "utf8".to_string()),
        ])
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|error| format!("酷狗歌词下载请求失败：{error}"))?;

    let download_data: Value = download_response
        .json()
        .await
        .map_err(|error| format!("酷狗歌词下载响应解析失败：{error}"))?;

    let encoded = download_data
        .get("content")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default();

    if encoded.is_empty() {
        return Ok(None);
    }

    let raw_krc = decode_kugou_krc(encoded)?;
    let converted = normalize_timed_lyric_text(&raw_krc);

    Ok(Some(OnlineLyricFetchResult {
        lyric: if converted.trim().is_empty() { raw_krc.clone() } else { converted },
        format: "krc".to_string(),
        provider: "kugou".to_string(),
        raw: Some(raw_krc),
    }))
}

async fn fetch_netease_lyric(client: &Client, song_id: &str) -> Result<Option<OnlineLyricFetchResult>, String> {
    if song_id.trim().is_empty() {
        return Ok(None);
    }

    let response = client
        .get("https://music.163.com/api/song/lyric")
        .query(&[
            ("id", song_id.to_string()),
            ("lv", "-1".to_string()),
            ("kv", "-1".to_string()),
            ("tv", "-1".to_string()),
        ])
        .header("User-Agent", USER_AGENT)
        .header("Referer", "https://music.163.com/")
        .send()
        .await
        .map_err(|error| format!("网易云歌词请求失败：{error}"))?;

    let data: Value = response
        .json()
        .await
        .map_err(|error| format!("网易云歌词响应解析失败：{error}"))?;

    let translation = data
        .pointer("/tlyric/lyric")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|line| !line.is_empty());

    let yrc = data
        .pointer("/yrc/lyric")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default();

    if !yrc.is_empty() {
        let normalized = normalize_timed_lyric_text(yrc);
        let merged = merge_lrc_translation(&normalized, translation);
        if !merged.trim().is_empty() {
            return Ok(Some(OnlineLyricFetchResult {
                lyric: merged,
                format: "yrc".to_string(),
                provider: "netease".to_string(),
                raw: Some(yrc.to_string()),
            }));
        }
    }

    let lrc = data
        .pointer("/lrc/lyric")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default();

    if lrc.is_empty() {
        return Ok(None);
    }

    let merged = merge_lrc_translation(lrc, translation);

    Ok(Some(OnlineLyricFetchResult {
        lyric: merged,
        format: "lrc".to_string(),
        provider: "netease".to_string(),
        raw: Some(lrc.to_string()),
    }))
}

fn decode_kugou_krc(content: &str) -> Result<String, String> {
    let mut decoded = BASE64_STANDARD
        .decode(content)
        .map_err(|error| format!("酷狗歌词解码失败（base64）：{error}"))?;

    if decoded.len() <= 4 {
        return Err("酷狗歌词解码失败：内容长度异常".to_string());
    }

    let mut payload = decoded.split_off(4);
    for (index, byte) in payload.iter_mut().enumerate() {
        *byte ^= KUGOU_KRC_KEY[index % KUGOU_KRC_KEY.len()];
    }

    let mut decoder = ZlibDecoder::new(payload.as_slice());
    let mut output = String::new();
    decoder
        .read_to_string(&mut output)
        .map_err(|error| format!("酷狗歌词解码失败（zlib）：{error}"))?;

    Ok(output)
}

fn normalize_timed_lyric_text(raw: &str) -> String {
    let krc_word_tag_re = Regex::new(r"<\d+,\d+(?:,\d+)?>").unwrap();
    let yrc_word_tag_re = Regex::new(r"\(\d+,\d+(?:,\d+)?\)").unwrap();

    let mut lines: Vec<String> = Vec::new();

    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        if let Some(converted) = convert_ms_tag_line(trimmed, &krc_word_tag_re, &yrc_word_tag_re) {
            if !converted.trim().is_empty() {
                lines.push(converted);
            }
            continue;
        }

        let cleaned = yrc_word_tag_re
            .replace_all(&krc_word_tag_re.replace_all(trimmed, ""), "")
            .to_string();

        if !cleaned.trim().is_empty() {
            lines.push(cleaned);
        }
    }

    lines.join("\n")
}

fn convert_ms_tag_line(line: &str, krc_word_tag_re: &Regex, yrc_word_tag_re: &Regex) -> Option<String> {
    if !line.starts_with('[') {
        return None;
    }

    let tag_end = line.find(']')?;
    if tag_end <= 1 {
        return None;
    }

    let head = &line[1..tag_end];
    let mut segments = head.split(',');

    let start_raw = segments.next()?.trim();
    let duration_raw = segments.next()?.trim();

    if start_raw.is_empty() || duration_raw.is_empty() {
        return None;
    }

    let start_ms = start_raw.parse::<i64>().ok()?;
    let content = &line[(tag_end + 1)..];

    let cleaned = yrc_word_tag_re
        .replace_all(&krc_word_tag_re.replace_all(content, ""), "")
        .trim()
        .to_string();

    if cleaned.is_empty() {
        return None;
    }

    Some(format!("{}{}", format_lrc_timestamp(start_ms), cleaned))
}

fn merge_lrc_translation(base: &str, translation: Option<&str>) -> String {
    let Some(translation_text) = translation else {
        return base.to_string();
    };

    let tag_re = Regex::new(r"\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]").unwrap();

    let mut trans_map: HashMap<String, String> = HashMap::new();
    for line in translation_text.lines() {
        let tags = extract_time_tags(line, &tag_re);
        if tags.is_empty() {
            continue;
        }

        let text = tag_re.replace_all(line, "").trim().to_string();
        if text.is_empty() {
            continue;
        }

        for tag in tags {
            trans_map.entry(tag).or_insert_with(|| text.clone());
        }
    }

    if trans_map.is_empty() {
        return base.to_string();
    }

    let mut merged_lines: Vec<String> = Vec::new();
    for line in base.lines() {
        let tags = extract_time_tags(line, &tag_re);
        if tags.is_empty() {
            merged_lines.push(line.to_string());
            continue;
        }

        let tags_raw = tag_re
            .captures_iter(line)
            .filter_map(|capture| capture.get(0).map(|value| value.as_str().to_string()))
            .collect::<Vec<String>>()
            .join("");

        let original_text = tag_re.replace_all(line, "").trim().to_string();
        let translation_line = tags
            .iter()
            .find_map(|tag| trans_map.get(tag).cloned())
            .unwrap_or_default();

        if translation_line.is_empty() || translation_line == original_text {
            merged_lines.push(line.to_string());
            continue;
        }

        if original_text.is_empty() {
            merged_lines.push(format!("{}{}", tags_raw, translation_line));
            continue;
        }

        merged_lines.push(format!("{}{}┃{}", tags_raw, original_text, translation_line));
    }

    merged_lines.join("\n")
}

fn extract_time_tags(line: &str, tag_re: &Regex) -> Vec<String> {
    tag_re
        .captures_iter(line)
        .filter_map(|capture| {
            let minute = capture.get(1)?.as_str().parse::<i64>().ok()?;
            let second = capture.get(2)?.as_str().parse::<i64>().ok()?;
            let millis_raw = capture.get(3).map(|value| value.as_str()).unwrap_or("0");

            let hundredths = if millis_raw.len() >= 3 {
                millis_raw.get(0..2).unwrap_or("00").parse::<i64>().unwrap_or(0)
            } else if millis_raw.len() == 2 {
                millis_raw.parse::<i64>().unwrap_or(0)
            } else {
                millis_raw.parse::<i64>().unwrap_or(0) * 10
            };

            Some(format!("{:02}:{:02}.{:02}", minute, second, hundredths.clamp(0, 99)))
        })
        .collect()
}

fn format_lrc_timestamp(start_ms: i64) -> String {
    let total_ms = start_ms.max(0);
    let minute = total_ms / 60_000;
    let second = (total_ms % 60_000) / 1000;
    let hundredth = (total_ms % 1000) / 10;
    format!("[{minute:02}:{second:02}.{hundredth:02}]")
}

fn compute_score(request: &OnlineLyricSearchRequest, title: &str, artists: &str, album: &str) -> f64 {
    let title_ref = request.title.trim();
    let artist_ref = request.artist.trim();
    let album_ref = request.album.as_deref().unwrap_or("").trim();

    let total = title_ref.chars().count() + artist_ref.chars().count() + album_ref.chars().count();
    if total == 0 {
        return 0.0;
    }

    let title_score = prefix_match_count(title_ref, title);
    let artist_score = prefix_match_count(artist_ref, artists);
    let album_score = prefix_match_count(album_ref, album);

    (title_score + artist_score + album_score) as f64 / total as f64
}

fn prefix_match_count(left: &str, right: &str) -> usize {
    let left_chars: Vec<char> = left.chars().collect();
    let right_chars: Vec<char> = right.chars().collect();
    let min_length = left_chars.len().min(right_chars.len());

    let mut score = 0usize;
    for index in 0..min_length {
        if left_chars[index] == right_chars[index] {
            score += 1;
        }
    }

    score
}

fn duration_diff(duration_ms: Option<i64>, target_duration_ms: Option<i64>) -> i64 {
    let Some(target) = target_duration_ms else {
        return 0;
    };
    let Some(duration) = duration_ms else {
        return i64::MAX / 8;
    };

    (duration - target).abs()
}

fn build_query(title: &str, artist: &str) -> String {
    let title_trimmed = title.trim();
    let artist_trimmed = artist.trim();

    if !title_trimmed.is_empty() && !artist_trimmed.is_empty() {
        format!("{title_trimmed} {artist_trimmed}")
    } else if !title_trimmed.is_empty() {
        title_trimmed.to_string()
    } else if !artist_trimmed.is_empty() {
        artist_trimmed.to_string()
    } else {
        String::new()
    }
}

fn normalize_providers(providers: Option<Vec<String>>) -> Vec<String> {
    let default_list = vec!["qq".to_string(), "kugou".to_string(), "netease".to_string()];

    let Some(values) = providers else {
        return default_list;
    };

    let mut normalized: Vec<String> = values
        .into_iter()
        .map(|provider| provider.trim().to_lowercase())
        .filter(|provider| provider == "qq" || provider == "kugou" || provider == "netease")
        .collect();

    normalized.sort();
    normalized.dedup();

    if normalized.is_empty() {
        default_list
    } else {
        normalized
    }
}

fn value_as_i64(value: Option<&Value>) -> Option<i64> {
    let item = value?;
    if let Some(number) = item.as_i64() {
        return Some(number);
    }
    if let Some(number) = item.as_u64() {
        return Some(number as i64);
    }
    if let Some(raw) = item.as_str() {
        return raw.trim().parse::<i64>().ok();
    }
    None
}

fn value_as_string(value: Option<&Value>) -> Option<String> {
    let item = value?;
    if let Some(raw) = item.as_str() {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
        return None;
    }
    if let Some(number) = item.as_i64() {
        return Some(number.to_string());
    }
    if let Some(number) = item.as_u64() {
        return Some(number.to_string());
    }
    None
}

fn value_as_str(value: Option<&Value>) -> Option<String> {
    value_as_string(value)
}
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import * as Checkbox from "@radix-ui/react-checkbox";
import * as Select from "@radix-ui/react-select";
import { animate, motion } from "framer-motion";

type Page =
  | "songs"
  | "albums"
  | "artists"
  | "playlists"
  | "scan"
  | "stream-config"
  | "stats"
  | "settings"
  | "settings-ui"
  | "about";

type DialogMode = "create" | "rename" | null;
type Language = "中文" | "English";
type FontWeightOption = "Normal" | "Medium" | "Bold";

interface DbSong {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  filePath: string;
  fileSize: number;
  isHr?: boolean;
  isSq?: boolean;
  coverHash?: string;
  sourceType: string;
  serverId?: string;
  serverSongId?: string;
  streamInfo?: string;
  fileModified?: number;
}

interface DbAlbum {
  id: string;
  name: string;
  artist: string;
  coverHash?: string;
  streamCoverUrl?: string;
  songCount: number;
}

interface DbArtist {
  id: string;
  name: string;
  coverHash?: string;
  streamCoverUrl?: string;
  songCount: number;
}

interface LibraryStats {
  totalSongs: number;
  localSongs: number;
  streamSongs: number;
  totalAlbums: number;
  totalArtists: number;
}

interface CoverCacheStats {
  fileCount: number;
  totalSizeBytes: number;
  totalSizeMb: number;
}

interface ScanConfig {
  id: number | null;
  directories: string[];
  skipShort: boolean;
  minDuration: number;
  lastScanAt: number | null;
}

interface LocalScanOptions {
  directories: string[];
  mode: "full" | "incremental";
  minDuration: number;
  batchSize: number;
}

interface ScanResult {
  totalSongs: number;
  added: number;
  updated: number;
  removed: number;
  skipped: number;
  errors: number;
  durationMs: number;
}

interface ScanProgress {
  phase: "collecting" | "checking" | "scanning" | "saving" | "cleanup" | "complete";
  total: number;
  processed: number;
  currentFile?: string;
  skipped: number;
  errors: number;
}

interface Playlist {
  id: string;
  name: string;
  songIds: string[];
}

interface CoverMap {
  [hash: string]: string;
}

interface DbStreamServer {
  id: string;
  serverType: string;
  serverName: string;
  serverUrl: string;
  username: string;
  password: string;
  accessToken?: string;
  userId?: string;
  enabled: boolean;
  createdAt: number;
}

interface StreamServerInput {
  serverType: string;
  serverName: string;
  serverUrl: string;
  username: string;
  password: string;
  accessToken?: string;
  userId?: string;
}

interface StreamServerConfig {
  serverType: string;
  serverName: string;
  serverUrl: string;
  username: string;
  password: string;
  accessToken?: string;
  userId?: string;
}

interface ConnectionTestResult {
  success: boolean;
  message: string;
  serverVersion?: string;
}

interface PlaylistStoreItem {
  id: string;
  name: string;
  songIds: string[];
}

type PlayMode = "sequence" | "shuffle" | "repeat-one";
type SongSortKey = "title" | "artist" | "album" | "duration" | "addedAt";
type AlbumSortKey = "title" | "artist" | "year" | "songCount";
type ArtistSortKey = "name" | "songCount";
type PlaylistSortKey = "addedAt" | "name" | "songCount";

interface StreamInfoPayload {
  type?: string;
  serverType?: string;
  songId?: string;
  serverName?: string;
  coverUrl?: string;
  config?: StreamServerConfig;
}

interface ParsedLrcLine {
  time: number;
  text: string;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

type IconName =
  | "songs"
  | "albums"
  | "artists"
  | "playlists"
  | "scan"
  | "stats"
  | "settings"
  | "about"
  | "search"
  | "more"
  | "sort"
  | "add"
  | "edit"
  | "shuffle"
  | "play"
  | "pause"
  | "prev"
  | "next"
  | "repeat"
  | "repeat-one"
  | "lyrics"
  | "queue"
  | "playlist-add"
  | "trash"
  | "volume"
  | "volume-mute"
  | "cloud-add"
  | "folder"
  | "back"
  | "menu";

const LineIcon = ({ name, className }: { name: IconName; className?: string }) => {
  const classes = className ? `line-icon ${className}` : "line-icon";

  // Lucide Icons (ISC License) - https://lucide.dev
  if (name === "songs") {
    return <svg className={classes} viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="8" cy="18" r="4" /><path d="M12 18V2l7 4" /></svg>;
  }
  if (name === "albums") {
    return <svg className={classes} viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="2" /></svg>;
  }
  if (name === "artists") {
    return <svg className={classes} viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 19v3" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><rect x="9" y="2" width="6" height="13" rx="3" /></svg>;
  }
  if (name === "playlists") {
    return <svg className={classes} viewBox="0 0 24 24" fill="none" aria-hidden><path d="M16 5H3" /><path d="M11 12H3" /><path d="M11 19H3" /><path d="M21 16V5" /><circle cx="18" cy="16" r="3" /></svg>;
  }
  if (name === "scan") {
    return <svg className={classes} viewBox="0 0 24 24" fill="none" aria-hidden><path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /><circle cx="12" cy="12" r="3" /><path d="m16 16-1.9-1.9" /></svg>;
  }
  if (name === "stats") {
    return <svg className={classes} viewBox="0 0 24 24" fill="none" aria-hidden><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5V19A9 3 0 0 0 21 19V5" /><path d="M3 12A9 3 0 0 0 21 12" /></svg>;
  }
  if (name === "settings") {
    return <svg className={classes} viewBox="0 0 24 24" fill="none" aria-hidden><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" /><circle cx="12" cy="12" r="3" /></svg>;
  }
  if (name === "about") {
    return <svg className={classes} viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>;
  }
  if (name === "search") {
    return <svg className={classes} viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="11" cy="11" r="8" /><path d="m21 21-4.34-4.34" /></svg>;
  }
  if (name === "more") {
    return <svg className={classes} viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" /></svg>;
  }
  if (name === "sort") {
    return <svg className={classes} viewBox="0 0 24 24" fill="none" aria-hidden><path d="m21 16-4 4-4-4" /><path d="M17 20V4" /><path d="m3 8 4-4 4 4" /><path d="M7 4v16" /></svg>;
  }
  if (name === "add") {
    return <svg className={classes} viewBox="0 0 24 24" fill="none" aria-hidden><path d="M5 12h14" /><path d="M12 5v14" /></svg>;
  }
  if (name === "edit") {
    return <svg className={classes} viewBox="0 0 24 24" fill="none" aria-hidden><path d="M21 10.656V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.344" /><path d="m9 11 3 3L22 4" /></svg>;
  }
  if (name === "shuffle") {
    return <svg className={classes} viewBox="0 0 24 24" fill="none" aria-hidden><path d="m18 14 4 4-4 4" /><path d="m18 2 4 4-4 4" /><path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22" /><path d="M2 6h1.972a4 4 0 0 1 3.6 2.2" /><path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45" /></svg>;
  }
  if (name === "play") {
    return <svg className={classes} viewBox="0 0 24 24" fill="none" aria-hidden><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" style={{fill:'currentColor',stroke:'none'}} /></svg>;
  }
  if (name === "pause") {
    return <svg className={classes} viewBox="0 0 24 24" fill="none" aria-hidden><rect x="14" y="3" width="5" height="18" rx="1" style={{fill:'currentColor',stroke:'none'}} /><rect x="5" y="3" width="5" height="18" rx="1" style={{fill:'currentColor',stroke:'none'}} /></svg>;
  }
  if (name === "prev") {
    return <svg className={classes} viewBox="0 0 24 24" fill="none" aria-hidden><path d="M17.971 4.285A2 2 0 0 1 21 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432z" style={{fill:'currentColor',stroke:'none'}} /><path d="M3 20V4" /></svg>;
  }
  if (name === "next") {
    return <svg className={classes} viewBox="0 0 24 24" fill="none" aria-hidden><path d="M21 4v16" /><path d="M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z" style={{fill:'currentColor',stroke:'none'}} /></svg>;
  }
  if (name === "repeat") {
    return <svg className={classes} viewBox="0 0 24 24" fill="none" aria-hidden><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></svg>;
  }
  if (name === "repeat-one") {
    return <svg className={classes} viewBox="0 0 24 24" fill="none" aria-hidden><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /><path d="M11 10h1v4" /></svg>;
  }
  if (name === "lyrics") {
    return <svg className={classes} viewBox="0 0 24 24" fill="none" aria-hidden><path d="M21 5H3" /><path d="M15 12H3" /><path d="M17 19H3" /></svg>;
  }
  if (name === "queue") {
    return <svg className={classes} viewBox="0 0 24 24" fill="none" aria-hidden><path d="M16 5H3" /><path d="M11 12H3" /><path d="M11 19H3" /><path d="M21 16V5" /><circle cx="18" cy="16" r="3" /></svg>;
  }
  if (name === "playlist-add") {
    return <svg className={classes} viewBox="0 0 24 24" fill="none" aria-hidden><path d="M4 6h10" /><path d="M4 12h10" /><path d="M4 18h6" /><path d="M16 14v6" /><path d="M13 17h6" /></svg>;
  }
  if (name === "trash") {
    return <svg className={classes} viewBox="0 0 24 24" fill="none" aria-hidden><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>;
  }
  if (name === "volume") {
    return <svg className={classes} viewBox="0 0 24 24" fill="none" aria-hidden><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" /><path d="M16 9a5 5 0 0 1 0 6" /><path d="M19.364 18.364a9 9 0 0 0 0-12.728" /></svg>;
  }
  if (name === "volume-mute") {
    return <svg className={classes} viewBox="0 0 24 24" fill="none" aria-hidden><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" /><line x1="22" x2="16" y1="9" y2="15" /><line x1="16" x2="22" y1="9" y2="15" /></svg>;
  }
  if (name === "cloud-add") {
    return <svg className={classes} viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 13v8" /><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" /><path d="m8 17 4-4 4 4" /></svg>;
  }
  if (name === "folder") {
    return <svg className={classes} viewBox="0 0 24 24" fill="none" aria-hidden><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z" /></svg>;
  }
  if (name === "back") {
    return <svg className={classes} viewBox="0 0 24 24" fill="none" aria-hidden><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>;
  }
  if (name === "menu") {
    return <svg className={classes} viewBox="0 0 24 24" fill="none" aria-hidden><path d="M4 5h16" /><path d="M4 12h16" /><path d="M4 19h16" /></svg>;
  }

  return null;
};

const ALPHABET_INDEX = ["0", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

const NAV_LIBRARY: Array<{ page: Page; label: string; icon: IconName }> = [
  { page: "songs", label: "歌曲", icon: "songs" },
  { page: "albums", label: "专辑", icon: "albums" },
  { page: "artists", label: "艺术家", icon: "artists" },
  { page: "playlists", label: "歌单", icon: "playlists" },
];

const NAV_SYSTEM: Array<{ page: Page; label: string; icon: IconName }> = [
  { page: "scan", label: "扫描音乐", icon: "scan" },
  { page: "stats", label: "音乐库统计", icon: "stats" },
  { page: "settings", label: "设置", icon: "settings" },
  { page: "about", label: "关于", icon: "about" },
];

const PAGE_TITLE: Record<Page, string> = {
  songs: "歌曲",
  albums: "专辑",
  artists: "艺术家",
  playlists: "歌单",
  scan: "扫描音乐",
  "stream-config": "流媒体配置",
  stats: "音乐库统计",
  settings: "设置",
  "settings-ui": "用户界面",
  about: "关于",
};

const STREAM_SERVER_TYPE_OPTIONS = [
  { value: "navidrome", label: "Navidrome" },
  { value: "jellyfin", label: "Jellyfin" },
  { value: "emby", label: "Emby" },
  { value: "subsonic", label: "Subsonic" },
  { value: "opensubsonic", label: "OpenSubsonic" },
] as const;

const SONG_SORT_OPTIONS: Array<{ key: SongSortKey; label: string }> = [
  { key: "title", label: "标题" },
  { key: "artist", label: "艺术家" },
  { key: "album", label: "专辑" },
  { key: "duration", label: "时长" },
  { key: "addedAt", label: "添加日期" },
];

const ALBUM_SORT_OPTIONS: Array<{ key: AlbumSortKey; label: string }> = [
  { key: "title", label: "标题" },
  { key: "artist", label: "艺术家" },
  { key: "year", label: "年份" },
  { key: "songCount", label: "歌曲数量" },
];

const ARTIST_SORT_OPTIONS: Array<{ key: ArtistSortKey; label: string }> = [
  { key: "name", label: "名称" },
  { key: "songCount", label: "歌曲数量" },
];

const PLAYLIST_SORT_OPTIONS: Array<{ key: PlaylistSortKey; label: string }> = [
  { key: "addedAt", label: "添加日期" },
  { key: "name", label: "名称" },
  { key: "songCount", label: "歌曲数量" },
];

const FALLBACK_COVERS = [
  "linear-gradient(135deg,#596cff,#303b90)",
  "linear-gradient(135deg,#8db4ff,#4a61a9)",
  "linear-gradient(135deg,#d3b27a,#7d8bc4)",
  "linear-gradient(135deg,#a3b4d3,#5f6da9)",
  "linear-gradient(135deg,#91a6ff,#445298)",
];

const WEB_SAMPLE_SONGS: DbSong[] = [
  {
    id: "demo-1",
    title: "百鬼率舞 Dancing Fantasms",
    artist: "HOYO-MiX",
    album: "崩坏星穹铁道-星穹剧场 Astral Theater",
    duration: 246,
    filePath: "",
    fileSize: 0,
    isHr: true,
    isSq: true,
    sourceType: "local",
  },
  {
    id: "demo-2",
    title: "燎焚 Blaze",
    artist: "HOYO-MiX",
    album: "崩坏星穹铁道-雪融于烬 Of Snow and Ember",
    duration: 232,
    filePath: "",
    fileSize: 0,
    isHr: true,
    isSq: true,
    sourceType: "local",
  },
  {
    id: "demo-3",
    title: "不眠之夜",
    artist: "张杰 / HOYO-MiX",
    album: "崩坏星穹铁道-不眠之夜 WHITE NIGHT",
    duration: 214,
    filePath: "",
    fileSize: 0,
    isHr: true,
    isSq: true,
    sourceType: "local",
  },
];

const ABOUT_LINKS = ["捐赠支持", "创作者", "使用条款", "隐私政策", "开源许可"];

const UI_SETTINGS_KEY = "bayin.uiSettings";
const PLAYLISTS_KEY = "bayin.playlists";
const THEME_KEY = "bayin.theme";

const ABOUT_URLS: Record<string, string> = {
  捐赠支持: "https://github.com/CallmeLins/BaYin#支持项目",
  创作者: "https://github.com/CallmeLins/BaYin",
  使用条款: "https://github.com/CallmeLins/BaYin/blob/main/README.md",
  隐私政策: "https://github.com/CallmeLins/BaYin/blob/main/README.md",
  开源许可: "https://github.com/CallmeLins/BaYin/blob/main/LICENSE",
};

const ABOUT_ICON_META: Record<string, { icon: string; tone: string }> = {
  捐赠支持: { icon: "❤", tone: "red" },
  创作者: { icon: "👥", tone: "blue" },
  使用条款: { icon: "📄", tone: "gray" },
  隐私政策: { icon: "🛡", tone: "green" },
  开源许可: { icon: "‹›", tone: "orange" },
};

function parseMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "未知错误";
}

function isMobileWidth(): boolean {
  return typeof window !== "undefined" && window.innerWidth <= 980;
}

function createCoverStyle(index: number): CSSProperties {
  return {
    background: FALLBACK_COVERS[index % FALLBACK_COVERS.length],
  };
}

function safeParseJson<T>(value?: string | null): T | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function toStreamConfigFromServer(server: DbStreamServer): StreamServerConfig {
  return {
    serverType: server.serverType,
    serverName: server.serverName,
    serverUrl: server.serverUrl,
    username: server.username,
    password: server.password,
    accessToken: server.accessToken,
    userId: server.userId,
  };
}

function resolveStreamTypeLabel(serverType: string): string {
  const normalized = serverType.toLowerCase();
  const option = STREAM_SERVER_TYPE_OPTIONS.find((item) => item.value === normalized);
  return option?.label ?? serverType;
}

function createDefaultStreamForm(serverType = "navidrome"): StreamServerInput {
  return {
    serverType,
    serverName: resolveStreamTypeLabel(serverType),
    serverUrl: "",
    username: "",
    password: "",
    accessToken: "",
    userId: "",
  };
}

function parseLrc(lyricText: string): ParsedLrcLine[] {
  const lines = lyricText.split(/\r?\n/);
  const result: ParsedLrcLine[] = [];

  for (const line of lines) {
    const matches = [...line.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!matches.length) {
      continue;
    }

    const text = line.replace(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g, "").trim();

    for (const match of matches) {
      const minute = Number(match[1] || 0);
      const second = Number(match[2] || 0);
      const millisRaw = match[3] || "0";
      const millis =
        millisRaw.length === 3
          ? Number(millisRaw)
          : millisRaw.length === 2
            ? Number(millisRaw) * 10
            : Number(millisRaw) * 100;

      result.push({
        time: minute * 60 + second + millis / 1000,
        text,
      });
    }
  }

  return result.sort((a, b) => a.time - b.time);
}

function pickNextIndex(queueLength: number, currentIndex: number, mode: PlayMode): number {
  if (queueLength <= 1) {
    return currentIndex;
  }

  if (mode === "repeat-one") {
    return currentIndex;
  }

  if (mode === "shuffle") {
    let randomIndex = currentIndex;
    while (randomIndex === currentIndex) {
      randomIndex = Math.floor(Math.random() * queueLength);
    }
    return randomIndex;
  }

  return (currentIndex + 1) % queueLength;
}

function pickPreviousIndex(queueLength: number, currentIndex: number): number {
  if (queueLength <= 1) {
    return currentIndex;
  }
  return (currentIndex - 1 + queueLength) % queueLength;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "00:00";
  }

  const total = Math.floor(seconds);
  const minute = Math.floor(total / 60);
  const second = total % 60;

  return `${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

function resolveSongAlphabet(title: string): string {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    return "0";
  }

  const firstChar = trimmedTitle.charAt(0).toUpperCase();
  return /^[A-Z]$/.test(firstChar) ? firstChar : "0";
}

interface QualityDistributionDonutProps {
  hiResCount: number;
  sqCount: number;
  size?: number;
  strokeWidth?: number;
}

function polarToCartesian(cx: number, cy: number, radius: number, angle: number) {
  const radian = (angle * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radian),
    y: cy + radius * Math.sin(radian),
  };
}

function buildDonutArcPath(cx: number, cy: number, radius: number, startAngle: number, sweepAngle: number) {
  if (sweepAngle <= 0.02) {
    return "";
  }

  const normalizedSweep = Math.min(Math.max(sweepAngle, 0), 359.999);
  const startPoint = polarToCartesian(cx, cy, radius, startAngle);
  const endPoint = polarToCartesian(cx, cy, radius, startAngle - normalizedSweep);
  const largeArcFlag = normalizedSweep > 180 ? 1 : 0;

  return `M ${startPoint.x.toFixed(3)} ${startPoint.y.toFixed(3)} A ${radius.toFixed(3)} ${radius.toFixed(3)} 0 ${largeArcFlag} 0 ${endPoint.x.toFixed(3)} ${endPoint.y.toFixed(3)}`;
}

function QualityDistributionDonut({
  hiResCount,
  sqCount,
  size = 196,
  strokeWidth = 42,
}: QualityDistributionDonutProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setProgress(0);

    const controls = animate(0, 1, {
      duration: 1.45,
      delay: 0.2,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        setProgress(latest);
      },
    });

    return () => {
      controls.stop();
    };
  }, [hiResCount, sqCount]);

  const { center, radius, hasData, hiResPath, sqPath } = useMemo(() => {
    const total = hiResCount + sqCount;
    const hasHiRes = hiResCount > 0;
    const hasSq = sqCount > 0;
    const hasBoth = hasHiRes && hasSq;
    const segmentGap = hasBoth ? 5 : 0;
    const wrapGap = hasBoth ? 5 : 0;
    const startAngle = 0;
    const normalizedProgress = Math.min(Math.max(progress, 0), 1);

    const center = size / 2;
    const radius = (size - strokeWidth) / 2;

    if (total <= 0) {
      return {
        center,
        radius,
        hasData: false,
        hiResPath: "",
        sqPath: "",
      };
    }

    const sequenceSweep = 360 - wrapGap;
    const dataSweep = Math.max(0, sequenceSweep - segmentGap);
    const hiResSweep = dataSweep * (hiResCount / total) * normalizedProgress;
    const sqSweep = dataSweep * (sqCount / total) * normalizedProgress;
    const animatedGap = segmentGap * normalizedProgress;

    const hiResPath = hasHiRes
      ? buildDonutArcPath(center, center, radius, startAngle, hiResSweep)
      : "";

    const sqStartAngle = startAngle - hiResSweep - animatedGap;
    const sqPath = hasSq
      ? buildDonutArcPath(center, center, radius, sqStartAngle, sqSweep)
      : "";

    return {
      center,
      radius,
      hasData: true,
      hiResPath,
      sqPath,
    };
  }, [hiResCount, progress, size, sqCount, strokeWidth]);

  return (
    <motion.svg
      className="quality-donut-svg"
      viewBox={`0 0 ${size} ${size}`}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <circle
        className={`quality-donut-track ${hasData ? "has-data" : ""}`}
        cx={center}
        cy={center}
        r={radius}
      />

      {hiResPath ? (
        <path
          className="quality-donut-segment quality-donut-hires"
          d={hiResPath}
        />
      ) : null}

      {sqPath ? (
        <path
          className="quality-donut-segment quality-donut-sq"
          d={sqPath}
        />
      ) : null}
    </motion.svg>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>("songs");
  const [isMobile, setIsMobile] = useState(isMobileWidth);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isTauriEnv] = useState(() => isTauri());

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);

  const [songs, setSongs] = useState<DbSong[]>([]);
  const [albums, setAlbums] = useState<DbAlbum[]>([]);
  const [artists, setArtists] = useState<DbArtist[]>([]);
  const [stats, setStats] = useState<LibraryStats>({
    totalSongs: 0,
    localSongs: 0,
    streamSongs: 0,
    totalAlbums: 0,
    totalArtists: 0,
  });

  const [coverMap, setCoverMap] = useState<CoverMap>({});
  const [coverStats, setCoverStats] = useState<CoverCacheStats>({
    fileCount: 0,
    totalSizeBytes: 0,
    totalSizeMb: 0,
  });

  const [directories, setDirectories] = useState<string[]>([]);
  const [skipShortAudio, setSkipShortAudio] = useState(true);
  const [minDuration, setMinDuration] = useState(60);
  const [scanMode] = useState<"full" | "incremental">("incremental");
  const [scanRunning, setScanRunning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string>("");

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [openedPlaylistId, setOpenedPlaylistId] = useState<string | null>(null);
  const [playlistMenuId, setPlaylistMenuId] = useState<string | null>(null);
  const [songMenuSongId, setSongMenuSongId] = useState<string | null>(null);
  const [songInfoSongId, setSongInfoSongId] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [dialogInput, setDialogInput] = useState("");
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);

  const [language, setLanguage] = useState<Language>("中文");
  const [lyricSize, setLyricSize] = useState(20);
  const [lyricCentered, setLyricCentered] = useState(false);
  const [fontWeight, setFontWeight] = useState<FontWeightOption>("Bold");
  const [showCover, setShowCover] = useState(true);

  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [searchQuery, setSearchQuery] = useState("");
  const [songsSearchMode, setSongsSearchMode] = useState(false);
  const [albumSearchQuery, setAlbumSearchQuery] = useState("");
  const [albumsSearchMode, setAlbumsSearchMode] = useState(false);
  const [artistSearchQuery, setArtistSearchQuery] = useState("");
  const [artistsSearchMode, setArtistsSearchMode] = useState(false);
  const [playlistSearchQuery, setPlaylistSearchQuery] = useState("");
  const [playlistsSearchMode, setPlaylistsSearchMode] = useState(false);
  const [playlistDetailSearchQuery, setPlaylistDetailSearchQuery] = useState("");
  const [playlistDetailSearchMode, setPlaylistDetailSearchMode] = useState(false);
  const [songsSelectMode, setSongsSelectMode] = useState(false);
  const [selectedSongIds, setSelectedSongIds] = useState<string[]>([]);
  const [songsSortKey, setSongsSortKey] = useState<SongSortKey>("title");
  const [songsSortDialogOpen, setSongsSortDialogOpen] = useState(false);
  const [albumsSortKey, setAlbumsSortKey] = useState<AlbumSortKey>("title");
  const [albumsSortDialogOpen, setAlbumsSortDialogOpen] = useState(false);
  const [artistsSortKey, setArtistsSortKey] = useState<ArtistSortKey>("name");
  const [artistsSortDialogOpen, setArtistsSortDialogOpen] = useState(false);
  const [playlistsSortKey, setPlaylistsSortKey] = useState<PlaylistSortKey>("addedAt");
  const [playlistsSortDialogOpen, setPlaylistsSortDialogOpen] = useState(false);
  const [songsBatchPlaylistDialogOpen, setSongsBatchPlaylistDialogOpen] = useState(false);
  const [songsBatchCreateMode, setSongsBatchCreateMode] = useState(false);
  const [songsBatchPlaylistName, setSongsBatchPlaylistName] = useState("");

  const [streamServers, setStreamServers] = useState<DbStreamServer[]>([]);
  const [streamForm, setStreamForm] = useState<StreamServerInput>(() => createDefaultStreamForm());
  const [streamTesting, setStreamTesting] = useState(false);
  const [streamSaving, setStreamSaving] = useState(false);
  const [streamFormMessage, setStreamFormMessage] = useState<string>("");

  const [queueSongIds, setQueueSongIds] = useState<string[]>([]);
  const [currentSongId, setCurrentSongId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isResolvingSong, setIsResolvingSong] = useState(false);
  const [playMode, setPlayMode] = useState<PlayMode>("sequence");
  const [volume, setVolume] = useState(0.72);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showQueuePanel, setShowQueuePanel] = useState(false);
  const [showLyricsPanel, setShowLyricsPanel] = useState(false);
  const [currentLyricText, setCurrentLyricText] = useState<string>("");
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsError, setLyricsError] = useState<string>("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const songRowElementMapRef = useRef<Map<string, HTMLElement>>(new Map());
  const songsAlphabetRailRef = useRef<HTMLDivElement | null>(null);
  const songsAlphabetItemElementMapRef = useRef<Map<string, HTMLSpanElement>>(new Map());
  const songsAlphabetHideTimerRef = useRef<number | null>(null);
  const songsAlphabetDraggingRef = useRef(false);
  const songsAlphabetLastScrolledRef = useRef<string | null>(null);

  const [songsAlphabetActiveLetter, setSongsAlphabetActiveLetter] = useState<string | null>(null);
  const [songsAlphabetToastVisible, setSongsAlphabetToastVisible] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(isMobileWidth());
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setSidebarOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    return () => {
      if (songsAlphabetHideTimerRef.current !== null) {
        window.clearTimeout(songsAlphabetHideTimerRef.current);
        songsAlphabetHideTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (page !== "songs") {
      songsAlphabetDraggingRef.current = false;
      songsAlphabetLastScrolledRef.current = null;
      setSongsAlphabetToastVisible(false);
      setSongsAlphabetActiveLetter(null);

      if (songsAlphabetHideTimerRef.current !== null) {
        window.clearTimeout(songsAlphabetHideTimerRef.current);
        songsAlphabetHideTimerRef.current = null;
      }
    }
  }, [page]);

  useEffect(() => {
    if (page !== "songs") {
      if (searchQuery) {
        setSearchQuery("");
      }
      if (songsSearchMode) {
        setSongsSearchMode(false);
      }
      if (songsSortDialogOpen) {
        setSongsSortDialogOpen(false);
      }
      if (songsSelectMode) {
        setSongsSelectMode(false);
      }
      if (selectedSongIds.length) {
        setSelectedSongIds([]);
      }
      if (songsBatchPlaylistDialogOpen) {
        setSongsBatchPlaylistDialogOpen(false);
      }
      if (songsBatchCreateMode) {
        setSongsBatchCreateMode(false);
      }
      if (songsBatchPlaylistName) {
        setSongsBatchPlaylistName("");
      }
    }

    if (page !== "albums") {
      if (albumSearchQuery) {
        setAlbumSearchQuery("");
      }
      if (albumsSearchMode) {
        setAlbumsSearchMode(false);
      }
      if (albumsSortDialogOpen) {
        setAlbumsSortDialogOpen(false);
      }
    }

    if (page !== "artists") {
      if (artistSearchQuery) {
        setArtistSearchQuery("");
      }
      if (artistsSearchMode) {
        setArtistsSearchMode(false);
      }
      if (artistsSortDialogOpen) {
        setArtistsSortDialogOpen(false);
      }
    }

    if (page !== "playlists") {
      if (playlistSearchQuery) {
        setPlaylistSearchQuery("");
      }
      if (playlistsSearchMode) {
        setPlaylistsSearchMode(false);
      }
      if (playlistsSortDialogOpen) {
        setPlaylistsSortDialogOpen(false);
      }
      if (openedPlaylistId) {
        setOpenedPlaylistId(null);
      }
      if (playlistDetailSearchQuery) {
        setPlaylistDetailSearchQuery("");
      }
      if (playlistDetailSearchMode) {
        setPlaylistDetailSearchMode(false);
      }
    }
  }, [
    albumSearchQuery,
    albumsSearchMode,
    albumsSortDialogOpen,
    artistSearchQuery,
    artistsSearchMode,
    artistsSortDialogOpen,
    openedPlaylistId,
    page,
    playlistDetailSearchMode,
    playlistDetailSearchQuery,
    playlistSearchQuery,
    playlistsSearchMode,
    playlistsSortDialogOpen,
    searchQuery,
    selectedSongIds.length,
    songsBatchCreateMode,
    songsBatchPlaylistDialogOpen,
    songsBatchPlaylistName,
    songsSearchMode,
    songsSelectMode,
    songsSortDialogOpen,
  ]);

  useEffect(() => {
    if (page === "songs" && songsSearchMode) {
      searchInputRef.current?.focus();
    }
  }, [page, songsSearchMode]);

  useEffect(() => {
    if (page === "albums" && albumsSearchMode) {
      searchInputRef.current?.focus();
    }
  }, [albumsSearchMode, page]);

  useEffect(() => {
    if (page === "artists" && artistsSearchMode) {
      searchInputRef.current?.focus();
    }
  }, [artistsSearchMode, page]);

  useEffect(() => {
    if (page === "playlists" && playlistsSearchMode) {
      searchInputRef.current?.focus();
    }
  }, [page, playlistsSearchMode]);

  useEffect(() => {
    if (page === "playlists" && openedPlaylistId && playlistDetailSearchMode) {
      searchInputRef.current?.focus();
    }
  }, [openedPlaylistId, page, playlistDetailSearchMode]);

  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === "dark" || savedTheme === "light") {
      setTheme(savedTheme);
    }

    const rawUiSettings = localStorage.getItem(UI_SETTINGS_KEY);
    const parsedUiSettings = safeParseJson<{
      language?: Language;
      lyricSize?: number;
      lyricCentered?: boolean;
      fontWeight?: FontWeightOption;
      showCover?: boolean;
      volume?: number;
      muted?: boolean;
    }>(rawUiSettings);

    if (parsedUiSettings) {
      if (parsedUiSettings.language) {
        setLanguage(parsedUiSettings.language);
      }
      if (typeof parsedUiSettings.lyricSize === "number") {
        setLyricSize(parsedUiSettings.lyricSize);
      }
      if (typeof parsedUiSettings.lyricCentered === "boolean") {
        setLyricCentered(parsedUiSettings.lyricCentered);
      }
      if (parsedUiSettings.fontWeight) {
        setFontWeight(parsedUiSettings.fontWeight);
      }
      if (typeof parsedUiSettings.showCover === "boolean") {
        setShowCover(parsedUiSettings.showCover);
      }
      if (typeof parsedUiSettings.volume === "number") {
        setVolume(parsedUiSettings.volume);
      }
      if (typeof parsedUiSettings.muted === "boolean") {
        setMuted(parsedUiSettings.muted);
      }
    }

    const rawPlaylists = localStorage.getItem(PLAYLISTS_KEY);
    const parsedPlaylists = safeParseJson<PlaylistStoreItem[]>(rawPlaylists);
    if (parsedPlaylists && Array.isArray(parsedPlaylists)) {
      const nextPlaylists = parsedPlaylists.map((item) => ({
          id: item.id,
          name: item.name,
          songIds: item.songIds ?? [],
        }));

      setPlaylists(nextPlaylists);
      setSelectedPlaylistId(nextPlaylists[0]?.id ?? null);
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(
      UI_SETTINGS_KEY,
      JSON.stringify({
        language,
        lyricSize,
        lyricCentered,
        fontWeight,
        showCover,
        volume,
        muted,
      }),
    );
  }, [fontWeight, language, lyricCentered, lyricSize, muted, showCover, volume]);

  useEffect(() => {
    localStorage.setItem(
      PLAYLISTS_KEY,
      JSON.stringify(
        playlists.map((playlist) => ({
          id: playlist.id,
          name: playlist.name,
          songIds: playlist.songIds,
        })),
      ),
    );
  }, [playlists]);

  const refreshLibrary = useCallback(async () => {
    setIsRefreshing(true);
    setLibraryError(null);

    try {
      if (!isTauriEnv) {
        setSongs(WEB_SAMPLE_SONGS);
        setAlbums([]);
        setArtists([]);
        setStreamServers([]);
        setCoverStats({
          fileCount: 0,
          totalSizeBytes: 0,
          totalSizeMb: 0,
        });
        setStats({
          totalSongs: WEB_SAMPLE_SONGS.length,
          localSongs: WEB_SAMPLE_SONGS.length,
          streamSongs: 0,
          totalAlbums: 2,
          totalArtists: 2,
        });
        return;
      }

      const [songRows, albumRows, artistRows, statsResult, scanConfig, servers, coverStatsResult] =
        await Promise.all([
          invoke<DbSong[]>("db_get_all_songs"),
          invoke<DbAlbum[]>("db_get_all_albums"),
          invoke<DbArtist[]>("db_get_all_artists"),
          invoke<LibraryStats>("db_get_library_stats"),
          invoke<ScanConfig | null>("db_get_scan_config"),
          invoke<DbStreamServer[]>("db_get_stream_servers"),
          invoke<CoverCacheStats>("get_cover_cache_stats"),
        ]);

      setSongs(songRows);
      setAlbums(albumRows);
      setArtists(artistRows);
      setStreamServers(servers.filter((server) => server.enabled));
      setStats(statsResult);
      setCoverStats(coverStatsResult);

      if (scanConfig) {
        setDirectories(scanConfig.directories ?? []);
        setSkipShortAudio(scanConfig.skipShort);
        setMinDuration(Math.max(1, Math.round(scanConfig.minDuration || 60)));
      }

      const hashes = Array.from(
        new Set(
          [
            ...songRows.map((song) => song.coverHash),
            ...albumRows.map((album) => album.coverHash),
            ...artistRows.map((artist) => artist.coverHash),
          ].filter((hash): hash is string => Boolean(hash)),
        ),
      );

      if (!hashes.length) {
        setCoverMap({});
      } else {
        const urls = await invoke<Record<string, string>>("get_cover_urls_batch", {
          hashes,
          size: "list",
        });

        setCoverMap(urls);
      }
    } catch (error) {
      setLibraryError(parseMessage(error));
    } finally {
      setIsRefreshing(false);
    }
  }, [isTauriEnv]);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  useEffect(() => {
    if (!isTauriEnv) {
      return;
    }

    let unlistenLibrary: UnlistenFn | null = null;
    let unlistenScan: UnlistenFn | null = null;
    let disposed = false;

    const bindEvents = async () => {
      unlistenLibrary = await listen("library-updated", () => {
        void refreshLibrary();
      });

      unlistenScan = await listen<ScanProgress>("scan-progress", (event) => {
        if (disposed) {
          return;
        }
        const payload = event.payload;
        if (!payload) {
          return;
        }

        if (payload.phase === "complete") {
          setScanMessage(
            `扫描完成：处理 ${payload.processed} / ${payload.total}，跳过 ${payload.skipped}，错误 ${payload.errors}`,
          );
        } else {
          setScanMessage(
            `扫描中：${payload.phase} ${payload.processed}/${payload.total}（跳过 ${payload.skipped}）`,
          );
        }
      });
    };

    void bindEvents();

    return () => {
      disposed = true;
      if (unlistenLibrary) {
        unlistenLibrary();
      }
      if (unlistenScan) {
        unlistenScan();
      }
    };
  }, [isTauriEnv, refreshLibrary]);

  const songMap = useMemo(() => {
    const map = new Map<string, DbSong>();
    songs.forEach((song) => map.set(song.id, song));
    return map;
  }, [songs]);

  const filteredSongs = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) {
      return songs;
    }

    return songs.filter((song) => {
      const haystack = `${song.title} ${song.artist} ${song.album}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [searchQuery, songs]);

  const textSorter = useMemo(
    () =>
      new Intl.Collator("zh-CN", {
        sensitivity: "base",
        numeric: true,
      }),
    [],
  );

  const sortedSongs = useMemo(() => {
    const sorted = [...filteredSongs];
    const compareText = (left: string, right: string) => textSorter.compare(left, right);

    sorted.sort((leftSong, rightSong) => {
      if (songsSortKey === "title") {
        return (
          compareText(leftSong.title, rightSong.title)
          || compareText(leftSong.artist, rightSong.artist)
          || compareText(leftSong.album, rightSong.album)
        );
      }

      if (songsSortKey === "artist") {
        return (
          compareText(leftSong.artist, rightSong.artist)
          || compareText(leftSong.title, rightSong.title)
          || compareText(leftSong.album, rightSong.album)
        );
      }

      if (songsSortKey === "album") {
        return (
          compareText(leftSong.album, rightSong.album)
          || compareText(leftSong.title, rightSong.title)
          || compareText(leftSong.artist, rightSong.artist)
        );
      }

      if (songsSortKey === "duration") {
        return (
          leftSong.duration - rightSong.duration
          || compareText(leftSong.title, rightSong.title)
          || compareText(leftSong.artist, rightSong.artist)
        );
      }

      return (
        (rightSong.fileModified ?? 0) - (leftSong.fileModified ?? 0)
        || compareText(leftSong.title, rightSong.title)
        || compareText(leftSong.artist, rightSong.artist)
      );
    });

    return sorted;
  }, [filteredSongs, songsSortKey, textSorter]);

  useEffect(() => {
    songsAlphabetLastScrolledRef.current = null;
  }, [sortedSongs]);

  const songsAlphabetStartMap = useMemo(() => {
    const map = new Map<string, string>();

    sortedSongs.forEach((song) => {
      const alphabet = resolveSongAlphabet(song.title);
      if (!map.has(alphabet)) {
        map.set(alphabet, song.id);
      }
    });

    return map;
  }, [sortedSongs]);

  const clearSongsAlphabetHideTimer = useCallback(() => {
    if (songsAlphabetHideTimerRef.current !== null) {
      window.clearTimeout(songsAlphabetHideTimerRef.current);
      songsAlphabetHideTimerRef.current = null;
    }
  }, []);

  const scheduleSongsAlphabetHide = useCallback(() => {
    clearSongsAlphabetHideTimer();
    songsAlphabetHideTimerRef.current = window.setTimeout(() => {
      setSongsAlphabetToastVisible(false);
      songsAlphabetHideTimerRef.current = null;
    }, 460);
  }, [clearSongsAlphabetHideTimer]);

  const scrollSongsToAlphabet = useCallback(
    (alphabet: string, options?: { behavior?: ScrollBehavior; force?: boolean }) => {
      if (!sortedSongs.length) {
        return;
      }

      clearSongsAlphabetHideTimer();
      setSongsAlphabetToastVisible(true);
      setSongsAlphabetActiveLetter((previous) => (previous === alphabet ? previous : alphabet));

      if (!options?.force && songsAlphabetLastScrolledRef.current === alphabet) {
        return;
      }

      let targetSongId = songsAlphabetStartMap.get(alphabet);

      if (!targetSongId) {
        const alphabetIndex = ALPHABET_INDEX.indexOf(alphabet);
        const maxAlphabetIndex = ALPHABET_INDEX.length - 1;
        const scrollPercent = maxAlphabetIndex > 0 && alphabetIndex >= 0
          ? alphabetIndex / maxAlphabetIndex
          : 0;
        const approxSongIndex = Math.min(
          sortedSongs.length - 1,
          Math.max(0, Math.round(scrollPercent * (sortedSongs.length - 1))),
        );
        targetSongId = sortedSongs[approxSongIndex]?.id;
      }

      if (!targetSongId) {
        return;
      }

      const targetRowElement = songRowElementMapRef.current.get(targetSongId);
      if (targetRowElement) {
        songsAlphabetLastScrolledRef.current = alphabet;
        targetRowElement.scrollIntoView({
          block: "start",
          behavior: options?.behavior ?? "auto",
        });
      }
    },
    [clearSongsAlphabetHideTimer, songsAlphabetStartMap, sortedSongs],
  );

  const pickSongsAlphabetByPointer = useCallback((clientY: number): string | null => {
    let nearestAlphabet: string | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const alphabet of ALPHABET_INDEX) {
      const itemElement = songsAlphabetItemElementMapRef.current.get(alphabet);
      if (!itemElement) {
        continue;
      }

      const itemRect = itemElement.getBoundingClientRect();
      if (itemRect.height <= 0) {
        continue;
      }

      if (clientY >= itemRect.top && clientY <= itemRect.bottom) {
        return alphabet;
      }

      const distance = Math.abs(clientY - (itemRect.top + itemRect.height / 2));
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestAlphabet = alphabet;
      }
    }

    if (nearestAlphabet) {
      return nearestAlphabet;
    }

    const railElement = songsAlphabetRailRef.current;
    if (!railElement) {
      return null;
    }

    const railRect = railElement.getBoundingClientRect();
    if (railRect.height <= 0) {
      return null;
    }

    const clampedY = Math.min(railRect.bottom - 1, Math.max(railRect.top, clientY));
    const relativeY = (clampedY - railRect.top) / railRect.height;
    const targetIndex = Math.min(
      ALPHABET_INDEX.length - 1,
      Math.max(0, Math.round(relativeY * (ALPHABET_INDEX.length - 1))),
    );

    return ALPHABET_INDEX[targetIndex] ?? null;
  }, []);

  const handleSongsAlphabetPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      event.preventDefault();
      songsAlphabetDraggingRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);

      const alphabet = pickSongsAlphabetByPointer(event.clientY);
      if (alphabet) {
        scrollSongsToAlphabet(alphabet, { behavior: "auto" });
      }
    },
    [pickSongsAlphabetByPointer, scrollSongsToAlphabet],
  );

  const handleSongsAlphabetPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!songsAlphabetDraggingRef.current) {
        return;
      }

      event.preventDefault();
      const alphabet = pickSongsAlphabetByPointer(event.clientY);
      if (alphabet) {
        scrollSongsToAlphabet(alphabet, { behavior: "auto" });
      }
    },
    [pickSongsAlphabetByPointer, scrollSongsToAlphabet],
  );

  const handleSongsAlphabetPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      songsAlphabetDraggingRef.current = false;

      if (songsAlphabetActiveLetter) {
        scrollSongsToAlphabet(songsAlphabetActiveLetter, {
          behavior: "smooth",
          force: true,
        });
      }

      scheduleSongsAlphabetHide();
    },
    [scheduleSongsAlphabetHide, scrollSongsToAlphabet, songsAlphabetActiveLetter],
  );

  const handleSongsAlphabetPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      songsAlphabetDraggingRef.current = false;

      if (songsAlphabetActiveLetter) {
        scrollSongsToAlphabet(songsAlphabetActiveLetter, {
          behavior: "smooth",
          force: true,
        });
      }

      scheduleSongsAlphabetHide();
    },
    [scheduleSongsAlphabetHide, scrollSongsToAlphabet, songsAlphabetActiveLetter],
  );

  const selectedSongsInViewOrder = useMemo(() => {
    if (!selectedSongIds.length) {
      return [];
    }

    const selectedSongSet = new Set(selectedSongIds);
    return sortedSongs.filter((song) => selectedSongSet.has(song.id));
  }, [selectedSongIds, sortedSongs]);

  const allVisibleSongsSelected = useMemo(() => {
    if (!sortedSongs.length) {
      return false;
    }

    const selectedSongSet = new Set(selectedSongIds);
    return sortedSongs.every((song) => selectedSongSet.has(song.id));
  }, [selectedSongIds, sortedSongs]);

  useEffect(() => {
    if (!songsSelectMode) {
      return;
    }

    const visibleSongSet = new Set(sortedSongs.map((song) => song.id));
    setSelectedSongIds((previous) => {
      const next = previous.filter((songId) => visibleSongSet.has(songId));
      return next.length === previous.length ? previous : next;
    });
  }, [songsSelectMode, sortedSongs]);

  const filteredAlbums = useMemo(() => {
    const keyword = albumSearchQuery.trim().toLowerCase();
    if (!keyword) {
      return albums;
    }

    return albums.filter((album) => {
      const haystack = `${album.name} ${album.artist}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [albumSearchQuery, albums]);

  const albumYearMap = useMemo(() => {
    const yearMap = new Map<string, number>();

    songs.forEach((song) => {
      const modified = song.fileModified ?? 0;
      if (!modified) {
        return;
      }

      const timestamp = modified > 1_000_000_000_000 ? modified : modified * 1000;
      const year = new Date(timestamp).getFullYear();
      if (!Number.isFinite(year) || year < 1900) {
        return;
      }

      const previousYear = yearMap.get(song.album) ?? 0;
      if (year > previousYear) {
        yearMap.set(song.album, year);
      }
    });

    return yearMap;
  }, [songs]);

  const sortedAlbums = useMemo(() => {
    const sorted = [...filteredAlbums];
    const compareText = (left: string, right: string) => textSorter.compare(left, right);

    sorted.sort((leftAlbum, rightAlbum) => {
      if (albumsSortKey === "title") {
        return (
          compareText(leftAlbum.name, rightAlbum.name)
          || compareText(leftAlbum.artist, rightAlbum.artist)
        );
      }

      if (albumsSortKey === "artist") {
        return (
          compareText(leftAlbum.artist, rightAlbum.artist)
          || compareText(leftAlbum.name, rightAlbum.name)
        );
      }

      if (albumsSortKey === "year") {
        const leftYear = albumYearMap.get(leftAlbum.name) ?? 0;
        const rightYear = albumYearMap.get(rightAlbum.name) ?? 0;
        return (
          rightYear - leftYear
          || compareText(leftAlbum.name, rightAlbum.name)
          || compareText(leftAlbum.artist, rightAlbum.artist)
        );
      }

      return (
        rightAlbum.songCount - leftAlbum.songCount
        || compareText(leftAlbum.name, rightAlbum.name)
        || compareText(leftAlbum.artist, rightAlbum.artist)
      );
    });

    return sorted;
  }, [albumYearMap, albumsSortKey, filteredAlbums, textSorter]);

  const filteredArtists = useMemo(() => {
    const keyword = artistSearchQuery.trim().toLowerCase();
    if (!keyword) {
      return artists;
    }

    return artists.filter((artist) => artist.name.toLowerCase().includes(keyword));
  }, [artistSearchQuery, artists]);

  const sortedArtists = useMemo(() => {
    const sorted = [...filteredArtists];
    const compareText = (left: string, right: string) => textSorter.compare(left, right);

    sorted.sort((leftArtist, rightArtist) => {
      if (artistsSortKey === "name") {
        return compareText(leftArtist.name, rightArtist.name);
      }

      return (
        rightArtist.songCount - leftArtist.songCount
        || compareText(leftArtist.name, rightArtist.name)
      );
    });

    return sorted;
  }, [artistsSortKey, filteredArtists, textSorter]);

  const filteredPlaylists = useMemo(() => {
    const keyword = playlistSearchQuery.trim().toLowerCase();
    if (!keyword) {
      return playlists;
    }

    return playlists.filter((playlist) => playlist.name.toLowerCase().includes(keyword));
  }, [playlistSearchQuery, playlists]);

  const sortedPlaylists = useMemo(() => {
    const sorted = [...filteredPlaylists];
    const compareText = (left: string, right: string) => textSorter.compare(left, right);

    const resolveAddedAt = (playlist: Playlist): number => {
      const matched = playlist.id.match(/^(\d{10,})-/);
      if (!matched) {
        return 0;
      }

      const timestamp = Number(matched[1]);
      return Number.isFinite(timestamp) ? timestamp : 0;
    };

    sorted.sort((leftPlaylist, rightPlaylist) => {
      if (playlistsSortKey === "name") {
        return compareText(leftPlaylist.name, rightPlaylist.name);
      }

      if (playlistsSortKey === "songCount") {
        return (
          rightPlaylist.songIds.length - leftPlaylist.songIds.length
          || compareText(leftPlaylist.name, rightPlaylist.name)
        );
      }

      return (
        resolveAddedAt(rightPlaylist) - resolveAddedAt(leftPlaylist)
        || compareText(leftPlaylist.name, rightPlaylist.name)
      );
    });

    return sorted;
  }, [filteredPlaylists, playlistsSortKey, textSorter]);

  const openedPlaylist = useMemo(
    () => (openedPlaylistId ? playlists.find((playlist) => playlist.id === openedPlaylistId) ?? null : null),
    [openedPlaylistId, playlists],
  );

  const playlistDetailSongs = useMemo(() => {
    if (!openedPlaylist) {
      return [];
    }

    return openedPlaylist.songIds
      .map((songId) => songMap.get(songId))
      .filter((song): song is DbSong => Boolean(song));
  }, [openedPlaylist, songMap]);

  const filteredPlaylistDetailSongs = useMemo(() => {
    const keyword = playlistDetailSearchQuery.trim().toLowerCase();
    if (!keyword) {
      return playlistDetailSongs;
    }

    return playlistDetailSongs.filter((song) => {
      const title = song.title.toLowerCase();
      const artist = song.artist.toLowerCase();
      const album = song.album.toLowerCase();
      return title.includes(keyword) || artist.includes(keyword) || album.includes(keyword);
    });
  }, [playlistDetailSearchQuery, playlistDetailSongs]);

  const songMenuSong = useMemo(
    () => (songMenuSongId ? songMap.get(songMenuSongId) ?? null : null),
    [songMap, songMenuSongId],
  );

  const songInfoSong = useMemo(
    () => (songInfoSongId ? songMap.get(songInfoSongId) ?? null : null),
    [songInfoSongId, songMap],
  );

  const songMenuCoverUrl = useMemo(() => {
    if (!songMenuSong) {
      return null;
    }

    if (songMenuSong.coverHash && coverMap[songMenuSong.coverHash]) {
      return coverMap[songMenuSong.coverHash];
    }

    const payload = safeParseJson<StreamInfoPayload>(songMenuSong.streamInfo);
    return payload?.coverUrl ?? null;
  }, [coverMap, songMenuSong]);

  const primaryStreamServer = useMemo(() => streamServers[0] ?? null, [streamServers]);

  const qualityStats = useMemo(() => {
    const total = songs.length;
    const hiRes = songs.filter((song) => Boolean(song.isHr)).length;
    const sqOnly = songs.filter((song) => !song.isHr && song.isSq).length;
    const hiResRatio = total ? hiRes / total : 0;
    const sqRatio = total ? sqOnly / total : 0;

    return {
      total,
      hiRes,
      sqOnly,
      hiResRatio,
      sqRatio,
    };
  }, [songs]);

  const queueSongs = useMemo(
    () => queueSongIds.map((id) => songMap.get(id)).filter((song): song is DbSong => Boolean(song)),
    [queueSongIds, songMap],
  );

  const currentSong = useMemo(
    () => (currentSongId ? songMap.get(currentSongId) ?? null : null),
    [currentSongId, songMap],
  );

  const currentSongCover = useMemo(() => {
    if (!currentSong) {
      return null;
    }

    if (currentSong.coverHash && coverMap[currentSong.coverHash]) {
      return coverMap[currentSong.coverHash];
    }

    const payload = safeParseJson<StreamInfoPayload>(currentSong.streamInfo);
    return payload?.coverUrl ?? null;
  }, [coverMap, currentSong]);

  const currentQueueIndex = useMemo(
    () => queueSongs.findIndex((song) => song.id === currentSongId),
    [currentSongId, queueSongs],
  );

  const parsedLyrics = useMemo(() => parseLrc(currentLyricText), [currentLyricText]);

  const activeLyricIndex = useMemo(() => {
    if (!parsedLyrics.length) {
      return -1;
    }

    let index = -1;
    for (let pointer = 0; pointer < parsedLyrics.length; pointer += 1) {
      if (currentTime >= parsedLyrics[pointer].time) {
        index = pointer;
      } else {
        break;
      }
    }
    return index;
  }, [currentTime, parsedLyrics]);

  useEffect(() => {
    if (!playlists.length) {
      setSelectedPlaylistId(null);
      return;
    }

    setSelectedPlaylistId((previous) => {
      if (previous && playlists.some((playlist) => playlist.id === previous)) {
        return previous;
      }

      return playlists[0].id;
    });
  }, [playlists]);

  useEffect(() => {
    if (!openedPlaylistId) {
      return;
    }

    if (!playlists.some((playlist) => playlist.id === openedPlaylistId)) {
      setOpenedPlaylistId(null);
      setPlaylistDetailSearchMode(false);
      setPlaylistDetailSearchQuery("");
    }
  }, [openedPlaylistId, playlists]);

  useEffect(() => {
    if (page !== "stream-config") {
      return;
    }

    if (primaryStreamServer) {
      setStreamForm({
        serverType: primaryStreamServer.serverType,
        serverName: primaryStreamServer.serverName || resolveStreamTypeLabel(primaryStreamServer.serverType),
        serverUrl: primaryStreamServer.serverUrl,
        username: primaryStreamServer.username,
        password: primaryStreamServer.password,
        accessToken: primaryStreamServer.accessToken ?? "",
        userId: primaryStreamServer.userId ?? "",
      });
      setStreamFormMessage("");
      return;
    }

    setStreamForm((previous) => {
      const fallback = createDefaultStreamForm(previous.serverType);
      return {
        ...fallback,
        serverType: previous.serverType,
        serverName: previous.serverName.trim() || fallback.serverName,
      };
    });
    setStreamFormMessage("");
  }, [page, primaryStreamServer]);

  useEffect(() => {
    if (!songs.length) {
      setQueueSongIds([]);
      setCurrentSongId(null);
      return;
    }

    setQueueSongIds((previous) => {
      const keep = previous.filter((id) => songMap.has(id));
      return keep.length ? keep : songs.map((song) => song.id);
    });

    setCurrentSongId((previous) => (previous && songMap.has(previous) ? previous : songs[0].id));
  }, [songMap, songs]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.muted = muted;
  }, [muted]);

  const findServerBySong = useCallback(
    (song: DbSong): StreamServerConfig | null => {
      const payload = safeParseJson<StreamInfoPayload>(song.streamInfo);
      if (payload?.config) {
        return payload.config;
      }

      if (song.serverId) {
        const server = streamServers.find((item) => item.id === song.serverId);
        if (server) {
          return toStreamConfigFromServer(server);
        }
      }

      return null;
    },
    [streamServers],
  );

  const fetchLyricsForSong = useCallback(
    async (song: DbSong) => {
      if (!isTauriEnv) {
        setCurrentLyricText("");
        setLyricsError("");
        return;
      }

      setLyricsLoading(true);
      setLyricsError("");

      try {
        if (song.sourceType === "stream") {
          const payload = safeParseJson<StreamInfoPayload>(song.streamInfo);
          const config = findServerBySong(song);
          const songId = payload?.songId || song.serverSongId || song.id;

          if (config && songId) {
            const result = await invoke<string | null>("get_stream_lyrics", {
              config,
              songId,
            });

            if (result && result.trim()) {
              setCurrentLyricText(result);
            } else {
              setCurrentLyricText("");
              setLyricsError("暂无歌词");
            }
          } else {
            setCurrentLyricText("");
            setLyricsError("缺少流媒体配置，无法获取歌词");
          }
        } else if (song.filePath) {
          const lyric = await invoke<string | null>("get_lyrics", { filePath: song.filePath });
          if (lyric && lyric.trim()) {
            setCurrentLyricText(lyric);
          } else {
            setCurrentLyricText("");
            setLyricsError("暂无歌词");
          }
        } else {
          setCurrentLyricText("");
          setLyricsError("当前歌曲无可用文件路径");
        }
      } catch (error) {
        setCurrentLyricText("");
        setLyricsError(`歌词加载失败：${parseMessage(error)}`);
      } finally {
        setLyricsLoading(false);
      }
    },
    [findServerBySong, isTauriEnv],
  );

  const resolveSongSrc = useCallback(
    async (song: DbSong) => {
      if (song.sourceType === "stream") {
        const payload = safeParseJson<StreamInfoPayload>(song.streamInfo);
        const config = findServerBySong(song);
        const songId = payload?.songId || song.serverSongId || song.id;
        if (!config || !songId) {
          throw new Error("缺少流媒体配置或歌曲 ID");
        }
        return invoke<string>("get_stream_url", { config, songId });
      }

      if (!song.filePath) {
        throw new Error("歌曲文件路径为空");
      }

      if (isTauriEnv) {
        return convertFileSrc(song.filePath);
      }

      return song.filePath;
    },
    [findServerBySong, isTauriEnv],
  );

  const playSongById = useCallback(
    async (songId: string, autoPlay = true) => {
      const song = songMap.get(songId);
      const audio = audioRef.current;
      if (!song || !audio) {
        return;
      }

      setIsResolvingSong(true);
      setCurrentSongId(song.id);
      setCurrentTime(0);
      setDuration(song.duration || 0);

      try {
        const src = await resolveSongSrc(song);
        if (audio.src !== src) {
          audio.src = src;
        }

        if (autoPlay) {
          await audio.play();
          setIsPlaying(true);
        }

        await fetchLyricsForSong(song);
      } catch (error) {
        setIsPlaying(false);
        setScanMessage(`播放失败：${parseMessage(error)}`);
      } finally {
        setIsResolvingSong(false);
      }
    },
    [fetchLyricsForSong, resolveSongSrc, songMap],
  );

  const playNext = useCallback(async () => {
    if (!queueSongs.length) {
      return;
    }

    const currentIndex = currentQueueIndex >= 0 ? currentQueueIndex : 0;
    const nextIndex = pickNextIndex(queueSongs.length, currentIndex, playMode);
    const nextSong = queueSongs[nextIndex];
    if (nextSong) {
      await playSongById(nextSong.id, true);
    }
  }, [currentQueueIndex, playMode, playSongById, queueSongs]);

  const playPrevious = useCallback(async () => {
    if (!queueSongs.length) {
      return;
    }

    const currentIndex = currentQueueIndex >= 0 ? currentQueueIndex : 0;
    const previousIndex = pickPreviousIndex(queueSongs.length, currentIndex);
    const previousSong = queueSongs[previousIndex];
    if (previousSong) {
      await playSongById(previousSong.id, true);
    }
  }, [currentQueueIndex, playSongById, queueSongs]);

  const togglePlayPause = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (!currentSongId && queueSongs.length) {
      await playSongById(queueSongs[0].id, true);
      return;
    }

    if (audio.paused) {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch (error) {
        setScanMessage(`播放失败：${parseMessage(error)}`);
      }
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, [currentSongId, playSongById, queueSongs]);

  const cyclePlayMode = () => {
    setPlayMode((previous) => {
      if (previous === "sequence") {
        return "shuffle";
      }
      if (previous === "shuffle") {
        return "repeat-one";
      }
      return "sequence";
    });
  };

  const playModeLabel =
    playMode === "sequence" ? "顺序播放" : playMode === "shuffle" ? "随机播放" : "单曲循环";

  const onAudioTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    setCurrentTime(audio.currentTime || 0);
  };

  const onAudioLoadedMetadata = () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    setDuration(audio.duration || 0);
  };

  const onAudioPlay = () => setIsPlaying(true);
  const onAudioPause = () => setIsPlaying(false);

  const onAudioEnded = () => {
    void playNext();
  };

  const seekTo = (time: number) => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.currentTime = time;
    setCurrentTime(time);
  };

  // Suppress unused variable warnings for features temporarily hidden from player bar
  void formatTime; void duration; void seekTo; void cyclePlayMode; void playModeLabel;

  const removeFromQueue = (songId: string) => {
    setQueueSongIds((previous) => previous.filter((id) => id !== songId));
    if (currentSongId === songId) {
      const remained = queueSongs.filter((song) => song.id !== songId);
      if (remained.length) {
        void playSongById(remained[0].id, true);
      } else {
        const audio = audioRef.current;
        if (audio) {
          audio.pause();
          audio.src = "";
        }
        setCurrentSongId(null);
        setIsPlaying(false);
      }
    }
  };

  const clearQueue = () => {
    setQueueSongIds([]);
    setCurrentSongId(null);
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    setIsPlaying(false);
  };


  const go = (next: Page) => {
    setPage(next);
    setPlaylistMenuId(null);
    setSongMenuSongId(null);
    setSongInfoSongId(null);
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const openSongsSearch = () => {
    setSongsSearchMode(true);
  };

  const closeSongsSearch = () => {
    setSongsSearchMode(false);
    setSearchQuery("");
  };

  const openAlbumsSearch = () => {
    setAlbumsSearchMode(true);
    setAlbumsSortDialogOpen(false);
  };

  const closeAlbumsSearch = () => {
    setAlbumsSearchMode(false);
    setAlbumSearchQuery("");
  };

  const openArtistsSearch = () => {
    setArtistsSearchMode(true);
    setArtistsSortDialogOpen(false);
  };

  const closeArtistsSearch = () => {
    setArtistsSearchMode(false);
    setArtistSearchQuery("");
  };

  const openPlaylistsSearch = () => {
    setPlaylistsSearchMode(true);
    setPlaylistsSortDialogOpen(false);
  };

  const closePlaylistsSearch = () => {
    setPlaylistsSearchMode(false);
    setPlaylistSearchQuery("");
  };

  const openPlaylistDetail = (playlistId: string) => {
    setSelectedPlaylistId(playlistId);
    setOpenedPlaylistId(playlistId);
    setPlaylistMenuId(null);
    setPlaylistsSearchMode(false);
    setPlaylistSearchQuery("");
    setPlaylistsSortDialogOpen(false);
    setPlaylistDetailSearchMode(false);
    setPlaylistDetailSearchQuery("");
  };

  const closePlaylistDetail = () => {
    setOpenedPlaylistId(null);
    setPlaylistDetailSearchMode(false);
    setPlaylistDetailSearchQuery("");
    setSongMenuSongId(null);
    setSongInfoSongId(null);
  };

  const openPlaylistDetailSearch = () => {
    setPlaylistDetailSearchMode(true);
  };

  const closePlaylistDetailSearch = () => {
    setPlaylistDetailSearchMode(false);
    setPlaylistDetailSearchQuery("");
  };

  const closeSongMenu = () => {
    setSongMenuSongId(null);
  };

  const openSongMenu = (songId: string) => {
    setSongMenuSongId(songId);
    setSongInfoSongId(null);
    setPlaylistMenuId(null);
  };

  const queueSongAsNext = (songId: string) => {
    setQueueSongIds((previous) => {
      const queueWithoutSong = previous.filter((id) => id !== songId);
      if (!queueWithoutSong.length) {
        return [songId];
      }

      const currentIndex = currentSongId ? queueWithoutSong.indexOf(currentSongId) : -1;
      if (currentIndex < 0) {
        return [songId, ...queueWithoutSong];
      }

      const nextQueue = [...queueWithoutSong];
      nextQueue.splice(currentIndex + 1, 0, songId);
      return nextQueue;
    });

    if (!currentSongId) {
      void playSongById(songId, true);
    }

    closeSongMenu();
  };

  const jumpToSongArtist = (song: DbSong) => {
    setArtistSearchQuery(song.artist);
    setArtistsSearchMode(true);
    closeSongMenu();
    go("artists");
  };

  const jumpToSongAlbum = (song: DbSong) => {
    setAlbumSearchQuery(song.album);
    setAlbumsSearchMode(true);
    closeSongMenu();
    go("albums");
  };

  const openSongInfo = (songId: string) => {
    setSongInfoSongId(songId);
    setSongMenuSongId(null);
  };

  const closeSongInfo = () => {
    setSongInfoSongId(null);
  };

  const deleteSongById = async (songId: string) => {
    if (isTauriEnv) {
      try {
        await invoke<number>("db_delete_songs_by_ids", {
          songIds: [songId],
        });
      } catch (error) {
        setLibraryError(parseMessage(error));
        return;
      }
    }

    setSongs((previous) => previous.filter((song) => song.id !== songId));
    setPlaylists((previous) =>
      previous.map((playlist) => ({
        ...playlist,
        songIds: playlist.songIds.filter((id) => id !== songId),
      })),
    );
    setSelectedSongIds((previous) => previous.filter((id) => id !== songId));

    if (currentSongId === songId) {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.src = "";
      }
      setCurrentSongId(null);
      setIsPlaying(false);
    }

    setSongMenuSongId(null);
    setSongInfoSongId(null);

    if (isTauriEnv) {
      void refreshLibrary();
    }
  };

  const openSongsSelectMode = () => {
    setSongsSortDialogOpen(false);
    setSongsBatchPlaylistDialogOpen(false);
    setSongsBatchCreateMode(false);
    setSongsBatchPlaylistName("");
    setSongsSelectMode(true);
    setSelectedSongIds([]);
  };

  const closeSongsSelectMode = () => {
    setSongsBatchPlaylistDialogOpen(false);
    setSongsBatchCreateMode(false);
    setSongsBatchPlaylistName("");
    setSongsSelectMode(false);
    setSelectedSongIds([]);
  };

  const setSongSelected = (songId: string, checked: boolean) => {
    setSelectedSongIds((previous) => {
      const exists = previous.includes(songId);

      if (checked) {
        return exists ? previous : [...previous, songId];
      }

      return exists ? previous.filter((id) => id !== songId) : previous;
    });
  };

  const toggleSongSelected = (songId: string) => {
    setSelectedSongIds((previous) => {
      if (previous.includes(songId)) {
        return previous.filter((id) => id !== songId);
      }
      return [...previous, songId];
    });
  };

  const toggleSelectAllSongs = () => {
    if (!sortedSongs.length) {
      return;
    }

    const visibleSongIds = sortedSongs.map((song) => song.id);
    const selectedSet = new Set(selectedSongIds);
    const allSelected = visibleSongIds.every((songId) => selectedSet.has(songId));

    if (allSelected) {
      setSelectedSongIds([]);
      return;
    }

    setSelectedSongIds(visibleSongIds);
  };

  const openSongsSortDialog = () => {
    setSongsSortDialogOpen(true);
  };

  const closeSongsSortDialog = () => {
    setSongsSortDialogOpen(false);
  };

  const updateSongsSort = (nextSortKey: SongSortKey) => {
    setSongsSortKey(nextSortKey);
    setSongsSortDialogOpen(false);
  };

  const openAlbumsSortDialog = () => {
    setAlbumsSortDialogOpen(true);
  };

  const closeAlbumsSortDialog = () => {
    setAlbumsSortDialogOpen(false);
  };

  const updateAlbumsSort = (nextSortKey: AlbumSortKey) => {
    setAlbumsSortKey(nextSortKey);
    setAlbumsSortDialogOpen(false);
  };

  const openArtistsSortDialog = () => {
    setArtistsSortDialogOpen(true);
  };

  const closeArtistsSortDialog = () => {
    setArtistsSortDialogOpen(false);
  };

  const updateArtistsSort = (nextSortKey: ArtistSortKey) => {
    setArtistsSortKey(nextSortKey);
    setArtistsSortDialogOpen(false);
  };

  const openPlaylistsSortDialog = () => {
    setPlaylistsSortDialogOpen(true);
  };

  const closePlaylistsSortDialog = () => {
    setPlaylistsSortDialogOpen(false);
  };

  const updatePlaylistsSort = (nextSortKey: PlaylistSortKey) => {
    setPlaylistsSortKey(nextSortKey);
    setPlaylistsSortDialogOpen(false);
  };

  const openSongsBatchPlaylistDialog = () => {
    if (!selectedSongIds.length) {
      return;
    }

    setSongsBatchPlaylistDialogOpen(true);
    setSongsBatchCreateMode(false);
    setSongsBatchPlaylistName("");
  };

  const closeSongsBatchPlaylistDialog = () => {
    setSongsBatchPlaylistDialogOpen(false);
    setSongsBatchCreateMode(false);
    setSongsBatchPlaylistName("");
  };

  const submitSongsBatchCreatePlaylist = () => {
    const trimmed = songsBatchPlaylistName.trim();
    if (!trimmed || !selectedSongsInViewOrder.length) {
      return;
    }

    const nextPlaylist: Playlist = {
      id: `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: trimmed,
      songIds: [],
    };

    const selectedIds = selectedSongsInViewOrder.map((song) => song.id);

    setPlaylists((previous) => [
      {
        ...nextPlaylist,
        songIds: selectedIds,
      },
      ...previous,
    ]);
    setSelectedPlaylistId(nextPlaylist.id);

    closeSongsBatchPlaylistDialog();
  };

  const playSelectedSongs = () => {
    if (!selectedSongsInViewOrder.length) {
      return;
    }

    const selectedIds = selectedSongsInViewOrder.map((song) => song.id);
    setQueueSongIds(selectedIds);
    void playSongById(selectedIds[0], true);
  };

  const deleteSelectedSongs = async () => {
    if (!selectedSongIds.length) {
      return;
    }

    const deletingSongIds = [...selectedSongIds];

    if (isTauriEnv) {
      try {
        await invoke<number>("db_delete_songs_by_ids", {
          songIds: deletingSongIds,
        });
      } catch (error) {
        setLibraryError(parseMessage(error));
        return;
      }
    }

    const deletingSet = new Set(deletingSongIds);

    setSongs((previous) => previous.filter((song) => !deletingSet.has(song.id)));
    setPlaylists((previous) =>
      previous.map((playlist) => ({
        ...playlist,
        songIds: playlist.songIds.filter((songId) => !deletingSet.has(songId)),
      })),
    );
    setSelectedSongIds([]);

    if (isTauriEnv) {
      void refreshLibrary();
    }
  };

  const openCreatePlaylistDialog = () => {
    setDialogMode("create");
    setDialogInput("");
    setEditingPlaylistId(null);
    setPlaylistMenuId(null);
  };

  const openRenamePlaylistDialog = (playlistId: string) => {
    const target = playlists.find((playlist) => playlist.id === playlistId);
    if (!target) {
      return;
    }

    setDialogMode("rename");
    setDialogInput(target.name);
    setEditingPlaylistId(playlistId);
    setPlaylistMenuId(null);
  };

  const closeDialog = () => {
    setDialogMode(null);
    setDialogInput("");
    setEditingPlaylistId(null);
  };

  const submitDialog = () => {
    const trimmed = dialogInput.trim();
    if (!trimmed) {
      return;
    }

    if (dialogMode === "create") {
      const nextPlaylist: Playlist = {
        id: `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: trimmed,
        songIds: [],
      };
      setPlaylists((previous) => [nextPlaylist, ...previous]);
      setSelectedPlaylistId(nextPlaylist.id);
    }

    if (dialogMode === "rename" && editingPlaylistId) {
      setPlaylists((previous) =>
        previous.map((playlist) =>
          playlist.id === editingPlaylistId
            ? {
                ...playlist,
                name: trimmed,
              }
            : playlist,
        ),
      );
    }

    closeDialog();
  };

  const removePlaylist = () => {
    if (!playlistMenuId) {
      return;
    }

    const removedId = playlistMenuId;

    setPlaylists((previous) =>
      previous.filter((playlist) => playlist.id !== playlistMenuId),
    );
    if (selectedPlaylistId === removedId) {
      setSelectedPlaylistId(null);
    }
    if (openedPlaylistId === removedId) {
      closePlaylistDetail();
    }
    setPlaylistMenuId(null);
  };

  const addSongsToPlaylist = (songIds: string[], playlistId?: string | null) => {
    const targetId = playlistId ?? selectedPlaylistId;
    if (!targetId) {
      setScanMessage("请先创建歌单。");
      return false;
    }

    if (!songIds.length) {
      return false;
    }

    setPlaylists((previous) =>
      previous.map((playlist) => {
        if (playlist.id !== targetId) {
          return playlist;
        }

        const existingSongSet = new Set(playlist.songIds);
        const nextSongIds = [...playlist.songIds];

        songIds.forEach((songId) => {
          if (!existingSongSet.has(songId)) {
            existingSongSet.add(songId);
            nextSongIds.push(songId);
          }
        });

        if (nextSongIds.length === playlist.songIds.length) {
          return playlist;
        }

        return {
          ...playlist,
          songIds: nextSongIds,
        };
      }),
    );

    return true;
  };

  const addSongToPlaylist = (songId: string, playlistId?: string | null) => {
    addSongsToPlaylist([songId], playlistId);
  };

  const addSelectedSongsToPlaylist = (playlistId: string) => {
    if (!selectedSongsInViewOrder.length) {
      return;
    }

    const selectedIds = selectedSongsInViewOrder.map((song) => song.id);
    const ok = addSongsToPlaylist(selectedIds, playlistId);
    if (ok) {
      closeSongsBatchPlaylistDialog();
    }
  };

  const openStreamConfigPage = () => {
    setStreamFormMessage("");
    go("stream-config");
  };

  const updateStreamServerType = (serverType: string) => {
    setStreamForm((previous) => {
      const previousLabel = resolveStreamTypeLabel(previous.serverType);
      const nextLabel = resolveStreamTypeLabel(serverType);
      const hasCustomName = previous.serverName.trim() && previous.serverName.trim() !== previousLabel;

      return {
        ...previous,
        serverType,
        serverName: hasCustomName ? previous.serverName : nextLabel,
      };
    });
  };

  const saveStreamServer = async () => {
    if (!isTauriEnv) {
      setStreamFormMessage("浏览器预览模式无法保存流媒体配置。");
      return;
    }

    const payload: StreamServerInput = {
      serverType: streamForm.serverType,
      serverName: streamForm.serverName.trim() || resolveStreamTypeLabel(streamForm.serverType),
      serverUrl: streamForm.serverUrl.trim(),
      username: streamForm.username.trim(),
      password: streamForm.password,
      accessToken: streamForm.accessToken?.trim() || undefined,
      userId: streamForm.userId?.trim() || undefined,
    };

    if (!payload.serverUrl || !payload.username || !payload.password) {
      setStreamFormMessage("请完整填写服务器地址、用户名和密码。");
      return;
    }

    setStreamSaving(true);
    setStreamFormMessage("");
    try {
      await invoke<string>("db_save_stream_server", { config: payload });
      setStreamFormMessage("保存成功。");
      await refreshLibrary();
    } catch (error) {
      setStreamFormMessage(`保存失败：${parseMessage(error)}`);
    } finally {
      setStreamSaving(false);
    }
  };

  const testStreamConnection = async () => {
    if (!isTauriEnv) {
      setStreamFormMessage("浏览器预览模式无法测试连接。");
      return;
    }

    const payload: StreamServerConfig = {
      serverType: streamForm.serverType,
      serverName: streamForm.serverName.trim() || resolveStreamTypeLabel(streamForm.serverType),
      serverUrl: streamForm.serverUrl.trim(),
      username: streamForm.username.trim(),
      password: streamForm.password,
      accessToken: streamForm.accessToken?.trim() || undefined,
      userId: streamForm.userId?.trim() || undefined,
    };

    if (!payload.serverUrl || !payload.username || !payload.password) {
      setStreamFormMessage("测试连接前请先填写地址、用户名和密码。");
      return;
    }

    setStreamTesting(true);
    setStreamFormMessage("");
    try {
      const result = await invoke<ConnectionTestResult>("test_stream_connection", {
        config: payload,
      });
      if (result.success) {
        setStreamFormMessage(`连接成功：${result.message}`);
      } else {
        setStreamFormMessage(`连接失败：${result.message}`);
      }
    } catch (error) {
      setStreamFormMessage(`连接异常：${parseMessage(error)}`);
    } finally {
      setStreamTesting(false);
    }
  };

  const clearStreamConfig = async () => {
    const resetType = streamForm.serverType;

    if (!isTauriEnv) {
      setStreamForm(createDefaultStreamForm(resetType));
      setStreamFormMessage("已清空配置。");
      return;
    }

    setStreamSaving(true);
    setStreamFormMessage("");
    try {
      if (streamServers.length) {
        await Promise.all(
          streamServers.map((server) => invoke<void>("db_delete_stream_server", { serverId: server.id })),
        );
      }

      setStreamForm(createDefaultStreamForm(resetType));
      setStreamFormMessage("已清除配置。");
      await refreshLibrary();
    } catch (error) {
      setStreamFormMessage(`清除失败：${parseMessage(error)}`);
    } finally {
      setStreamSaving(false);
    }
  };

  const addDirectory = async () => {
    if (!isTauriEnv) {
      setScanMessage("当前是浏览器预览模式，请使用桌面端选择目录。");
      return;
    }

    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择音乐文件夹",
      });

      if (typeof selected === "string") {
        setDirectories((previous) =>
          previous.includes(selected) ? previous : [...previous, selected],
        );
      }
    } catch (error) {
      setScanMessage(`选择目录失败：${parseMessage(error)}`);
    }
  };

  const removeDirectory = (path: string) => {
    setDirectories((previous) => previous.filter((directory) => directory !== path));
  };

  const startScan = async () => {
    if (!directories.length) {
      setScanMessage("请先添加至少一个文件夹。");
      return;
    }

    if (!isTauriEnv) {
      setScanMessage("当前是浏览器预览模式，请在桌面端执行扫描。");
      return;
    }

    setScanRunning(true);
    setScanMessage("准备开始扫描...");

    try {
      const config: ScanConfig = {
        id: null,
        directories,
        skipShort: skipShortAudio,
        minDuration,
        lastScanAt: null,
      };

      const options: LocalScanOptions = {
        directories,
        mode: scanMode,
        minDuration: skipShortAudio ? minDuration : 0,
        batchSize: 500,
      };

      const [result] = await Promise.all([
        invoke<ScanResult>("scan_local_to_db", { options }),
        invoke<void>("db_save_scan_config", { config }),
      ]);

      setScanMessage(
        `扫描完成：新增 ${result.added}，更新 ${result.updated}，移除 ${result.removed}，跳过 ${result.skipped}。`,
      );

      await refreshLibrary();
    } catch (error) {
      setScanMessage(`扫描失败：${parseMessage(error)}`);
    } finally {
      setScanRunning(false);
    }
  };

  const cleanupCoverCache = async () => {
    if (!isTauriEnv) {
      return;
    }

    try {
      const cleaned = await invoke<number>("cleanup_orphaned_covers");
      setScanMessage(`已清理 ${cleaned} 个无效封面缓存。`);
      await refreshLibrary();
    } catch (error) {
      setScanMessage(`清理封面缓存失败：${parseMessage(error)}`);
    }
  };

  const cleanupMissingSongs = async () => {
    if (!isTauriEnv) {
      return;
    }

    try {
      const removed = await invoke<number>("cleanup_missing_songs");
      setScanMessage(`已清理 ${removed} 条失效歌曲记录。`);
      await refreshLibrary();
    } catch (error) {
      setScanMessage(`清理失效歌曲失败：${parseMessage(error)}`);
    }
  };

  const clearMusicLibrary = async () => {
    if (!isTauriEnv) {
      return;
    }

    const confirmed =
      typeof window !== "undefined"
        ? window.confirm("该操作会清空音乐库记录和封面缓存，是否继续？")
        : false;

    if (!confirmed) {
      return;
    }

    try {
      const [removedSongs, removedCovers] = await Promise.all([
        invoke<number>("db_clear_all_songs"),
        invoke<number>("clear_cover_cache"),
      ]);
      setScanMessage(`已清空音乐库：删除 ${removedSongs} 首歌曲，清理 ${removedCovers} 张封面。`);
      await refreshLibrary();
    } catch (error) {
      setScanMessage(`清空音乐库失败：${parseMessage(error)}`);
    }
  };

  const isPlaylistDetailView = page === "playlists" && Boolean(openedPlaylist);
  const shouldShowBack = page === "settings-ui" || page === "stream-config" || isPlaylistDetailView;
  const showSongsSearchBar = page === "songs" && songsSearchMode;
  const showAlbumsSearchBar = page === "albums" && albumsSearchMode;
  const showArtistsSearchBar = page === "artists" && artistsSearchMode;
  const showPlaylistsSearchBar = page === "playlists" && !isPlaylistDetailView && playlistsSearchMode;
  const showPlaylistDetailSearchBar = isPlaylistDetailView && playlistDetailSearchMode;
  const showTopSearchBar = showSongsSearchBar
    || showAlbumsSearchBar
    || showArtistsSearchBar
    || showPlaylistsSearchBar
    || showPlaylistDetailSearchBar;
  const isSystemTitlePage = page === "scan"
    || page === "stats"
    || page === "settings"
    || page === "about"
    || page === "settings-ui"
    || page === "stream-config";
  const pageTitleText = isPlaylistDetailView && openedPlaylist ? openedPlaylist.name : PAGE_TITLE[page];

  const openExternalUrl = useCallback(
    async (url: string) => {
      try {
        if (isTauriEnv) {
          await openUrl(url);
        } else if (typeof window !== "undefined") {
          window.open(url, "_blank", "noopener,noreferrer");
        }
      } catch (error) {
        setScanMessage(`打开链接失败：${parseMessage(error)}`);
      }
    },
    [isTauriEnv],
  );

  const minimizeWindow = useCallback(async () => {
    if (!isTauriEnv) {
      return;
    }

    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().minimize();
  }, [isTauriEnv]);

  const toggleMaximizeWindow = useCallback(async () => {
    if (!isTauriEnv) {
      return;
    }

    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().toggleMaximize();
  }, [isTauriEnv]);

  const closeWindow = useCallback(async () => {
    if (!isTauriEnv) {
      if (typeof window !== "undefined") {
        window.close();
      }
      return;
    }

    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().close();
  }, [isTauriEnv]);

  const exitApp = useCallback(async () => {
    if (!isTauriEnv) {
      if (typeof window !== "undefined") {
        window.close();
      }
      return;
    }

    try {
      await invoke("plugin:process|exit", { code: 0 });
      return;
    } catch {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().destroy();
    }
  }, [isTauriEnv]);

  const startWindowDragging = useCallback(async (event: { target: EventTarget | null }) => {
    if (!isTauriEnv || isMobile) {
      return;
    }

    const target = event.target;
    const element =
      target instanceof Element
        ? target
        : target instanceof Node
          ? target.parentElement
          : null;

    if (element?.closest("button, input, textarea, select, a, [data-no-drag='true']")) {
      return;
    }

    if (element?.closest("h1, h2, h3, p, span, small, strong, em, label")) {
      return;
    }

    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().startDragging();
    } catch {
      // ignore drag errors
    }
  }, [isMobile, isTauriEnv]);

  const headerActions = (() => {
    if (page === "songs") {
      if (songsSearchMode) {
        return null;
      }

      return (
        <>
          <button type="button" className="icon-btn" aria-label="搜索" onClick={openSongsSearch}>
            <LineIcon name="search" />
          </button>
          <button type="button" className="icon-btn" aria-label="排序" onClick={openSongsSortDialog}>
            <LineIcon name="more" />
          </button>
        </>
      );
    }

    if (page === "albums") {
      return (
        <>
          <button type="button" className="icon-btn" aria-label="搜索专辑" onClick={openAlbumsSearch}>
            <LineIcon name="search" />
          </button>
          <button type="button" className="icon-btn" aria-label="专辑排序" onClick={openAlbumsSortDialog}>
            <LineIcon name="more" />
          </button>
        </>
      );
    }

    if (page === "artists") {
      return (
        <>
          <button type="button" className="icon-btn" aria-label="搜索艺术家" onClick={openArtistsSearch}>
            <LineIcon name="search" />
          </button>
          <button type="button" className="icon-btn" aria-label="艺术家排序" onClick={openArtistsSortDialog}>
            <LineIcon name="more" />
          </button>
        </>
      );
    }

    if (page === "about") {
      return (
        <button type="button" className="icon-btn" aria-label="更多">
          <LineIcon name="more" />
        </button>
      );
    }

    if (page === "playlists") {
      if (isPlaylistDetailView) {
        return (
          <button type="button" className="icon-btn" aria-label="搜索歌单内歌曲" onClick={openPlaylistDetailSearch}>
            <LineIcon name="search" />
          </button>
        );
      }

      return (
        <>
          <button type="button" className="icon-btn" aria-label="搜索歌单" onClick={openPlaylistsSearch}>
            <LineIcon name="search" />
          </button>
          <button type="button" className="icon-btn" aria-label="歌单排序" onClick={openPlaylistsSortDialog}>
            <LineIcon name="sort" />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="创建歌单"
            onClick={openCreatePlaylistDialog}
          >
            <LineIcon name="add" />
          </button>
        </>
      );
    }

    return null;
  })();

  const renderEmpty = (title: string, actionLabel: string, onAction: () => void) => (
    <section className="empty-state">
      <p className="empty-title">{title}</p>
      <button type="button" className="primary-btn" onClick={onAction}>
        {actionLabel}
      </button>
    </section>
  );

  const renderSongsPage = () => {
    const hasSearchKeyword = Boolean(searchQuery.trim());

    if (songsSearchMode && !hasSearchKeyword) {
      return (
        <section className="songs-search-empty" data-no-drag="true">
          <LineIcon name="search" className="songs-search-empty-icon" />
          <p>输入关键词开始搜索</p>
        </section>
      );
    }

    if (!filteredSongs.length) {
      if (songsSearchMode) {
        return (
          <section className="songs-search-empty" data-no-drag="true">
            <LineIcon name="search" className="songs-search-empty-icon" />
            <p>未找到匹配结果</p>
          </section>
        );
      }

      return renderEmpty("未找到音乐", "扫描音乐", () => go("scan"));
    }

    return (
      <section className="songs-page">
        <div className="songs-toolbar">
          {songsSelectMode ? (
            <div className="songs-select-toolbar" data-no-drag="true">
              <button type="button" className="songs-select-all" onClick={toggleSelectAllSongs}>{allVisibleSongsSelected ? "取消全选" : "全选"}</button>
              <p>已选择 {selectedSongIds.length} 首</p>
              <button type="button" className="songs-select-close" aria-label="退出多选" onClick={closeSongsSelectMode}>×</button>
            </div>
          ) : (
            <>
              <div className="songs-count">
                <span className="songs-count-icon" aria-hidden>
                  <LineIcon name="shuffle" />
                </span>
                <span className="songs-count-main">{filteredSongs.length}</span>
                <small>歌曲</small>
              </div>

              <div className="songs-toolbar-actions">
                <button type="button" className="icon-btn subtle" aria-label="多选" onClick={openSongsSelectMode}>
                  <LineIcon name="edit" />
                </button>
              </div>
            </>
          )}
        </div>

        <div className="songs-layout">
          <ScrollArea.Root className="songs-scroll-root" type="always" scrollHideDelay={0}>
            <ScrollArea.Viewport className="songs-card">
              {sortedSongs.map((song, index) => {
                const coverUrl = song.coverHash ? coverMap[song.coverHash] : undefined;
                const active = !songsSelectMode && song.id === currentSongId;
                const selected = selectedSongIds.includes(song.id);

                return (
                  <article
                    key={song.id}
                    ref={(node) => {
                      if (node) {
                        songRowElementMapRef.current.set(song.id, node);
                      } else {
                        songRowElementMapRef.current.delete(song.id);
                      }
                    }}
                    className={`song-row ${active ? "active" : ""} ${songsSelectMode ? "select-mode" : ""}`}
                    onClick={() => {
                      if (songsSelectMode) {
                        toggleSongSelected(song.id);
                        return;
                      }
                      void playSongById(song.id, true);
                    }}
                    onContextMenu={(event) => {
                      if (songsSelectMode) {
                        return;
                      }
                      event.preventDefault();
                      openSongMenu(song.id);
                    }}
                  >
                    {showCover ? (
                      <div className="song-cover" style={coverUrl ? undefined : createCoverStyle(index)}>
                        {coverUrl ? (
                          <img src={coverUrl} alt={song.title} className="song-cover-image" />
                        ) : null}
                      </div>
                    ) : null}

                    <div className="song-info">
                      <div className="song-title-line">
                        <span className="song-title">{song.title}</span>
                        {song.isHr ? <span className="song-tag hr">HR</span> : null}
                        {song.isSq ? <span className="song-tag sq">SQ</span> : null}
                      </div>
                      <p className="song-subtitle">
                        {song.artist} · {song.album}
                      </p>
                    </div>

                    <div className="song-row-actions">
                      {songsSelectMode ? (
                        <Checkbox.Root
                          className="songs-select-checkbox"
                          checked={selected}
                          aria-label={selected ? "取消选择" : "选择歌曲"}
                          onClick={(event) => event.stopPropagation()}
                          onPointerDown={(event) => event.stopPropagation()}
                          onCheckedChange={(checked) => {
                            setSongSelected(song.id, checked === true);
                          }}
                        >
                          <Checkbox.Indicator className="songs-select-checkmark">
                            <svg viewBox="0 0 12 12" aria-hidden="true">
                              <path d="M2.6 6.4 5.3 9 10.2 4.1" />
                            </svg>
                          </Checkbox.Indicator>
                        </Checkbox.Root>
                      ) : (
                        <button
                          type="button"
                          className="icon-btn subtle"
                          aria-label="歌曲操作"
                          onClick={(event) => {
                            event.stopPropagation();
                            openSongMenu(song.id);
                          }}
                        >
                          <LineIcon name="more" />
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar className="songs-scrollbar" orientation="vertical">
              <ScrollArea.Thumb className="songs-scrollbar-thumb" />
            </ScrollArea.Scrollbar>
            <ScrollArea.Corner className="songs-scrollbar-corner" />
          </ScrollArea.Root>

          {!isMobile ? (
            <>
              <div
                ref={songsAlphabetRailRef}
                className="alphabet-rail interactive"
                data-no-drag="true"
                onPointerDown={handleSongsAlphabetPointerDown}
                onPointerMove={handleSongsAlphabetPointerMove}
                onPointerUp={handleSongsAlphabetPointerUp}
                onPointerCancel={handleSongsAlphabetPointerCancel}
              >
                {ALPHABET_INDEX.map((item) => (
                  <span
                    key={item}
                    ref={(node) => {
                      if (node) {
                        songsAlphabetItemElementMapRef.current.set(item, node);
                      } else {
                        songsAlphabetItemElementMapRef.current.delete(item);
                      }
                    }}
                    className={`alphabet-rail-item ${songsAlphabetActiveLetter === item ? "active" : ""}`}
                  >
                    {item}
                  </span>
                ))}
              </div>

              <div className={`songs-alphabet-toast ${songsAlphabetToastVisible ? "visible" : ""}`} aria-hidden>
                {songsAlphabetActiveLetter ?? "0"}
              </div>
            </>
          ) : null}
        </div>
      </section>
    );
  };

  const renderAlbumsPage = () => {
    const hasSearchKeyword = Boolean(albumSearchQuery.trim());

    if (albumsSearchMode && !hasSearchKeyword) {
      return (
        <section className="songs-search-empty" data-no-drag="true">
          <LineIcon name="search" className="songs-search-empty-icon" />
          <p>输入关键词开始搜索</p>
        </section>
      );
    }

    if (!sortedAlbums.length) {
      if (albumsSearchMode) {
        return (
          <section className="songs-search-empty" data-no-drag="true">
            <LineIcon name="search" className="songs-search-empty-icon" />
            <p>未找到匹配结果</p>
          </section>
        );
      }

      return renderEmpty("尚未扫描音乐", "扫描音乐", () => go("scan"));
    }

    return (
      <section className="cover-grid-page">
        <div className="cover-grid-layout">
          <div className="cover-grid albums-grid">
            {sortedAlbums.map((album, index) => {
              const coverUrl = album.coverHash
                ? coverMap[album.coverHash]
                : album.streamCoverUrl || undefined;

              return (
                <article key={album.id} className="cover-card album-card">
                  <div className="cover-square" style={coverUrl ? undefined : createCoverStyle(index)}>
                    {coverUrl ? <img src={coverUrl} alt={album.name} className="cover-image" /> : null}
                  </div>
                  <h3>{album.name}</h3>
                  <p>{album.artist}</p>
                  <p className="cover-meta">{album.songCount} songs</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    );
  };

  const renderArtistsPage = () => {
    const hasSearchKeyword = Boolean(artistSearchQuery.trim());

    if (artistsSearchMode && !hasSearchKeyword) {
      return (
        <section className="songs-search-empty" data-no-drag="true">
          <LineIcon name="search" className="songs-search-empty-icon" />
          <p>输入关键词开始搜索</p>
        </section>
      );
    }

    if (!sortedArtists.length) {
      if (artistsSearchMode) {
        return (
          <section className="songs-search-empty" data-no-drag="true">
            <LineIcon name="search" className="songs-search-empty-icon" />
            <p>未找到匹配结果</p>
          </section>
        );
      }

      return renderEmpty("尚未扫描音乐", "扫描音乐", () => go("scan"));
    }

    return (
      <section className="cover-grid-page">
        <div className="cover-grid-layout">
          <div className="cover-grid">
            {sortedArtists.map((artist, index) => {
              const coverUrl = artist.coverHash
                ? coverMap[artist.coverHash]
                : artist.streamCoverUrl || undefined;

              return (
                <article key={artist.id} className="cover-card artist-card">
                  <div
                    className="cover-square artist-avatar"
                    style={coverUrl ? undefined : createCoverStyle(index)}
                  >
                    {coverUrl ? <img src={coverUrl} alt={artist.name} className="cover-image artist-image" /> : null}
                  </div>
                  <h3>{artist.name}</h3>
                  <p>{artist.songCount} 首歌曲</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    );
  };

  const renderPlaylistsPage = () => {
    if (isPlaylistDetailView && openedPlaylist) {
      const hasSearchKeyword = Boolean(playlistDetailSearchQuery.trim());

      if (playlistDetailSearchMode && !hasSearchKeyword) {
        return (
          <section className="songs-search-empty" data-no-drag="true">
            <LineIcon name="search" className="songs-search-empty-icon" />
            <p>输入关键词开始搜索</p>
          </section>
        );
      }

      if (!filteredPlaylistDetailSongs.length) {
        if (playlistDetailSearchMode) {
          return (
            <section className="songs-search-empty" data-no-drag="true">
              <LineIcon name="search" className="songs-search-empty-icon" />
              <p>未找到匹配结果</p>
            </section>
          );
        }

        return (
          <section className="songs-search-empty" data-no-drag="true">
            <LineIcon name="playlists" className="songs-search-empty-icon" />
            <p>当前歌单还没有歌曲</p>
          </section>
        );
      }

      return (
        <section className="songs-page playlist-detail-page">
          <div className="songs-layout">
            <ScrollArea.Root className="songs-scroll-root" type="always" scrollHideDelay={0}>
              <ScrollArea.Viewport className="songs-card">
                {filteredPlaylistDetailSongs.map((song, index) => {
                  const coverUrl = song.coverHash ? coverMap[song.coverHash] : undefined;
                  const active = song.id === currentSongId;

                  return (
                    <article
                      key={`${openedPlaylist.id}-${song.id}`}
                      className={`song-row ${active ? "active" : ""}`}
                      onClick={() => {
                        void playSongById(song.id, true);
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        openSongMenu(song.id);
                      }}
                    >
                      {showCover ? (
                        <div className="song-cover" style={coverUrl ? undefined : createCoverStyle(index)}>
                          {coverUrl ? (
                            <img src={coverUrl} alt={song.title} className="song-cover-image" />
                          ) : null}
                        </div>
                      ) : null}

                      <div className="song-info">
                        <div className="song-title-line">
                          <span className="song-title">{song.title}</span>
                          {song.isHr ? <span className="song-tag hr">HR</span> : null}
                          {song.isSq ? <span className="song-tag sq">SQ</span> : null}
                        </div>
                        <p className="song-subtitle">
                          {song.artist} · {song.album}
                        </p>
                      </div>

                      <div className="song-row-actions">
                        <button
                          type="button"
                          className="icon-btn subtle"
                          aria-label="歌曲操作"
                          onClick={(event) => {
                            event.stopPropagation();
                            openSongMenu(song.id);
                          }}
                        >
                          <LineIcon name="more" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </ScrollArea.Viewport>
              <ScrollArea.Scrollbar className="songs-scrollbar" orientation="vertical">
                <ScrollArea.Thumb className="songs-scrollbar-thumb" />
              </ScrollArea.Scrollbar>
              <ScrollArea.Corner className="songs-scrollbar-corner" />
            </ScrollArea.Root>
          </div>
        </section>
      );
    }

    const hasSearchKeyword = Boolean(playlistSearchQuery.trim());

    if (playlistsSearchMode && !hasSearchKeyword) {
      return (
        <section className="songs-search-empty" data-no-drag="true">
          <LineIcon name="search" className="songs-search-empty-icon" />
          <p>输入关键词开始搜索</p>
        </section>
      );
    }

    if (!sortedPlaylists.length) {
      if (playlistsSearchMode) {
        return (
          <section className="songs-search-empty" data-no-drag="true">
            <LineIcon name="search" className="songs-search-empty-icon" />
            <p>未找到匹配结果</p>
          </section>
        );
      }

      return renderEmpty("暂无歌单", "创建歌单", openCreatePlaylistDialog);
    }

    return (
      <section className="playlist-page">
        {sortedPlaylists.map((playlist) => {
          const active = playlist.id === selectedPlaylistId;

          return (
            <article
              key={playlist.id}
              className={`playlist-card ${active ? "active" : ""}`}
              onContextMenu={(event) => {
                event.preventDefault();
                setSelectedPlaylistId(playlist.id);
                setPlaylistMenuId(playlist.id);
              }}
            >
            <button
              type="button"
              className="playlist-main"
              onClick={() => openPlaylistDetail(playlist.id)}
            >
              <h3>{playlist.name}</h3>
              <p>{playlist.songIds.length} 首歌曲</p>
            </button>

            <button
              type="button"
              className="icon-btn subtle"
              aria-label={`操作 ${playlist.name}`}
              onClick={(event) => {
                event.stopPropagation();
                setSelectedPlaylistId(playlist.id);
                setPlaylistMenuId(playlist.id);
              }}
            >
              <LineIcon name="more" />
            </button>
          </article>
          );
        })}
      </section>
    );
  };

  const renderScanPage = () => (
    <section className="scan-page">
      <div className="scan-panel compact scan-panel-modern">
        <article className="scan-card scan-folder-card">
          <div className="scan-card-head scan-folder-head">
            <div className="scan-icon-box scan-folder-icon-box"><LineIcon name="folder" /></div>
            <div>
              <h3>本地文件夹</h3>
              <p>选择文件夹...</p>
            </div>
          </div>

          {directories.length ? <p className="directory-label">SELECTED</p> : null}

          {directories.length ? (
            <div className="directory-list">
              {directories.map((directory) => (
                <div key={directory} className="directory-item">
                  <span title={directory}>{directory}</span>
                  <button
                    type="button"
                    className="directory-remove-btn"
                    onClick={() => removeDirectory(directory)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <button type="button" className="scan-add-btn" onClick={addDirectory}>
            <LineIcon name="folder" />
            <span>Add Folder</span>
          </button>
        </article>

        <article className="scan-card scan-row scan-stream-row">
          <div className="scan-row-left">
            <div className="scan-icon-box purple"><LineIcon name="scan" /></div>
            <div>
              <h3>流媒体配置</h3>
              <p>{primaryStreamServer ? primaryStreamServer.serverName : "未配置"}</p>
            </div>
          </div>

          <button type="button" className="scan-config-btn" onClick={openStreamConfigPage}>
            配置
          </button>
        </article>

        <article className="scan-card scan-row">
          <div>
            <h3>跳过短音频</h3>
            <p>最短时长 {minDuration} 秒</p>
          </div>

          <button
            type="button"
            className={`switch ${skipShortAudio ? "on" : ""}`}
            onClick={() => setSkipShortAudio((previous) => !previous)}
          >
            <span />
          </button>
        </article>

        <button
          type="button"
          className="primary-btn full scan-start-btn"
          onClick={startScan}
          disabled={scanRunning}
        >
          {scanRunning ? "扫描中..." : "开始扫描"}
        </button>

        {scanMessage ? <p className="status-text">{scanMessage}</p> : null}
      </div>
    </section>
  );

  const renderStreamConfigPage = () => {
    const canTest = Boolean(streamForm.serverUrl.trim() && streamForm.username.trim() && streamForm.password);

    return (
      <section className="stream-config-page">
        <div className="stream-config-shell" data-no-drag="true">
          <article className="stream-config-card">
            <label className="stream-config-field">
              <span>服务器类型</span>
              <Select.Root
                value={streamForm.serverType}
                onValueChange={updateStreamServerType}
              >
                <Select.Trigger className="stream-type-trigger" aria-label="服务器类型">
                  <Select.Value />
                  <Select.Icon className="stream-type-trigger-icon" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="stream-type-content" position="popper" sideOffset={6}>
                    <Select.Viewport className="stream-type-viewport">
                      {STREAM_SERVER_TYPE_OPTIONS.map((option) => (
                        <Select.Item key={option.value} value={option.value} className="stream-type-item">
                          <Select.ItemText>{option.label}</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </label>

            <label className="stream-config-field">
              <span>服务器名称 (选填)</span>
              <input
                value={streamForm.serverName}
                onChange={(event) => setStreamForm((previous) => ({ ...previous, serverName: event.target.value }))}
                placeholder={resolveStreamTypeLabel(streamForm.serverType)}
              />
            </label>

            <label className="stream-config-field">
              <span>服务器地址</span>
              <input
                value={streamForm.serverUrl}
                onChange={(event) => setStreamForm((previous) => ({ ...previous, serverUrl: event.target.value }))}
                placeholder="https://music.example.com"
              />
            </label>

            <label className="stream-config-field">
              <span>用户名</span>
              <input
                value={streamForm.username}
                onChange={(event) => setStreamForm((previous) => ({ ...previous, username: event.target.value }))}
                placeholder="Username"
              />
            </label>

            <label className="stream-config-field">
              <span>密码</span>
              <input
                type="password"
                value={streamForm.password}
                onChange={(event) => setStreamForm((previous) => ({ ...previous, password: event.target.value }))}
                placeholder="Password"
              />
            </label>

            <button
              type="button"
              className="stream-config-test-btn"
              disabled={!canTest || streamTesting || streamSaving}
              onClick={() => {
                void testStreamConnection();
              }}
            >
              {streamTesting ? "测试中" : "测试连接"}
            </button>
          </article>

          <div className="stream-config-actions-row">
            <button
              type="button"
              className="stream-config-clear-btn"
              onClick={() => {
                void clearStreamConfig();
              }}
              disabled={streamSaving || streamTesting}
            >
              <LineIcon name="trash" />
              <span>清除配置</span>
            </button>
            <button
              type="button"
              className="stream-config-save-btn"
              onClick={() => {
                void saveStreamServer();
              }}
              disabled={streamSaving || streamTesting}
            >
              {streamSaving ? "保存中" : "保存"}
            </button>
          </div>

          {streamFormMessage ? <p className="status-text stream-config-status">{streamFormMessage}</p> : null}
        </div>
      </section>
    );
  };

  const renderStatsPage = () => (
    <section className="stats-page rich">
      <div className="stats-layout">
        <article className="stats-main-card quality-card">
          <h3>音质分布</h3>

          <div className="quality-donut-wrap">
            <div className="quality-donut">
              <QualityDistributionDonut hiResCount={qualityStats.hiRes} sqCount={qualityStats.sqOnly} />
              <div className="quality-donut-hole" />
            </div>
          </div>

          <div className="quality-legend">
            <motion.span
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.8 }}
            >
              <i className="dot purple" />Hi-Res
            </motion.span>
            <motion.span
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.8 }}
            >
              <i className="dot green" />SQ
            </motion.span>
          </div>
        </article>

        <div className="stats-side">
          <motion.article
            className="stats-side-card"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <p><i className="dot purple" />Hi-Res</p>
            <strong>{qualityStats.hiRes}</strong>
            <small>歌曲</small>
          </motion.article>

          <motion.article
            className="stats-side-card"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <p><i className="dot green" />SQ</p>
            <strong>{qualityStats.sqOnly}</strong>
            <small>歌曲</small>
          </motion.article>

          <motion.article
            className="stats-side-card total"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.9, ease: [0.22, 1, 0.36, 1] }}
          >
            <p>音乐库总计</p>
            <strong>{stats.totalSongs}</strong>
          </motion.article>
        </div>
      </div>
    </section>
  );

  const renderSettingsPage = () => (
    <section className="settings-page">
      <article className="settings-card settings-shortcuts">
        <button type="button" className="settings-item rich" onClick={() => go("settings-ui")}>
          <span className="settings-icon blue">🖥</span>
          <span className="settings-item-main"><strong>用户界面</strong></span>
          <span>›</span>
        </button>
        <button
          type="button"
          className="settings-item rich"
          onClick={() => {
            void openExternalUrl("https://github.com/CallmeLins/BaYin/issues");
          }}
        >
          <span className="settings-icon purple">?</span>
          <span className="settings-item-main"><strong>帮助与反馈</strong></span>
          <span>›</span>
        </button>
        <button
          type="button"
          className="settings-item rich"
          onClick={() => {
            void openExternalUrl("https://github.com/CallmeLins/BaYin/releases");
          }}
        >
          <span className="settings-icon green">↓</span>
          <span className="settings-item-main"><strong>软件更新</strong></span>
          <span>›</span>
        </button>
      </article>

      <article className="settings-card settings-manage-card">
        <div className="settings-head with-icon">
          <span className="settings-icon orange">◍</span>
          <div>
            <h3>音乐库管理</h3>
            <p>Manage your music database and cache</p>
          </div>
        </div>

        <div className="settings-stats-row">
          <div className="chip blue">
            <em>♫</em>
            <strong>{stats.totalSongs}</strong>
            <span>歌曲</span>
          </div>
          <div className="chip green">
            <em>◎</em>
            <strong>{stats.totalAlbums}</strong>
            <span>专辑</span>
          </div>
          <div className="chip purple">
            <em>◉</em>
            <strong>{stats.totalArtists}</strong>
            <span>艺术家</span>
          </div>
        </div>

        <p className="settings-meta-line">
          Local: {stats.localSongs} &nbsp; Stream: {stats.streamSongs} &nbsp; Covers: {coverStats.fileCount}
          &nbsp;({coverStats.totalSizeMb.toFixed(1)} MB)
        </p>

        <button type="button" className="settings-item rich" onClick={cleanupCoverCache}>
          <span className="settings-icon gray">⌧</span>
          <span className="settings-item-main">
            <strong>清理封面缓存</strong>
            <small>Remove orphaned cover images</small>
          </span>
          <span>›</span>
        </button>

        <button type="button" className="settings-item rich" onClick={cleanupMissingSongs}>
          <span className="settings-icon gray">🗑</span>
          <span className="settings-item-main">
            <strong>清理失效歌曲</strong>
            <small>Remove entries for deleted files</small>
          </span>
          <span>›</span>
        </button>

        <button type="button" className="settings-item rich danger" onClick={() => { void clearMusicLibrary(); }}>
          <span className="settings-icon red">⚠</span>
          <span className="settings-item-main">
            <strong>清空音乐库</strong>
            <small>Remove all songs and cache</small>
          </span>
          <span>›</span>
        </button>
      </article>

      <div className="refresh-line">
        <button
          type="button"
          className="text-btn"
          onClick={() => {
            void refreshLibrary();
          }}
          disabled={isRefreshing}
        >
          {isRefreshing ? "刷新中..." : "刷新数据"}
        </button>
      </div>
    </section>
  );

  const renderSettingsUiPage = () => (
    <section className="settings-ui-page">
      <article className="settings-card padded">
        <p className="block-title">语言</p>
        <div className="segment two">
          {["中文", "English"].map((item) => (
            <button
              key={item}
              type="button"
              className={language === item ? "active" : ""}
              onClick={() => setLanguage(item as Language)}
            >
              {item}
            </button>
          ))}
        </div>
      </article>

      <article className="settings-card padded">
        <p className="block-title">歌词显示</p>
        <div className="setting-line">
          <span>字体大小</span>
          <span>{lyricSize}px</span>
        </div>
        <input
          type="range"
          min={12}
          max={30}
          value={lyricSize}
          onChange={(event) => setLyricSize(Number(event.target.value))}
        />

        <div className="setting-line with-gap">
          <span>歌词居中</span>
          <button
            type="button"
            className={`switch ${lyricCentered ? "on" : ""}`}
            onClick={() => setLyricCentered((previous) => !previous)}
          >
            <span />
          </button>
        </div>

        <p className="sub-title">字体粗细</p>
        <div className="segment three">
          {["Normal", "Medium", "Bold"].map((item) => (
            <button
              key={item}
              type="button"
              className={fontWeight === item ? "active" : ""}
              onClick={() => setFontWeight(item as FontWeightOption)}
            >
              {item}
            </button>
          ))}
        </div>
      </article>

      <article className="settings-card padded">
        <p className="block-title">列表</p>
        <div className="setting-line">
          <span>显示封面</span>
          <button
            type="button"
            className={`switch ${showCover ? "on" : ""}`}
            onClick={() => setShowCover((previous) => !previous)}
          >
            <span />
          </button>
        </div>
      </article>
    </section>
  );

  const renderAboutPage = () => (
    <section className="about-page about-page-centered">
      <div className="about-hero">
        <img src="/app-icon.png" alt="BaYin" className="about-logo" />
        <h2>BaYin</h2>
        <p>版本 1.1.6</p>
      </div>

      <article className="settings-card about-links-card">
        {ABOUT_LINKS.map((item) => {
          const meta = ABOUT_ICON_META[item] ?? { icon: "•", tone: "gray" };

          return (
            <button
              key={item}
              type="button"
              className="settings-item rich about-link-row"
              onClick={() => {
                const url = ABOUT_URLS[item];
                if (url) {
                  void openExternalUrl(url);
                }
              }}
            >
              <span className={`settings-icon ${meta.tone}`}>{meta.icon}</span>
              <span className="settings-item-main"><strong>{item}</strong></span>
              <span>›</span>
            </button>
          );
        })}
      </article>

      <p className="about-copyright">© 2024 BaYin Music. All rights reserved.</p>
    </section>
  );

  const pageContent = (() => {
    if (page === "songs") {
      return renderSongsPage();
    }
    if (page === "albums") {
      return renderAlbumsPage();
    }
    if (page === "artists") {
      return renderArtistsPage();
    }
    if (page === "playlists") {
      return renderPlaylistsPage();
    }
    if (page === "scan") {
      return renderScanPage();
    }
    if (page === "stream-config") {
      return renderStreamConfigPage();
    }
    if (page === "stats") {
      return renderStatsPage();
    }
    if (page === "settings") {
      return renderSettingsPage();
    }
    if (page === "settings-ui") {
      return renderSettingsUiPage();
    }

    return renderAboutPage();
  })();

  return (
    <div className={`app-shell ${theme === "dark" ? "theme-dark" : "theme-light"}`}>
      <aside className={`sidebar ${isMobile ? "mobile" : ""} ${isMobile && sidebarOpen ? "open" : ""}`} onMouseDown={(event) => { void startWindowDragging(event); }}>
        <div className="sidebar-top-actions">
          <button
            type="button"
            className="icon-btn subtle sidebar-top-btn"
            aria-label="主题"
            title={theme === "dark" ? "切换浅色" : "切换深色"}
            onClick={() => setTheme((previous) => (previous === "dark" ? "light" : "dark"))}
          >
            {theme === "dark" ? (
              <svg className="sidebar-top-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
              </svg>
            ) : (
              <svg className="sidebar-top-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="icon-btn subtle sidebar-top-btn"
            aria-label="退出软件"
            title="退出软件"
            onClick={() => {
              void exitApp();
            }}
          >
            <svg className="sidebar-top-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /></svg>
          </button>
        </div>

        <div className="sidebar-section">
          <p className="sidebar-title">音乐库</p>
          {NAV_LIBRARY.map((item) => (
            <button
              key={item.page}
              type="button"
              className={`sidebar-item ${page === item.page ? "active" : ""}`}
              onClick={() => go(item.page)}
            >
              <span className="sidebar-item-icon"><LineIcon name={item.icon} /></span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-section gap">
          <p className="sidebar-title">系统</p>
          {NAV_SYSTEM.map((item) => {
            const isActive =
              page === item.page
              || (item.page === "settings" && page === "settings-ui")
              || (item.page === "scan" && page === "stream-config");

            return (
              <button
                key={item.page}
                type="button"
                className={`sidebar-item ${isActive ? "active" : ""}`}
                onClick={() => go(item.page)}
              >
                <span className="sidebar-item-icon"><LineIcon name={item.icon} /></span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </aside>

      {isMobile && sidebarOpen ? (
        <button
          type="button"
          className="sidebar-mask"
          onClick={() => setSidebarOpen(false)}
          aria-label="关闭侧栏"
        />
      ) : null}

      <div className="main-shell">
        <header className="topbar">
          <div className="window-drag-strip" onMouseDown={(event) => { void startWindowDragging(event); }}>
            <div className="window-drag-fill" />
            {isTauriEnv ? (
              <div className="window-controls" data-no-drag="true">
                <button type="button" className="window-btn" aria-label="最小化" onClick={() => { void minimizeWindow(); }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden><line x1="1" y1="6" x2="11" y2="6" /></svg>
                </button>
                <button type="button" className="window-btn" aria-label="最大化" onClick={() => { void toggleMaximizeWindow(); }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden><rect x="1.5" y="1.5" width="9" height="9" rx="0.5" /></svg>
                </button>
                <button type="button" className="window-btn close" aria-label="关闭" onClick={() => { void closeWindow(); }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden><line x1="2" y1="2" x2="10" y2="10" /><line x1="10" y1="2" x2="2" y2="10" /></svg>
                </button>
              </div>
            ) : null}
          </div>

          <div className={`topbar-main ${showTopSearchBar ? "searching" : ""}`}>
            {showSongsSearchBar ? (
              <div className="songs-search-topbar" data-no-drag="true">
                <label className="songs-search-field">
                  <LineIcon name="search" />
                  <input
                    ref={searchInputRef}
                    className="songs-search-input"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        closeSongsSearch();
                      }
                    }}
                    placeholder="搜索歌曲、艺术家、专辑"
                  />
                </label>
                <button type="button" className="songs-search-cancel" onClick={closeSongsSearch}>
                  取消
                </button>
              </div>
            ) : showAlbumsSearchBar ? (
              <div className="songs-search-topbar" data-no-drag="true">
                <label className="songs-search-field">
                  <LineIcon name="search" />
                  <input
                    ref={searchInputRef}
                    className="songs-search-input"
                    value={albumSearchQuery}
                    onChange={(event) => setAlbumSearchQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        closeAlbumsSearch();
                      }
                    }}
                    placeholder="搜索专辑、艺术家"
                  />
                </label>
                <button type="button" className="songs-search-cancel" onClick={closeAlbumsSearch}>
                  取消
                </button>
              </div>
            ) : showArtistsSearchBar ? (
              <div className="songs-search-topbar" data-no-drag="true">
                <label className="songs-search-field">
                  <LineIcon name="search" />
                  <input
                    ref={searchInputRef}
                    className="songs-search-input"
                    value={artistSearchQuery}
                    onChange={(event) => setArtistSearchQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        closeArtistsSearch();
                      }
                    }}
                    placeholder="搜索艺术家"
                  />
                </label>
                <button type="button" className="songs-search-cancel" onClick={closeArtistsSearch}>
                  取消
                </button>
              </div>
            ) : showPlaylistsSearchBar ? (
              <div className="songs-search-topbar" data-no-drag="true">
                <label className="songs-search-field">
                  <LineIcon name="search" />
                  <input
                    ref={searchInputRef}
                    className="songs-search-input"
                    value={playlistSearchQuery}
                    onChange={(event) => setPlaylistSearchQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        closePlaylistsSearch();
                      }
                    }}
                    placeholder="搜索歌单"
                  />
                </label>
                <button type="button" className="songs-search-cancel" onClick={closePlaylistsSearch}>
                  取消
                </button>
              </div>
            ) : showPlaylistDetailSearchBar ? (
              <div className="songs-search-topbar" data-no-drag="true">
                <label className="songs-search-field">
                  <LineIcon name="search" />
                  <input
                    ref={searchInputRef}
                    className="songs-search-input"
                    value={playlistDetailSearchQuery}
                    onChange={(event) => setPlaylistDetailSearchQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        closePlaylistDetailSearch();
                      }
                    }}
                    placeholder="搜索歌单内歌曲"
                  />
                </label>
                <button type="button" className="songs-search-cancel" onClick={closePlaylistDetailSearch}>
                  取消
                </button>
              </div>
            ) : (
              <>
                <div className="topbar-left">
                  {shouldShowBack ? (
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => {
                        if (isPlaylistDetailView) {
                          closePlaylistDetail();
                          return;
                        }
                        if (page === "stream-config") {
                          go("scan");
                          return;
                        }
                        go("settings");
                      }}
                    >
                      <LineIcon name="back" />
                    </button>
                  ) : null}

                  {!shouldShowBack && isMobile ? (
                    <button type="button" className="icon-btn" onClick={() => setSidebarOpen(true)}>
                      <LineIcon name="menu" />
                    </button>
                  ) : null}

                  <h1 className={`page-title ${page === "songs" || page === "albums" || page === "artists" || page === "playlists" ? "songs-title" : ""} ${isSystemTitlePage ? "system-title" : ""}`}>{pageTitleText}</h1>
                </div>

                <div className="page-header-actions" data-no-drag="true">{headerActions}</div>
              </>
            )}
          </div>
        </header>

        {libraryError ? (
          <div className="error-strip">数据加载失败：{libraryError}</div>
        ) : null}

        <main className="page-body">{pageContent}</main>

        {page === "songs" && songsSelectMode ? (
          <div className="songs-select-floating-actions" data-no-drag="true">
            <button
              type="button"
              className="songs-select-fab-btn"
              aria-label="播放已选歌曲"
              onClick={playSelectedSongs}
              disabled={!selectedSongIds.length}
            >
              <LineIcon name="play" />
            </button>
            <button
              type="button"
              className="songs-select-fab-btn"
              aria-label="添加到歌单"
              onClick={openSongsBatchPlaylistDialog}
              disabled={!selectedSongIds.length}
            >
              <LineIcon name="playlist-add" />
            </button>
            <button
              type="button"
              className="songs-select-fab-btn danger"
              aria-label="删除已选歌曲"
              onClick={() => { void deleteSelectedSongs(); }}
              disabled={!selectedSongIds.length}
            >
              <LineIcon name="trash" />
            </button>
          </div>
        ) : null}

        <footer className="player-bar">
          <div className="player-left">
            <div className="player-cover-placeholder">
              {currentSongCover ? (
                <img src={currentSongCover} alt={currentSong?.title || "cover"} className="song-cover-image" />
              ) : currentSong ? (
                <LineIcon name="songs" />
              ) : (
                <LineIcon name="songs" />
              )}
            </div>
            <div>
              <p className="player-title">{currentSong?.title || "未在播放"}</p>
              <p className="player-subtitle">{currentSong ? `${currentSong.artist} · ${currentSong.album}` : "选择一首歌曲"}</p>
            </div>
          </div>

          <div className="player-center-wrap">
            <div className="player-center">
              <button type="button" className="icon-btn subtle" aria-label="上一首" onClick={() => { void playPrevious(); }}><LineIcon name="prev" /></button>
              <button type="button" className="play-main-btn" aria-label={isPlaying ? "暂停" : "播放"} onClick={() => { void togglePlayPause(); }} disabled={isResolvingSong}>{isPlaying ? <LineIcon name="pause" /> : <LineIcon name="play" />}</button>
              <button type="button" className="icon-btn subtle" aria-label="下一首" onClick={() => { void playNext(); }}><LineIcon name="next" /></button>
            </div>
          </div>

          <div className="player-right">
            <button type="button" className="icon-btn subtle" aria-label="队列" onClick={() => setShowQueuePanel((previous) => !previous)}><LineIcon name="queue" /></button>
            <input
              type="range"
              className="volume-slider"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              style={{ '--vol-pct': `${(muted ? 0 : volume) * 100}%` } as CSSProperties}
              onChange={(event) => {
                const next = Number(event.target.value);
                setVolume(next);
                setMuted(next <= 0.001);
              }}
            />
            <button type="button" className="icon-btn subtle" aria-label="静音" onClick={() => setMuted((previous) => !previous)}>{muted ? <LineIcon name="volume-mute" /> : <LineIcon name="volume" />}</button>
          </div>
        </footer>
      </div>

      <audio
        ref={audioRef}
        preload="metadata"
        onLoadedMetadata={onAudioLoadedMetadata}
        onTimeUpdate={onAudioTimeUpdate}
        onPlay={onAudioPlay}
        onPause={onAudioPause}
        onEnded={onAudioEnded}
      />

      {showQueuePanel ? (
        <section className="floating-panel queue-panel">
          <div className="floating-panel-head">
            <h3>播放队列</h3>
            <div>
              <button type="button" className="text-btn" onClick={clearQueue}>清空</button>
              <button type="button" className="icon-btn subtle" onClick={() => setShowQueuePanel(false)}>×</button>
            </div>
          </div>

          <div className="floating-panel-body">
            {queueSongs.length ? (
              queueSongs.map((song) => (
                <div key={`queue-${song.id}`} className={`queue-row ${song.id === currentSongId ? "active" : ""}`}>
                  <button
                    type="button"
                    className="queue-main"
                    onClick={() => { void playSongById(song.id, true); }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      openSongMenu(song.id);
                    }}
                  >
                    <span>{song.title}</span>
                    <small>{song.artist}</small>
                  </button>
                  <button type="button" className="icon-btn subtle" onClick={() => removeFromQueue(song.id)}>×</button>
                </div>
              ))
            ) : (
              <p className="floating-empty">队列为空</p>
            )}
          </div>
        </section>
      ) : null}

      {showLyricsPanel ? (
        <section className="floating-panel lyrics-panel">
          <div className="floating-panel-head">
            <h3>歌词</h3>
            <button type="button" className="icon-btn subtle" onClick={() => setShowLyricsPanel(false)}>×</button>
          </div>

          <div className="floating-panel-body lyrics-body" style={{ fontSize: `${lyricSize}px`, textAlign: lyricCentered ? "center" : "left", fontWeight: fontWeight === "Bold" ? 700 : fontWeight === "Medium" ? 500 : 400 }}>
            {lyricsLoading ? <p className="floating-empty">歌词加载中...</p> : null}
            {!lyricsLoading && lyricsError ? <p className="floating-empty">{lyricsError}</p> : null}
            {!lyricsLoading && !lyricsError && parsedLyrics.length ? (
              parsedLyrics.map((line, index) => (
                <p key={`${line.time}-${line.text}-${index}`} className={`lyric-line ${index === activeLyricIndex ? "active" : ""}`}>
                  {line.text || "♪"}
                </p>
              ))
            ) : null}
            {!lyricsLoading && !lyricsError && !parsedLyrics.length && currentLyricText ? (
              <pre className="raw-lyric">{currentLyricText}</pre>
            ) : null}
            {!lyricsLoading && !lyricsError && !parsedLyrics.length && !currentLyricText ? (
              <p className="floating-empty">暂无歌词</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {songsSortDialogOpen ? (
        <div className="overlay" onClick={closeSongsSortDialog}>
          <section className="songs-sort-dialog" data-no-drag="true" onClick={(event) => event.stopPropagation()}>
            <h3>排序</h3>
            {SONG_SORT_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                className={`songs-sort-option ${songsSortKey === option.key ? "active" : ""}`}
                onClick={() => updateSongsSort(option.key)}
              >
                {option.label}
              </button>
            ))}
          </section>
        </div>
      ) : null}

      {albumsSortDialogOpen ? (
        <div className="overlay" onClick={closeAlbumsSortDialog}>
          <section className="songs-sort-dialog" data-no-drag="true" onClick={(event) => event.stopPropagation()}>
            <h3>排序</h3>
            {ALBUM_SORT_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                className={`songs-sort-option ${albumsSortKey === option.key ? "active" : ""}`}
                onClick={() => updateAlbumsSort(option.key)}
              >
                {option.label}
              </button>
            ))}
          </section>
        </div>
      ) : null}

      {artistsSortDialogOpen ? (
        <div className="overlay" onClick={closeArtistsSortDialog}>
          <section className="songs-sort-dialog" data-no-drag="true" onClick={(event) => event.stopPropagation()}>
            <h3>排序</h3>
            {ARTIST_SORT_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                className={`songs-sort-option ${artistsSortKey === option.key ? "active" : ""}`}
                onClick={() => updateArtistsSort(option.key)}
              >
                {option.label}
              </button>
            ))}
          </section>
        </div>
      ) : null}

      {playlistsSortDialogOpen ? (
        <div className="overlay" onClick={closePlaylistsSortDialog}>
          <section className="songs-sort-dialog" data-no-drag="true" onClick={(event) => event.stopPropagation()}>
            <h3>排序</h3>
            {PLAYLIST_SORT_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                className={`songs-sort-option ${playlistsSortKey === option.key ? "active" : ""}`}
                onClick={() => updatePlaylistsSort(option.key)}
              >
                {option.label}
              </button>
            ))}
          </section>
        </div>
      ) : null}

      {songMenuSong ? (
        <div className="overlay" onClick={closeSongMenu}>
          <section className="song-context-menu" data-no-drag="true" onClick={(event) => event.stopPropagation()}>
            <div className="song-context-head">
              <div
                className="song-context-cover"
                style={songMenuCoverUrl ? undefined : createCoverStyle(0)}
              >
                {songMenuCoverUrl ? (
                  <img src={songMenuCoverUrl} alt={songMenuSong.title} className="song-context-cover-image" />
                ) : null}
              </div>
              <div className="song-context-meta">
                <h3>{songMenuSong.title}</h3>
                <p>{songMenuSong.artist} · {songMenuSong.album}</p>
              </div>
              <button type="button" className="song-context-close" onClick={closeSongMenu}>×</button>
            </div>

            <div className="song-context-body">
              <button
                type="button"
                className="song-context-item"
                onClick={() => {
                  addSongToPlaylist(songMenuSong.id);
                  closeSongMenu();
                }}
              >
                <LineIcon name="playlist-add" />
                <span>添加到歌单</span>
              </button>
              <button type="button" className="song-context-item" onClick={() => queueSongAsNext(songMenuSong.id)}>
                <LineIcon name="next" />
                <span>下一首播放</span>
              </button>
              <button type="button" className="song-context-item" onClick={() => jumpToSongArtist(songMenuSong)}>
                <LineIcon name="artists" />
                <span>查看艺术家</span>
              </button>
              <button type="button" className="song-context-item" onClick={() => jumpToSongAlbum(songMenuSong)}>
                <LineIcon name="albums" />
                <span>查看专辑</span>
              </button>
              <button type="button" className="song-context-item" onClick={() => openSongInfo(songMenuSong.id)}>
                <LineIcon name="about" />
                <span>歌曲信息</span>
              </button>
              <button type="button" className="song-context-item danger" onClick={() => { void deleteSongById(songMenuSong.id); }}>
                <LineIcon name="trash" />
                <span>从音乐库删除</span>
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {songInfoSong ? (
        <div className="overlay" onClick={closeSongInfo}>
          <section className="song-info-dialog" data-no-drag="true" onClick={(event) => event.stopPropagation()}>
            <h3>歌曲信息</h3>
            <div className="song-info-grid">
              <div className="song-info-row">
                <span>标题</span>
                <strong>{songInfoSong.title}</strong>
              </div>
              <div className="song-info-row">
                <span>艺术家</span>
                <strong>{songInfoSong.artist}</strong>
              </div>
              <div className="song-info-row">
                <span>专辑</span>
                <strong>{songInfoSong.album}</strong>
              </div>
              <div className="song-info-row">
                <span>时长</span>
                <strong>{formatTime(songInfoSong.duration)}</strong>
              </div>
            </div>
            <div className="song-info-actions">
              <button type="button" className="ghost-btn" onClick={closeSongInfo}>关闭</button>
            </div>
          </section>
        </div>
      ) : null}


      {songsBatchPlaylistDialogOpen ? (
        <div className="overlay" onClick={closeSongsBatchPlaylistDialog}>
          <section className="songs-batch-playlist-dialog" data-no-drag="true" onClick={(event) => event.stopPropagation()}>
            <h3>添加到歌单</h3>

            {songsBatchCreateMode ? (
              <div className="songs-batch-create-wrap">
                <input
                  type="text"
                  value={songsBatchPlaylistName}
                  onChange={(event) => setSongsBatchPlaylistName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      submitSongsBatchCreatePlaylist();
                    }

                    if (event.key === "Escape") {
                      setSongsBatchCreateMode(false);
                      setSongsBatchPlaylistName("");
                    }
                  }}
                  placeholder="歌单名称"
                  autoFocus
                />

                <div className="songs-batch-create-actions">
                  <button
                    type="button"
                    className="ghost-btn songs-batch-create-btn"
                    onClick={() => {
                      setSongsBatchCreateMode(false);
                      setSongsBatchPlaylistName("");
                    }}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="primary-btn songs-batch-create-btn"
                    onClick={submitSongsBatchCreatePlaylist}
                    disabled={!songsBatchPlaylistName.trim()}
                  >
                    创建
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="songs-batch-create-trigger"
                onClick={() => {
                  setSongsBatchCreateMode(true);
                  setSongsBatchPlaylistName("");
                }}
              >
                <LineIcon name="playlist-add" />
                新建歌单
              </button>
            )}

            <div className="songs-batch-playlist-list">
              {playlists.length ? (
                playlists.map((playlist) => (
                  <button
                    key={`songs-batch-${playlist.id}`}
                    type="button"
                    className="songs-batch-playlist-item"
                    onClick={() => addSelectedSongsToPlaylist(playlist.id)}
                  >
                    <span>{playlist.name}</span>
                    <small>{playlist.songIds.length} songs</small>
                  </button>
                ))
              ) : (
                <p className="songs-batch-playlist-empty">暂无歌单</p>
              )}
            </div>

            <button type="button" className="songs-batch-close" onClick={closeSongsBatchPlaylistDialog}>
              取消
            </button>
          </section>
        </div>
      ) : null}

      {dialogMode ? (
        <div className="overlay" onClick={closeDialog}>
          <div className="dialog" onClick={(event) => event.stopPropagation()}>
            <h3>{dialogMode === "create" ? "新建歌单" : "重命名歌单"}</h3>
            <input
              autoFocus
              value={dialogInput}
              onChange={(event) => setDialogInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  submitDialog();
                }
                if (event.key === "Escape") {
                  closeDialog();
                }
              }}
              placeholder="请输入歌单名称"
            />
            <div className="dialog-actions">
              <button type="button" className="ghost-btn" onClick={closeDialog}>
                取消
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={submitDialog}
                disabled={!dialogInput.trim()}
              >
                {dialogMode === "create" ? "创建" : "保存"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {playlistMenuId ? (
        <div className="overlay" onClick={() => setPlaylistMenuId(null)}>
          <div className="menu playlist-menu" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="menu-item"
              onClick={() => openRenamePlaylistDialog(playlistMenuId)}
            >
              <LineIcon name="edit" />
              <span>重命名</span>
            </button>
            <button type="button" className="menu-item danger" onClick={removePlaylist}>
              <LineIcon name="trash" />
              <span>删除歌单</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

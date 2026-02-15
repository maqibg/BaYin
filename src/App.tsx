import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import * as ScrollArea from "@radix-ui/react-scroll-area";

type Page =
  | "songs"
  | "albums"
  | "artists"
  | "playlists"
  | "scan"
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

interface StreamScanOptions {
  serverId?: string | null;
}

interface PlaylistStoreItem {
  id: string;
  name: string;
  songIds: string[];
}

type PlayMode = "sequence" | "shuffle" | "repeat-one";

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
  | "volume"
  | "volume-mute"
  | "cloud-add"
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
  if (name === "volume") {
    return <svg className={classes} viewBox="0 0 24 24" fill="none" aria-hidden><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" /><path d="M16 9a5 5 0 0 1 0 6" /><path d="M19.364 18.364a9 9 0 0 0 0-12.728" /></svg>;
  }
  if (name === "volume-mute") {
    return <svg className={classes} viewBox="0 0 24 24" fill="none" aria-hidden><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" /><line x1="22" x2="16" y1="9" y2="15" /><line x1="16" x2="22" y1="9" y2="15" /></svg>;
  }
  if (name === "cloud-add") {
    return <svg className={classes} viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 13v8" /><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" /><path d="m8 17 4-4 4 4" /></svg>;
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
  stats: "音乐库统计",
  settings: "设置",
  "settings-ui": "用户界面",
  about: "关于",
};

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
  const [scanMode, setScanMode] = useState<"full" | "incremental">("incremental");
  const [showScanAdvanced, setShowScanAdvanced] = useState(false);
  const [scanRunning, setScanRunning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string>("");

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [playlistMenuId, setPlaylistMenuId] = useState<string | null>(null);
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

  const [streamServers, setStreamServers] = useState<DbStreamServer[]>([]);
  const [streamModalOpen, setStreamModalOpen] = useState(false);
  const [streamForm, setStreamForm] = useState<StreamServerInput>({
    serverType: "navidrome",
    serverName: "",
    serverUrl: "",
    username: "",
    password: "",
    accessToken: "",
    userId: "",
  });
  const [streamTesting, setStreamTesting] = useState(false);
  const [streamSaving, setStreamSaving] = useState(false);
  const [streamScanningId, setStreamScanningId] = useState<string | null>(null);
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
    if (page !== "songs") {
      if (searchQuery) {
        setSearchQuery("");
      }
      if (songsSearchMode) {
        setSongsSearchMode(false);
      }
    }
  }, [page, searchQuery, songsSearchMode]);

  useEffect(() => {
    if (page === "songs" && songsSearchMode) {
      searchInputRef.current?.focus();
    }
  }, [page, songsSearchMode]);

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

  const filteredAlbums = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) {
      return albums;
    }

    return albums.filter((album) => {
      const haystack = `${album.name} ${album.artist}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [albums, searchQuery]);

  const filteredArtists = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) {
      return artists;
    }

    return artists.filter((artist) => artist.name.toLowerCase().includes(keyword));
  }, [artists, searchQuery]);

  const qualityStats = useMemo(() => {
    const total = songs.length;
    const hiRes = songs.filter((song) => Boolean(song.isHr)).length;
    const sqOnly = songs.filter((song) => !song.isHr && song.isSq).length;
    const hiResDeg = total ? (hiRes / total) * 360 : 0;
    const sqDeg = total ? (sqOnly / total) * 360 : 0;

    return {
      total,
      hiRes,
      sqOnly,
      hiResDeg,
      sqDeg,
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

  const selectedPlaylist = useMemo(
    () => playlists.find((playlist) => playlist.id === selectedPlaylistId) ?? null,
    [playlists, selectedPlaylistId],
  );

  const selectedPlaylistSongs = useMemo(() => {
    if (!selectedPlaylist) {
      return [];
    }

    return selectedPlaylist.songIds
      .map((songId) => songMap.get(songId))
      .filter((song): song is DbSong => Boolean(song));
  }, [selectedPlaylist, songMap]);

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

  const insertAllFilteredSongsToQueue = () => {
    if (!filteredSongs.length) {
      return;
    }

    setQueueSongIds(filteredSongs.map((song) => song.id));
    void playSongById(filteredSongs[0].id, true);
  };

  const go = (next: Page) => {
    setPage(next);
    setPlaylistMenuId(null);
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
    setPlaylistMenuId(null);
  };

  const addSongToPlaylist = (songId: string, playlistId?: string | null) => {
    const targetId = playlistId ?? selectedPlaylistId;
    if (!targetId) {
      setScanMessage("请先创建歌单。");
      return;
    }

    setPlaylists((previous) =>
      previous.map((playlist) => {
        if (playlist.id !== targetId) {
          return playlist;
        }

        if (playlist.songIds.includes(songId)) {
          return playlist;
        }

        return {
          ...playlist,
          songIds: [...playlist.songIds, songId],
        };
      }),
    );
  };

  const removeSongFromPlaylist = (songId: string, playlistId: string) => {
    setPlaylists((previous) =>
      previous.map((playlist) => {
        if (playlist.id !== playlistId) {
          return playlist;
        }

        return {
          ...playlist,
          songIds: playlist.songIds.filter((id) => id !== songId),
        };
      }),
    );
  };

  const openStreamModal = () => {
    setStreamFormMessage("");
    setStreamModalOpen(true);
  };

  const closeStreamModal = () => {
    setStreamModalOpen(false);
    setStreamFormMessage("");
  };

  const saveStreamServer = async () => {
    if (!isTauriEnv) {
      setStreamFormMessage("浏览器预览模式无法保存流媒体配置。");
      return;
    }

    const payload: StreamServerInput = {
      serverType: streamForm.serverType,
      serverName: streamForm.serverName.trim(),
      serverUrl: streamForm.serverUrl.trim(),
      username: streamForm.username.trim(),
      password: streamForm.password,
      accessToken: streamForm.accessToken?.trim() || undefined,
      userId: streamForm.userId?.trim() || undefined,
    };

    if (!payload.serverName || !payload.serverUrl || !payload.username || !payload.password) {
      setStreamFormMessage("请完整填写服务器名称、地址、用户名和密码。");
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
      serverName: streamForm.serverName.trim() || "Test Server",
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

  const deleteStreamServer = async (serverId: string) => {
    if (!isTauriEnv) {
      return;
    }

    try {
      await invoke<void>("db_delete_stream_server", { serverId });
      setScanMessage("已删除流媒体服务器配置。");
      await refreshLibrary();
    } catch (error) {
      setScanMessage(`删除服务器失败：${parseMessage(error)}`);
    }
  };

  const scanStreamServer = async (serverId?: string) => {
    if (!isTauriEnv) {
      setScanMessage("浏览器预览模式无法扫描流媒体。");
      return;
    }

    setStreamScanningId(serverId ?? "all");
    try {
      const options: StreamScanOptions = {
        serverId: serverId ?? null,
      };
      const result = await invoke<ScanResult>("scan_stream_to_db", { options });
      setScanMessage(`流媒体扫描完成：新增 ${result.added}，错误 ${result.errors}`);
      await refreshLibrary();
    } catch (error) {
      setScanMessage(`流媒体扫描失败：${parseMessage(error)}`);
    } finally {
      setStreamScanningId(null);
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

  const shouldShowBack = page === "settings-ui";
  const showSongsSearchBar = page === "songs" && songsSearchMode;

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
          <button type="button" className="icon-btn" aria-label="更多">
            <LineIcon name="more" />
          </button>
        </>
      );
    }

    if (page === "albums" || page === "artists" || page === "about") {
      return (
        <button type="button" className="icon-btn" aria-label="更多">
          <LineIcon name="more" />
        </button>
      );
    }

    if (page === "playlists") {
      return (
        <>
          <button type="button" className="icon-btn" aria-label="排序">
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
          <div className="songs-count">
            <span className="songs-count-icon" aria-hidden>
              <LineIcon name="shuffle" />
            </span>
            <span className="songs-count-main">{filteredSongs.length}</span>
            <small>歌曲</small>
          </div>

          <div className="songs-toolbar-actions">
            <button type="button" className="icon-btn subtle" aria-label="使用当前过滤作为队列" onClick={insertAllFilteredSongsToQueue}>
              <LineIcon name="edit" />
            </button>
          </div>
        </div>

        <div className="songs-layout">
          <ScrollArea.Root className="songs-scroll-root" type="always" scrollHideDelay={0}>
            <ScrollArea.Viewport className="songs-card">
              {filteredSongs.map((song, index) => {
                const coverUrl = song.coverHash ? coverMap[song.coverHash] : undefined;
                const active = song.id === currentSongId;

                return (
                  <article
                    key={song.id}
                    className={`song-row ${active ? "active" : ""}`}
                    onDoubleClick={() => {
                      void playSongById(song.id, true);
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
                        onClick={() => addSongToPlaylist(song.id)}
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

          {!isMobile ? (
            <div className="alphabet-rail" aria-hidden>
              {ALPHABET_INDEX.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    );
  };

  const renderAlbumsPage = () => {
    if (!filteredAlbums.length) {
      return renderEmpty("尚未扫描音乐", "扫描音乐", () => go("scan"));
    }

    return (
      <section className="cover-grid-page">
        <div className="cover-grid-layout">
          <div className="cover-grid">
            {filteredAlbums.map((album, index) => {
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

          {!isMobile ? (
            <div className="alphabet-rail" aria-hidden>
              {ALPHABET_INDEX.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    );
  };

  const renderArtistsPage = () => {
    if (!filteredArtists.length) {
      return renderEmpty("尚未扫描音乐", "扫描音乐", () => go("scan"));
    }

    return (
      <section className="cover-grid-page">
        <div className="cover-grid-layout">
          <div className="cover-grid">
            {filteredArtists.map((artist, index) => {
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

          {!isMobile ? (
            <div className="alphabet-rail" aria-hidden>
              {ALPHABET_INDEX.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    );
  };

  const renderPlaylistsPage = () => {
    if (!playlists.length) {
      return renderEmpty("暂无歌单", "创建歌单", openCreatePlaylistDialog);
    }

    return (
      <section className="playlist-page">
        {playlists.map((playlist) => {
          const isSelected = playlist.id === selectedPlaylistId;
          return (
            <article key={playlist.id} className={`playlist-card ${isSelected ? "active" : ""}`}>
              <button
                type="button"
                className="playlist-main"
                onClick={() => setSelectedPlaylistId(playlist.id)}
              >
                <h3>{playlist.name}</h3>
                <p>{playlist.songIds.length} 首歌曲</p>
              </button>

              <button
                type="button"
                className="icon-btn subtle"
                aria-label={`操作 ${playlist.name}`}
                onClick={() => setPlaylistMenuId(playlist.id)}
              >
                <LineIcon name="more" />
              </button>
            </article>
          );
        })}

        {selectedPlaylist ? (
          <article className="playlist-detail">
            <div className="playlist-detail-head">
              <h3>{selectedPlaylist.name}</h3>
              <button
                type="button"
                className="text-btn"
                onClick={() => {
                  if (currentSongId) {
                    addSongToPlaylist(currentSongId, selectedPlaylist.id);
                  }
                }}
                disabled={!currentSongId}
              >
                添加当前播放
              </button>
            </div>

            {selectedPlaylistSongs.length ? (
              <div className="playlist-song-list">
                {selectedPlaylistSongs.map((song) => (
                  <div key={`${selectedPlaylist.id}-${song.id}`} className="playlist-song-row">
                    <button
                      type="button"
                      className="playlist-song-main"
                      onClick={() => {
                        void playSongById(song.id, true);
                      }}
                    >
                      <span>{song.title}</span>
                      <small>{song.artist}</small>
                    </button>
                    <button
                      type="button"
                      className="icon-btn subtle"
                      onClick={() => removeSongFromPlaylist(song.id, selectedPlaylist.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="playlist-empty-hint">当前歌单还没有歌曲。</p>
            )}
          </article>
        ) : null}
      </section>
    );
  };

  const renderScanPage = () => (
    <section className="scan-page">
      <div className="scan-panel compact">
        <article className="scan-card">
          <div className="scan-card-head">
            <div className="scan-icon-box">📁</div>
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
            📁 Add Folder
          </button>
        </article>

        <article className="scan-card scan-row">
          <div className="scan-row-left">
            <div className="scan-icon-box purple">◉</div>
            <div>
              <h3>流媒体配置</h3>
              <p>{streamServers.length ? `已配置 ${streamServers.length} 个服务器` : "未配置"}</p>
            </div>
          </div>

          <button type="button" className="text-btn" onClick={openStreamModal}>
            配置
          </button>
        </article>

        {streamServers.length ? (
          <article className="scan-card stream-list-card">
            <div className="stream-list-head">
              <h3>流媒体服务器</h3>
              <button
                type="button"
                className="text-btn"
                onClick={() => {
                  void scanStreamServer();
                }}
                disabled={streamScanningId === "all"}
              >
                {streamScanningId === "all" ? "扫描中..." : "扫描全部"}
              </button>
            </div>

            <div className="stream-list">
              {streamServers.map((server) => (
                <div key={server.id} className="stream-item">
                  <div className="stream-item-main">
                    <strong>{server.serverName}</strong>
                    <p>
                      {server.serverType} · {server.serverUrl}
                    </p>
                  </div>

                  <div className="stream-item-actions">
                    <button
                      type="button"
                      className="text-btn"
                      onClick={() => {
                        void scanStreamServer(server.id);
                      }}
                      disabled={streamScanningId === server.id}
                    >
                      {streamScanningId === server.id ? "扫描中" : "扫描"}
                    </button>
                    <button
                      type="button"
                      className="text-btn danger"
                      onClick={() => {
                        void deleteStreamServer(server.id);
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </article>
        ) : null}

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
          className="text-btn scan-advanced-toggle"
          onClick={() => setShowScanAdvanced((previous) => !previous)}
        >
          {showScanAdvanced ? "收起高级选项" : "高级选项"}
        </button>

        {showScanAdvanced ? (
          <>
            <div className="duration-row">
              <span>最短时长</span>
              <input
                type="range"
                min={10}
                max={180}
                value={minDuration}
                onChange={(event) => setMinDuration(Number(event.target.value))}
              />
              <span>{minDuration}s</span>
            </div>

            <div className="segment two scan-mode">
              <button
                type="button"
                className={scanMode === "incremental" ? "active" : ""}
                onClick={() => setScanMode("incremental")}
              >
                增量扫描
              </button>
              <button
                type="button"
                className={scanMode === "full" ? "active" : ""}
                onClick={() => setScanMode("full")}
              >
                全量扫描
              </button>
            </div>
          </>
        ) : null}

        <button
          type="button"
          className="primary-btn full"
          onClick={startScan}
          disabled={scanRunning}
        >
          {scanRunning ? "扫描中..." : "开始扫描"}
        </button>

        {scanMessage ? <p className="status-text">{scanMessage}</p> : null}
      </div>
    </section>
  );

  const renderStatsPage = () => {
    const ringStyle: CSSProperties = {
      background: `conic-gradient(
        #8657ff 0deg ${qualityStats.hiResDeg}deg,
        #1cc391 ${qualityStats.hiResDeg}deg ${qualityStats.hiResDeg + qualityStats.sqDeg}deg,
        #e5eaf3 ${qualityStats.hiResDeg + qualityStats.sqDeg}deg 360deg
      )`,
    };

    return (
      <section className="stats-page rich">
        <div className="stats-layout">
          <article className="stats-main-card quality-card">
            <h3>音质分布</h3>

            <div className="quality-donut-wrap">
              <div className="quality-donut" style={ringStyle}>
                <div className="quality-donut-hole" />
              </div>
            </div>

            <div className="quality-legend">
              <span><i className="dot purple" />Hi-Res</span>
              <span><i className="dot green" />SQ</span>
            </div>
          </article>

          <div className="stats-side">
            <article className="stats-side-card">
              <p><i className="dot purple" />Hi-Res</p>
              <strong>{qualityStats.hiRes}<small>歌曲</small></strong>
            </article>

            <article className="stats-side-card">
              <p><i className="dot green" />SQ</p>
              <strong>{qualityStats.sqOnly}<small>歌曲</small></strong>
            </article>

            <article className="stats-side-card total">
              <p>音乐库总计</p>
              <strong>{stats.totalSongs}</strong>
            </article>
          </div>
        </div>
      </section>
    );
  };

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
              void closeWindow();
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
              page === item.page || (item.page === "settings" && page === "settings-ui");

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

          <div className={`topbar-main ${showSongsSearchBar ? "searching" : ""}`}>
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
            ) : (
              <>
                <div className="topbar-left">
                  {shouldShowBack ? (
                    <button type="button" className="icon-btn" onClick={() => go("settings")}>
                      <LineIcon name="back" />
                    </button>
                  ) : null}

                  {!shouldShowBack && isMobile ? (
                    <button type="button" className="icon-btn" onClick={() => setSidebarOpen(true)}>
                      <LineIcon name="menu" />
                    </button>
                  ) : null}

                  <h1 className={`page-title ${page === "songs" ? "songs-title" : ""}`}>{PAGE_TITLE[page]}</h1>
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
                  <button type="button" className="queue-main" onClick={() => { void playSongById(song.id, true); }}>
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

      {streamModalOpen ? (
        <div className="overlay" onClick={closeStreamModal}>
          <div className="dialog stream-dialog" onClick={(event) => event.stopPropagation()}>
            <h3>流媒体配置</h3>

            <label className="field">
              <span>服务器类型</span>
              <select
                value={streamForm.serverType}
                onChange={(event) =>
                  setStreamForm((previous) => ({ ...previous, serverType: event.target.value }))
                }
              >
                <option value="navidrome">Navidrome</option>
                <option value="subsonic">Subsonic</option>
                <option value="opensubsonic">OpenSubsonic</option>
                <option value="jellyfin">Jellyfin</option>
                <option value="emby">Emby</option>
              </select>
            </label>

            <label className="field">
              <span>服务器名称</span>
              <input
                value={streamForm.serverName}
                onChange={(event) =>
                  setStreamForm((previous) => ({ ...previous, serverName: event.target.value }))
                }
                placeholder="例如：家庭 Jellyfin"
              />
            </label>

            <label className="field">
              <span>服务器地址</span>
              <input
                value={streamForm.serverUrl}
                onChange={(event) =>
                  setStreamForm((previous) => ({ ...previous, serverUrl: event.target.value }))
                }
                placeholder="https://demo.example.com"
              />
            </label>

            <label className="field two-col">
              <span>用户名</span>
              <input
                value={streamForm.username}
                onChange={(event) =>
                  setStreamForm((previous) => ({ ...previous, username: event.target.value }))
                }
              />
            </label>

            <label className="field two-col">
              <span>密码</span>
              <input
                type="password"
                value={streamForm.password}
                onChange={(event) =>
                  setStreamForm((previous) => ({ ...previous, password: event.target.value }))
                }
              />
            </label>

            {streamFormMessage ? <p className="status-text">{streamFormMessage}</p> : null}

            <div className="dialog-actions three">
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  void testStreamConnection();
                }}
                disabled={streamTesting}
              >
                {streamTesting ? "测试中" : "测试"}
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  void saveStreamServer();
                }}
                disabled={streamSaving}
              >
                {streamSaving ? "保存中" : "保存"}
              </button>
              <button type="button" className="ghost-btn" onClick={closeStreamModal}>
                关闭
              </button>
            </div>
          </div>
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
          <div className="menu" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="menu-item"
              onClick={() => openRenamePlaylistDialog(playlistMenuId)}
            >
              <span>✎</span>
              <span>重命名</span>
            </button>
            <button type="button" className="menu-item danger" onClick={removePlaylist}>
              <span>🗑</span>
              <span>删除歌单</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

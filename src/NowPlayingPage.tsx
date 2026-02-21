import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import {
  HamburgerMenuIcon,
  MixerHorizontalIcon,
  SpeakerLoudIcon,
  SpeakerOffIcon,
  DotsHorizontalIcon,
  TextAlignLeftIcon,
  TextAlignCenterIcon,
  TextAlignRightIcon,
  PlusIcon,
  MinusIcon,
  ReloadIcon,
  EyeOpenIcon,
  EyeClosedIcon,
  FontBoldIcon,
} from "@radix-ui/react-icons";
import "./NowPlayingPage.css";

type PlayMode = "sequence" | "shuffle" | "repeat-one";
type FontWeightOption = "Normal" | "Medium" | "Bold";
type LyricAlign = "left" | "center" | "right";
type LyricSourceMode = "local" | "online";
type LyricProvider = "qq" | "kugou" | "netease";
interface EqualizerPreset {
  name: string;
  gains: number[];
}

interface ParsedLrcLine {
  time: number;
  text: string;
}

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
  format?: string;
  bitDepth?: number;
  sampleRate?: number;
  bitrate?: number;
  channels?: number;
}

export interface NowPlayingPageProps {
  currentSong: DbSong | null;
  currentSongCover: string | null;
  isPlaying: boolean;
  isResolvingSong: boolean;
  currentTime: number;
  duration: number;
  playMode: PlayMode;
  volume: number;
  muted: boolean;
  parsedLyrics: ParsedLrcLine[];
  currentLyricText: string;
  activeLyricIndex: number;
  lyricsLoading: boolean;
  lyricsError: string;
  queueSongs: DbSong[];
  currentSongId: string | null;
  coverMap: Record<string, string>;
  theme: "light" | "dark";
  lyricSize: number;
  lyricCentered: boolean;
  fontWeight: FontWeightOption;
  lyricSourceMode: LyricSourceMode;
  currentLyricSourceText: string;
  currentLyricProvider: LyricProvider | null;
  npAutoScrollLyrics: boolean;
  npDynamicBg: boolean;
  equalizerEnabled: boolean;
  equalizerGains: number[];
  onClose: () => void;
  onTogglePlayPause: () => void;
  onPlayNext: () => void;
  onPlayPrevious: () => void;
  onSeek: (t: number) => void;
  onCyclePlayMode: () => void;
  onVolumeChange: (v: number) => void;
  onMutedChange: (v: boolean) => void;
  onPlaySong: (id: string) => void;
  onRemoveFromQueue: (id: string) => void;
  onClearQueue: () => void;
  onLyricSourceModeChange?: (mode: LyricSourceMode) => void;
  onOpenLyricSourceDialog?: () => void;
  onReloadLyrics?: () => void;
  onLyricSizeChange?: (next: number) => void;
  onLyricCenteredChange?: (centered: boolean) => void;
  onFontWeightChange?: (next: FontWeightOption) => void;
  onDynamicBgChange?: (enabled: boolean) => void;
  onOpenCurrentArtist?: (artistName?: string) => void;
  onOpenCurrentAlbum?: () => void;
  onOpenSettings?: () => void;
  windowFullscreen?: boolean;
  windowMaximized?: boolean;
  onToggleWindowFullscreen?: () => void;
  onMinimizeWindow?: () => void;
  onToggleWindowMaximize?: () => void;
  onCloseWindow?: () => void;
  onEqualizerEnabledChange: (enabled: boolean) => void;
  onEqualizerGainChange: (index: number, gain: number) => void;
  onEqualizerApplyPreset: (gains: number[]) => void;
  onEqualizerReset: () => void;
}

const FW: Record<FontWeightOption, number> = {
  Normal: 400,
  Medium: 500,
  Bold: 700,
};
const EQ_MIN_GAIN = -12;
const EQ_MAX_GAIN = 12;
const EQ_FREQUENCIES = [80, 100, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const EQ_PRESETS: EqualizerPreset[] = [
  { name: "默认", gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: "流行", gains: [4, 3, 2, 1, 0, 0, 1, 2, 3, 2] },
  { name: "舞曲", gains: [6, 5, 4, 2, 0, -1, 0, 1, 2, 1] },
  { name: "蓝调", gains: [2, 2, 2, 3, 2, 1, 2, 1, 0, -1] },
  { name: "古典", gains: [0, 0, 0, 0, 0, 0, 0, 1, 2, 3] },
  { name: "爵士", gains: [2, 2, 1, 1, 0, 0, 1, 2, 1, 0] },
  { name: "慢歌", gains: [1, 1, 0, 0, 2, 3, 2, 1, 0, -1] },
  { name: "电子乐", gains: [5, 4, 3, 0, -1, -2, 0, 2, 4, 5] },
  { name: "摇滚", gains: [3, 2, 1, 0, -1, 0, 2, 3, 2, 1] },
  { name: "乡村", gains: [0, 0, 0, 1, 2, 2, 3, 2, 1, 0] },
  { name: "人声", gains: [-2, -1, 0, 1, 3, 4, 3, 1, -1, -2] },
];

function fmt(seconds: number) {
  const minute = Math.floor(seconds / 60);
  const second = Math.floor(seconds % 60);
  return `${minute}:${String(second).padStart(2, "0")}`;
}

function fmtEqFrequency(frequency: number) {
  if (frequency >= 1000) {
    return `${frequency / 1000}kHz`;
  }
  return `${frequency}Hz`;
}

function extractColor(src: string): Promise<[string, string]> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 16;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("no canvas context"));
        return;
      }

      context.drawImage(image, 0, 0, 16, 16);
      const data = context.getImageData(0, 0, 16, 16).data;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let index = 0; index < data.length; index += 4) {
        red += data[index];
        green += data[index + 1];
        blue += data[index + 2];
      }

      const pixelCount = data.length / 4;
      resolve([
        `rgb(${Math.round(red / pixelCount)},${Math.round(green / pixelCount)},${Math.round(blue / pixelCount)})`,
        `rgb(${Math.round((red / pixelCount) * 0.38)},${Math.round((green / pixelCount) * 0.38)},${Math.round((blue / pixelCount) * 0.38)})`,
      ]);
    };
    image.onerror = () => reject(new Error("cover load failed"));
    image.src = src;
  });
}

function getSongCover(song: DbSong, coverMap: Record<string, string>): string | null {
  if (song.coverHash && coverMap[song.coverHash]) {
    return coverMap[song.coverHash];
  }

  try {
    const payload = JSON.parse(song.streamInfo ?? "{}") as { coverUrl?: string };
    return payload.coverUrl ?? null;
  } catch {
    return null;
  }
}

function splitLyricLineText(text: string): { main: string; subLines: string[] } {
  const parts = text
    .split("┃")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (!parts.length) {
    return { main: "", subLines: [] };
  }

  return {
    main: parts[0],
    subLines: parts.slice(1),
  };
}

function normalizeSubLyrics(lines: string[]) {
  return lines.filter((line) => line.trim().length > 0 && !/^[\\/\-—\s]+$/.test(line));
}

const ARTIST_SPLIT_REGEX = /\/|、/;

function splitArtistNames(artist: string): string[] {
  return Array.from(
    new Set(
      artist
        .split(ARTIST_SPLIT_REGEX)
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  );
}

function formatSongBitrate(bitrate?: number | null) {
  if (!Number.isFinite(bitrate ?? NaN) || !bitrate || bitrate <= 0) {
    return "—";
  }
  const kbps = bitrate >= 10000 ? bitrate / 1000 : bitrate;
  return `${Number.isInteger(kbps) ? kbps : kbps.toFixed(1)} kbps`;
}

function formatSongSampleRate(sampleRate?: number | null) {
  if (!Number.isFinite(sampleRate ?? NaN) || !sampleRate || sampleRate <= 0) {
    return "—";
  }
  if (sampleRate >= 1000) {
    const khz = sampleRate / 1000;
    return `${Number.isInteger(khz) ? khz : khz.toFixed(1)} kHz`;
  }
  return `${sampleRate} Hz`;
}

function formatSongBitDepth(bitDepth?: number | null) {
  if (!Number.isFinite(bitDepth ?? NaN) || !bitDepth || bitDepth <= 0) {
    return "—";
  }
  return `${bitDepth} bit`;
}

function formatSongChannels(channels?: number | null) {
  if (!Number.isFinite(channels ?? NaN) || !channels || channels <= 0) {
    return "—";
  }
  if (channels === 1) {
    return "单声道";
  }
  if (channels === 2) {
    return "立体声";
  }
  return `${channels} 声道`;
}

function formatSongFileSize(fileSize?: number | null) {
  if (!Number.isFinite(fileSize ?? NaN) || !fileSize || fileSize <= 0) {
    return "—";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = fileSize;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const formatted = value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1);
  return `${formatted} ${units[unitIndex]}`;
}

function formatSongSourceType(sourceType?: string) {
  if (!sourceType) {
    return "—";
  }
  if (sourceType === "local") {
    return "本地";
  }
  if (sourceType === "stream") {
    return "流媒体";
  }
  return sourceType;
}

const IcoDown = () => (
  <svg viewBox="0 0 24 24" fill="none" width="22" height="22" aria-hidden>
    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IcoWindowFull = () => (
  <svg viewBox="0 0 24 24" fill="none" width="16" height="16" aria-hidden>
    <path d="M8 3H4v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M20 8V4h-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M16 21h4v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 16v4h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IcoWindowExitFull = () => (
  <svg viewBox="0 0 24 24" fill="none" width="16" height="16" aria-hidden>
    <path d="M9 9H4V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M15 9h5V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9 15H4v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M15 15h5v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IcoWindowMinimize = () => (
  <svg viewBox="0 0 24 24" fill="none" width="16" height="16" aria-hidden>
    <path d="M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

const IcoWindowMaximize = () => (
  <svg viewBox="0 0 24 24" fill="none" width="16" height="16" aria-hidden>
    <rect x="5" y="5" width="14" height="14" rx="1.5" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const IcoWindowRestore = () => (
  <svg viewBox="0 0 24 24" fill="none" width="16" height="16" aria-hidden>
    <rect x="8" y="8" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="2" />
    <path d="M6 15V6h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IcoWindowClose = () => (
  <svg viewBox="0 0 24 24" fill="none" width="16" height="16" aria-hidden>
    <path d="M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

const IcoPlay = () => (
  <svg viewBox="0 0 24 24" fill="none" width="28" height="28" aria-hidden>
    <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" style={{ fill: "currentColor", stroke: "none" }} />
  </svg>
);

const IcoPause = () => (
  <svg viewBox="0 0 24 24" fill="none" width="28" height="28" aria-hidden>
    <rect x="14" y="3" width="5" height="18" rx="1.5" style={{ fill: "currentColor", stroke: "none" }} />
    <rect x="5" y="3" width="5" height="18" rx="1.5" style={{ fill: "currentColor", stroke: "none" }} />
  </svg>
);
const IcoPrev = () => (
  <svg viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden>
    <path d="M17.971 4.285A2 2 0 0 1 21 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432z" style={{ fill: "currentColor", stroke: "none" }} />
    <path d="M3 20V4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

const IcoNext = () => (
  <svg viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden>
    <path d="M21 4v16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z" style={{ fill: "currentColor", stroke: "none" }} />
  </svg>
);

const IcoRepeat = () => (
  <svg viewBox="0 0 24 24" fill="none" width="18" height="18" aria-hidden>
    <path d="m17 2 4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="m7 22-4-4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const IcoRepeatOne = () => (
  <svg viewBox="0 0 24 24" fill="none" width="18" height="18" aria-hidden>
    <path d="m17 2 4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="m7 22-4-4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M11 10h1v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const IcoShuffle = () => (
  <svg viewBox="0 0 24 24" fill="none" width="18" height="18" aria-hidden>
    <path d="m18 14 4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="m18 2 4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M2 6h1.972a4 4 0 0 1 3.6 2.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const IcoWave = () => (
  <svg viewBox="0 0 24 24" fill="none" width="18" height="18" aria-hidden>
    <path d="M2 18v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M6 18V8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M10 18V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M14 18V8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M18 18v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M22 18v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const IcoNote = () => (
  <svg viewBox="0 0 24 24" fill="none" width="24" height="24" aria-hidden>
    <circle cx="8" cy="18" r="4" stroke="currentColor" strokeWidth="1.5" />
    <path d="M12 18V2l7 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function resolveLyricProviderLabel(provider: LyricProvider): string {
  if (provider === "qq") {
    return "QQ";
  }
  if (provider === "kugou") {
    return "酷狗";
  }
  return "网易云";
}

export default function NowPlayingPage({
  currentSong,
  currentSongCover,
  isPlaying,
  isResolvingSong,
  currentTime,
  duration,
  playMode,
  volume,
  muted,
  parsedLyrics,
  currentLyricText,
  activeLyricIndex,
  lyricsLoading,
  lyricsError,
  queueSongs,
  currentSongId,
  coverMap,
  theme,
  lyricSize,
  lyricCentered,
  fontWeight,
  lyricSourceMode,
  currentLyricSourceText,
  currentLyricProvider,
  npAutoScrollLyrics,
  npDynamicBg,
  equalizerEnabled,
  equalizerGains,
  onClose,
  onTogglePlayPause,
  onPlayNext,
  onPlayPrevious,
  onSeek,
  onCyclePlayMode,
  onVolumeChange,
  onMutedChange,
  onPlaySong,
  onRemoveFromQueue,
  onClearQueue,
  onLyricSourceModeChange,
  onOpenLyricSourceDialog,
  onReloadLyrics,
  onLyricSizeChange,
  onLyricCenteredChange,
  onFontWeightChange,
  onDynamicBgChange,
  onOpenCurrentArtist,
  onOpenCurrentAlbum,
  onOpenSettings,
  windowFullscreen = false,
  windowMaximized = false,
  onToggleWindowFullscreen,
  onMinimizeWindow,
  onToggleWindowMaximize,
  onCloseWindow,
  onEqualizerEnabledChange,
  onEqualizerGainChange,
  onEqualizerApplyPreset,
  onEqualizerReset,
}: NowPlayingPageProps) {
  const [bgColors, setBgColors] = useState<[string, string] | null>(null);
  const [showQueue, setShowQueue] = useState(false);
  const [showEqualizer, setShowEqualizer] = useState(false);

  const [hoverLyricPanel, setHoverLyricPanel] = useState(false);
  const [showNowPlayingInfo, setShowNowPlayingInfo] = useState(
    () => localStorage.getItem("np_show_now_playing_info") === "true",
  );
  const [showTranslation, setShowTranslation] = useState(
    () => localStorage.getItem("np_show_translation") !== "false",
  );

  const [lyricFontSize, setLyricFontSize] = useState(lyricSize);
  const [lyricFontWeight, setLyricFontWeight] = useState<FontWeightOption>(fontWeight);
  const [currentLineScale] = useState(() => {
    const saved = Number(localStorage.getItem("np_current_line_scale") ?? "1.1");
    return Number.isFinite(saved) && saved >= 1 && saved <= 1.5 ? saved : 1.1;
  });
  const [lineSpacing] = useState(() => {
    const saved = Number(localStorage.getItem("np_line_spacing") ?? "8");
    return Number.isFinite(saved) && saved >= 2 && saved <= 24 ? saved : 8;
  });

  const [lyricAlign, setLyricAlign] = useState<LyricAlign>(() => {
    const saved = localStorage.getItem("np_lyric_align");
    if (saved === "left" || saved === "center" || saved === "right") {
      return saved;
    }
    return lyricCentered ? "center" : "left";
  });

  const [lyricMenuPos, setLyricMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [lyricSourceMenuOpen, setLyricSourceMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [showSongInfo, setShowSongInfo] = useState(false);

  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);
  const lyricSourceMenuRef = useRef<HTMLDivElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const lyricRefs = useRef<Map<number, HTMLElement>>(new Map());
  const userScrollRef = useRef(false);
  const cooldownRef = useRef<number | null>(null);
  const lastAutoIndexRef = useRef<number>(-1);
  const initialScrollDoneRef = useRef(false);

  const lyricMenuOpen = lyricMenuPos !== null;

  useEffect(() => {
    if (!npDynamicBg || !currentSongCover) {
      setBgColors(null);
      return;
    }

    extractColor(currentSongCover)
      .then(setBgColors)
      .catch(() => setBgColors(null));
  }, [currentSongCover, npDynamicBg]);

  useEffect(() => {
    setLyricFontSize(lyricSize);
  }, [lyricSize]);

  useEffect(() => {
    setLyricFontWeight(fontWeight);
  }, [fontWeight]);

  useEffect(() => {
    const saved = localStorage.getItem("np_lyric_align");
    if (!saved) {
      setLyricAlign(lyricCentered ? "center" : "left");
    }
  }, [lyricCentered]);

  useEffect(() => {
    localStorage.setItem("np_show_now_playing_info", String(showNowPlayingInfo));
  }, [showNowPlayingInfo]);

  useEffect(() => {
    localStorage.setItem("np_show_translation", String(showTranslation));
  }, [showTranslation]);
  useEffect(() => {
    initialScrollDoneRef.current = false;
    lastAutoIndexRef.current = -1;
    userScrollRef.current = false;
  }, [currentSong?.id, parsedLyrics.length]);

  useEffect(() => {
    return () => {
      if (cooldownRef.current !== null) {
        window.clearTimeout(cooldownRef.current);
        cooldownRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!npAutoScrollLyrics || userScrollRef.current || activeLyricIndex < 0) {
      return;
    }

    const previousIndex = lastAutoIndexRef.current;
    const isInitial = !initialScrollDoneRef.current;
    const isLargeJump = previousIndex >= 0 ? Math.abs(activeLyricIndex - previousIndex) > 2 : false;
    const immediate = isInitial || isLargeJump;

    requestAnimationFrame(() => {
      const container = lyricsContainerRef.current;
      const lineElement = lyricRefs.current.get(activeLyricIndex);
      if (!container || !lineElement) {
        return;
      }

      const targetTop = lineElement.offsetTop - container.clientHeight * 0.33 + lineElement.clientHeight / 2;
      const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
      const top = Math.min(Math.max(0, targetTop), maxTop);

      container.scrollTo({
        top,
        behavior: immediate ? "auto" : "smooth",
      });

      lastAutoIndexRef.current = activeLyricIndex;
      initialScrollDoneRef.current = true;
    });
  }, [activeLyricIndex, npAutoScrollLyrics]);

  useEffect(() => {
    const onEsc = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      if (showQueue) {
        setShowQueue(false);
        return;
      }

      if (showEqualizer) {
        setShowEqualizer(false);
        return;
      }

      if (lyricSourceMenuOpen) {
        setLyricSourceMenuOpen(false);
        return;
      }

      if (showSongInfo) {
        setShowSongInfo(false);
        return;
      }

      if (moreMenuOpen) {
        setMoreMenuOpen(false);
        return;
      }

      if (lyricMenuOpen) {
        setLyricMenuPos(null);
        return;
      }

      onClose();
    };

    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [lyricMenuOpen, lyricSourceMenuOpen, showSongInfo, moreMenuOpen, onClose, showEqualizer, showQueue]);

  useEffect(() => {
    if (!lyricMenuOpen) {
      return;
    }

    const closeMenu = () => setLyricMenuPos(null);
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("blur", closeMenu);

    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("blur", closeMenu);
    };
  }, [lyricMenuOpen]);

  useEffect(() => {
    if (!lyricSourceMenuOpen) {
      return;
    }

    const closeMenu = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (lyricSourceMenuRef.current && target && lyricSourceMenuRef.current.contains(target)) {
        return;
      }
      setLyricSourceMenuOpen(false);
    };

    const closeMenuWithoutEvent = () => setLyricSourceMenuOpen(false);

    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("resize", closeMenuWithoutEvent);
    window.addEventListener("blur", closeMenuWithoutEvent);

    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("resize", closeMenuWithoutEvent);
      window.removeEventListener("blur", closeMenuWithoutEvent);
    };
  }, [lyricSourceMenuOpen]);

  useEffect(() => {
    if (!moreMenuOpen) {
      return;
    }

    const closeMenu = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (moreMenuRef.current && target && moreMenuRef.current.contains(target)) {
        return;
      }
      setMoreMenuOpen(false);
    };

    const closeMenuWithoutEvent = () => setMoreMenuOpen(false);

    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("resize", closeMenuWithoutEvent);
    window.addEventListener("blur", closeMenuWithoutEvent);

    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("resize", closeMenuWithoutEvent);
      window.removeEventListener("blur", closeMenuWithoutEvent);
    };
  }, [moreMenuOpen]);

  const getAlignText = (align: LyricAlign): "left" | "center" | "right" => align;

  const getAlignIcon = (align: LyricAlign) => {
    if (align === "left") {
      return <TextAlignLeftIcon width={18} height={18} />;
    }
    if (align === "right") {
      return <TextAlignRightIcon width={18} height={18} />;
    }
    return <TextAlignCenterIcon width={18} height={18} />;
  };

  const setLyricAlignMode = (align: LyricAlign) => {
    setLyricAlign(align);
    localStorage.setItem("np_lyric_align", align);
    onLyricCenteredChange?.(align === "center");
    setLyricSourceMenuOpen(false);
    setShowSongInfo(false);
    setMoreMenuOpen(false);
    setLyricMenuPos(null);
  };

  const cycleLyricAlign = () => {
    const next = lyricAlign === "left" ? "center" : lyricAlign === "center" ? "right" : "left";
    setLyricAlignMode(next);
  };

  const switchLyricWeight = () => {
    const next: FontWeightOption = lyricFontWeight === "Bold" ? "Normal" : "Bold";
    setLyricFontWeight(next);
    onFontWeightChange?.(next);
    setLyricSourceMenuOpen(false);
    setShowSongInfo(false);
    setMoreMenuOpen(false);
    setLyricMenuPos(null);
  };

  const adjustLyricSize = (delta: number) => {
    const next = Math.min(56, Math.max(14, lyricFontSize + delta));
    setLyricFontSize(next);
    onLyricSizeChange?.(next);
  };

  const toggleTranslation = () => {
    setShowTranslation((previous) => !previous);
    setLyricSourceMenuOpen(false);
    setShowSongInfo(false);
    setMoreMenuOpen(false);
    setLyricMenuPos(null);
  };

  const toggleNowPlayingInfo = () => {
    setShowNowPlayingInfo((previous) => !previous);
    setLyricSourceMenuOpen(false);
    setShowSongInfo(false);
    setMoreMenuOpen(false);
    setLyricMenuPos(null);
  };

  const triggerReloadLyrics = () => {
    onReloadLyrics?.();
    setLyricSourceMenuOpen(false);
    setShowSongInfo(false);
    setMoreMenuOpen(false);
    setLyricMenuPos(null);
  };

  const handleLyricScroll = () => {
    userScrollRef.current = true;
    if (cooldownRef.current !== null) {
      window.clearTimeout(cooldownRef.current);
    }
    cooldownRef.current = window.setTimeout(() => {
      userScrollRef.current = false;
      cooldownRef.current = null;
    }, 2000);
  };

  const getLineDuration = (index: number) => {
    if (index < 0 || index >= parsedLyrics.length) {
      return 0;
    }

    const currentLine = parsedLyrics[index];
    const nextLine = parsedLyrics[index + 1];
    const end = nextLine ? nextLine.time : duration;
    return Math.max(0, end - currentLine.time);
  };

  const handleLyricContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setShowSongInfo(false);
    setMoreMenuOpen(false);

    const menuWidth = 226;
    const menuHeight = 288;
    const padding = 12;

    const left = Math.min(event.clientX, window.innerWidth - menuWidth - padding);
    const top = Math.min(event.clientY, window.innerHeight - menuHeight - padding);

    setLyricMenuPos({
      x: Math.max(padding, left),
      y: Math.max(padding, top),
    });
  };

  const openLyricSourceDialog = () => {
    onOpenLyricSourceDialog?.();
    setLyricSourceMenuOpen(false);
    setShowSongInfo(false);
    setMoreMenuOpen(false);
  };

  const switchLyricSourceMode = (mode: LyricSourceMode) => {
    onLyricSourceModeChange?.(mode);
    setLyricSourceMenuOpen(false);
    setShowSongInfo(false);
    setMoreMenuOpen(false);
  };

  const toggleDynamicBg = () => {
    onDynamicBgChange?.(!npDynamicBg);
    setLyricSourceMenuOpen(false);
    setShowSongInfo(false);
    setLyricMenuPos(null);
    setMoreMenuOpen(false);
  };

  const splitArtists = splitArtistNames(currentSong?.artist ?? "");
  const hasArtist = splitArtists.length > 0;
  const hasAlbum = Boolean(currentSong?.album?.trim());
  const hasSong = Boolean(currentSong?.id);

  const openCurrentArtist = (artistName?: string) => {
    if (!splitArtists.length) {
      return;
    }
    onOpenCurrentArtist?.(artistName ?? splitArtists[0]);
    setShowSongInfo(false);
    setMoreMenuOpen(false);
  };

  const openCurrentAlbum = () => {
    if (!hasAlbum) {
      return;
    }
    onOpenCurrentAlbum?.();
    setShowSongInfo(false);
    setMoreMenuOpen(false);
  };

  const openCurrentSongInfo = () => {
    if (!hasSong) {
      return;
    }
    setShowSongInfo(true);
    setMoreMenuOpen(false);
  };

  const openSettings = () => {
    onOpenSettings?.();
    setShowSongInfo(false);
    setMoreMenuOpen(false);
  };

  const currentProviderLabel = currentLyricProvider ? resolveLyricProviderLabel(currentLyricProvider) : "";
  const hasWindowControlButtons = Boolean(
    onToggleWindowFullscreen || onMinimizeWindow || onToggleWindowMaximize || onCloseWindow,
  );

  const renderLyrics = () => {
    if (lyricsLoading) {
      return <div className="np-hint">正在加载歌词...</div>;
    }

    if (lyricsError) {
      return <div className="np-hint np-hint-err">{lyricsError}</div>;
    }

    if (!parsedLyrics.length) {
      if (!currentLyricText.trim()) {
        return <div className="np-hint">暂无歌词</div>;
      }

      const rawLines = currentLyricText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      return (
        <div
          ref={lyricsContainerRef}
          className={`np-lyrics np-lyrics-${lyricAlign} np-lyrics-raw`}
          onScroll={handleLyricScroll}
        >
          {(rawLines.length ? rawLines : [currentLyricText.trim()]).map((line, index) => (
            <div
              key={`raw-${index}`}
              className="np-lyric-line np-lyric-line-raw"
              style={{
                textAlign: getAlignText(lyricAlign),
                padding: `${lineSpacing}px 12px`,
              }}
            >
              <p
                className="np-lyric-main np-lyric-main-raw"
                style={{
                  fontSize: `${lyricFontSize}px`,
                  fontWeight: FW[lyricFontWeight],
                }}
              >
                {line}
              </p>
            </div>
          ))}
        </div>
      );
    }

    const translationSize = Math.max(14, lyricFontSize - 6);

    return (
      <div
        ref={lyricsContainerRef}
        className={`np-lyrics np-lyrics-${lyricAlign}`}
        onScroll={handleLyricScroll}
      >
        {parsedLyrics.map((line, index) => {
          const isActive = index === activeLyricIndex;
          const { main, subLines } = splitLyricLineText(line.text);
          const safeSubLines = showTranslation ? normalizeSubLyrics(subLines) : [];
          const showTransition = !main && safeSubLines.length === 0 && getLineDuration(index) >= 5;

          const lineStyle: CSSProperties = {
            textAlign: getAlignText(lyricAlign),
            padding: `${lineSpacing}px 12px`,
          };

          const mainStyle: CSSProperties = {
            fontSize: `${lyricFontSize}px`,
            fontWeight: FW[lyricFontWeight],
            transform: isActive ? `scale(${currentLineScale})` : "scale(1)",
          };

          return (
            <div
              key={`${line.time}-${index}`}
              ref={(element) => {
                if (element) {
                  lyricRefs.current.set(index, element);
                } else {
                  lyricRefs.current.delete(index);
                }
              }}
              className={`np-lyric-line${isActive ? " active" : ""}`}
              style={lineStyle}
              onClick={() => onSeek(line.time)}
            >
              {showTransition ? (
                <div className="np-lyric-transition" aria-hidden>
                  <span className="np-lyric-dot" />
                  <span className="np-lyric-dot" />
                  <span className="np-lyric-dot" />
                </div>
              ) : (
                <>
                  <p className="np-lyric-main" style={mainStyle}>{main || "\u00A0"}</p>
                  {safeSubLines.map((text, subIndex) => (
                    <p
                      key={`${line.time}-${subIndex}-translation`}
                      className="np-lyric-sub"
                      style={{ fontSize: `${translationSize}px` }}
                    >
                      {text}
                    </p>
                  ))}
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const volumePercent = (muted ? 0 : volume) * 100;
  const ModeIcon = playMode === "shuffle" ? IcoShuffle : playMode === "repeat-one" ? IcoRepeatOne : IcoRepeat;
  const modeLabel = playMode === "shuffle" ? "随机播放" : playMode === "repeat-one" ? "单曲循环" : "顺序播放";
  const normalizedEqGains = EQ_FREQUENCIES.map((_, index) => {
    const gain = Number(equalizerGains[index] ?? 0);
    if (!Number.isFinite(gain)) {
      return 0;
    }
    return Math.max(EQ_MIN_GAIN, Math.min(EQ_MAX_GAIN, gain));
  });

  return (
    <div className={`np-overlay${theme === "dark" ? " np-dark" : ""}`}>
      <div className="np-bg">
        {currentSongCover && (
          <div className="np-bg-blur" style={{ backgroundImage: `url("${currentSongCover}")` }} />
        )}
        {bgColors && (
          <div className="np-bg-grad" style={{ background: `linear-gradient(155deg,${bgColors[0]} 0%,${bgColors[1]} 100%)` }} />
        )}
        <div className="np-bg-dim" />
      </div>

      <div className="np-shell">
        <div className="np-topbar">
          <button className="np-tb-btn" onClick={onClose} aria-label="收起" data-no-drag="true">
            <IcoDown />
          </button>
          <div className="np-tb-drag" data-tauri-drag-region aria-hidden="true" />
          <div className="np-tb-actions" data-no-drag="true">
            <button
              className={`np-tb-btn${showQueue ? " np-tb-btn-active" : ""}`}
              onClick={() => {
                setLyricMenuPos(null);
                setLyricSourceMenuOpen(false);
                setShowSongInfo(false);
                setMoreMenuOpen(false);
                setShowEqualizer(false);
                setShowQueue((previous) => !previous);
              }}
              aria-label="播放队列"
              data-no-drag="true"
            >
              <HamburgerMenuIcon width={18} height={18} />
            </button>
            {hasWindowControlButtons ? (
              <>
                <button
                  className={`np-tb-btn${windowFullscreen ? " np-tb-btn-active" : ""}`}
                  onClick={() => onToggleWindowFullscreen?.()}
                  aria-label={windowFullscreen ? "退出全屏" : "全屏"}
                  title={windowFullscreen ? "退出全屏" : "全屏"}
                  data-no-drag="true"
                >
                  {windowFullscreen ? <IcoWindowExitFull /> : <IcoWindowFull />}
                </button>
                <button
                  className="np-tb-btn"
                  onClick={() => onMinimizeWindow?.()}
                  aria-label="缩小"
                  title="缩小"
                  data-no-drag="true"
                >
                  <IcoWindowMinimize />
                </button>
                <button
                  className={`np-tb-btn${windowMaximized ? " np-tb-btn-active" : ""}`}
                  onClick={() => onToggleWindowMaximize?.()}
                  aria-label={windowMaximized ? "还原" : "放大"}
                  title={windowMaximized ? "还原" : "放大"}
                  data-no-drag="true"
                >
                  {windowMaximized ? <IcoWindowRestore /> : <IcoWindowMaximize />}
                </button>
                <button
                  className="np-tb-btn np-tb-btn-close"
                  onClick={() => onCloseWindow?.()}
                  aria-label="关闭"
                  title="关闭"
                  data-no-drag="true"
                >
                  <IcoWindowClose />
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div className="np-body">
          <div className="np-left">
            <div className="np-cover-wrap">
              {currentSongCover ? (
                <img src={currentSongCover} alt={currentSong?.title ?? "cover"} className="np-cover-img" />
              ) : (
                <div className="np-cover-empty"><IcoNote /></div>
              )}
            </div>
            <div className="np-meta">
              <p className="np-meta-title">{currentSong?.title ?? "未在播放"}</p>
              <p className="np-meta-artist">
                {currentSong ? `${currentSong.artist}${currentSong.album ? ` · ${currentSong.album}` : ""}` : "选择一首歌曲"}
              </p>
            </div>
          </div>

          <div
            className={`np-right np-right-${lyricAlign}`}
            onContextMenu={handleLyricContextMenu}
            onMouseEnter={() => setHoverLyricPanel(true)}
            onMouseLeave={() => setHoverLyricPanel(false)}
          >
            {showNowPlayingInfo && currentSong && (
              <div className={`np-lyric-topbar np-lyric-topbar-${lyricAlign}`}>
                <p className="np-lyric-song">{currentSong.title}</p>
                <p className="np-lyric-song-sub">{`${currentSong.artist}${currentSong.album ? ` · ${currentSong.album}` : ""}`}</p>
              </div>
            )}

            {renderLyrics()}

            <div className={`np-lyric-controls${hoverLyricPanel || lyricMenuOpen || lyricSourceMenuOpen ? " show" : ""}`} data-no-drag="true">
              <div className="np-source-wrap np-source-wrap-inline" ref={lyricSourceMenuRef}>
                <button
                  type="button"
                  className={`np-lyric-ctl-btn${lyricSourceMenuOpen ? " active" : ""}`}
                  onClick={() => {
                    setLyricMenuPos(null);
                    setShowSongInfo(false);
                    setMoreMenuOpen(false);
                    setLyricSourceMenuOpen((previous) => !previous);
                  }}
                  title={`歌词来源（当前：${currentLyricSourceText}）`}
                  aria-label="歌词来源"
                >
                  <IcoNote />
                </button>

                {lyricSourceMenuOpen ? (
                  <div className="np-source-menu np-source-menu-from-lyrics" onPointerDown={(event) => event.stopPropagation()}>
                    <div className="np-source-menu-head">歌词来源 · {currentLyricSourceText}</div>
                    <button type="button" className="np-source-menu-item" onClick={openLyricSourceDialog}>
                      指定在线歌词
                    </button>
                    <button
                      type="button"
                      className={`np-source-menu-item ${lyricSourceMode === "online" ? "active" : ""}`}
                      onClick={() => switchLyricSourceMode("online")}
                    >
                      在线{currentProviderLabel ? `（${currentProviderLabel}）` : ""}
                    </button>
                    <button
                      type="button"
                      className={`np-source-menu-item ${lyricSourceMode === "local" ? "active" : ""}`}
                      onClick={() => switchLyricSourceMode("local")}
                    >
                      本地
                    </button>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                className="np-lyric-ctl-btn"
                onClick={triggerReloadLyrics}
                title="重新加载歌词"
                disabled={!onReloadLyrics}
              >
                <ReloadIcon width={18} height={18} />
              </button>

              <button
                type="button"
                className="np-lyric-ctl-btn"
                onClick={cycleLyricAlign}
                title={`切换歌词对齐（当前：${getAlignText(lyricAlign)}）`}
              >
                {getAlignIcon(lyricAlign)}
              </button>

              <div className="np-lyric-ctl-row">
                <button
                  type="button"
                  className="np-lyric-ctl-btn"
                  onClick={() => adjustLyricSize(1)}
                  title={`增大字体（当前：${lyricFontSize}px）`}
                >
                  <PlusIcon width={18} height={18} />
                </button>
                <button
                  type="button"
                  className="np-lyric-ctl-btn"
                  onClick={() => adjustLyricSize(-1)}
                  title={`减小字体（当前：${lyricFontSize}px）`}
                >
                  <MinusIcon width={18} height={18} />
                </button>
              </div>

              <button
                type="button"
                className={`np-lyric-ctl-btn${lyricFontWeight === "Bold" ? " active" : ""}`}
                onClick={switchLyricWeight}
                title={`切换加粗（当前：${lyricFontWeight === "Bold" ? "加粗" : "常规"}）`}
              >
                <FontBoldIcon width={18} height={18} />
              </button>

              <div className="np-lyric-ctl-row">
                <button
                  type="button"
                  className={`np-lyric-ctl-btn${showTranslation ? " active" : ""}`}
                  onClick={toggleTranslation}
                  title={showTranslation ? "隐藏翻译行" : "显示翻译行"}
                >
                  {showTranslation ? <EyeOpenIcon width={18} height={18} /> : <EyeClosedIcon width={18} height={18} />}
                </button>
                <button
                  type="button"
                  className={`np-lyric-ctl-btn${showNowPlayingInfo ? " active" : ""}`}
                  onClick={toggleNowPlayingInfo}
                  title={showNowPlayingInfo ? "隐藏顶部歌曲信息" : "显示顶部歌曲信息"}
                >
                  {showNowPlayingInfo ? <EyeOpenIcon width={18} height={18} /> : <EyeClosedIcon width={18} height={18} />}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="np-progress">
          <span className="np-time">{fmt(currentTime)}</span>
          <input
            type="range"
            className="np-prog-slider"
            min={0}
            max={duration || 1}
            step={0.1}
            value={currentTime}
            style={{ "--prog-pct": `${progressPercent}%` } as CSSProperties}
            onChange={(event) => onSeek(Number(event.target.value))}
          />
          <span className="np-time np-time-r">{fmt(duration)}</span>
        </div>

        <div className="np-controls">
          <div className="np-ctrl-l">
            <button
              className={`np-ic-btn${showEqualizer ? " np-ic-active" : ""}`}
              onClick={() => {
                setLyricMenuPos(null);
                setLyricSourceMenuOpen(false);
                setShowSongInfo(false);
                setMoreMenuOpen(false);
                setShowQueue(false);
                setShowEqualizer((previous) => !previous);
              }}
              title="均衡器"
              data-no-drag="true"
            >
              <MixerHorizontalIcon width={18} height={18} />
            </button>
            <button
              className={`np-ic-btn${npDynamicBg ? " np-ic-active" : ""}`}
              onClick={toggleDynamicBg}
              title={npDynamicBg ? "关闭播放背景效果" : "开启播放背景效果"}
              data-no-drag="true"
            >
              <IcoWave />
            </button>
            <button
              className={`np-ic-btn${playMode !== "sequence" ? " np-ic-active" : ""}`}
              onClick={onCyclePlayMode}
              title={modeLabel}
              aria-label={modeLabel}
              data-no-drag="true"
            >
              <ModeIcon />
            </button>
          </div>

          <div className="np-ctrl-c">
            <button className="np-ic-btn np-ic-nav" onClick={onPlayPrevious} aria-label="上一首" data-no-drag="true"><IcoPrev /></button>
            <button
              className="np-play-btn"
              onClick={onTogglePlayPause}
              disabled={isResolvingSong}
              aria-label={isPlaying ? "暂停" : "播放"}
              data-no-drag="true"
            >
              {isPlaying ? <IcoPause /> : <IcoPlay />}
            </button>
            <button className="np-ic-btn np-ic-nav" onClick={onPlayNext} aria-label="下一首" data-no-drag="true"><IcoNext /></button>
          </div>

          <div className="np-ctrl-r">
            <div className="np-more-wrap" ref={moreMenuRef}>
              <button
                className={`np-ic-btn${moreMenuOpen ? " np-ic-active" : ""}`}
                onClick={() => {
                  setLyricMenuPos(null);
                  setLyricSourceMenuOpen(false);
                  setShowSongInfo(false);
                  setMoreMenuOpen((previous) => !previous);
                }}
                title="更多"
                data-no-drag="true"
              >
                <DotsHorizontalIcon width={18} height={18} />
              </button>
              {moreMenuOpen ? (
                <div className="np-more-menu" data-no-drag="true" onPointerDown={(event) => event.stopPropagation()}>
                  <div className="np-more-menu-head">更多操作</div>
                  {splitArtists.length <= 1 ? (
                    <button type="button" className="np-more-item" onClick={() => openCurrentArtist()} disabled={!hasArtist}>
                      前往艺术家
                    </button>
                  ) : (
                    <>
                      <div className="np-more-menu-sep" />
                      <div className="np-more-menu-head">前往艺术家</div>
                      {splitArtists.map((artist) => (
                        <button key={artist} type="button" className="np-more-item" onClick={() => openCurrentArtist(artist)}>
                          {artist}
                        </button>
                      ))}
                    </>
                  )}
                  <button type="button" className="np-more-item" onClick={openCurrentAlbum} disabled={!hasAlbum}>
                    前往专辑
                  </button>
                  <button type="button" className="np-more-item" onClick={openCurrentSongInfo} disabled={!hasSong}>
                    歌曲信息
                  </button>
                  <button type="button" className="np-more-item" onClick={openSettings}>
                    打开设置
                  </button>
                </div>
              ) : null}
            </div>
            <button
              className="np-ic-btn"
              onClick={() => onMutedChange(!muted)}
              aria-label={muted ? "取消静音" : "静音"}
              data-no-drag="true"
            >
              {muted ? <SpeakerOffIcon width={18} height={18} /> : <SpeakerLoudIcon width={18} height={18} />}
            </button>
            <input
              type="range"
              className="np-vol-slider"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              style={{ "--vol-pct": `${volumePercent}%` } as CSSProperties}
              onChange={(event) => {
                const next = Number(event.target.value);
                onVolumeChange(next);
                onMutedChange(next <= 0.001);
              }}
            />
          </div>
        </div>

        {showSongInfo && currentSong ? (
          <div className="np-song-info-backdrop" data-no-drag="true" onClick={() => setShowSongInfo(false)}>
            <section
              className="np-song-info-panel"
              data-no-drag="true"
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <header className="np-song-info-head">
                <h3>歌曲信息</h3>
                <button
                  type="button"
                  className="np-song-info-close"
                  onClick={() => setShowSongInfo(false)}
                  aria-label="关闭歌曲信息"
                >
                  ×
                </button>
              </header>

              <div className="np-song-info-grid">
                <div className="np-song-info-row">
                  <span>标题</span>
                  <strong>{currentSong.title || "—"}</strong>
                </div>
                <div className="np-song-info-row">
                  <span>艺术家</span>
                  <strong>{splitArtists.length ? splitArtists.join(" / ") : "—"}</strong>
                </div>
                <div className="np-song-info-row">
                  <span>专辑</span>
                  <strong>{currentSong.album || "—"}</strong>
                </div>
                <div className="np-song-info-row">
                  <span>时长</span>
                  <strong>{fmt(currentSong.duration)}</strong>
                </div>
                <div className="np-song-info-row">
                  <span>格式</span>
                  <strong>{currentSong.format?.toUpperCase() || "—"}</strong>
                </div>
                <div className="np-song-info-row">
                  <span>码率</span>
                  <strong>{formatSongBitrate(currentSong.bitrate)}</strong>
                </div>
                <div className="np-song-info-row">
                  <span>采样率</span>
                  <strong>{formatSongSampleRate(currentSong.sampleRate)}</strong>
                </div>
                <div className="np-song-info-row">
                  <span>位深</span>
                  <strong>{formatSongBitDepth(currentSong.bitDepth)}</strong>
                </div>
                <div className="np-song-info-row">
                  <span>声道</span>
                  <strong>{formatSongChannels(currentSong.channels)}</strong>
                </div>
                <div className="np-song-info-row">
                  <span>文件大小</span>
                  <strong>{formatSongFileSize(currentSong.fileSize)}</strong>
                </div>
                <div className="np-song-info-row">
                  <span>来源</span>
                  <strong>{formatSongSourceType(currentSong.sourceType)}</strong>
                </div>
                <div className="np-song-info-row np-song-info-row-path">
                  <span>路径</span>
                  <strong>{currentSong.filePath || "—"}</strong>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {showEqualizer ? (
          <div
            className="np-eq-backdrop"
            data-no-drag="true"
            onClick={() => setShowEqualizer(false)}
          >
            <section
              className="np-eq-panel"
              data-no-drag="true"
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <header className="np-eq-head">
                <h3>均衡器</h3>
                <div className="np-eq-head-actions">
                  <button
                    type="button"
                    className={`np-eq-switch${equalizerEnabled ? " on" : ""}`}
                    onClick={() => onEqualizerEnabledChange(!equalizerEnabled)}
                  >
                    {equalizerEnabled ? "已启用" : "已关闭"}
                  </button>
                  <button
                    type="button"
                    className="np-eq-close"
                    onClick={() => setShowEqualizer(false)}
                    aria-label="关闭均衡器"
                  >
                    ×
                  </button>
                </div>
              </header>

              <div className="np-eq-presets">
                {EQ_PRESETS.map((preset) => {
                  const isActive = preset.gains.every(
                    (gain, index) => Math.abs(gain - normalizedEqGains[index]) < 0.05,
                  );
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      className={`np-eq-preset${isActive ? " active" : ""}`}
                      onClick={() => onEqualizerApplyPreset(preset.gains)}
                    >
                      {preset.name}
                    </button>
                  );
                })}
              </div>

              <div className={`np-eq-bands${equalizerEnabled ? "" : " off"}`}>
                {EQ_FREQUENCIES.map((frequency, index) => (
                  <div key={frequency} className="np-eq-band">
                    <span className="np-eq-gain">{normalizedEqGains[index].toFixed(1)}dB</span>
                    <div className="np-eq-slider-wrap">
                      <input
                        type="range"
                        className="np-eq-slider"
                        min={EQ_MIN_GAIN}
                        max={EQ_MAX_GAIN}
                        step={0.1}
                        value={normalizedEqGains[index]}
                        style={{
                          "--eq-pct": `${((normalizedEqGains[index] - EQ_MIN_GAIN) / (EQ_MAX_GAIN - EQ_MIN_GAIN)) * 100}%`,
                        } as CSSProperties}
                        onChange={(event) => onEqualizerGainChange(index, Number(event.target.value))}
                        aria-label={`${fmtEqFrequency(frequency)} 增益`}
                      />
                    </div>
                    <span className="np-eq-frequency">{fmtEqFrequency(frequency)}</span>
                  </div>
                ))}
              </div>

              <footer className="np-eq-foot">
                <button type="button" className="np-eq-reset" onClick={onEqualizerReset}>
                  重置
                </button>
              </footer>
            </section>
          </div>
        ) : null}

        {lyricMenuPos && (
          <div
            className="np-ctx-menu"
            style={{ left: `${lyricMenuPos.x}px`, top: `${lyricMenuPos.y}px` }}
            onPointerDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            <div className="np-ctx-head">歌词设置</div>

            <button className={`np-ctx-item${lyricAlign === "left" ? " active" : ""}`} onClick={() => setLyricAlignMode("left")} type="button">
              左对齐
            </button>
            <button className={`np-ctx-item${lyricAlign === "center" ? " active" : ""}`} onClick={() => setLyricAlignMode("center")} type="button">
              居中
            </button>
            <button className={`np-ctx-item${lyricAlign === "right" ? " active" : ""}`} onClick={() => setLyricAlignMode("right")} type="button">
              右对齐
            </button>

            <div className="np-ctx-sep" />

            <button className="np-ctx-item" onClick={toggleTranslation} type="button">
              {showTranslation ? "隐藏翻译行" : "显示翻译行"}
            </button>
            <button className="np-ctx-item" onClick={toggleNowPlayingInfo} type="button">
              {showNowPlayingInfo ? "隐藏顶部信息" : "显示顶部信息"}
            </button>
            <button className="np-ctx-item" onClick={switchLyricWeight} type="button">
              切换加粗（当前：{lyricFontWeight === "Bold" ? "加粗" : "常规"}）
            </button>
            <button className="np-ctx-item" onClick={triggerReloadLyrics} type="button" disabled={!onReloadLyrics}>
              重新加载歌词
            </button>
          </div>
        )}
      </div>

      {showQueue && (
        <>
          <div className="np-sheet-bd" onClick={() => setShowQueue(false)} />
          <div className="np-queue-sheet">
            <div className="np-sheet-drag" />
            <div className="np-sheet-hd">
              <span className="np-sheet-hd-title">即将播放</span>
              <button className="np-sheet-clear" onClick={onClearQueue}>清空</button>
            </div>
            <div className="np-sheet-list">
              {queueSongs.length === 0 ? (
                <div className="np-hint" style={{ padding: "32px 16px" }}>队列为空</div>
              ) : (
                queueSongs.map((song) => {
                  const thumb = getSongCover(song, coverMap);
                  const isCurrent = song.id === currentSongId;
                  return (
                    <div key={song.id} className={`np-q-row${isCurrent ? " np-q-current" : ""}`}>
                      <div className="np-q-thumb">
                        {thumb ? <img src={thumb} alt="" className="np-q-thumb-img" /> : <div className="np-q-thumb-empty"><IcoNote /></div>}
                      </div>
                      <button className="np-q-main" onClick={() => { onPlaySong(song.id); setShowQueue(false); }}>
                        <span className="np-q-name">
                          {song.title}
                          {song.isHr && <span className="np-badge np-badge-hr">HR</span>}
                          {song.isSq && <span className="np-badge np-badge-sq">SQ</span>}
                        </span>
                        <span className="np-q-artist">{song.artist}</span>
                      </button>
                      <button className="np-q-del" onClick={() => onRemoveFromQueue(song.id)} aria-label="移除">×</button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

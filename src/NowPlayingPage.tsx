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
  npAutoScrollLyrics: boolean;
  npDynamicBg: boolean;
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
  onReloadLyrics?: () => void;
  onLyricSizeChange?: (next: number) => void;
  onLyricCenteredChange?: (centered: boolean) => void;
  onFontWeightChange?: (next: FontWeightOption) => void;
}

const FW: Record<FontWeightOption, number> = {
  Normal: 400,
  Medium: 500,
  Bold: 700,
};

function fmt(seconds: number) {
  const minute = Math.floor(seconds / 60);
  const second = Math.floor(seconds % 60);
  return `${minute}:${String(second).padStart(2, "0")}`;
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

const IcoDown = () => (
  <svg viewBox="0 0 24 24" fill="none" width="22" height="22" aria-hidden>
    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
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
  npAutoScrollLyrics,
  npDynamicBg,
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
  onReloadLyrics,
  onLyricSizeChange,
  onLyricCenteredChange,
  onFontWeightChange,
}: NowPlayingPageProps) {
  const [bgColors, setBgColors] = useState<[string, string] | null>(null);
  const [showQueue, setShowQueue] = useState(false);

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

  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);
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

      if (lyricMenuOpen) {
        setLyricMenuPos(null);
        return;
      }

      onClose();
    };

    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [lyricMenuOpen, onClose, showQueue]);

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
    setLyricMenuPos(null);
  };

  const adjustLyricSize = (delta: number) => {
    const next = Math.min(56, Math.max(14, lyricFontSize + delta));
    setLyricFontSize(next);
    onLyricSizeChange?.(next);
  };

  const toggleTranslation = () => {
    setShowTranslation((previous) => !previous);
    setLyricMenuPos(null);
  };

  const toggleNowPlayingInfo = () => {
    setShowNowPlayingInfo((previous) => !previous);
    setLyricMenuPos(null);
  };

  const triggerReloadLyrics = () => {
    onReloadLyrics?.();
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

  const renderLyrics = () => {
    if (lyricsLoading) {
      return <div className="np-hint">正在加载歌词...</div>;
    }

    if (lyricsError) {
      return <div className="np-hint np-hint-err">{lyricsError}</div>;
    }

    if (!parsedLyrics.length) {
      return <div className="np-hint">暂无歌词</div>;
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
          <button
            className={`np-tb-btn${showQueue ? " np-tb-btn-active" : ""}`}
            onClick={() => {
              setLyricMenuPos(null);
              setShowQueue((previous) => !previous);
            }}
            aria-label="播放队列"
            data-no-drag="true"
          >
            <HamburgerMenuIcon width={18} height={18} />
          </button>
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

            <div className={`np-lyric-controls${hoverLyricPanel || lyricMenuOpen ? " show" : ""}`} data-no-drag="true">
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
            <button className="np-ic-btn np-ic-dim" disabled title="均衡器（敬请期待）" data-no-drag="true">
              <MixerHorizontalIcon width={18} height={18} />
            </button>
            <button className="np-ic-btn np-ic-dim" disabled title="频谱（敬请期待）" data-no-drag="true">
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
            <button className="np-ic-btn np-ic-dim" disabled title="更多（敬请期待）" data-no-drag="true">
              <DotsHorizontalIcon width={18} height={18} />
            </button>
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

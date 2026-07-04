"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api-client";
import { parseLrc, findActiveLineIndex, formatTime, type LyricLine } from "@/lib/lrc-parser";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  X,
  Music2,
  Mic,
  Loader2,
  ChevronDown,
  AlertCircle,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { AudioMatchDialog } from "@/components/voicehub/audio-match-dialog";
import { toast } from "sonner";

/**
 * 统一音乐播放器 — 支持音频 (mp3) 和视频 (mp4) 播放。
 *
 * 媒体类型由当前歌曲的平台推导：
 *   - bilibili → 视频 (mp4)，可切换到视频浮层全屏播放
 *   - netease/qq → 音频 (mp3)，隐藏 <audio> 元素
 *
 * 状态 (currentSong, isPlaying, mediaType) 由全局 Zustand store 管理，
 * 找歌列表 / 播放历史列表与播放器保持同步。
 *
 * 播放逻辑保持原版不变：切换歌曲时调用 /api/music/resolve-url 解析真实播放链接，
 * 通过 /api/music/proxy 代理附加 Referer 头以绕过 CDN 防盗链。
 */
export function MusicPlayer() {
  const {
    currentSong,
    isPlaying,
    setIsPlaying,
    setCurrentSong,
    playSong,
    stopPlayer,
    setPreviewPlayingId,
    mediaType,
    audioMatchOpen,
    setAudioMatchOpen,
  } = useStore();

  // A single media element ref — we render <audio> or <video> based on mediaType.
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const videoOverlayRef = useRef<HTMLVideoElement | null>(null);
  const lyricLinesRef = useRef<LyricLine[]>([]);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [activeLine, setActiveLine] = useState(-1);
  const [lyricLines, setLyricLines] = useState<LyricLine[]>([]);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [videoMode, setVideoMode] = useState(false);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const lyricScrollRef = useRef<HTMLDivElement>(null);
  // Guard to prevent the isPlaying effect from pausing during resolve-url playback start
  const startingPlayRef = useRef(false);

  const platform = currentSong?.musicPlatform || "netease";
  const isVideo = mediaType === "video";

  // Parse lyrics from the song's embedded LRC (if any)
  useEffect(() => {
    if (!currentSong) return;
    const lines = currentSong.lrc ? parseLrc(currentSong.lrc).lines : [];
    lyricLinesRef.current = lines;
    setLyricLines(lines);
    setActiveLine(-1);
  }, [currentSong?.id, currentSong?.lrc]);

  // Resolve a real playable URL when the song changes
  useEffect(() => {
    if (!currentSong) {
      setResolvedUrl(null);
      return;
    }
    let cancelled = false;
    setLoadingUrl(true);
    setErrorMsg(null);
    setResolvedUrl(null);

    (async () => {
      try {
        const res = await api.resolveUrl(platform, currentSong!.musicId || currentSong!.id, {
          name: currentSong!.title,
          artist: currentSong!.artist,
          duration: currentSong!.duration ?? undefined,
        });
        if (cancelled) return;
        if (res.url) {
          const proxied = api.proxyUrl(res.url);
          setResolvedUrl(proxied);
          if (res.lyric) {
            const parsed = parseLrc(res.lyric).lines;
            lyricLinesRef.current = parsed;
            setLyricLines(parsed);
          }
        } else {
          setErrorMsg("无法获取播放链接");
          toast.error("无法获取播放链接");
          setIsPlaying(false);
        }
      } catch (e) {
        if (!cancelled) {
          const msg = (e as Error).message || "解析播放链接失败";
          setErrorMsg(msg);
          toast.error(msg);
          setIsPlaying(false);
        }
      } finally {
        if (!cancelled) setLoadingUrl(false);
      }
    })();

    return () => {
      cancelled = true;
      // Stop media on cleanup
      if (mediaRef.current) {
        mediaRef.current.pause();
      }
    };
  }, [currentSong?.id, platform, setIsPlaying]);

  // Set the media src ONLY when resolvedUrl changes (not on play/pause).
  useEffect(() => {
    if (!resolvedUrl || !mediaRef.current) return;
    const el = mediaRef.current;
    el.src = resolvedUrl;
    el.load();
    if (isPlaying) {
      startingPlayRef.current = true;
      el.play().then(() => {
        setPreviewPlayingId(null);
      }).catch((e) => {
        const msg = (e as Error).message || "播放失败";
        if (!msg.includes("interrupted") && !msg.includes("NotAllowedError") && !msg.includes("play()")) {
          setErrorMsg(msg);
          toast.error(msg);
        }
        setIsPlaying(false);
      }).finally(() => {
        setTimeout(() => { startingPlayRef.current = false; }, 100);
      });
    }
  }, [resolvedUrl]);

  // play/pause control — sync media element with isPlaying state.
  useEffect(() => {
    if (startingPlayRef.current) return;
    const el = mediaRef.current;
    if (!el || !resolvedUrl) return;
    if (isPlaying) {
      el.play().catch((e) => {
        const msg = (e as Error).message || "播放失败";
        if (!msg.includes("interrupted") && !msg.includes("NotAllowedError") && !msg.includes("play()")) {
          setErrorMsg(msg);
          toast.error(msg);
        }
        setIsPlaying(false);
      });
    } else {
      el.pause();
    }
  }, [isPlaying, setIsPlaying, resolvedUrl]);

  // volume changes
  useEffect(() => {
    if (mediaRef.current) mediaRef.current.volume = muted ? 0 : volume;
  }, [volume, muted]);

  // Video overlay fullscreen + landscape handling
  useEffect(() => {
    if (!videoMode || !isVideo) return;
    if (mediaRef.current && mediaRef.current !== videoOverlayRef.current) {
      mediaRef.current.pause();
    }
    setIsPlaying(false);
    const el = videoOverlayRef.current;
    if (!el) return;
    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    if (!isTouch) return;

    let exited = false;
    const enterFs = async () => {
      try {
        if (el.requestFullscreen) {
          await el.requestFullscreen();
        } else {
          const v = el as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
          if (typeof v.webkitEnterFullscreen === "function") v.webkitEnterFullscreen();
        }
      } catch { /* noop */ }
      try {
        const so = screen.orientation as ScreenOrientation & {
          lock?: (o: OrientationLockType) => Promise<void>;
        };
        if (so?.lock) await so.lock("landscape");
      } catch { /* noop */ }
    };
    enterFs();

    const onFsChange = () => {
      if (!document.fullscreenElement && !exited) {
        exited = true;
        setVideoMode(false);
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      try {
        const so = screen.orientation as ScreenOrientation & { unlock?: () => void };
        if (so?.unlock) so.unlock();
      } catch { /* noop */ }
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, [videoMode, isVideo, setIsPlaying]);

  // auto-scroll active lyric into view
  useEffect(() => {
    if (activeLine < 0 || !lyricScrollRef.current) return;
    const el = lyricScrollRef.current.querySelector(`[data-line="${activeLine}"]`) as HTMLElement | null;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeLine]);

  const seek = useCallback((value: number) => {
    if (mediaRef.current) mediaRef.current.currentTime = value;
    setProgress(value);
  }, []);

  function onTimeUpdate() {
    const el = mediaRef.current;
    if (!el) return;
    setProgress(el.currentTime);
    setDuration(el.duration || 0);
    const idx = findActiveLineIndex(lyricLinesRef.current, el.currentTime);
    setActiveLine((prev) => (idx !== prev ? idx : prev));
  }

  function handleClose() {
    if (mediaRef.current) {
      mediaRef.current.pause();
    }
    stopPlayer();
    setResolvedUrl(null);
  }

  if (!currentSong) return null;

  const hasLyrics = lyricLines.length > 0;
  const proxiedCover = currentSong.cover && currentSong.cover.startsWith("http")
    ? api.proxyUrl(currentSong.cover)
    : currentSong.cover;
  const playDisabled = loadingUrl;

  return (
    <>
      {/* Hidden audio element (rendered when mediaType is audio) */}
      {mediaType === "audio" && (
        <audio
          ref={(el) => { mediaRef.current = el; }}
          onTimeUpdate={onTimeUpdate}
          className="hidden"
        />
      )}
      {/* Video element (rendered when mediaType is video) — hidden when not in videoMode */}
      {mediaType === "video" && (
        <video
          ref={(el) => { mediaRef.current = el; }}
          onTimeUpdate={onTimeUpdate}
          className="hidden"
        />
      )}

      {/* Video player overlay (for bilibili mp4) */}
      {isVideo && videoMode && resolvedUrl && (
        <div
          className="fixed inset-0 bg-black flex items-center justify-center sm:p-4"
          style={{ zIndex: 2147483647 }}
          onClick={() => setVideoMode(false)}
        >
          <div
            className="relative w-full h-full sm:max-w-5xl sm:w-auto sm:h-auto sm:max-h-[92vh] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <video
              ref={(el) => { videoOverlayRef.current = el; }}
              src={resolvedUrl}
              controls
              autoPlay
              playsInline
              className="w-full h-full sm:max-w-5xl sm:max-h-[92vh] object-contain"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-3 right-3 z-10 text-white bg-black/40 hover:bg-black/60 rounded-full h-10 w-10"
              onClick={() => setVideoMode(false)}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-50 glass-strong border-t border-border pb-safe">
        {/* === Mobile layout (two rows) === */}
        <div className="sm:hidden">
          {/* Row 1: cover + info + play/pause + close */}
          <div className="flex items-center gap-3 px-3 pt-2.5 pb-1.5">
            <div className="relative shrink-0">
              <button
                onClick={() => hasLyrics && setLyricsOpen(!lyricsOpen)}
                className="flex items-center gap-2.5 min-w-0 flex-1 group"
                title={hasLyrics ? "查看歌词" : "暂无歌词"}
              >
                <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-gradient-to-br from-blue-500/30 to-teal-500/30 flex items-center justify-center shrink-0">
                  {proxiedCover && !proxiedCover.startsWith("from-") ? (
                    <img src={proxiedCover} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : proxiedCover && proxiedCover.startsWith("from-") ? (
                    <div className={`w-full h-full bg-gradient-to-br ${proxiedCover}`} />
                  ) : (
                    <Music2 className="w-5 h-5 text-blue-400" />
                  )}
                  {isPlaying && !loadingUrl && !errorMsg && (
                    <div className="absolute inset-0 flex items-end justify-center gap-0.5 bg-black/40 p-1.5">
                      {[0, 1, 2, 3].map((i) => (
                        <span key={i} className="w-0.5 bg-blue-400 rounded-full" style={{ animation: `equalizer 0.8s ease-in-out ${i * 0.15}s infinite`, height: "40%" }} />
                      ))}
                    </div>
                  )}
                  {loadingUrl && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                      <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                    </div>
                  )}
                  {errorMsg && (
                    <div className="absolute inset-0 flex items-center justify-center bg-red-900/80">
                      <AlertCircle className="w-4 h-4 text-red-300" />
                    </div>
                  )}
                </div>
              </button>
              {isVideo && (
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute left-0 top-0 w-12 h-12 rounded-lg bg-black/55 hover:bg-black/70 text-white border-0 hover:text-white z-20"
                  onClick={() => setVideoMode(true)}
                  title="视频模式"
                >
                  <Video className="w-4 h-4" />
                </Button>
              )}
            </div>
            <button
              onClick={() => hasLyrics && setLyricsOpen(!lyricsOpen)}
              className="min-w-0 flex-1 text-left"
              title={hasLyrics ? "查看歌词" : "暂无歌词"}
            >
              <div className="min-w-0 text-left">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium truncate">{currentSong.title}</span>
                  {isVideo && <Badge className="text-[9px] py-0 px-1 bg-teal-500/80 shrink-0"><Video className="w-2.5 h-2.5 mr-0.5" />视频</Badge>}
                </div>
                <div className="text-xs text-muted-foreground truncate">{currentSong.artist}</div>
                {errorMsg && <div className="text-[10px] text-red-400 truncate">{errorMsg}</div>}
              </div>
            </button>
            <Button
              size="icon"
              className="h-10 w-10 rounded-full bg-primary hover:bg-primary/90 shrink-0 relative z-10"
              onClick={() => {
                if (errorMsg) { setErrorMsg(null); setCurrentSong({ ...currentSong }); return; }
                setIsPlaying(!isPlaying);
              }}
              disabled={playDisabled}
            >
              {loadingUrl ? <Loader2 className="w-5 h-5 animate-spin" /> : errorMsg ? <AlertCircle className="w-5 h-5" /> : isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 relative z-10" onClick={handleClose} title="停止并关闭播放器">
              <X className="w-5 h-5" />
            </Button>
          </div>
          {/* Row 2: progress bar */}
          <div className="flex items-center gap-2 px-3 pb-1">
            <span className="text-[10px] text-muted-foreground tabular-nums w-9 text-right">{formatTime(progress)}</span>
            <Slider value={[progress]} max={duration || 100} step={0.1} onValueChange={(v) => seek(v[0])} className="flex-1" />
            <span className="text-[10px] text-muted-foreground tabular-nums w-9">{formatTime(duration)}</span>
          </div>
          {/* Row 3: secondary buttons */}
          <div className="flex items-center gap-1 px-3 pb-2 overflow-x-auto scrollbar-thin relative z-10">
            {isVideo && (
              <Button variant="ghost" size="sm" className="h-8 px-2 shrink-0 relative z-20" onClick={() => setVideoMode(true)} title="视频模式">
                <Video className="w-3.5 h-3.5" />
              </Button>
            )}
            {hasLyrics && (
              <Button variant="ghost" size="sm" className={`h-8 px-2.5 shrink-0 ${lyricsOpen ? "text-primary" : ""}`} onClick={() => setLyricsOpen(!lyricsOpen)}>
                <span className="text-[10px] font-bold">LRC</span>
              </Button>
            )}
            <Button variant="ghost" size="sm" className={`h-8 px-2.5 shrink-0 ${audioMatchOpen ? "text-primary" : ""}`} onClick={() => setAudioMatchOpen(true)}>
              <Mic className="w-3.5 h-3.5" />
            </Button>
            <div className="flex items-center gap-1 ml-auto shrink-0">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setMuted(!muted)}>
                {muted || volume === 0 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </Button>
              <Slider value={[muted ? 0 : volume * 100]} max={100} onValueChange={(v) => { setVolume(v[0] / 100); setMuted(false); }} className="w-16" />
            </div>
          </div>
        </div>

        {/* === Desktop layout (single row, taller) === */}
        <div className="hidden sm:block">
          <div className="mx-auto max-w-7xl px-6 h-24 flex items-center gap-4">
            <div className="relative shrink-0">
              <button
                onClick={() => hasLyrics && setLyricsOpen(!lyricsOpen)}
                className="flex items-center gap-3 min-w-0 w-72 group"
                title={hasLyrics ? "查看歌词" : "暂无歌词"}
              >
                <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-gradient-to-br from-blue-500/30 to-teal-500/30 flex items-center justify-center shrink-0">
                  {proxiedCover && !proxiedCover.startsWith("from-") ? (
                    <img src={proxiedCover} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : proxiedCover && proxiedCover.startsWith("from-") ? (
                    <div className={`w-full h-full bg-gradient-to-br ${proxiedCover}`} />
                  ) : (
                    <Music2 className="w-6 h-6 text-blue-400" />
                  )}
                  {isPlaying && !loadingUrl && !errorMsg && (
                    <div className="absolute inset-0 flex items-end justify-center gap-0.5 bg-black/40 p-1.5">
                      {[0, 1, 2, 3].map((i) => (
                        <span key={i} className="w-0.5 bg-blue-400 rounded-full" style={{ animation: `equalizer 0.8s ease-in-out ${i * 0.15}s infinite`, height: "40%" }} />
                      ))}
                    </div>
                  )}
                  {loadingUrl && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                      <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                    </div>
                  )}
                  {errorMsg && (
                    <div className="absolute inset-0 flex items-center justify-center bg-red-900/80">
                      <AlertCircle className="w-5 h-5 text-red-300" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base font-medium truncate">{currentSong.title}</span>
                    {isVideo && <Badge className="text-[10px] py-0 px-1 bg-teal-500/80 shrink-0"><Video className="w-2.5 h-2.5 mr-0.5" />视频</Badge>}
                  </div>
                  <div className="text-sm text-muted-foreground truncate">{currentSong.artist}</div>
                  {errorMsg && <div className="text-[11px] text-red-400 truncate max-w-[180px]">{errorMsg}</div>}
                </div>
              </button>
              {isVideo && (
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute left-0 top-0 w-14 h-14 rounded-lg bg-black/55 hover:bg-black/70 text-white border-0 hover:text-white z-20"
                  onClick={() => setVideoMode(true)}
                  title="视频模式"
                >
                  <Video className="w-5 h-5" />
                </Button>
              )}
            </div>

            {/* Controls */}
            <div className="flex flex-col items-center gap-1.5 flex-1 max-w-xl relative z-10">
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  className="h-11 w-11 rounded-full bg-primary hover:bg-primary/90"
                  onClick={() => {
                    if (errorMsg) { setErrorMsg(null); setCurrentSong({ ...currentSong }); return; }
                    setIsPlaying(!isPlaying);
                  }}
                  disabled={playDisabled}
                  title={errorMsg ? "重试播放" : isPlaying ? "暂停" : "播放"}
                >
                  {loadingUrl ? <Loader2 className="w-5 h-5 animate-spin" /> : errorMsg ? <AlertCircle className="w-5 h-5" /> : isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                </Button>
                {isVideo && (
                  <Button variant="ghost" size="icon" className="h-9 w-9 relative z-20" onClick={() => setVideoMode(true)} title="视频模式">
                    <Video className="w-4 h-4" />
                  </Button>
                )}
                {hasLyrics && (
                  <Button variant="ghost" size="icon" className={`h-9 w-9 ${lyricsOpen ? "text-primary" : ""}`} onClick={() => setLyricsOpen(!lyricsOpen)} title="歌词">
                    <span className="text-[11px] font-bold tracking-tight">LRC</span>
                  </Button>
                )}
                <Button variant="ghost" size="icon" className={`h-9 w-9 ${audioMatchOpen ? "text-primary" : ""}`} onClick={() => setAudioMatchOpen(true)} title="听歌识曲">
                  <Mic className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2 w-full">
                <span className="text-[11px] text-muted-foreground tabular-nums w-10 text-right">{formatTime(progress)}</span>
                <Slider value={[progress]} max={duration || 100} step={0.1} onValueChange={(v) => seek(v[0])} className="flex-1" />
                <span className="text-[11px] text-muted-foreground tabular-nums w-10">{formatTime(duration)}</span>
              </div>
            </div>

            {/* Volume + close */}
            <div className="flex items-center gap-2 w-36 justify-end">
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setMuted(!muted)}>
                {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </Button>
              <Slider value={[muted ? 0 : volume * 100]} max={100} onValueChange={(v) => { setVolume(v[0] / 100); setMuted(false); }} className="w-20" />
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={handleClose} title="停止并关闭播放器">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Lyrics panel */}
        {lyricsOpen && (
          <div className="border-t border-border bg-background/95 backdrop-blur-xl">
            <div className="mx-auto max-w-3xl px-4 py-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold tracking-tight text-primary bg-primary/10 px-1.5 py-0.5 rounded">LRC</span>
                  <span className="text-sm font-medium">{currentSong.title}</span>
                  <span className="text-xs text-muted-foreground">— {currentSong.artist}</span>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setLyricsOpen(false)}>
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </div>
              {hasLyrics ? (
                <div ref={lyricScrollRef} className="max-h-64 overflow-y-auto scrollbar-thin px-4 py-8 text-center">
                  {lyricLines.map((line, i) => (
                    <div
                      key={i}
                      data-line={i}
                      className={`py-1.5 transition-all duration-300 ${
                        i === activeLine
                          ? "text-lg font-semibold text-primary scale-105"
                          : i < activeLine
                          ? "text-sm text-muted-foreground/50"
                          : "text-sm text-muted-foreground"
                      }`}
                    >
                      {line.text || "♪"}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 text-sm text-muted-foreground">
                  <span className="text-xs font-bold tracking-tight text-primary bg-primary/10 px-1.5 py-0.5 rounded">LRC</span>
                  <p className="mt-2">暂无歌词</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Audio Match (听歌识曲) dialog — triggered from the player panel */}
      <AudioMatchDialog
        open={audioMatchOpen}
        onOpenChange={setAudioMatchOpen}
        onSelect={(song) => {
          playSong({
            id: song.id,
            title: song.title,
            artist: song.artist,
            cover: song.cover ?? null,
            musicPlatform: song.platform,
            musicId: song.id,
            lrc: song.lrc ?? null,
            duration: song.duration ?? null,
          });
          setAudioMatchOpen(false);
        }}
      />
    </>
  );
}

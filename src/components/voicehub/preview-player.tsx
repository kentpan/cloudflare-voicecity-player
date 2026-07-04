"use client";
import { useState, useEffect } from "react";
import { Play, Pause, Loader2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Song } from "@/types/voicehub";

interface PreviewPlayerProps {
  trackId: string;
  platform?: string;
  size?: "sm" | "md";
  className?: string;
  /** Optional title/artist/cover for the unified player display */
  title?: string;
  artist?: string;
  cover?: string;
}

/**
 * 紧凑的试听按钮 — 点击后把搜索结果构造成 Song 对象传给 store.playSong()，
 * 由全局 MusicPlayer 负责解析 URL、播放、显示歌词等。
 *
 * 互斥逻辑：当统一播放器在播放时，点击试听会切换到这首；
 * 再次点击同一首会暂停（通过 stopPlayer）。
 */
export function PreviewPlayer({ trackId, platform, size = "sm", className, title, artist, cover }: PreviewPlayerProps) {
  const [loading, setLoading] = useState(false);
  const detectedPlatform = platform || detectPlatform(trackId);
  const { playSong, stopPlayer, currentSong, isPlaying, setPreviewPlayingId } = useStore();

  // 当前是否正在播放这首试听曲目
  const isThisPlaying = currentSong?.id === `preview-${trackId}` && isPlaying;

  useEffect(() => {
    if (currentSong && currentSong.id !== `preview-${trackId}`) {
      // 别的歌在播，本按钮显示为未播放状态
    }
  }, [currentSong, trackId]);

  async function toggle() {
    // 如果正在播放这首，点击则暂停
    if (isThisPlaying) {
      stopPlayer();
      return;
    }

    // 构造 Song 对象给统一播放器
    setLoading(true);
    setPreviewPlayingId(trackId);
    try {
      const previewSong: Song = {
        id: `preview-${trackId}`,
        title: title || "试听",
        artist: artist || "未知",
        cover: cover || null,
        musicPlatform: detectedPlatform as Song["musicPlatform"],
        musicId: trackId,
        lrc: null,
        duration: null,
      };
      playSong(previewSong);
    } catch (e) {
      const msg = (e as Error).message || "试听失败";
      toast.error(msg);
      setPreviewPlayingId(null);
    } finally {
      setLoading(false);
    }
  }

  const dim = size === "sm" ? "w-8 h-8" : "w-10 h-10";
  const icon = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";

  return (
    <button
      onClick={(e) => { e.stopPropagation(); toggle(); }}
      className={cn(
        "relative rounded-full flex items-center justify-center transition-all shrink-0",
        dim,
        isThisPlaying
          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
          : "bg-primary/15 text-primary hover:bg-primary hover:text-primary-foreground",
        className
      )}
      aria-label={isThisPlaying ? "停止试听" : "试听"}
      title={isThisPlaying ? "停止试听" : "试听片段"}
    >
      {loading ? (
        <Loader2 className={cn(icon, "animate-spin")} />
      ) : isThisPlaying ? (
        <Pause className={cn(icon, "fill-current")} />
      ) : (
        <Play className={cn(icon, "fill-current ml-0.5")} />
      )}
      {isThisPlaying && !loading && (
        <span className="absolute inset-0 rounded-full" style={{ animation: "pulse-ring 1.5s ease-out infinite" }} />
      )}
    </button>
  );
}

function detectPlatform(id: string): string {
  if (id.startsWith("wy-")) return "netease";
  if (id.startsWith("qq-")) return "qq";
  if (id.startsWith("bili-")) return "bilibili";
  return "netease";
}

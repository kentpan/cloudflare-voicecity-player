/** Shared domain types for VoiceCity Lite (找歌 + 播放列表). */

export type MusicPlatform = "netease" | "qq" | "bilibili" | "custom";

/** 音乐搜索结果（网易云 / QQ / B站 搜索 API 返回） */
export interface MusicSearchResult {
  id: string;
  title: string;
  artist: string;
  cover?: string | null;
  platform: MusicPlatform;
  duration?: number | null;
  playUrl?: string;
  lrc?: string | null;
}

/**
 * Song — 统一播放器 + 播放列表共用的一首歌。
 * 保留原 Song 结构中播放器需要的字段（cover/musicPlatform/musicId/lrc/duration），
 * 移除点歌/送歌/投票/排期等已剥离的字段。
 */
export interface Song {
  id: string;
  title: string;
  artist: string;
  cover: string | null;
  musicPlatform: MusicPlatform | null;
  musicId: string | null;
  lrc: string | null;
  duration: number | null;
  /** 播放列表记录时间戳（indexedDB 主键） */
  playedAt?: string;
  /** 是否已收藏 */
  favorited?: boolean;
  /** 收藏时间戳 */
  favoritedAt?: string;
}

/** View routing keys */
export type ViewKey = "find" | "history";

"use client";
import type { MusicSearchResult, Song } from "@/types/voicehub";
import type { PlayerConfig } from "@/lib/player-config";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    ...options,
  });
  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json.error || json.message || `请求失败 (${res.status})`);
  }
  return json.data as T;
}

export const api = {
  // 音乐搜索
  searchMusic: (q: string, platform: string) =>
    request<MusicSearchResult[]>(`/api/search?q=${encodeURIComponent(q)}&platform=${platform}`),

  // 解析播放链接
  resolveUrl: (
    platform: string,
    musicId: string,
    opts?: { quality?: string; name?: string; artist?: string; album?: string; duration?: number }
  ) =>
    request<{ url: string; lyric: string | null; source: string }>("/api/music/resolve-url", {
      method: "POST",
      body: JSON.stringify({ platform, musicId, ...opts }),
    }),

  getLyric: (platform: string, musicId: string) =>
    request<{ lyric: string }>(`/api/music/lyric?platform=${platform}&musicId=${encodeURIComponent(musicId)}`),

  proxyUrl: (url: string) => `/api/music/proxy?url=${encodeURIComponent(url)}`,

  // auth
  adminSecretLogin: (secret: string) =>
    request<{ user: import("@/lib/store").AuthUser }>("/api/auth/admin-secret-login", {
      method: "POST",
      body: JSON.stringify({ secret }),
    }),
  me: () => request<{ user: import("@/lib/store").AuthUser | null }>("/api/auth/me"),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  getSetupStatus: () =>
    request<{ isCloudflare: boolean; adminSecretConfigured: boolean }>("/api/setup-status"),

  // passkey
  passkeyRegisterOptions: () =>
    request<unknown>("/api/auth/passkey/register-options", { method: "POST" }),
  passkeyRegisterVerify: (credential: unknown) =>
    request<{ verified: boolean }>("/api/auth/passkey/register-verify", {
      method: "POST",
      body: JSON.stringify({ credential }),
    }),
  passkeyLoginOptions: () => request<unknown>("/api/auth/passkey/login-options"),
  passkeyLoginVerify: (credential: unknown) =>
    request<{ user: import("@/lib/store").AuthUser }>("/api/auth/passkey/login-verify", {
      method: "POST",
      body: JSON.stringify({ credential }),
    }),

  // player config
  getPlayerConfig: () => request<PlayerConfig>("/api/player-config"),
  updatePlayerConfig: (data: Partial<PlayerConfig>) =>
    request<PlayerConfig>("/api/player-config", { method: "POST", body: JSON.stringify(data) }),
};

export function searchResultToSong(r: MusicSearchResult): Song {
  return {
    id: r.id,
    title: r.title,
    artist: r.artist,
    cover: r.cover ?? null,
    musicPlatform: r.platform,
    musicId: r.id,
    lrc: r.lrc ?? null,
    duration: r.duration ?? null,
  };
}

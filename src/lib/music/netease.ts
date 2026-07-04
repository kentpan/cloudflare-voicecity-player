/**
 * NetEase Cloud Music (网易云音乐) platform plugin.
 *
 * Ported from the original VoiceCity `server/utils/native_wy.ts` +
 * `server/api/native-api/search/wy.get.ts`, preserving ALL original headers
 * and the EAPI encryption flow. No simplification.
 *
 * All functionality (search, resolve play URL, fetch lyric) is self-contained.
 * The unified /api/music/proxy route handles audio + image streaming with
 * the correct Referer headers.
 */

import { createHash, createCipheriv } from "node:crypto";

// --- EAPI encryption (ported verbatim from native_wy.ts) ---
const eapiKey = "e82ckenh8dichen8";

function aesEncrypt(buffer: Buffer, mode: string, key: string | Buffer, iv: string | Buffer): Buffer {
  const cipher = createCipheriv(mode, key, iv);
  return Buffer.concat([cipher.update(buffer), cipher.final()]);
}

export function eapi(url: string, object: unknown): { params: string } {
  const text = typeof object === "object" ? JSON.stringify(object) : String(object);
  const message = `nobody${url}use${text}md5forencrypt`;
  const digest = createHash("md5").update(message).digest("hex");
  const data = `${url}-36cd479b6b5-${text}-36cd479b6b5-${digest}`;
  return {
    params: aesEncrypt(Buffer.from(data), "aes-128-ecb", eapiKey, "").toString("hex").toUpperCase(),
  };
}

// Original headers from native_wy.ts (preserved verbatim)
const WY_EAPI_HEADERS = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36",
  origin: "https://music.163.com",
  "Content-Type": "application/x-www-form-urlencoded",
};

// Headers for the public search API (preserved from original)
const WY_SEARCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36",
  Referer: "https://music.163.com",
  origin: "https://music.163.com",
};

// Headers for song URL resolution (preserved from original — os=pc cookie needed)
const WY_URL_HEADERS = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36",
  Referer: "https://music.163.com",
  origin: "https://music.163.com",
  Cookie: "os=pc",
};

// Headers for lyric API (preserved from original)
const WY_LYRIC_HEADERS = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36",
  Referer: "https://music.163.com",
  origin: "https://music.163.com",
};

export interface NetEaseSong {
  id: number;
  name: string;
  artist: string;
  album: string;
  albumId: number;
  duration: number; // seconds
  cover: string;
}

/**
 * Search NetEase via the public search API (no encryption needed).
 * Headers preserved from the original lx-music default headers.
 */
export async function searchNetEase(keyword: string, limit = 20): Promise<NetEaseSong[]> {
  const url = `https://music.163.com/api/search/get?s=${encodeURIComponent(keyword)}&type=1&limit=${limit}`;
  const res = await fetch(url, {
    headers: WY_SEARCH_HEADERS,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`网易云音乐搜索失败: HTTP ${res.status}`);
  const json = (await res.json()) as { result?: { songs?: Array<Record<string, unknown>> }; code?: number };
  if (json.code !== 200) throw new Error(`网易云音乐搜索接口异常: code=${json.code}`);
  const songs = json.result?.songs ?? [];
  return songs.map((s) => {
    const artists = s.artists as Array<{ name: string }> | undefined;
    const album = s.album as { name?: string; id?: number; picUrl?: string } | undefined;
    return {
      id: s.id as number,
      name: s.name as string,
      artist: artists?.map((a) => a.name).join("、") ?? "未知",
      album: album?.name ?? "",
      albumId: album?.id ?? 0,
      duration: Math.round((s.duration as number) / 1000),
      cover: album?.picUrl ?? "",
    };
  });
}

/**
 * Resolve a playable audio URL for a NetEase song.
 * Strategy (preserving original resolver chain):
 *   1. Meting mirror (api.injahow.cn) — returns a 302 redirect to the real CDN
 *   2. Official song/enhance/player/url/v1 (works for some free songs without cookie)
 *   3. song/media/outer/url redirect (often 404 for VIP)
 * Throws on failure (no silent fallback).
 */
export async function resolveNetEaseUrl(songId: number | string, loginCookie?: string): Promise<string> {
  // 1. If we have a login cookie (from QR login), use the official song/url/v1 API
  //    with the user's MUSIC_U cookie — this can resolve VIP songs
  if (loginCookie) {
    try {
      const url = `https://music.163.com/api/song/enhance/player/url/v1?ids=${encodeURIComponent(`[${songId}]`)}&level=exhigh&encodeType=mp3`;
      const res = await fetch(url, {
        headers: {
          ...WY_URL_HEADERS,
          Cookie: `os=pc; ${loginCookie}`,
        },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const json = (await res.json()) as { data?: Array<{ url?: string; code?: number }> };
        const item = json.data?.[0];
        if (item?.url) return item.url;
      }
    } catch (e) {
      console.warn("[netease] enhance/player/url with cookie failed:", e);
    }
  }

  // 2. Meting mirror — most reliable for free songs, returns 302 to real CDN url
  try {
    const metingUrl = `https://api.injahow.cn/meting/?type=url&server=netease&id=${encodeURIComponent(String(songId))}`;
    const res = await fetch(metingUrl, {
      method: "GET",
      redirect: "manual",
      headers: { "User-Agent": WY_SEARCH_HEADERS["User-Agent"] },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 302 || res.status === 301) {
      const loc = res.headers.get("location");
      if (loc && loc.startsWith("http")) return loc;
    }
    const ct = res.headers.get("content-type") ?? "";
    if (res.ok && (ct.startsWith("audio") || ct.includes("octet-stream"))) {
      return metingUrl;
    }
  } catch (e) {
    console.warn("[netease] Meting mirror failed:", e);
  }

  // 3. Official song/enhance/player/url/v1 (without login cookie)
  try {
    const url = `https://music.163.com/api/song/enhance/player/url/v1?ids=${encodeURIComponent(`[${songId}]`)}&level=exhigh&encodeType=mp3`;
    const res = await fetch(url, {
      headers: WY_URL_HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const json = (await res.json()) as { data?: Array<{ url?: string; code?: number }> };
      const item = json.data?.[0];
      if (item?.url) return item.url;
    }
  } catch (e) {
    console.warn("[netease] enhance/player/url failed:", e);
  }

  // 4. Official outer url redirect
  try {
    const outerUrl = `https://music.163.com/song/media/outer/url?id=${encodeURIComponent(String(songId))}.mp3`;
    const res = await fetch(outerUrl, {
      method: "GET",
      redirect: "manual",
      headers: { "User-Agent": WY_SEARCH_HEADERS["User-Agent"] },
      signal: AbortSignal.timeout(6000),
    });
    const loc = res.headers.get("location");
    if (loc && !loc.includes("/404")) return loc;
  } catch (e) {
    console.warn("[netease] outer url failed:", e);
  }

  throw new Error(`网易云音乐无法解析播放链接 (songId=${songId})，可能为 VIP 或版权受限，请扫码登录网易云后重试`);
}

/** Fetch LRC lyrics for a NetEase song (with original headers preserved). */
export async function fetchNetEaseLyric(songId: number | string): Promise<string> {
  const url = `https://music.163.com/api/song/lyric?id=${encodeURIComponent(String(songId))}&lv=1&kv=1&tv=-1`;
  const res = await fetch(url, {
    headers: WY_LYRIC_HEADERS,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`网易云歌词获取失败: HTTP ${res.status}`);
  const json = (await res.json()) as { lrc?: { lyric?: string }; code?: number };
  if (!json.lrc?.lyric) throw new Error(`网易云未返回歌词 (songId=${songId})`);
  return json.lrc.lyric;
}

import { ok, fail, handleError, readBody } from "@/lib/api";
import { resolveNetEaseUrl, fetchNetEaseLyric } from "@/lib/music/netease";
import {
  resolveQqOfficialPlayUrl,
  resolveQqSdkPlayUrl,
  resolveQqNativeLyric,
  resolveQqSdkLyric,
  normalizeQqCookie,
} from "@/lib/music/qq_music_sdk";
import {
  getTxSongPlayableInfo,
  upgradeTxAudioUrl,
} from "@/lib/music/native_tx";
import { resolveBilibiliUrl } from "@/lib/music/bilibili";
import { cookies } from "next/headers";

/**
 * POST /api/music/resolve-url
 *
 * Body: { platform, musicId, quality?, name?, artist?, album?, duration? }
 *   - platform: "netease" | "qq" | "bilibili"
 *   - musicId:  platform-prefixed id (wy-<id>, qq-<songmid>, bili-<bvid>)
 *
 * Returns: { url, lyric, source }
 *
 * - 网易云分支：保持现有实现不变（原生 fetch，无 SDK 依赖）
 * - QQ 分支：verbatim port of VoiceHub resolve-url.post.ts (huibq + music.3e0.cn + SDK + 官方 vkey)
 * - B站分支：verbatim port of VoiceHub bilibili/playurl.get.ts (buvid3=0 + client IP 转发)
 */
const QQ_INVALID_AUDIO_URL_SUFFIX = "/2149972737147268278.mp3";

const QQ_HUIBQ_QUALITY_MAP: Record<string, string> = {
  "4": "128k", "8": "320k", "10": "flac", "11": "flac24bit", "14": "flac24bit",
  "128": "128k", "320": "320k", "128k": "128k", "320k": "320k",
  flac: "flac", sq: "flac", hires: "flac24bit", flac24bit: "flac24bit",
};

function normalizeHuibqQuality(quality?: string): string {
  const key = String(quality ?? "8").toLowerCase();
  return QQ_HUIBQ_QUALITY_MAP[key] || "320k";
}

function validateResolvedTxUrl(url: string, source: string): string {
  const normalizedUrl = upgradeTxAudioUrl(url.trim());
  const urlWithoutParams = normalizedUrl.split("?")[0].split("#")[0];
  if (urlWithoutParams.endsWith(QQ_INVALID_AUDIO_URL_SUFFIX)) {
    throw new Error(`${source} 返回已知无效音频链接`);
  }
  return normalizedUrl;
}

/** Resolver 1: lx-music-api (Huibq) — 第三方 API */
async function resolveTxWithHuibq(songmid: string, quality: string): Promise<string> {
  const huibqQuality = normalizeHuibqQuality(quality);
  const url = `https://lxmusicapi.onrender.com/url/tx/${encodeURIComponent(songmid)}/${encodeURIComponent(huibqQuality)}`;
  const response = await fetch(url, {
    headers: { "X-Request-Key": "share-v3", "User-Agent": "lx-music-desktop/2.11.0" },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Huibq 返回 ${response.status}`);
  const data = (await response.json()) as { code?: number; url?: string; msg?: string };
  if (data?.code !== 0 || !data?.url) {
    throw new Error(data?.msg || "Huibq 未返回播放链接");
  }
  return upgradeTxAudioUrl(data.url);
}

/** Resolver 2: music.3e0.cn — 第三方 Meting 重定向 */
async function resolveTxWithDreamMeting(songmid: string): Promise<string> {
  const url = `https://music.3e0.cn/?server=tencent&type=url&id=${encodeURIComponent(songmid)}`;
  const response = await fetch(url, {
    method: "GET",
    redirect: "manual",
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    signal: AbortSignal.timeout(5000),
  });
  const location = response.headers.get("location");
  if (location) return upgradeTxAudioUrl(location);
  throw new Error(`music.3e0.cn 未返回播放重定向(${response.status})`);
}

export async function POST(req: Request) {
  try {
    const body = await readBody<{
      platform?: string;
      musicId?: string;
      quality?: string;
      name?: string;
      artist?: string;
      album?: string;
      duration?: number;
    }>(req);
    const platform = (body.platform ?? "").trim();
    const musicId = (body.musicId ?? "").trim();
    if (!platform || !musicId) return fail("缺少 platform 或 musicId", 400);

    // Parse prefixed ids
    let rawId = musicId;
    let detectedPlatform = platform;
    if (musicId.startsWith("wy-")) { rawId = musicId.slice(3); detectedPlatform = "netease"; }
    else if (musicId.startsWith("qq-")) { rawId = musicId.slice(3); detectedPlatform = "qq"; }
    else if (musicId.startsWith("bili-")) { rawId = musicId.slice(5); detectedPlatform = "bilibili"; }

    // Read saved music platform cookies (from QR login) for VIP song playback
    const cookieStore = await cookies();
    const neteaseCookie = cookieStore.get("music_cookie_netease")?.value || "";
    const qqCookie = cookieStore.get("music_cookie_qq")?.value || "";

    let url: string | null = null;
    let lyric: string | null = null;
    let source = "";

    if (detectedPlatform === "netease") {
      [url, lyric] = await Promise.all([
        resolveNetEaseUrl(rawId, neteaseCookie),
        fetchNetEaseLyric(rawId).catch(() => null),
      ]);
      source = "netease";
    } else if (detectedPlatform === "qq") {
      const playableInfo = await getTxSongPlayableInfo(rawId);
      const normalizedCookie = normalizeQqCookie(qqCookie);
      const mediaId = playableInfo.strMediaMid;
      const errors: string[] = [];

      // Resolver chain (verbatim VoiceHub resolve-url.post.ts + SDK/官方回退):
      // 1. huibq (lx-music-api)  2. music.3e0.cn  3. qq-music-api SDK  4. QQ 官方 vkey
      const resolvers: Array<{ name: string; fn: () => Promise<string> }> = [
        {
          name: "huibq",
          fn: async () => validateResolvedTxUrl(
            await resolveTxWithHuibq(playableInfo.songmid, body.quality || "320"), "huibq"
          ),
        },
        {
          name: "music.3e0.cn",
          fn: async () => validateResolvedTxUrl(
            await resolveTxWithDreamMeting(playableInfo.songmid), "music.3e0.cn"
          ),
        },
        {
          name: "qq-music-api",
          fn: async () => validateResolvedTxUrl(
            await resolveQqSdkPlayUrl(playableInfo.songmid, body.quality || "320", normalizedCookie, mediaId),
            "qq-music-api"
          ),
        },
        {
          name: "qq-official",
          fn: async () => await resolveQqOfficialPlayUrl({
            songmid: playableInfo.songmid,
            quality: body.quality || "320",
            cookie: normalizedCookie,
            mediaId,
          }),
        },
      ];

      for (const resolver of resolvers) {
        try {
          url = await resolver.fn();
          console.log(`[resolve-url] QQ resolved via ${resolver.name}`);
          break;
        } catch (err) {
          const msg = (err as Error).message;
          errors.push(`${resolver.name}: ${msg}`);
          console.warn(`[resolve-url] ${resolver.name} failed: ${msg}`);
        }
      }

      if (!url) {
        throw new Error(`QQ 音乐播放链接解析失败：${errors.join("；")}`);
      }

      // Lyric chain: 原生 QRC → SDK fallback
      try {
        const lyricData = await resolveQqNativeLyric({
          songId: playableInfo.songId || playableInfo.songmid,
          name: body.name,
          artist: body.artist,
          album: body.album,
          duration: body.duration,
          cookie: normalizedCookie,
        });
        lyric = lyricData.lrc || lyricData.qrc || null;
      } catch (e) {
        console.warn("[resolve-url] QRC 接口失败，回退到 SDK:", e);
        try {
          const sdkLyric = await resolveQqSdkLyric({
            songmid: playableInfo.songmid,
            songid: playableInfo.songId,
            cookie: normalizedCookie,
          });
          lyric = sdkLyric.lrc || null;
        } catch (sdkErr) {
          console.warn("[resolve-url] SDK 歌词也失败:", sdkErr);
        }
      }
      source = "qq";
    } else if (detectedPlatform === "bilibili") {
      // 客户端 IP 转发，分配最快 CDN 节点（verbatim VoiceHub）
      const forwardedFor = req.headers.get("x-forwarded-for");
      const forwardedForStr = forwardedFor ? forwardedFor.split(",")[0].trim() : "";
      const clientIp = forwardedForStr || req.headers.get("x-real-ip") || "";
      const r = await resolveBilibiliUrl(rawId, undefined, clientIp);
      url = r.url;
      // Bilibili has no LRC
      source = "bilibili";
    } else {
      return fail(`不支持的平台: ${detectedPlatform}`, 400);
    }

    if (!url) {
      return fail("无法解析播放链接，请稍后重试或更换歌曲", 502);
    }

    return ok({ url, lyric, source });
  } catch (err) {
    return handleError(err);
  }
}

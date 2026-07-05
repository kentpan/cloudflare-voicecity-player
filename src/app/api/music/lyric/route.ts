import { ok, fail, handleError } from "@/lib/api";
import { fetchNetEaseLyric } from "@/lib/music/netease";
import { resolveQqNativeLyric, resolveQqSdkLyric, fetchQqLegacyLyric, getTxSongPlayableInfo } from "@/lib/music/qq";

/**
 * GET /api/music/lyric?platform=netease&musicId=wy-123
 *
 * Fetches LRC lyrics from the platform's native API. Throws on failure
 * (no offline fallback).
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const platform = url.searchParams.get("platform") ?? "";
    let musicId = url.searchParams.get("musicId") ?? "";

    let rawId = musicId;
    let detected = platform;
    if (musicId.startsWith("wy-")) { rawId = musicId.slice(3); detected = "netease"; }
    else if (musicId.startsWith("qq-")) { rawId = musicId.slice(3); detected = "qq"; }
    else if (musicId.startsWith("bili-")) { rawId = musicId.slice(5); detected = "bilibili"; }

    if (detected === "bilibili") {
      return fail("B站视频暂无歌词", 404);
    }

    let lyric: string | null = null;
    if (detected === "netease") {
      lyric = await fetchNetEaseLyric(rawId);
    } else if (detected === "qq") {
      // 归一化 ID: mid → songmid + songId (aligned with VoiceHub)
      const playableInfo = await getTxSongPlayableInfo(rawId);
      // Lyric chain: 原生 QRC → SDK fallback → legacy fallback
      try {
        const data = await resolveQqNativeLyric(playableInfo.songId || playableInfo.songmid);
        lyric = data.lrc || data.qrc || null;
      } catch {
        try {
          const sdkLyric = await resolveQqSdkLyric(playableInfo.songmid, playableInfo.songId);
          lyric = sdkLyric.lrc || null;
        } catch {
          lyric = await fetchQqLegacyLyric(playableInfo.songmid, playableInfo.songId);
        }
      }
    } else {
      return fail(`不支持的平台: ${detected}`, 400);
    }

    if (!lyric) return fail("未找到歌词", 404);
    return ok({ lyric });
  } catch (err) {
    return handleError(err);
  }
}

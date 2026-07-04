import { ok, fail, handleError, readBody } from "@/lib/api";
import { resolveNetEaseUrl, fetchNetEaseLyric } from "@/lib/music/netease";
import { resolveQqOfficialPlayUrl, resolveQqNativeLyric, fetchQqLegacyLyric } from "@/lib/music/qq";
import { resolveBilibiliUrl } from "@/lib/music/bilibili";
import { cookies } from "next/headers";

/**
 * POST /api/music/resolve-url
 *
 * Body: { platform, musicId, quality? }
 *   - platform: "netease" | "qq" | "bilibili"
 *   - musicId:  platform-prefixed id (wy-<id>, qq-<songmid>, bili-<bvid>)
 *
 * Returns: { url, lyric, source }
 * 无数据库依赖，无状态。直接解析上游平台播放链接。
 * 若用户已通过扫码登录网易云/QQ音乐，会读取 httpOnly cookie 用于 VIP 歌曲播放。
 */
export async function POST(req: Request) {
  try {
    const body = await readBody<{ platform?: string; musicId?: string; quality?: string; name?: string; artist?: string; album?: string; duration?: number }>(req);
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
      const playUrl = await resolveQqOfficialPlayUrl(rawId, body.quality || "320", qqCookie);
      url = playUrl;
      // Try native QRC lyric, then legacy fallback
      try {
        const lyricData = await resolveQqNativeLyric(rawId, qqCookie, { name: body.name, artist: body.artist, album: body.album, duration: body.duration });
        lyric = lyricData.lrc || lyricData.qrc || null;
      } catch {
        try { lyric = await fetchQqLegacyLyric(rawId); } catch { lyric = null; }
      }
      source = "qq";
    } else if (detectedPlatform === "bilibili") {
      const r = await resolveBilibiliUrl(rawId);
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

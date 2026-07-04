import { ok, fail, handleError } from "@/lib/api";
import { searchNetEase } from "@/lib/music/netease";
import { searchQQMusic } from "@/lib/music/qq";
import { searchBilibili } from "@/lib/music/bilibili";
import type { MusicSearchResult } from "@/types/voicehub";

/**
 * GET /api/search?q=...&platform=netease|qq|bilibili&limit=20
 *
 * 音乐搜索 — 直接调用网易云 / QQ音乐 / B站 搜索 API。
 * 无数据库依赖，无状态。
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? "";
    const platform = url.searchParams.get("platform") ?? "netease";
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Math.max(1, Math.min(50, Number(limitParam))) : 20;

    if (!q.trim()) return ok([]);

    let results: MusicSearchResult[] = [];

    if (platform === "netease") {
      const songs = await searchNetEase(q, limit);
      results = songs.map((s) => ({
        id: `wy-${s.id}`,
        title: s.name,
        artist: s.artist,
        cover: s.cover,
        platform: "netease",
        duration: s.duration,
      }));
    } else if (platform === "qq") {
      const songs = await searchQQMusic(q, limit);
      results = songs.map((s) => ({
        id: `qq-${s.id}`,
        title: s.name,
        artist: s.artist,
        cover: s.cover,
        platform: "qq",
        duration: s.duration,
      }));
    } else if (platform === "bilibili") {
      const tracks = await searchBilibili(q, limit);
      results = tracks.map((t) => ({
        id: `bili-${t.id}`,
        title: t.title,
        artist: t.artist,
        cover: t.cover,
        platform: "bilibili",
        duration: t.duration,
      }));
    } else {
      return fail(`不支持的平台: ${platform}`, 400);
    }

    return ok(results);
  } catch (err) {
    return handleError(err);
  }
}

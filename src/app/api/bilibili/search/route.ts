import { ok, handleError } from "@/lib/api";
import { searchBilibili } from "@/lib/music/bilibili";
import type { MusicSearchResult } from "@/types/voicehub";

/**
 * GET /api/bilibili/search?keyword=...
 *
 * Verbatim port of VoiceHub bilibili/search.get.ts.
 * Searches Bilibili videos and returns normalized MusicSearchResult[].
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const keyword = url.searchParams.get("keyword") ?? url.searchParams.get("q") ?? "";
    if (!keyword) return ok([]);
    const tracks = await searchBilibili(keyword, 15);
    const results: MusicSearchResult[] = tracks.map((t) => ({
      id: `bili-${t.id}`,
      title: t.title,
      artist: t.artist,
      cover: t.cover,
      platform: "bilibili",
      duration: t.duration,
    }));
    return ok(results);
  } catch (err) {
    return handleError(err);
  }
}

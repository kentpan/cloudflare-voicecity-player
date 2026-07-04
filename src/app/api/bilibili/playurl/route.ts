import { ok, fail, handleError } from "@/lib/api";
import { resolveBilibiliUrl } from "@/lib/music/bilibili";

/**
 * GET /api/bilibili/playurl?id=<bvid>&cid=<optional cid>
 *
 * Direct port of the original VoiceHub `server/api/bilibili/playurl.get.ts`.
 * Returns a direct-playable mp4 URL (platform=html5).
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const bvid = url.searchParams.get("id") ?? "";
    const cid = url.searchParams.get("cid") ?? undefined;
    if (!bvid) return fail("缺少 id 参数", 400);
    const result = await resolveBilibiliUrl(bvid, cid);
    if (!result) return fail("获取播放链接失败", 502);
    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}

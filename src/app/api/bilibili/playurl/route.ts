import { ok, fail, handleError } from "@/lib/api";
import { resolveBilibiliUrl } from "@/lib/music/bilibili";

/**
 * GET /api/bilibili/playurl?id=<bvid>&cid=<optional cid>
 *
 * Verbatim port of VoiceHub bilibili/playurl.get.ts.
 * Returns a direct-playable mp4 URL (platform=html5) with client IP forwarding.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const bvid = url.searchParams.get("id") ?? "";
    const cid = url.searchParams.get("cid") ?? undefined;
    if (!bvid) return fail("缺少 id 参数", 400);

    // 提取客户端真实 IP，用于转发给 Bilibili 接口，以便分配最快 CDN 节点
    const forwardedFor = req.headers.get("x-forwarded-for");
    const forwardedForStr = forwardedFor ? forwardedFor.split(",")[0].trim() : "";
    const clientIp = forwardedForStr || req.headers.get("x-real-ip") || "";

    const result = await resolveBilibiliUrl(bvid, cid, clientIp);
    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}

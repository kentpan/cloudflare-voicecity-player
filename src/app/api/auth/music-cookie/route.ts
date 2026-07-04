import { ok, fail, handleError, readBody } from "@/lib/api";
import { cookies } from "next/headers";

/**
 * POST /api/auth/music-cookie
 *
 * Save music platform cookies (NetEase/QQ) after QR login so the server can
 * use them for VIP song playback / download.
 *
 * Body: { platform: "netease" | "qq", cookie: string }
 * Sets an httpOnly cookie: music_cookie_neteese / music_cookie_qq
 *
 * GET /api/auth/music-cookie?platform=netease
 * Returns the stored cookie for the specified platform.
 */
export async function POST(req: Request) {
  try {
    const body = await readBody<{ platform?: string; cookie?: string }>(req);
    const platform = (body.platform ?? "").trim();
    const cookie = (body.cookie ?? "").trim();
    if (!platform || !cookie) return fail("缺少 platform 或 cookie", 400);
    if (!["netease", "qq"].includes(platform)) return fail("不支持的平台", 400);

    const cookieName = `music_cookie_${platform}`;
    const store = await cookies();
    store.set(cookieName, cookie, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return ok({ saved: true, platform });
  } catch (err) {
    return handleError(err);
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const platform = url.searchParams.get("platform") ?? "";
    if (!["netease", "qq"].includes(platform)) return fail("不支持的平台", 400);

    const cookieName = `music_cookie_${platform}`;
    const store = await cookies();
    const cookie = store.get(cookieName)?.value || null;

    return ok({ platform, cookie, hasCookie: !!cookie });
  } catch (err) {
    return handleError(err);
  }
}

import { ok, fail, handleError } from "@/lib/api";

const WY_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36";

/**
 * GET /api/auth/netease-qr
 *
 * Get NetEase Cloud Music login QR code. Returns a QR code image (base64) +
 * unikey that the client polls via /api/auth/netease-check.
 *
 * Uses the public NetEase QR login API: /api/login/qrcode/unikey + /api/login/qrcode/client/login
 */
export async function GET() {
  try {
    // Step 1: Get a unikey for the QR login session
    const unikeyRes = await fetch("https://music.163.com/api/login/qrcode/unikey?type=1", {
      method: "POST",
      headers: {
        "User-Agent": WY_UA,
        Referer: "https://music.163.com",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "type=1",
      signal: AbortSignal.timeout(10000),
    });
    if (!unikeyRes.ok) return fail(`获取网易云 unikey 失败: HTTP ${unikeyRes.status}`, 502);
    const unikeyJson = (await unikeyRes.json()) as { unikey?: string; code?: number };
    if (unikeyJson.code !== 200 || !unikeyJson.unikey) {
      return fail(`获取网易云 unikey 失败: code=${unikeyJson.code}`, 502);
    }
    const unikey = unikeyJson.unikey;

    // Step 2: Generate QR code image URL (the client can display this directly)
    const qrUrl = `https://music.163.com/login?codekey=${unikey}`;

    return ok({
      unikey,
      qrUrl,
      // The QR code image is generated from the login URL
      qrImageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`,
    });
  } catch (err) {
    return handleError(err);
  }
}

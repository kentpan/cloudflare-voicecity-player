import { ok, fail, handleError } from "@/lib/api";

/**
 * GET /api/auth/qq-qr
 *
 * Get QQ Music login QR code. Returns a QR code image (base64 data URL) +
 * ptqrtoken + qrsig that the client polls via /api/auth/qq-check.
 *
 * 直接在服务端 fetch QQ 官方 ptqrshow 接口获取二维码图片，
 * 转 base64 data URL 返回给前端，避免浏览器因 Referer 防盗链加载失败。
 */
const QQ_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function GET() {
  try {
    // Step 1: Get QR login page to extract qrsig from cookies
    const loginPageRes = await fetch("https://ssl.ptlogin2.qq.com/ptqrshow?appid=716027609&e=2&l=M&s=3&d=72&v=4&t=0.1", {
      headers: {
        "User-Agent": QQ_UA,
        Referer: "https://y.qq.com/",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });

    // Extract qrsig from Set-Cookie
    const setCookie = loginPageRes.headers.get("set-cookie") || "";
    const qrsigMatch = setCookie.match(/qrsig=([^;]+)/);
    const qrsig = qrsigMatch ? qrsigMatch[1] : "";

    if (!qrsig) {
      return fail("获取 QQ 登录二维码失败：未获取到 qrsig", 502);
    }

    // Step 2: 读取二维码图片二进制，转 base64 data URL 返回给前端
    // （直接让浏览器加载 QQ 官方 URL 会因 Referer 防盗链失败，所以服务端代理）
    const contentType = loginPageRes.headers.get("content-type") || "image/png";
    const arrayBuffer = await loginPageRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const qrImageUrl = `data:${contentType};base64,${base64}`;

    // Compute ptqrtoken from qrsig (hash function from QQ's login flow)
    const ptqrtoken = hashQrsig(qrsig);

    return ok({
      qrImageUrl,
      ptqrtoken,
      qrsig,
    });
  } catch (err) {
    return handleError(err);
  }
}

/** QQ's ptqrtoken hash algorithm: sum of char codes with rotation */
function hashQrsig(qrsig: string): number {
  let hash = 0;
  for (let i = 0; i < qrsig.length; i++) {
    hash += (hash << 5) + qrsig.charCodeAt(i);
    hash = hash & 0x7fffffff; // keep 31-bit
  }
  return hash;
}

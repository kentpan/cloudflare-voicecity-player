import { ok, fail, handleError, readBody } from "@/lib/api";

const QQ_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * POST /api/auth/qq-check
 *
 * Poll QQ Music login status. Returns "waiting" | "success" | "expired".
 * On success, returns the cookie + user info.
 *
 * Body: { ptqrtoken: number, qrsig: string }
 */
export async function POST(req: Request) {
  try {
    const body = await readBody<{ ptqrtoken?: number; qrsig?: string }>(req);
    const ptqrtoken = body.ptqrtoken;
    const qrsig = (body.qrsig ?? "").trim();
    if (!ptqrtoken || !qrsig) return fail("缺少 ptqrtoken 或 qrsig", 400);

    // Poll QQ login status
    const checkUrl = `https://ssl.ptlogin2.qq.com/ptqrlogin?u1=https%3A//y.qq.com/portal/player.html&ptqrtoken=${ptqrtoken}&ptredirect=0&h=1&t=1&g=1&from_ui=1&ptlang=2052&action=0-0-${Date.now()}&js_ver=10275&js_type=1&login_sig=${qrsig}&pt_uistyle=40&aid=716027609&daid=38&pt_3rd_aid=0`;
    const res = await fetch(checkUrl, {
      headers: {
        "User-Agent": QQ_UA,
        Referer: "https://y.qq.com/",
        Cookie: `qrsig=${qrsig}`,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return fail(`QQ 登录检查失败: HTTP ${res.status}`, 502);
    const text = await res.text();

    // Parse the response: ptuiCB('66','0','...','0','二维码未失效。(862898517)', '');
    // Code 66 = waiting, 67 = expired, 0 = success (with redirect URL)
    const codeMatch = text.match(/ptuiCB\('(\d+)','(\d+)','([^']*)','(\d+)','([^']*)'/);
    if (!codeMatch) {
      return fail("QQ 登录检查响应格式异常", 502);
    }

    const [, code, , redirectUrl, , message] = codeMatch;
    let status: "waiting" | "success" | "expired" = "waiting";
    let cookie = "";
    let uin = "";

    if (code === "0") {
      // Success — follow redirect to get cookies
      status = "success";
      const cookieRes = await fetch(redirectUrl, {
        headers: { "User-Agent": QQ_UA, Referer: "https://y.qq.com/" },
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
      });
      const setCookie = cookieRes.headers.get("set-cookie") || "";
      // Extract relevant cookies: uin, qqmusic_key, qm_keyst
      const cookies: string[] = [];
      for (const c of setCookie.split(",")) {
        const trimmed = c.trim();
        if (trimmed.startsWith("uin=") || trimmed.startsWith("qqmusic_key=") || trimmed.startsWith("qm_keyst=") || trimmed.startsWith("psrf=")) {
          cookies.push(trimmed.split(";")[0]);
        }
      }
      cookie = cookies.join("; ");
      const uinMatch = setCookie.match(/uin=o?(\d+)/);
      uin = uinMatch ? uinMatch[1] : "";
    } else if (code === "67") {
      status = "expired";
    }

    return ok({
      status,
      cookie: cookie || undefined,
      uin: uin || undefined,
      message,
      user: status === "success" ? {
        userId: uin,
        nickname: uin ? `QQ ${uin}` : "QQ音乐账号",
        avatarUrl: uin ? `https://q.qlogo.cn/g?b=qq&nk=${uin}&s=140` : "",
      } : undefined,
    });
  } catch (err) {
    return handleError(err);
  }
}

import { setSessionCookie, ADMIN_USER } from "@/lib/auth";
import { ok, fail, handleError, readBody } from "@/lib/api";
import { timingSafeEqual } from "node:crypto";

/**
 * POST /api/auth/admin-secret-login
 *
 * 使用预设的 ADMIN_SECRET 环境密钥登录为管理员。
 *
 * 请求体: { "secret": "你设置的 ADMIN_SECRET 值" }
 */
export async function POST(req: Request) {
  try {
    const { secret } = await readBody<{ secret?: string }>(req);

    const configuredSecret = process.env.ADMIN_SECRET;
    if (!configuredSecret || configuredSecret.trim().length === 0) {
      return fail("ADMIN_SECRET 环境密钥未配置。请在 Cloudflare Pages 控制台或 wrangler 中设置 ADMIN_SECRET。", 503);
    }

    if (!secret || secret.trim().length === 0) {
      return fail("请输入管理员密钥 (ADMIN_SECRET)", 400);
    }

    const a = Buffer.from(secret.trim());
    const b = Buffer.from(configuredSecret.trim());
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return fail("管理员密钥错误", 401);
    }

    await setSessionCookie(ADMIN_USER);
    return ok({ user: ADMIN_USER });
  } catch (err) {
    return handleError(err);
  }
}

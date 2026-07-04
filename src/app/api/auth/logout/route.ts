import { clearSessionCookie } from "@/lib/auth";
import { ok, handleError } from "@/lib/api";

/**
 * POST /api/auth/logout
 * 清除 session cookie，退出登录。
 */
export async function POST() {
  try {
    await clearSessionCookie();
    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}

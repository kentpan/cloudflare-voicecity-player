import { getCurrentUser } from "@/lib/auth";
import { ok } from "@/lib/api";

/**
 * GET /api/auth/me
 * 返回当前登录的管理员用户信息。
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return ok({ user: null });
  return ok({ user });
}

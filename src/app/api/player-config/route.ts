import { ok, fail, handleError, readBody } from "@/lib/api";
import { getPlayerConfig, setPlayerConfig } from "@/lib/player-config";
import { requireAdmin } from "@/lib/auth";

/**
 * GET /api/player-config
 * 返回播放器配置（公开，所有用户可读）。
 *
 * POST /api/player-config
 * 更新播放器配置（仅管理员可写）。
 */
export async function GET() {
  try {
    const config = await getPlayerConfig();
    return ok(config);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await readBody<Partial<import("@/lib/player-config").PlayerConfig>>(req);
    const updated = await setPlayerConfig(body);
    return ok(updated);
  } catch (err) {
    const e = err as Error & { status?: number };
    if (e.status === 401) return fail("请先登录管理员", 401);
    return handleError(err);
  }
}

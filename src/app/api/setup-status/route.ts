import { NextResponse } from "next/server";

/**
 * GET /api/setup-status
 *
 * 返回当前运行环境的初始化状态，供前端 SetupGuard 决定是否显示
 *「未配置 ADMIN_SECRET」全屏阻断弹窗。
 *
 * 返回字段：
 *   - adminSecretConfigured: boolean  ADMIN_SECRET 是否已配置
 *   - isCloudflare: boolean            是否运行在 Cloudflare 环境
 */
export async function GET() {
  const isCloudflare = !!(process.env.CF_PAGES || process.env.CLOUDFLARE);
  const adminSecretConfigured = !!process.env.ADMIN_SECRET && process.env.ADMIN_SECRET.trim().length > 0;

  return NextResponse.json({
    success: true,
    data: {
      isCloudflare,
      adminSecretConfigured,
    },
  });
}

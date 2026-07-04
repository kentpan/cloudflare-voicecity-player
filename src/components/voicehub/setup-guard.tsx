"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { ShieldAlert, RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * SetupGuard — 部署初始化守卫
 *
 * 当 ADMIN_SECRET 未配置时，显示全屏阻断弹窗，阻止用户进行任何后续操作。
 * ADMIN_SECRET 是登录管理员的唯一凭据，必须配置后才能使用播放器管理功能。
 */
export function SetupGuard() {
  const [status, setStatus] = useState<{
    checked: boolean;
    adminSecretConfigured: boolean;
  }>({ checked: false, adminSecretConfigured: false });

  useEffect(() => {
    let mounted = true;
    api
      .getSetupStatus()
      .then((data) => {
        if (!mounted) return;
        setStatus({
          checked: true,
          adminSecretConfigured: data.adminSecretConfigured,
        });
      })
      .catch(() => {
        if (!mounted) return;
        // 接口异常时不阻断
        setStatus({ checked: true, adminSecretConfigured: true });
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (!status.checked) return null;
  if (status.adminSecretConfigured) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg glass-strong rounded-3xl border border-destructive/40 shadow-2xl overflow-hidden">
        <div className="px-8 pt-10 pb-6 text-center">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-destructive/20 to-destructive/10 flex items-center justify-center mb-4 border border-destructive/30">
            <ShieldAlert className="w-11 h-11 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold mb-2">需要完成初始化配置</h1>
          <p className="text-sm text-muted-foreground">
            播放器已部署，但尚未配置管理员密钥
          </p>
        </div>

        <div className="px-8 pb-6 space-y-4">
          <div className="rounded-xl bg-destructive/5 border border-destructive/20 p-4">
            <p className="text-sm leading-relaxed">
              检测到 <code className="px-1 py-0.5 rounded bg-muted text-xs font-mono">ADMIN_SECRET</code> 环境密钥未配置。
              这是登录管理员（用于播放器配置管理）的唯一凭据，必须配置后才能使用管理功能。
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
              配置 ADMIN_SECRET 密钥
            </h2>
            <p className="text-xs text-muted-foreground ml-7 leading-relaxed">
              在 Cloudflare Pages 项目设置中添加环境变量，或使用 wrangler CLI：
            </p>
            <div className="ml-7 rounded-lg bg-muted p-3 font-mono text-xs overflow-x-auto">
              <div className="text-muted-foreground"># 使用 wrangler CLI</div>
              <div className="text-foreground">npx wrangler pages secret put ADMIN_SECRET</div>
              <div className="text-muted-foreground mt-2"># 或在 Cloudflare Dashboard</div>
              <div className="text-foreground">Pages → 项目 → Settings → Environment variables</div>
              <div className="text-foreground">→ 添加变量 ADMIN_SECRET = 你的强密码</div>
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
              重新部署或刷新页面
            </h2>
            <p className="text-xs text-muted-foreground ml-7 leading-relaxed">
              配置完成后若通过 Dashboard 设置，需要触发一次重新部署才会生效；
              然后点击下方按钮重新检测。
            </p>
          </div>
        </div>

        <div className="px-8 pb-8 pt-2 flex flex-col gap-2">
          <Button onClick={() => window.location.reload()} className="w-full" size="lg">
            <RefreshCw className="w-4 h-4 mr-2" /> 重新检测配置
          </Button>
          <Button
            variant="outline"
            onClick={() => window.open("https://dash.cloudflare.com/?to=/:account/pages", "_blank")}
            className="w-full"
            size="lg"
          >
            <ExternalLink className="w-4 h-4 mr-2" /> 打开 Cloudflare 控制台
          </Button>
        </div>
      </div>
    </div>
  );
}

"use client";
import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import {
  startRegistration,
} from "@simplewebauthn/browser";
import {
  User as UserIcon,
  Mail,
  Save,
  Settings,
  Fingerprint,
  Loader2,
  Github,
  Music2,
  Globe,
  Copyright,
  Power,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PlayerConfig } from "@/lib/player-config";
import { DEFAULT_PLAYER_CONFIG } from "@/lib/player-config";

/**
 * 播放器管理弹窗（原账号管理修改版）
 *
 * 左侧：个人资料（邮箱设置 + Passkey 注册，无所在地）
 * 右侧：播放器配置（代理API开关 + 播放器名称 + title文字 + github url + copyright）
 */
export function AccountDialog() {
  const { accountOpen, setAccountOpen, user, playerConfig, setPlayerConfig } = useStore();
  const [email, setEmail] = useState("");
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [hasPasskey, setHasPasskey] = useState(false);

  // 播放器配置表单
  const [configForm, setConfigForm] = useState<PlayerConfig>(DEFAULT_PLAYER_CONFIG);
  const [savingConfig, setSavingConfig] = useState(false);

  useEffect(() => {
    if (playerConfig) {
      setConfigForm(playerConfig);
    }
  }, [playerConfig]);

  useEffect(() => {
    if (accountOpen) {
      // 检查是否已注册 passkey（尝试登录选项中是否有凭证）
      api.passkeyLoginOptions().then((opts) => {
        const allowCreds = (opts as { allowCredentials?: unknown[] }).allowCredentials;
        setHasPasskey(!!allowCreds && allowCreds.length > 0);
      }).catch(() => { /* ignore */ });
    }
  }, [accountOpen]);

  // 注册 Passkey
  async function handleRegisterPasskey() {
    setPasskeyLoading(true);
    try {
      const options = await api.passkeyRegisterOptions();
      const credential = await startRegistration({ optionsJSON: options as never });
      await api.passkeyRegisterVerify(credential);
      toast.success("Passkey 已添加，下次可使用 Passkey 快速登录");
      setHasPasskey(true);
    } catch (e) {
      const msg = (e as Error).message || "Passkey 注册失败";
      if (!msg.includes("abort")) toast.error(msg);
    } finally {
      setPasskeyLoading(false);
    }
  }

  // 保存播放器配置
  async function handleSaveConfig() {
    setSavingConfig(true);
    try {
      const updated = await api.updatePlayerConfig(configForm);
      setPlayerConfig(updated);
      toast.success("播放器配置已保存");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingConfig(false);
    }
  }

  if (!user) return null;

  return (
    <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
      <DialogContent className="sm:max-w-4xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col glass-strong">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" /> 播放器管理
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="grid md:grid-cols-[300px_1fr] gap-5">
            {/* 左侧：个人资料 */}
            <div className="space-y-4">
              {/* 用户卡片 */}
              <div className="rounded-xl border border-border bg-card/50 p-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white text-xl font-bold flex items-center justify-center">
                    {user.name?.[0] || user.username[0]?.toUpperCase() || "A"}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{user.name || user.username}</div>
                    <div className="text-xs text-muted-foreground">@{user.username}</div>
                  </div>
                </div>
              </div>

              {/* 个人资料设置 */}
              <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <UserIcon className="w-4 h-4 text-primary" /> 个人资料
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Mail className="w-3 h-3" /> 邮箱
                  </Label>
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@example.com"
                    type="email"
                  />
                </div>

                {/* Passkey 注册 */}
                <div className="pt-2 border-t border-border/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Fingerprint className="w-4 h-4 text-primary" />
                      <div>
                        <div className="text-sm font-medium">Passkey 登录</div>
                        <div className="text-xs text-muted-foreground">
                          {hasPasskey ? "已注册，可在登录弹窗使用" : "注册后可用 Passkey 快速登录"}
                        </div>
                      </div>
                    </div>
                    {hasPasskey ? (
                      <Badge variant="secondary" className="text-green-400">已注册</Badge>
                    ) : (
                      <Button size="sm" variant="outline" onClick={handleRegisterPasskey} disabled={passkeyLoading}>
                        {passkeyLoading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Fingerprint className="w-3.5 h-3.5 mr-1" />}
                        {passkeyLoading ? "添加中..." : "添加"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 右侧：播放器配置 */}
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card/50 p-5 space-y-5">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Settings className="w-4 h-4 text-primary" /> 播放器配置
                </div>

                {/* 代理API开关 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Power className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">使用代理 API</div>
                      <div className="text-xs text-muted-foreground">关闭后无法播放/加载封面</div>
                    </div>
                  </div>
                  <Switch
                    checked={configForm.proxyEnabled}
                    onCheckedChange={(v) => setConfigForm({ ...configForm, proxyEnabled: v })}
                  />
                </div>

                {/* 播放器名称 */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Music2 className="w-3 h-3" /> 播放器名称
                  </Label>
                  <Input
                    value={configForm.playerName}
                    onChange={(e) => setConfigForm({ ...configForm, playerName: e.target.value })}
                    placeholder="随心音乐"
                  />
                </div>

                {/* Title 文字 */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Globe className="w-3 h-3" /> 页面 Title 文字
                  </Label>
                  <Input
                    value={configForm.titleText}
                    onChange={(e) => setConfigForm({ ...configForm, titleText: e.target.value })}
                    placeholder="随心音乐播放器"
                  />
                </div>

                {/* GitHub URL */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Github className="w-3 h-3" /> GitHub 项目地址
                  </Label>
                  <Input
                    value={configForm.githubUrl}
                    onChange={(e) => setConfigForm({ ...configForm, githubUrl: e.target.value })}
                    placeholder="https://github.com/..."
                  />
                </div>

                {/* Copyright 文字 */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Copyright className="w-3 h-3" /> 底部 Copyright 文字
                  </Label>
                  <Input
                    value={configForm.copyrightText}
                    onChange={(e) => setConfigForm({ ...configForm, copyrightText: e.target.value })}
                    placeholder="© 2026 VoiceCity"
                  />
                </div>

                <Button onClick={handleSaveConfig} disabled={savingConfig} className="w-full">
                  {savingConfig ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                  {savingConfig ? "保存中..." : "保存配置"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { startAuthentication } from "@simplewebauthn/browser";
import { Key, Fingerprint, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * 登录弹窗 — 支持密钥登录 + Passkey 登录双 tab。
 */
export function LoginDialog() {
  const { loginOpen, setLoginOpen, setUser } = useStore();
  const [tab, setTab] = useState<"secret" | "passkey">("secret");
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(false);

  // 密钥登录
  async function handleSecretLogin() {
    if (!secret.trim()) {
      toast.error("请输入管理员密钥");
      return;
    }
    setLoading(true);
    try {
      const { user } = await api.adminSecretLogin(secret.trim());
      setUser(user);
      toast.success("登录成功");
      setLoginOpen(false);
      setSecret("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Passkey 登录
  async function handlePasskeyLogin() {
    setLoading(true);
    try {
      const options = await api.passkeyLoginOptions();
      const credential = await startAuthentication({ optionsJSON: options as never });
      const { user } = await api.passkeyLoginVerify(credential);
      setUser(user);
      toast.success("Passkey 登录成功");
      setLoginOpen(false);
    } catch (e) {
      const msg = (e as Error).message || "Passkey 登录失败";
      if (!msg.includes("abort")) toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
      <DialogContent className="glass-strong max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" /> 管理员登录
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "secret" | "passkey")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="secret" className="gap-1.5">
              <Key className="w-3.5 h-3.5" /> 密钥
            </TabsTrigger>
            <TabsTrigger value="passkey" className="gap-1.5">
              <Fingerprint className="w-3.5 h-3.5" /> Passkey
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="py-4">
          {tab === "secret" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">管理员密钥 (ADMIN_SECRET)</Label>
                <Input
                  type="password"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSecretLogin()}
                  placeholder="输入 ADMIN_SECRET 值"
                  autoFocus
                />
              </div>
              <Button onClick={handleSecretLogin} disabled={loading} className="w-full">
                {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Key className="w-4 h-4 mr-1" />}
                {loading ? "登录中..." : "登录"}
              </Button>
            </div>
          )}

          {tab === "passkey" && (
            <div className="space-y-4">
              <div className="flex flex-col items-center py-4 gap-3">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Fingerprint className="w-8 h-8 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  使用已注册的 Passkey 快速登录<br />
                  <span className="text-xs">（需先通过密钥登录后注册 Passkey）</span>
                </p>
              </div>
              <Button onClick={handlePasskeyLogin} disabled={loading} className="w-full">
                {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Fingerprint className="w-4 h-4 mr-1" />}
                {loading ? "等待中..." : "Passkey 登录"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

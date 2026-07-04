"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Music2, QrCode, Loader2, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface MusicLoginDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialPlatform?: "netease" | "qq";
}

/**
 * Dialog for QR-code login to NetEase Cloud Music / QQ Music.
 *
 * After login, the music platform cookie is saved server-side (httpOnly) via
 * /api/auth/music-cookie, so VIP songs can be resolved for playback/download.
 */
export function MusicLoginDialog({ open, onOpenChange, initialPlatform }: MusicLoginDialogProps) {
  const [platform, setPlatform] = useState<"netease" | "qq">(initialPlatform || "netease");
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [pollData, setPollData] = useState<{ unikey?: string; ptqrtoken?: number; qrsig?: string } | null>(null);
  const [status, setStatus] = useState<"loading" | "waiting" | "success" | "expired" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch QR code when platform changes or dialog opens
  const fetchQr = useCallback(async () => {
    setStatus("loading");
    setQrUrl(null);
    setPollData(null);
    setErrorMsg("");
    try {
      if (platform === "netease") {
        const res = await fetch("/api/auth/netease-qr");
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        setQrUrl(json.data.qrImageUrl);
        setPollData({ unikey: json.data.unikey });
        setStatus("waiting");
      } else {
        const res = await fetch("/api/auth/qq-qr");
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        setQrUrl(json.data.qrImageUrl);
        setPollData({ ptqrtoken: json.data.ptqrtoken, qrsig: json.data.qrsig });
        setStatus("waiting");
      }
    } catch (e) {
      setStatus("error");
      setErrorMsg((e as Error).message);
    }
  }, [platform]);

  // Poll login status
  useEffect(() => {
    if (open && status === "waiting" && pollData) {
      pollRef.current = setInterval(async () => {
        try {
          const endpoint = platform === "netease" ? "/api/auth/netease-check" : "/api/auth/qq-check";
          const body = platform === "netease"
            ? { unikey: pollData.unikey }
            : { ptqrtoken: pollData.ptqrtoken, qrsig: pollData.qrsig };
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const json = await res.json();
          if (!json.success) return;
          const data = json.data;
          if (data.status === "success") {
            setStatus("success");
            if (pollRef.current) clearInterval(pollRef.current);
            // Save cookie server-side
            if (data.cookie) {
              await fetch("/api/auth/music-cookie", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ platform, cookie: data.cookie }),
              });
            }
            toast.success(`已登录${platform === "netease" ? "网易云音乐" : "QQ 音乐"}，VIP歌曲可播放`);
            setTimeout(() => onOpenChange(false), 1500);
          } else if (data.status === "expired") {
            setStatus("expired");
            if (pollRef.current) clearInterval(pollRef.current);
          }
        } catch {
          // ignore poll errors
        }
      }, 2000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [open, status, pollData, platform, onOpenChange]);

  // Fetch QR on open — also set platform from initialPlatform prop
  useEffect(() => {
    if (open) {
      if (initialPlatform) setPlatform(initialPlatform);
      fetchQr();
    }
  }, [open, fetchQr, initialPlatform]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music2 className="w-5 h-5 text-primary" /> 音乐平台登录
          </DialogTitle>
        </DialogHeader>

        <Tabs value={platform} onValueChange={(v) => setPlatform(v as "netease" | "qq")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="netease">网易云音乐</TabsTrigger>
            <TabsTrigger value="qq">QQ 音乐</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-col items-center py-4 gap-4">
          {status === "loading" && (
            <div className="flex flex-col items-center gap-2 py-8">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <span className="text-sm text-muted-foreground">正在获取二维码...</span>
            </div>
          )}

          {status === "waiting" && qrUrl && (
            <>
              <div className="relative">
                { }
                <img src={qrUrl} alt="登录二维码" className="w-48 h-48 rounded-lg border border-border" />
                <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground text-center">
                请使用{platform === "netease" ? "网易云音乐" : "QQ"}APP扫码登录
              </p>
              <p className="text-xs text-muted-foreground/70 text-center px-4">
                登录状态仅保存到当前浏览器，用于获取封面、音乐播放和歌词解析。
              </p>
            </>
          )}

          {status === "success" && (
            <div className="flex flex-col items-center gap-2 py-8">
              <CheckCircle2 className="w-12 h-12 text-green-400" />
              <span className="text-sm font-medium">登录成功！</span>
              <span className="text-xs text-muted-foreground">VIP歌曲现已可播放</span>
            </div>
          )}

          {status === "expired" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <QrCode className="w-12 h-12 text-muted-foreground opacity-50" />
              <span className="text-sm text-muted-foreground">二维码已过期</span>
              <Button onClick={fetchQr} size="sm" variant="outline">
                <RefreshCw className="w-4 h-4 mr-1" /> 刷新二维码
              </Button>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <span className="text-sm text-red-400">{errorMsg}</span>
              <Button onClick={fetchQr} size="sm" variant="outline">
                <RefreshCw className="w-4 h-4 mr-1" /> 重试
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

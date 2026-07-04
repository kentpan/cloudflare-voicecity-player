"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { Mic, X, Loader2, Play, Search as SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MusicSearchResult } from "@/types/voicehub";

const AUDIO_MATCH_DURATION = 8; // seconds

interface AudioMatchResult {
  key: string;
  id?: number;
  name: string;
  artist: string;
  album: string;
  cover: string;
  startTime: number;
}

interface AudioMatchDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelect: (song: MusicSearchResult) => void;
}

/**
 * Listen-and-identify (听歌识曲) dialog.
 *
 * Uses the microphone + the afp.js WASM module (ported from the original
 * VoiceCity) to generate an audio fingerprint, then sends it to
 * /api/music/audio-match which queries NetEase's audio match API.
 */
export function AudioMatchDialog({ open, onOpenChange, onSelect }: AudioMatchDialogProps) {
  const [preparing, setPreparing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState("");
  const [results, setResults] = useState<AudioMatchResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const recorderNodeRef = useRef<AudioWorkletNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const silentNodeRef = useRef<GainNode | null>(null);
  const scriptsLoadedRef = useRef(false);

  // Cleanup on close
  useEffect(() => {
    if (!open) {
      stopSession();
      setResults([]);
      setError(null);
      setStatus("");
    }
  }, [open]);

  // Load WASM scripts
  async function ensureScripts(): Promise<void> {
    if (scriptsLoadedRef.current && typeof window.GenerateFP === "function") return;
    if (typeof window.GenerateFP === "function") {
      scriptsLoadedRef.current = true;
      return;
    }
    setStatus("正在加载识曲引擎...");
    await loadScript("/audio-match/afp.wasm.js");
    await loadScript("/audio-match/afp.js");
    if (typeof window.GenerateFP !== "function") {
      throw new Error("识曲引擎初始化失败");
    }
    scriptsLoadedRef.current = true;
  }

  function loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-audio-match="${src}"]`);
      if (existing) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.dataset.audioMatch = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`加载识曲资源失败: ${src}`));
      document.head.appendChild(script);
    });
  }

  async function stopSession() {
    if (recorderNodeRef.current) {
      try { recorderNodeRef.current.disconnect(); } catch {}
      recorderNodeRef.current = null;
    }
    if (silentNodeRef.current) {
      try { silentNodeRef.current.disconnect(); } catch {}
      silentNodeRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current) {
      try { await audioContextRef.current.close(); } catch {}
      audioContextRef.current = null;
    }
    setRecording(false);
  }

  async function initialize() {
    setPreparing(true);
    setError(null);
    setStatus("正在请求麦克风权限...");
    try {
      await ensureScripts();
      await stopSession();

      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextClass({ sampleRate: 8000 });
      if (ctx.state === "suspended") await ctx.resume();
      audioContextRef.current = ctx;

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("当前环境不支持麦克风访问，请确保使用 HTTPS 访问或 localhost 调试");
      }

      // AudioWorklet for recording
      if (ctx.audioWorklet) {
        await ctx.audioWorklet.addModule("/audio-match/rec.js");
        const recorderNode = new AudioWorkletNode(ctx, "timed-recorder");
        recorderNode.port.onmessage = async (event: MessageEvent) => {
          const data = event.data as { message: string; health?: number; recording?: Float32Array };
          if (data.message === "bufferhealth") {
            const progress = Math.min(1, Number(data.health) || 0);
            const currentSeconds = (AUDIO_MATCH_DURATION * progress).toFixed(1);
            setStatus(`录音中 ${currentSeconds}s / ${AUDIO_MATCH_DURATION}s`);
          } else if (data.message === "finished" && data.recording) {
            setRecording(false);
            await handleFingerprint(data.recording);
          }
        };
        recorderNodeRef.current = recorderNode;
      } else {
        throw new Error("当前浏览器不支持 AudioWorklet，请使用现代浏览器");
      }

      silentNodeRef.current = ctx.createGain();
      silentNodeRef.current.gain.value = 0;
      recorderNodeRef.current.connect(silentNodeRef.current);
      silentNodeRef.current.connect(ctx.destination);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false, latency: 0 },
      });
      micStreamRef.current = stream;
      const micSource = ctx.createMediaStreamSource(stream);
      micSource.connect(recorderNodeRef.current);
      setStatus("麦克风已连接，点击开始识曲");
    } catch (e) {
      setError((e as Error).message || "无法初始化听歌识曲，请检查麦克风权限");
      await stopSession();
    } finally {
      setPreparing(false);
    }
  }

  async function handleFingerprint(recording: Float32Array) {
    setProcessing(true);
    setStatus("正在生成指纹并识别...");
    try {
      const fingerprint = await window.GenerateFP(recording);
      const res = await fetch("/api/music/audio-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duration: AUDIO_MATCH_DURATION, audioFP: fingerprint }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.error || "识曲失败");
      }
      const matches: AudioMatchResult[] = json.data?.matches || [];
      if (matches.length === 0) {
        throw new Error("未识别到匹配歌曲，请换一段更清晰的副歌重试");
      }
      setResults(matches);
      setStatus(`识别完成，找到 ${matches.length} 个候选结果`);
    } catch (e) {
      setError((e as Error).message || "听歌识曲失败，请稍后重试");
      setStatus("");
      setResults([]);
    } finally {
      setProcessing(false);
    }
  }

  function startRecording() {
    if (!recorderNodeRef.current) {
      toast.error("请先初始化麦克风");
      return;
    }
    setResults([]);
    setError(null);
    setRecording(true);
    recorderNodeRef.current.port.postMessage({ message: "start", duration: AUDIO_MATCH_DURATION });
  }

  function handleSelectResult(r: AudioMatchResult) {
    if (!r.id) {
      toast.error("该歌曲无法点歌（缺少ID）");
      return;
    }
    const song: MusicSearchResult = {
      id: `wy-${r.id}`,
      title: r.name,
      artist: r.artist,
      cover: r.cover,
      platform: "netease",
    };
    onSelect(song);
    onOpenChange(false);
  }

  useEffect(() => {
    if (open) {
      initialize();
    }
    return () => {
      if (!open) stopSession();
    };
     
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="w-5 h-5 text-primary" /> 听歌识曲
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status */}
          {(status || error) && (
            <div className={`rounded-lg p-3 text-sm ${error ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-blue-500/10 text-blue-300 border border-blue-500/20"}`}>
              {error || status}
            </div>
          )}

          {/* Recording visualization */}
          {recording && (
            <div className="flex items-center justify-center py-6">
              <div className="relative w-24 h-24 rounded-full bg-red-500/20 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-red-500/10 animate-ping" />
                <Mic className="w-10 h-10 text-red-400 relative" />
              </div>
            </div>
          )}

          {/* Processing */}
          {processing && (
            <div className="flex flex-col items-center py-6 gap-2">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
              <span className="text-sm text-muted-foreground">正在识别...</span>
            </div>
          )}

          {/* Action button */}
          {!recording && !processing && (
            <Button
              onClick={startRecording}
              disabled={preparing}
              className="w-full"
              size="lg"
            >
              {preparing ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 初始化中...</>
              ) : (
                <><Mic className="w-4 h-4 mr-2" /> 开始识曲 ({AUDIO_MATCH_DURATION}秒)</>
              )}
            </Button>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-thin">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <SearchIcon className="w-3 h-3" /> 识别结果 ({results.length})
              </div>
              {results.map((r) => (
                <div
                  key={r.key}
                  className="flex items-center gap-3 p-2 rounded-lg border border-border bg-card/50 hover:border-primary/30 transition-colors cursor-pointer"
                  onClick={() => handleSelectResult(r)}
                >
                  {r.cover ? (
                     
                    <img src={api.proxyUrl(r.cover)} alt="" className="w-10 h-10 rounded object-cover shrink-0" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-10 h-10 rounded bg-gradient-to-br from-blue-500/20 to-teal-500/20 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{r.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{r.artist}</div>
                  </div>
                  {r.startTime > 0 && (
                    <span className="text-[10px] text-muted-foreground shrink-0">{Math.round(r.startTime)}s</span>
                  )}
                  <Play className="w-4 h-4 text-primary shrink-0" />
                </div>
              ))}
            </div>
          )}

          {/* Close */}
          <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4 mr-2" /> 关闭
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

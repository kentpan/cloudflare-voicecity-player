"use client";
import { Music2, Heart } from "lucide-react";
import { useStore } from "@/lib/store";

export function SiteFooter() {
  const { playerConfig } = useStore();
  const playerName = playerConfig?.playerName || "随心音乐";
  const copyrightText = playerConfig?.copyrightText || "© 2026 VoiceCity";
  const githubUrl = playerConfig?.githubUrl || "https://github.com/kentpan/cloudflare-voicecity-player";

  return (
    <footer className="mt-auto border-t border-border/60 glass relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-green-500/5 via-emerald-500/5 to-transparent pointer-events-none" />
      <div className="relative mx-auto max-w-5xl px-4 sm:px-6 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* LOGO 改为 A 标签，链接到 GitHub */}
          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Music2 className="w-5 h-5 text-white" />
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 ring-2 ring-background animate-pulse" />
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold flex items-center gap-1.5">
                {playerName}
                <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-300">
                  FREE
                </span>
              </div>
            </div>
          </a>

          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              服务在线
            </span>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-center gap-1 text-[10px] text-muted-foreground/70">
          <Heart className="w-2.5 h-2.5 text-red-400 fill-current" /> {playerName} · {copyrightText}
        </div>
      </div>
    </footer>
  );
}

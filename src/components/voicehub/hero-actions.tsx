"use client";
import { useState, useRef, useEffect } from "react";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api-client";
import { Github, LogOut, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * Hero 区域右上角操作组件 — GitHub 图标 + 登录/头像按钮。
 *
 * - 未登录：显示「登录」按钮（primary 样式）
 * - 已登录：显示首字符头像，点击切换下拉浮层（播放器管理 + 退出登录）
 */
export function HeroActions() {
  const { user, setLoginOpen, playerConfig } = useStore();
  const githubUrl = playerConfig?.githubUrl || "https://github.com/kentpan/cloudflare-voicecity-player";
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉浮层
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", onClick);
      return () => document.removeEventListener("mousedown", onClick);
    }
  }, [menuOpen]);

  async function handleLogout() {
    setMenuOpen(false);
    try {
      await api.logout();
      useStore.getState().setUser(null);
      toast.success("已退出登录");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function handleAccount() {
    setMenuOpen(false);
    useStore.getState().setAccountOpen(true);
  }

  return (
    <div className="absolute top-4 right-4 sm:top-6 sm:right-6 flex items-center gap-3 z-20">
      {/* GitHub 图标（只有图标，大一点） */}
      <a
        href={githubUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center w-10 h-10 rounded-full border border-gray-500/50 hover:border-gray-400 hover:bg-accent transition-all"
        title="GitHub"
      >
        <Github className="w-5 h-5" />
      </a>

      {/* 登录/头像按钮 */}
      {user ? (
        <div className="relative" ref={menuRef}>
          {/* 头像按钮 — 点击切换下拉浮层 */}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white text-base font-bold flex items-center justify-center shadow-lg hover:shadow-blue-500/40 hover:scale-105 transition-all"
            title="账户菜单"
          >
            {user.name?.[0] || user.username[0]?.toUpperCase() || "A"}
          </button>
          {/* 下拉浮层 */}
          {menuOpen && (
            <div className="absolute right-0 top-12 w-44 rounded-xl border border-border bg-card/95 backdrop-blur-xl shadow-2xl overflow-hidden z-50">
              <div className="px-3 py-2.5 border-b border-border/60">
                <div className="text-sm font-semibold truncate">{user.name || user.username}</div>
                <div className="text-xs text-muted-foreground truncate">@{user.username}</div>
              </div>
              <button
                onClick={handleAccount}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left"
              >
                <Settings className="w-4 h-4" /> 播放器管理
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left text-red-400"
              >
                <LogOut className="w-4 h-4" /> 退出登录
              </button>
            </div>
          )}
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="rounded-full h-10 px-4 border !border-gray-500/50 hover:!border-blue-400 hover:!bg-gray-50/20 transition-all"
          onClick={() => setLoginOpen(true)}
        >
          登录
        </Button>
      )}
    </div>
  );
}

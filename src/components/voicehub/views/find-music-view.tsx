"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { api, searchResultToSong } from "@/lib/api-client";
import { addPlayHistory } from "@/lib/indexeddb";
import type { MusicSearchResult } from "@/types/voicehub";
import {
  Search,
  Music2,
  Mic,
  Play,
  Pause,
  Loader2,
  Video,
  Headphones,
  TrendingUp,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PreviewPlayer } from "@/components/voicehub/preview-player";
import { AudioMatchDialog } from "@/components/voicehub/audio-match-dialog";
import { MusicLoginDialog } from "@/components/voicehub/music-login-dialog";
import { HeroActions } from "@/components/voicehub/hero-actions";
import { toast } from "sonner";

const ALL_PLATFORMS = [
  { value: "netease", label: "网易云", color: "from-red-500 to-rose-600", icon: "🎵" },
  { value: "qq", label: "QQ音乐", color: "from-green-500 to-emerald-600", icon: "🎶" },
  { value: "bilibili", label: "B站", color: "from-pink-500 to-blue-500", icon: "📺" },
];

/** 渲染封面：真实 URL 走代理，否则渐变占位 */
function CoverOrGradient({ cover, className }: { cover?: string | null; className?: string }) {
  if (cover && cover.startsWith("http")) {
    const proxied = api.proxyUrl(cover);
    return <img src={proxied} alt="" className={className} referrerPolicy="no-referrer" />;
  }
  if (cover && cover.startsWith("from-")) {
    return <div className={`bg-gradient-to-br ${cover} ${className ?? ""}`} />;
  }
  return <div className={`bg-gradient-to-br from-blue-500/20 to-teal-500/20 ${className ?? ""}`} />;
}

export function FindMusicView() {
  const { view, setView, playSong, currentSong, isPlaying, setIsPlaying, bumpHistory } = useStore();
  const [platform, setPlatform] = useState("netease");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MusicSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [audioMatchOpen, setAudioMatchOpen] = useState(false);
  const [musicLoginOpen, setMusicLoginOpen] = useState(false);
  const [musicLoginPlatform, setMusicLoginPlatform] = useState<"netease" | "qq">("netease");

  async function handleSearch() {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await api.searchMusic(query.trim(), platform);
      setResults(res);
      if (res.length === 0) toast.info("未找到相关歌曲，试试其它关键词");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  /** 点击搜索结果：在统一播放器播放 + 写入 indexedDB 历史 */
  async function handleSelect(r: MusicSearchResult) {
    const song = searchResultToSong(r);
    // 若点击的是当前正在播放的歌，切换暂停
    if (currentSong?.id === song.id) {
      setIsPlaying(!isPlaying);
      return;
    }
    playSong(song);
    try {
      await addPlayHistory(song);
      bumpHistory();
    } catch (e) {
      console.error("写入播放历史失败", e);
    }
  }

  /** 听歌识曲选中结果 → 同样播放 + 写历史 */
  async function handleAudioMatchSelect(r: MusicSearchResult) {
    const song = searchResultToSong(r);
    playSong(song);
    setAudioMatchOpen(false);
    try {
      await addPlayHistory(song);
      bumpHistory();
    } catch (e) {
      console.error("写入播放历史失败", e);
    }
  }

  /** 打开音乐平台登录弹窗 */
  function openMusicLogin(p: "netease" | "qq") {
    setMusicLoginPlatform(p);
    setMusicLoginOpen(true);
  }

  return (
    <div className="mx-auto max-w-5xl w-full px-4 sm:px-6 py-6 sm:py-10 pb-28">
      {/* Hero 区域（保留原版 box 样式） — 标题 + 描述放在里面 */}
      <section className="relative mb-8 sm:mb-10">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-blue-600/20 via-teal-600/10 to-transparent p-6 sm:p-10">
          <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="absolute -bottom-12 -left-12 w-48 h-48 rounded-full bg-teal-500/10 blur-3xl" />
          {/* 右上角 GitHub + 登录按钮 */}
          <HeroActions />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Badge variant="secondary" className="bg-blue-500/15 text-blue-300 border-blue-500/20">
                <Sparkles className="w-3 h-3 mr-1" /> 找歌
              </Badge>
            </div>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mb-3">
              搜索你喜欢的歌
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base max-w-2xl mb-6">
              支持网易云 / QQ音乐 / B站视频，点击搜索结果即可在底部统一播放器播放，并自动记录到本地播放历史。
            </p>
          </div>
        </div>
      </section>

      {/* 找歌 / 播放历史 Tab 切换 */}
      <Tabs
        value={view}
        onValueChange={(v) => setView(v as "find" | "history")}
        className="mb-6"
      >
        <TabsList className="glass rounded-2xl p-1.5 w-full sm:w-auto h-auto flex">
          <TabsTrigger
            value="find"
            className="rounded-xl h-12 sm:h-11 flex-1 sm:flex-none gap-2 text-sm sm:text-base font-semibold border-transparent dark:data-[state=active]:border-transparent data-[state=active]:!bg-primary dark:data-[state=active]:!bg-primary data-[state=active]:!text-primary-foreground dark:data-[state=active]:!text-primary-foreground data-[state=active]:!shadow-lg data-[state=active]:!shadow-primary/25"
          >
            <Search className="w-4 h-4 sm:w-5 sm:h-5" /> 找歌
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="rounded-xl h-12 sm:h-11 flex-1 sm:flex-none gap-2 text-sm sm:text-base font-semibold border-transparent dark:data-[state=active]:border-transparent data-[state=active]:!bg-primary dark:data-[state=active]:!bg-primary data-[state=active]:!text-primary-foreground dark:data-[state=active]:!text-primary-foreground data-[state=active]:!shadow-lg data-[state=active]:!shadow-primary/25"
          >
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" /> 播放历史
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* 音乐平台登录按钮（tab 下方、搜索框上方；网易云/QQ 才显示，B站无登录） */}
      {platform !== "bilibili" && (
        <div className="mb-4 flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className={
              platform === "netease"
                ? "text-[11px] h-7 px-2 text-red-400 hover:text-red-300"
                : "text-[11px] h-7 px-2 text-green-400 hover:text-green-300"
            }
            onClick={() => openMusicLogin(platform as "netease" | "qq")}
          >
            <Music2 className="w-3 h-3 mr-1" />
            {platform === "netease" ? "登录网易云" : "登录QQ音乐"}
          </Button>
          <span className="text-[10px] text-muted-foreground">
            登录后可播放 VIP 歌曲
          </span>
        </div>
      )}

      {/* 平台选择 */}
      <div className="space-y-2 mb-4">
        <Label className="text-xs text-muted-foreground">选择音乐平台</Label>
        <div className="flex gap-2">
          {ALL_PLATFORMS.map((p) => (
            <button
              key={p.value}
              onClick={() => { setPlatform(p.value); setResults([]); }}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                platform === p.value
                  ? `bg-gradient-to-r ${p.color} text-white border-transparent`
                  : "bg-card border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* 搜索框 + 听歌识曲入口 */}
      <div className="flex gap-2 mb-6">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="搜索歌曲、歌手..."
          className="flex-1"
        />
        <Button onClick={handleSearch} disabled={searching}>
          {searching ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Search className="w-4 h-4 mr-1" />}
          {searching ? "搜索中" : "搜索"}
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setAudioMatchOpen(true)}
          title="听歌识曲"
        >
          <Mic className="w-4 h-4" />
        </Button>
      </div>

      {/* 搜索结果 */}
      {results.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">搜索结果（点击试听 / 播放）</Label>
          <div className="space-y-1.5">
            {results.map((r, idx) => {
              const p = ALL_PLATFORMS.find((x) => x.value === r.platform);
              const isVideo = r.platform === "bilibili";
              const isCurrent = currentSong?.id === r.id;
              const isThisPlaying = isCurrent && isPlaying;
              return (
                <div
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelect(r)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSelect(r); } }}
                  className={`w-full flex items-center gap-3 p-2 sm:p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    isCurrent
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card/50 hover:border-primary/30 hover:bg-card"
                  }`}
                >
                  <span className={`w-6 text-center font-bold text-sm shrink-0 ${idx < 3 ? "text-yellow-400" : "text-muted-foreground"}`}>
                    {idx < 3 ? <TrendingUp className="w-4 h-4 mx-auto" /> : idx + 1}
                  </span>
                  <div className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-lg overflow-hidden bg-gradient-to-br from-blue-500/20 to-teal-500/20 flex items-center justify-center shrink-0">
                    <CoverOrGradient cover={r.cover} className="w-full h-full" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/25">
                        {isThisPlaying ? (
                          <Pause className="w-3.5 h-3.5 text-white fill-current" />
                        ) : (
                          <Play className="w-3.5 h-3.5 text-white fill-current ml-0.5" />
                        )}
                      </div>
                    </div>
                    {isThisPlaying && (
                      <div className="absolute inset-0 flex items-end justify-center gap-0.5 bg-black/40 p-1.5 pointer-events-none">
                        {[0, 1, 2, 3].map((i) => (
                          <span key={i} className="w-0.5 bg-blue-400 rounded-full" style={{ animation: `equalizer 0.8s ease-in-out ${i * 0.15}s infinite`, height: "50%" }} />
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium truncate">{r.title}</span>
                      {p && (
                        <Badge variant="outline" className={`text-[9px] py-0 bg-gradient-to-r ${p.color} text-white border-transparent shrink-0`}>
                          {p.icon} {p.label}
                        </Badge>
                      )}
                      <Badge variant="outline" className={`text-[9px] py-0 shrink-0 ${isVideo ? "text-teal-300 border-teal-500/30" : "text-blue-300 border-blue-500/30"}`}>
                        {isVideo ? <Video className="w-2.5 h-2.5 mr-0.5" /> : <Headphones className="w-2.5 h-2.5 mr-0.5" />}
                        {isVideo ? "视频" : "音频"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.artist}
                      {r.duration != null && r.duration > 0 && (
                        <> · {Math.floor(r.duration / 60)}:{String(r.duration % 60).padStart(2, "0")}</>
                      )}
                    </div>
                  </div>
                  {/* 试听按钮（独立于卡片点击，stopPropagation） */}
                  <PreviewPlayer trackId={r.id} platform={r.platform} title={r.title} artist={r.artist} cover={r.cover || ''} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 空状态（未搜索时） */}
      {results.length === 0 && !searching && (
        <div className="text-center py-20 rounded-2xl border border-dashed border-border">
          <Music2 className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">输入关键词搜索，或点击右上角麦克风听歌识曲</p>
        </div>
      )}

      {/* 听歌识曲弹窗 */}
      <AudioMatchDialog
        open={audioMatchOpen}
        onOpenChange={setAudioMatchOpen}
        onSelect={handleAudioMatchSelect}
      />

      {/* 音乐平台登录弹窗（网易云/QQ 扫码） */}
      <MusicLoginDialog
        open={musicLoginOpen}
        onOpenChange={setMusicLoginOpen}
        initialPlatform={musicLoginPlatform}
      />
    </div>
  );
}

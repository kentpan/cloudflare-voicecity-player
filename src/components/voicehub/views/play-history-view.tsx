"use client";
import { useEffect, useState, useCallback } from "react";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api-client";
import {
  getPlayHistory,
  deletePlayHistory,
  clearPlayHistory,
  favoriteSong,
  unfavoriteSong,
  deleteFavorite,
} from "@/lib/indexeddb";
import type { Song } from "@/types/voicehub";
import {
  Music2,
  Play,
  Pause,
  Trash2,
  Clock,
  Video,
  Headphones,
  TrendingUp,
  Search,
  Sparkles,
  Star,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { HeroActions } from "@/components/voicehub/hero-actions";
import { toast } from "sonner";

const ALL_PLATFORMS = [
  { value: "netease", label: "网易云", color: "from-red-500 to-rose-600", icon: "🎵" },
  { value: "qq", label: "QQ音乐", color: "from-green-500 to-emerald-600", icon: "🎶" },
  { value: "bilibili", label: "B站", color: "from-pink-500 to-blue-500", icon: "📺" },
];

const PAGE_SIZE = 10;

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

function formatPlayedAt(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function PlayHistoryView() {
  const { view, setView, playSong, currentSong, isPlaying, setIsPlaying, historyVersion, bumpHistory } = useStore();
  const [history, setHistory] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  // 确认弹窗状态：单条删除
  const [deleteTarget, setDeleteTarget] = useState<Song | null>(null);
  // 确认弹窗状态：清空全部
  const [clearAllOpen, setClearAllOpen] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getPlayHistory();
      setHistory(list);
    } catch (e) {
      console.error("读取播放列表失败", e);
      toast.error("读取播放列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory, historyVersion]);

  // 重听一首歌：仅播放，不刷新 playedAt（不自动置顶）
  function handlePlay(song: Song) {
    if (currentSong?.id === song.id) {
      setIsPlaying(!isPlaying);
      return;
    }
    playSong(song);
  }

  /** 点击收藏/取消收藏 */
  async function handleToggleFavorite(song: Song) {
    try {
      if (song.favorited) {
        await unfavoriteSong(song.id);
        toast.success("已取消收藏");
      } else {
        await favoriteSong(song);
        toast.success("已收藏");
      }
      bumpHistory();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  /** 点击删除按钮 → 弹出确认弹窗 */
  function handleDeleteClick(song: Song) {
    setDeleteTarget(song);
  }

  /** 确认删除单条（收藏的歌也走此路径，单独删除） */
  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.favorited) {
        // 收藏的歌：同时从 favorites 和 play-history 删除
        await deleteFavorite(deleteTarget.id);
      } else {
        await deletePlayHistory(deleteTarget.id);
      }
      bumpHistory();
      toast.success("已删除");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleteTarget(null);
    }
  }

  /** 点击清空按钮 → 弹出确认弹窗 */
  function handleClearAllClick() {
    if (history.length === 0) return;
    setClearAllOpen(true);
  }

  /** 确认清空全部（保留收藏的歌曲） */
  async function confirmClearAll() {
    try {
      await clearPlayHistory();
      bumpHistory();
      setPage(1);
      toast.success("已清空未收藏的播放列表");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setClearAllOpen(false);
    }
  }

  // 分页计算
  const totalCount = history.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pageItems = history.slice(startIndex, startIndex + PAGE_SIZE);
  const favoriteCount = history.filter((s) => s.favorited).length;
  const clearableCount = totalCount - favoriteCount;

  return (
    <div className="mx-auto max-w-5xl w-full px-4 sm:px-6 py-6 sm:py-10 pb-28">
      {/* Hero 区域（保留原版 box 样式） */}
      <section className="relative mb-8 sm:mb-10">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-blue-600/20 via-teal-600/10 to-transparent p-6 sm:p-10">
          <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="absolute -bottom-12 -left-12 w-48 h-48 rounded-full bg-teal-500/10 blur-3xl" />
          {/* 右上角 GitHub + 登录按钮 */}
          <HeroActions />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="secondary" className="bg-blue-500/15 text-blue-300 border-blue-500/20">
                <Sparkles className="w-3 h-3 mr-1" /> 播放列表
              </Badge>
            </div>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mb-3">
              本地播放列表
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base max-w-2xl mb-6">
              历史记录保存在浏览器 indexedDB，仅限本设备。点击列表可再次播放，重听后自动置顶。
              <span className="inline-flex items-center gap-1 ml-1 text-orange-400">
                <Star className="w-3 h-3" /> 收藏
              </span>
              的歌曲始终居顶，清空历史不会删除收藏。
            </p>
          </div>
        </div>
      </section>

      {/* 找歌 / 播放列表 Tab 切换 */}
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
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" /> 播放列表
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* 清空按钮 + 统计信息 */}
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-muted-foreground">
          共 {totalCount} 条
          {favoriteCount > 0 && (
            <span className="ml-2 text-orange-400 flex items-center gap-0.5 inline-flex">
              <Star className="w-3 h-3 fill-current" /> {favoriteCount} 收藏
            </span>
          )}
        </div>
        {clearableCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 text-red-400 hover:text-red-300 hover:border-red-500/30"
            onClick={handleClearAllClick}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" /> 清空未收藏
          </Button>
        )}
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="grid gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-card/50 animate-pulse" />
          ))}
        </div>
      ) : history.length === 0 ? (
        <div className="text-center py-20 rounded-2xl border border-dashed border-border">
          <Music2 className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">还没有播放记录，去「找歌」听一首吧</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => setView("find")}
          >
            <Search className="w-4 h-4 mr-1.5" /> 去找歌
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-2.5">
            {pageItems.map((song, idx) => {
              const globalIdx = startIndex + idx;
              const p = ALL_PLATFORMS.find((x) => x.value === song.musicPlatform);
              const isVideo = song.musicPlatform === "bilibili";
              const isCurrent = currentSong?.id === song.id;
              const isThisPlaying = isCurrent && isPlaying;
              const isFav = !!song.favorited;
              const rankColor = isFav
                ? "text-orange-400"
                : globalIdx === 0
                ? "text-yellow-400"
                : globalIdx === 1
                ? "text-gray-300"
                : globalIdx === 2
                ? "text-orange-400"
                : "text-muted-foreground";
              return (
                <div
                  key={song.id}
                  className={`group p-3 sm:p-4 rounded-2xl bg-card/60 hover:bg-card border transition-all sm:flex sm:items-center sm:gap-4 ${
                    isCurrent ? "border-primary bg-primary/5" : isFav ? "border-orange-500/30" : "border-border hover:border-primary/30"
                  }`}
                >
                  {/* 移动端布局 */}
                  <div className="sm:hidden">
                    <div className="flex items-start gap-3">
                      <div className={`w-7 text-center font-bold text-sm shrink-0 pt-1 ${rankColor}`}>
                        {isFav ? <Star className="w-5 h-5 mx-auto fill-current" /> : globalIdx < 3 ? <TrendingUp className="w-5 h-5 mx-auto" /> : globalIdx + 1}
                      </div>
                      <button
                        onClick={() => handlePlay(song)}
                        className="relative w-16 h-16 rounded-xl overflow-hidden bg-gradient-to-br from-blue-500/20 to-teal-500/20 flex items-center justify-center shrink-0"
                      >
                        <CoverOrGradient cover={song.cover} className="w-full h-full" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <div className="w-8 h-8 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/25">
                            {isThisPlaying ? (
                              <Pause className="w-4 h-4 text-white fill-current" />
                            ) : (
                              <Play className="w-4 h-4 text-white fill-current ml-0.5" />
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
                      </button>
                      <button
                        onClick={() => handlePlay(song)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <span className="font-semibold text-sm truncate">{song.title}</span>
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
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap mb-1.5">
                          <span className="truncate max-w-[110px]">{song.artist}</span>
                        </div>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            <span className="tabular-nums">{formatPlayedAt(song.playedAt)}</span>
                          </div>
                        </div>
                      </button>
                      {/* 收藏按钮 + 删除按钮 */}
                      <div className="flex flex-col items-center gap-1.5 shrink-0 self-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleFavorite(song); }}
                          className={`flex items-center justify-center w-8 h-8 rounded-full transition-all ${
                            isFav
                              ? "bg-orange-500/15 text-orange-400 hover:bg-orange-500/25"
                              : "bg-secondary hover:bg-orange-500/15 hover:text-orange-400 text-muted-foreground"
                          }`}
                          title={isFav ? "取消收藏" : "收藏"}
                        >
                          <Star className={`w-3.5 h-3.5 ${isFav ? "fill-current" : ""}`} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteClick(song); }}
                          className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary hover:bg-red-500/15 hover:text-red-400 text-muted-foreground transition-all"
                          title="删除这条记录"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 桌面端布局 */}
                  <div className="hidden sm:flex sm:items-center sm:gap-4 sm:w-full">
                    <div className={`w-8 text-center font-bold text-lg shrink-0 ${rankColor}`}>
                      {isFav ? <Star className="w-5 h-5 mx-auto fill-current" /> : globalIdx < 3 ? <TrendingUp className="w-5 h-5 mx-auto" /> : globalIdx + 1}
                    </div>
                    <button
                      onClick={() => handlePlay(song)}
                      className="relative w-16 h-16 rounded-xl overflow-hidden bg-gradient-to-br from-blue-500/20 to-teal-500/20 flex items-center justify-center shrink-0"
                    >
                      <CoverOrGradient cover={song.cover} className="w-full h-full" />
                      <div className="absolute top-0.5 right-0.5 rounded bg-black/60 px-1 py-0.5 text-[8px] text-white flex items-center gap-0.5">
                        {isVideo ? <Video className="w-2 h-2" /> : <Headphones className="w-2 h-2" />}
                        {isVideo ? "MP4" : "MP3"}
                      </div>
                      <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${isCurrent ? "bg-black/50 opacity-100" : "bg-black/40 opacity-0 group-hover:opacity-100"}`}>
                        <div className={`w-9 h-9 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/25 transition-transform ${isCurrent ? "scale-100" : "scale-90 group-hover:scale-100"}`}>
                          {isThisPlaying ? <Pause className="w-5 h-5 text-white fill-current" /> : <Play className="w-5 h-5 text-white fill-current ml-0.5" />}
                        </div>
                      </div>
                      {isThisPlaying && (
                        <div className="absolute inset-0 flex items-end justify-center gap-0.5 bg-black/40 p-2 pointer-events-none">
                          {[0, 1, 2, 3].map((i) => (
                            <span key={i} className="w-0.5 bg-blue-400 rounded-full" style={{ animation: `equalizer 0.8s ease-in-out ${i * 0.15}s infinite`, height: "50%" }} />
                          ))}
                        </div>
                      )}
                    </button>
                    <button
                      onClick={() => handlePlay(song)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="font-semibold truncate">{song.title}</span>
                        {p && (
                          <Badge variant="outline" className={`text-[10px] py-0 bg-gradient-to-r ${p.color} text-white border-transparent flex items-center gap-0.5`}>
                            <span>{p.icon}</span>{p.label}
                          </Badge>
                        )}
                        <Badge variant="outline" className={`text-[9px] py-0 ${isVideo ? "text-teal-300 border-teal-500/30" : "text-blue-300 border-blue-500/30"} flex items-center gap-0.5`}>
                          {isVideo ? <Video className="w-2.5 h-2.5" /> : <Headphones className="w-2.5 h-2.5" />}
                          {isVideo ? "视频" : "音频"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        <span className="truncate">{song.artist}</span>
                      </div>
                    </button>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span className="tabular-nums">{formatPlayedAt(song.playedAt)}</span>
                      </div>
                    </div>
                    {/* 收藏按钮 */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleToggleFavorite(song); }}
                      className={`flex items-center justify-center w-8 h-8 rounded-full transition-all shrink-0 ${
                        isFav
                          ? "bg-orange-500/15 text-orange-400 hover:bg-orange-500/25"
                          : "bg-secondary hover:bg-orange-500/15 hover:text-orange-400 text-muted-foreground"
                      }`}
                      title={isFav ? "取消收藏" : "收藏"}
                    >
                      <Star className={`w-4 h-4 ${isFav ? "fill-current" : ""}`} />
                    </button>
                    {/* 删除按钮 */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteClick(song); }}
                      className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary hover:bg-red-500/15 hover:text-red-400 text-muted-foreground transition-all shrink-0"
                      title="删除这条记录"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 分页控件 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="h-8 px-3"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-muted-foreground tabular-nums px-2">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="h-8 px-3"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* 确认弹窗：删除单条 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent className="glass-strong">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" /> 确认删除
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.favorited
                ? `「${deleteTarget?.title}」是已收藏的歌曲，确定要删除吗？删除后将同时取消收藏，此操作不可撤销。`
                : `确定要从播放列表中删除「${deleteTarget?.title}」吗？此操作不可撤销。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 确认弹窗：清空全部 */}
      <AlertDialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
        <AlertDialogContent className="glass-strong">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" /> 确认清空
            </AlertDialogTitle>
            <AlertDialogDescription>
              确定要清空 {clearableCount} 条未收藏的播放列表吗？
              {favoriteCount > 0 && ` 已收藏的 ${favoriteCount} 首歌曲将保留。`}
              此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmClearAll}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              清空未收藏
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

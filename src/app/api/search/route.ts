import { ok, fail, handleError } from "@/lib/api";
import { searchNetEase } from "@/lib/music/netease";
import { searchQqMusic } from "@/lib/music/qq_music_sdk";
import { createTxSearchBody, txRequest, txSignedRequest } from "@/lib/music/native_tx";
import { decodeName } from "@/lib/music/native_common";
import { searchBilibili } from "@/lib/music/bilibili";
import type { MusicSearchResult } from "@/types/voicehub";

/**
 * GET /api/search?q=...&platform=netease|qq|bilibili&limit=20
 *
 * 音乐搜索 — 直接调用网易云 / QQ音乐 / B站 搜索 API。
 * 无数据库依赖，无状态。
 *
 * QQ 音乐分支 verbatim port of VoiceHub native-api/search/tx.get.ts:
 *   SDK 优先 → 原生签名请求 → 原生普通请求
 */
const stripHtml = (value: unknown) => String(value ?? "").replace(/[<>]/g, "");

function formatSdkSearchList(items: any[]): MusicSearchResult[] {
  return items.map((item: any) => {
    const songmid = item.songmid || item.mid;
    const albumMid = item.albummid || item.albumMid || item.album?.mid || "";
    const singers = Array.isArray(item.singer)
      ? item.singer.map((s: any) => s.name).filter(Boolean).join("、")
      : item.singer || "";
    const cover =
      albumMid && albumMid !== "空"
        ? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${albumMid}.jpg`
        : Array.isArray(item.singer) && item.singer[0]?.mid
          ? `https://y.gtimg.cn/music/photo_new/T001R500x500M000${item.singer[0].mid}.jpg`
          : "";
    return {
      id: `qq-${songmid}`,
      title: decodeName(stripHtml(item.songname || item.name || item.title)),
      artist: decodeName(stripHtml(singers)),
      cover,
      platform: "qq" as const,
      duration: Number(item.interval || item.duration || 0),
    };
  }).filter((item) => item.id !== "qq-" && item.id !== "qq-undefined");
}

function formatNativeSearchList(rawList: any[]): MusicSearchResult[] {
  const list: MusicSearchResult[] = [];
  for (const item of rawList) {
    if (!item.file?.media_mid) continue;
    const songmid = item.mid;
    if (!songmid) continue;
    const albumMid = item.album?.mid ?? "";
    const singerName = item.singer ? item.singer.map((s: any) => s.name).join("、") : "";
    const cover = albumMid
      ? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${albumMid}.jpg`
      : "";
    list.push({
      id: `qq-${songmid}`,
      title: decodeName(item.name + (item.title_extra ?? "")),
      artist: decodeName(singerName),
      cover,
      platform: "qq" as const,
      duration: Number(item.interval || 0),
    });
  }
  return list;
}

async function searchQqAll(q: string, limit: number): Promise<MusicSearchResult[]> {
  // 1. SDK 优先
  try {
    const sdkResult: any = await searchQqMusic({ key: q, page: 1, limit, cookie: undefined });
    const sdkList = sdkResult?.song?.list || sdkResult?.data?.song?.list || [];
    const list = formatSdkSearchList(sdkList);
    if (list.length > 0) return list;
  } catch (sdkErr) {
    console.warn("[search] qq-music-api 搜索失败，回退到原生搜索:", sdkErr);
  }

  // 2. 原生签名请求 → 普通请求
  const body = createTxSearchBody(q, 1, limit);
  let result: any;
  try {
    result = await txSignedRequest(body);
  } catch (signedErr) {
    console.warn("[search] 签名请求失败，回退到普通请求:", signedErr);
    result = await txRequest("https://u.y.qq.com/cgi-bin/musicu.fcg", body);
  }
  if (!result || result.code !== 0 || result.req?.code !== 0) {
    throw new Error(`QQ 搜索接口异常: code=${result?.code}, req.code=${result?.req?.code}`);
  }
  const rawList = result.req?.data?.body?.item_song || result.req?.data?.item_song || [];
  return formatNativeSearchList(rawList);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? "";
    const platform = url.searchParams.get("platform") ?? "netease";
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Math.max(1, Math.min(50, Number(limitParam))) : 20;

    if (!q.trim()) return ok([]);

    let results: MusicSearchResult[] = [];

    if (platform === "netease") {
      const songs = await searchNetEase(q, limit);
      results = songs.map((s) => ({
        id: `wy-${s.id}`,
        title: s.name,
        artist: s.artist,
        cover: s.cover,
        platform: "netease",
        duration: s.duration,
      }));
    } else if (platform === "qq") {
      results = await searchQqAll(q, limit);
    } else if (platform === "bilibili") {
      const tracks = await searchBilibili(q, limit);
      results = tracks.map((t) => ({
        id: `bili-${t.id}`,
        title: t.title,
        artist: t.artist,
        cover: t.cover,
        platform: "bilibili",
        duration: t.duration,
      }));
    } else {
      return fail(`不支持的平台: ${platform}`, 400);
    }

    return ok(results);
  } catch (err) {
    return handleError(err);
  }
}

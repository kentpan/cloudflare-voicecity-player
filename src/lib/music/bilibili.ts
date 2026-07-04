/**
 * Bilibili (哔哩哔哩) platform plugin.
 *
 * All functionality (search, resolve play URL, cover proxy) is self-contained.
 * Ported from the original VoiceCity bilibili/search.get.ts + playurl.get.ts.
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

let cachedBuvid3: string | null = null;

/** 从 B站 spi 接口获取真实 buvid3，规避云服务器 IP 段被反爬拦截 (412)。 */
async function getBuvid3(): Promise<string> {
  if (cachedBuvid3) return cachedBuvid3;
  try {
    const res = await fetch("https://api.bilibili.com/x/frontend/finger/spi", {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const json = (await res.json()) as { code: number; data?: { b_3?: string } };
      if (json.code === 0 && json.data?.b_3) {
        cachedBuvid3 = json.data.b_3;
        return cachedBuvid3;
      }
    }
  } catch (error) {
    console.log("[bilibili] getBuvid3 failed:", error);
  }
  return "0";
}

/** 构建带有效 buvid3 的 B站请求 headers。 */
async function getBiliHeaders(): Promise<Record<string, string>> {
  const buvid3 = await getBuvid3();
  return {
    Cookie: `buvid3=${buvid3}`,
    Referer: "https://www.bilibili.com/",
    "User-Agent": UA,
  };
}

export interface BilibiliVideoPage {
  cid: number;
  page: number;
  part: string;
  duration: number;
}

export interface BilibiliTrack {
  id: string; // bvid
  cid: number | null;
  title: string;
  artist: string;
  cover: string;
  duration: number; // seconds
  pages: BilibiliVideoPage[];
}

function htmlDecode(value: string): string {
  return value.replace(/<[^>]*>/g, "");
}

function convertSong(
  song: { id: number; bvid: string; title: string; author: string; pic: string; duration: string },
  pages?: BilibiliVideoPage[]
): BilibiliTrack {
  let imgUrl = song.pic;
  const parts = song.duration.split(":").map((x) => Number.parseInt(x, 10)).reverse();
  let duration = (parts[0] || 0) + (parts[1] || 0) * 60;
  if (parts.length === 3) duration += parts[2] * 60 * 60;
  if (imgUrl.startsWith("//")) imgUrl = `https:${imgUrl}`;
  return {
    id: song.bvid,
    cid: pages?.[0]?.cid ?? null,
    title: htmlDecode(song.title),
    artist: htmlDecode(song.author),
    cover: imgUrl,
    duration,
    pages: pages ?? [],
  };
}

/**
 * Failover 代理域名(部署在 Vercel,IP 段不被 B站反爬拦截)。
 * 直连 B站 API 返回 412 时,按顺序回退到这两个代理。
 */
const BILI_PROXY_DOMAINS = [
  "https://voice.xubaoge.com",
  "https://voicehub.smart-teach.cn",
  "https://voicehub.lao-shui.top",
];

interface ProxyTrack {
  id: string;
  title: string;
  artist: string;
  cover: string;
  duration: number;
  pages?: BilibiliVideoPage[];
}

function convertProxyTrack(track: ProxyTrack): BilibiliTrack {
  return {
    id: track.id,
    cid: track.pages?.[0]?.cid ?? null,
    title: track.title,
    artist: track.artist,
    cover: track.cover,
    duration: track.duration,
    pages: track.pages ?? [],
  };
}

/** 412 时按顺序尝试 Vercel 代理域名搜索。 */
async function searchViaProxy(keyword: string): Promise<BilibiliTrack[]> {
  let lastError: Error | null = null;
  for (const base of BILI_PROXY_DOMAINS) {
    try {
      const url = new URL(`${base}/api/bilibili/search`);
      url.searchParams.set("keyword", keyword);
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12000) });
      if (!res.ok) throw new Error(`代理搜索 HTTP ${res.status}`);
      const json = (await res.json()) as ProxyTrack[];
      return json.map(convertProxyTrack);
    } catch (error) {
      console.log(`[bilibili] proxy search failed (${base}):`, error);
      lastError = error as Error;
    }
  }
  throw lastError ?? new Error("代理搜索全部失败");
}

/** 412 时按顺序尝试 Vercel 代理域名解析播放链接。 */
async function resolveViaProxy(bvid: string): Promise<{ url: string; pay: boolean }> {
  let lastError: Error | null = null;
  for (const base of BILI_PROXY_DOMAINS) {
    try {
      const url = new URL(`${base}/api/bilibili/playurl`);
      url.searchParams.set("id", bvid);
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`代理解析 HTTP ${res.status}`);
      const json = (await res.json()) as { url: string; pay: boolean };
      if (!json.url) throw new Error("代理返回空 url");
      return json;
    } catch (error) {
      console.log(`[bilibili] proxy resolve failed (${base}):`, error);
      lastError = error as Error;
    }
  }
  throw lastError ?? new Error("代理解析全部失败");
}

/** Search Bilibili videos. Throws on failure (no silent fallback). */
export async function searchBilibili(keyword: string, limit = 15): Promise<BilibiliTrack[]> {
  if (!keyword) return [];
  try {
    const headers = await getBiliHeaders();
    const url = new URL("https://api.bilibili.com/x/web-interface/search/type");
    url.searchParams.set("page", "1");
    url.searchParams.set("page_size", String(limit));
    url.searchParams.set("platform", "pc");
    url.searchParams.set("highlight", "1");
    url.searchParams.set("keyword", keyword);
    url.searchParams.set("search_type", "video");

    const res = await fetch(url.toString(), {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`B站搜索失败: HTTP ${res.status}`);
    const json = (await res.json()) as { code: number; message: string; data?: { result?: Array<{ id: number; bvid: string; title: string; author: string; pic: string; duration: string }> } };
    if (json.code !== 0) throw new Error(`B站搜索接口异常: ${json.message}`);
    const results = json.data?.result ?? [];

    const tracks = await Promise.all(
      results.map(async (song) => {
        try {
          const viewUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(song.bvid)}`;
          const viewRes = await fetch(viewUrl, {
            method: "GET",
            headers,
            signal: AbortSignal.timeout(8000),
          });
          if (!viewRes.ok) return convertSong(song);
          const viewJson = (await viewRes.json()) as { data?: { pages?: BilibiliVideoPage[] }; code?: number };
          if (viewJson.code !== 0) return convertSong(song);
          const pages = viewJson.data?.pages ?? [];
          return convertSong(song, pages);
        } catch {
          return convertSong(song);
        }
      })
    );
    return tracks;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("412")) {
      console.log("[bilibili] direct search got 412, falling back to proxy");
      return searchViaProxy(keyword);
    }
    throw error;
  }
}

/** Resolve a playable audio/video URL for a Bilibili video (platform=html5). */
export async function resolveBilibiliUrl(bvid: string, cid?: string | number): Promise<{ url: string; pay: boolean }> {
  if (!bvid) throw new Error("缺少 B站 bvid 参数");

  try {
    const headers = await getBiliHeaders();
    let finalCid = cid ? String(cid) : "";
    if (!finalCid) {
      const viewUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`;
      const viewRes = await fetch(viewUrl, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(8000),
      });
      if (!viewRes.ok) throw new Error(`获取 B站视频信息失败: HTTP ${viewRes.status}`);
      const viewJson = (await viewRes.json()) as { code?: number; message?: string; data?: { pages?: Array<{ cid: string }> } };
      if (viewJson.code !== 0 || !viewJson.data?.pages?.[0]?.cid) {
        throw new Error(`获取 B站 CID 失败: ${viewJson.message || "视频不存在或不可见"}`);
      }
      finalCid = viewJson.data.pages[0].cid;
    }

    const playUrl = new URL("https://api.bilibili.com/x/player/playurl");
    playUrl.searchParams.set("fnval", "1");
    playUrl.searchParams.set("platform", "html5");
    playUrl.searchParams.set("high_quality", "1");
    playUrl.searchParams.set("bvid", bvid);
    playUrl.searchParams.set("cid", finalCid);

    const res = await fetch(playUrl.toString(), {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`获取 B站播放链接失败: HTTP ${res.status}`);
    const json = (await res.json()) as { code: number; message: string; data?: { durl?: Array<{ url: string }> } };
    if (json.code !== 0 || !json.data?.durl?.length) {
      throw new Error(`获取 B站播放链接失败: ${json.message || "未知错误"}`);
    }
    return { url: json.data.durl[0].url, pay: false };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("412")) {
      console.log("[bilibili] direct resolve got 412, falling back to proxy");
      return resolveViaProxy(bvid);
    }
    throw error;
  }
}

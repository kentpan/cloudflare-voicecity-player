/**
 * Bilibili (哔哩哔哩) platform plugin.
 *
 * All functionality (search, resolve play URL, cover proxy) is self-contained.
 * Ported from the original VoiceCity bilibili/search.get.ts + playurl.get.ts.
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const BILI_HEADERS: Record<string, string> = {
  Cookie: "buvid3=0",
  Referer: "https://www.bilibili.com/",
  "User-Agent": UA,
};

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

/** Search Bilibili videos. Throws on failure (no silent fallback). */
export async function searchBilibili(keyword: string, limit = 15): Promise<BilibiliTrack[]> {
  if (!keyword) return [];
  const url = new URL("https://api.bilibili.com/x/web-interface/search/type");
  url.searchParams.set("page", "1");
  url.searchParams.set("page_size", String(limit));
  url.searchParams.set("platform", "pc");
  url.searchParams.set("highlight", "1");
  url.searchParams.set("keyword", keyword);
  url.searchParams.set("search_type", "video");

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: BILI_HEADERS,
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
          headers: BILI_HEADERS,
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
}

/** Resolve a playable audio/video URL for a Bilibili video (platform=html5). */
export async function resolveBilibiliUrl(bvid: string, cid?: string | number): Promise<{ url: string; pay: boolean }> {
  if (!bvid) throw new Error("缺少 B站 bvid 参数");

  let finalCid = cid ? String(cid) : "";
  if (!finalCid) {
    const viewUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`;
    const viewRes = await fetch(viewUrl, {
      method: "GET",
      headers: BILI_HEADERS,
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
    headers: BILI_HEADERS,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`获取 B站播放链接失败: HTTP ${res.status}`);
  const json = (await res.json()) as { code: number; message: string; data?: { durl?: Array<{ url: string }> } };
  if (json.code !== 0 || !json.data?.durl?.length) {
    throw new Error(`获取 B站播放链接失败: ${json.message || "未知错误"}`);
  }
  return { url: json.data.durl[0].url, pay: false };
}

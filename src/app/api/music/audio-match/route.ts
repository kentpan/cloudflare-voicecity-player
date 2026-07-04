import { ok, fail, handleError, readBody } from "@/lib/api";

/**
 * POST /api/music/audio-match
 *
 * Listen-and-identify (听歌识曲): takes a fingerprint generated client-side
 * by the afp.js WASM module + an 8s recording, sends it to NetEase's
 * audio/match API, and returns matching songs.
 *
 * Body: { duration: number, audioFP: string (base64 fingerprint) }
 *
 * Ported from the original VoiceHub `server/api/api-enhanced/netease/[...path].ts`
 * which proxied to `@neteasecloudmusicapienhanced/api`'s `audio_match` endpoint.
 * Here we call the NetEase public API directly.
 */
export async function POST(req: Request) {
  try {
    const body = await readBody<{ duration?: number; audioFP?: string }>(req);
    const duration = Number(body.duration) || 8;
    const audioFP = (body.audioFP ?? "").trim();
    if (!audioFP) return fail("缺少音频指纹", 400);

    // NetEase audio match API endpoint
    const url = "https://music.163.com/api/music/audio/match";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: "https://music.163.com",
        origin: "https://music.163.com",
      },
      body: new URLSearchParams({
        duration: String(duration),
        audioFP,
      }).toString(),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return fail(`识曲接口 HTTP ${res.status}`, res.status);
    const json = (await res.json()) as { code?: number; data?: { result?: Array<Record<string, unknown>> }; result?: Array<Record<string, unknown>> };

    // Normalize the response — extract song list
    const rawResults = json.data?.result || json.result || [];
    const matches = rawResults.map((item: Record<string, unknown>, index: number) => {
      const song = (item.song as Record<string, unknown>) || {};
      const artists = Array.isArray(song.artists)
        ? (song.artists as Array<Record<string, unknown>>).map((a) => String(a?.name ?? "")).filter(Boolean)
        : [];
      const album = (song.album as Record<string, unknown>) || {};
      return {
        key: `${song.id || "unknown"}-${index}`,
        id: song.id as number | undefined,
        name: (song.name as string) || "未知歌曲",
        artist: artists.join(" / ") || "未知歌手",
        album: (album.name as string) || "",
        cover: (album.picUrl as string) || "",
        startTime: typeof item.startTime === "number" ? (item.startTime as number) : 0,
      };
    });

    return ok({ matches, total: matches.length });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * QQ Music (QQ音乐) SDK — ported from the original VoiceCity
 * `server/utils/qq_music_sdk.ts` + `server/utils/native_tx.ts`.
 *
 * Uses plain fetch (no h3/$fetch, no external qq-music-api package).
 * Implements: search, resolve play URL (vkey), fetch lyric (QRC + LRC),
 * zzcSign signing, and the QRC triple-DES decryption for 逐字歌词.
 */

import { createHash } from "node:crypto";

export const txHeaders: Record<string, string> = {
  "User-Agent": "QQMusic 14090508(android 12)",
};

const TX_MUSICU_URL = "https://u.y.qq.com/cgi-bin/musicu.fcg";
const TX_MUSICS_URL = "https://u.y.qq.com/cgi-bin/musics.fcg";

// ─── zzcSign 签名算法 (ported from native_tx.ts) ─────────────────────────
const PART_1_INDEXES = [23, 14, 6, 36, 16, 40, 7, 19];
const PART_2_INDEXES = [16, 1, 32, 12, 19, 27, 8, 5];
const SCRAMBLE_VALUES = [89, 39, 179, 150, 218, 82, 58, 252, 177, 52, 186, 123, 120, 64, 242, 133, 143, 161, 121, 179];

function pickHashByIdx(hash: string, indexes: number[]): string {
  return indexes.map((idx) => hash[idx]).join("");
}

function base64Encode(data: Buffer | string): string {
  return Buffer.from(data).toString("base64").replace(/[\\/+=]/g, "");
}

export async function zzcSign(text: string): Promise<string> {
  const hash = createHash("sha1").update(text).digest("hex");
  const part1 = pickHashByIdx(hash, PART_1_INDEXES);
  const part2 = pickHashByIdx(hash, PART_2_INDEXES);
  const part3 = SCRAMBLE_VALUES.map((value, i) => value ^ parseInt(hash.slice(i * 2, i * 2 + 2), 16));
  const b64Part = base64Encode(Buffer.from(part3)).replace(/[\\/+=]/g, "");
  return `zzc${part1}${b64Part}${part2}`.toLowerCase();
}

export async function txSignedRequest(body: unknown): Promise<any> {
  const sign = await zzcSign(JSON.stringify(body));
  const res = await fetch(`${TX_MUSICS_URL}?sign=${sign}`, {
    method: "POST",
    headers: { ...txHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`QQ 签名请求 HTTP ${res.status}`);
  return res.json();
}

export async function txRequest(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { ...txHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`QQ 请求 HTTP ${res.status}`);
  return res.json();
}

export function upgradeTxAudioUrl(url: string): string {
  return url.startsWith("http://") ? url.replace("http://", "https://") : url;
}

// ─── 搜索 (createTxSearchBody + DoSearchForQQMusicMobile) ─────────────────
export function createTxSearchBody(str: string, page: number, limit: number) {
  return {
    comm: { ct: "11", cv: "14090508", v: "14090508", tmeAppID: "qqmusic", phonetype: "EBG-AN10", deviceScore: "553.47", devicelevel: "50", newdevicelevel: "20", rom: "HuaWei/EMOTION/EmotionUI_14.2.0", os_ver: "12", OpenUDID: "0", OpenUDID2: "0", QIMEI36: "0", udid: "0", chid: "0", aid: "0", oaid: "0", taid: "0", tid: "0", wid: "0", uid: "0", sid: "0", modeSwitch: "6", teenMode: "0", ui_mode: "2", nettype: "1020", v4ip: "" },
    req: {
      module: "music.search.SearchCgiService",
      method: "DoSearchForQQMusicMobile",
      param: { search_type: 0, query: str, page_num: page, num_per_page: limit, highlight: 0, nqc_flag: 0, multi_zhida: 0, cat: 2, grp: 1, sin: 0, sem: 0 },
    },
  };
}

export interface QQSong {
  id: string; // songmid
  songId?: string;
  strMediaMid?: string;
  name: string;
  artist: string;
  album: string;
  albumId: string; // albumMid
  duration: number;
  cover: string;
}

const stripHtml = (value: unknown) => String(value ?? "").replace(/[<>]/g, "");
const decodeName = (value: string) => value;

export async function searchQQMusic(keyword: string, limit = 20, page = 1): Promise<QQSong[]> {
  const body = createTxSearchBody(keyword, page, limit);
  let result: any;
  try {
    result = await txSignedRequest(body);
  } catch {
    result = await txRequest(TX_MUSICU_URL, body);
  }
  if (!result || result.code !== 0 || result.req?.code !== 0) {
    throw new Error(`QQ 搜索接口异常: code=${result?.code}, req.code=${result?.req?.code}`);
  }
  const rawList = result.req?.data?.body?.item_song || result.req?.data?.item_song || [];
  const list: QQSong[] = [];
  for (const item of rawList) {
    const songmid = item.mid || item.songmid;
    if (!songmid) continue;
    const strMediaMid = item.file?.media_mid || songmid;
    const albumMid = item.album?.mid || "";
    const singers = Array.isArray(item.singer) ? item.singer.map((s: any) => s.name).filter(Boolean).join("、") : "";
    const cover = albumMid
      ? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${albumMid}.jpg`
      : "";
    list.push({
      id: songmid,
      songId: String(item.id || ""),
      strMediaMid,
      name: decodeName(stripHtml(item.name || item.title)),
      artist: decodeName(stripHtml(singers)),
      album: decodeName(stripHtml(item.album?.name || "")),
      albumId: albumMid,
      duration: Number(item.interval || 0),
      cover,
    });
  }
  return list;
}

// ─── 播放链接解析 (vkey.GetVkeyServer.CgiGetVkey) ──────────────────────────
const QQ_PLAY_GUID = "1429839143";
const QQ_PLAY_FILE_TYPE_MAP: Record<string, { prefix: string; suffix: string }> = {
  m4a: { prefix: "C400", suffix: ".m4a" },
  "128": { prefix: "M500", suffix: ".mp3" },
  "320": { prefix: "M800", suffix: ".mp3" },
  flac: { prefix: "F000", suffix: ".flac" },
};

const QQ_SDK_QUALITY_MAP: Record<string, string> = {
  "4": "128", "8": "320", "10": "flac", "11": "flac", "14": "flac",
  "128": "128", "320": "320", "128k": "128", "320k": "320",
  flac: "flac", sq: "flac", hires: "flac",
};

function normalizeQqSdkQuality(quality?: string): string {
  const key = String(quality ?? "8").toLowerCase();
  return QQ_SDK_QUALITY_MAP[key] || "320";
}

function pickPlayableDomain(sip: unknown): string {
  if (!Array.isArray(sip)) return "";
  const urls = sip.filter((item) => typeof item === "string" && item.length > 0);
  return urls.find((url) => !url.startsWith("http://ws")) ||
    urls.find((url) => url.startsWith("https://")) ||
    urls[0] || "";
}

function joinUrl(domain: string, path: string): string {
  if (domain.endsWith("/") && path.startsWith("/")) return `${domain}${path.slice(1)}`;
  if (!domain.endsWith("/") && !path.startsWith("/")) return `${domain}/${path}`;
  return `${domain}${path}`;
}

function buildQqOfficialPlayUrl(domain: string, info: Record<string, any> | undefined, guid: string): string {
  if (!domain || !info) return "";
  if (info.purl) return joinUrl(domain, info.purl);
  if (info.vkey && info.filename) {
    return `${joinUrl(domain, info.filename)}?vkey=${info.vkey}&guid=${guid}&fromtag=66`;
  }
  return "";
}

function createQqOfficialVkeyPayload(songmid: string, filename: string, guid: string, uin: string, authst?: string) {
  return {
    req_0: {
      module: "vkey.GetVkeyServer",
      method: "CgiGetVkey",
      param: { filename: [filename], guid, songmid: [songmid], songtype: [0], uin, loginflag: 1, platform: "20", ...(authst ? { authst } : {}) },
    },
    loginUin: uin,
    comm: { uin, format: "json", ct: 24, cv: 0 },
  };
}

function parseQqOfficialPlayUrl(response: any, songmid: string, guid: string) {
  const data = response?.req_0?.data;
  const domain = pickPlayableDomain(data?.sip);
  const midurlinfo = Array.isArray(data?.midurlinfo) ? data.midurlinfo : [];
  const info = midurlinfo.find((item: any) => item?.songmid === songmid) || midurlinfo[0];
  const url = buildQqOfficialPlayUrl(domain, info, guid);
  return { url, info };
}

/** Known invalid audio URL suffix (QQ Music returns this for blocked songs) */
const INVALID_TX_AUDIO_URL_SUFFIX = "/2149972737147268278.mp3";

/** Validate that a resolved QQ audio URL is not a known-invalid placeholder */
function validateResolvedTxUrl(url: string, source: string): string {
  const normalizedUrl = upgradeTxAudioUrl(url.trim());
  const urlWithoutParams = normalizedUrl.split("?")[0].split("#")[0];
  if (urlWithoutParams.endsWith(INVALID_TX_AUDIO_URL_SUFFIX)) {
    throw new Error(`${source} 返回已知无效音频链接`);
  }
  return normalizedUrl;
}

/** Resolver 1: lx-music-api (Huibq) — third-party API with X-Request-Key */
async function resolveTxWithHuibq(songmid: string, quality: string): Promise<string> {
  const url = `https://lxmusicapi.onrender.com/url/tx/${encodeURIComponent(songmid)}/${encodeURIComponent(quality)}`;
  const response = await fetch(url, {
    headers: {
      "X-Request-Key": "share-v3",
      "User-Agent": "lx-music-desktop/2.11.0",
    },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Huibq 返回 ${response.status}`);
  const data = (await response.json()) as { code?: number; url?: string; msg?: string };
  if (data?.code !== 0 || !data?.url) {
    throw new Error(data?.msg || "Huibq 未返回播放链接");
  }
  return upgradeTxAudioUrl(data.url);
}

/** Resolver 2: music.3e0.cn — third-party Meting-style redirect */
async function resolveTxWithDreamMeting(songmid: string): Promise<string> {
  const url = `https://music.3e0.cn/?server=tencent&type=url&id=${encodeURIComponent(songmid)}`;
  const response = await fetch(url, {
    method: "GET",
    redirect: "manual",
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    signal: AbortSignal.timeout(5000),
  });
  const location = response.headers.get("location");
  if (location) {
    return upgradeTxAudioUrl(location);
  }
  throw new Error(`music.3e0.cn 未返回播放重定向(${response.status})`);
}

/** Resolver 3: Meting mirror (api.injahow.cn) */
async function resolveTxWithMeting(songmid: string): Promise<string> {
  const url = `https://api.injahow.cn/meting/?type=url&server=tencent&id=${encodeURIComponent(songmid)}`;
  const response = await fetch(url, {
    method: "GET",
    redirect: "manual",
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    signal: AbortSignal.timeout(5000),
  });
  const location = response.headers.get("location");
  if (location) return upgradeTxAudioUrl(location);
  const ct = response.headers.get("content-type") ?? "";
  if (response.ok && (ct.startsWith("audio") || ct.includes("octet-stream"))) {
    return url;
  }
  throw new Error("Meting 未返回播放链接");
}

export async function resolveQqOfficialPlayUrl(
  songmid: string,
  quality = "320",
  cookieOrMediaId?: string,
  mediaId?: string
): Promise<string> {
  // Support both (songmid, quality, cookie, mediaId) and (songmid, quality, mediaId)
  let cookie = "";
  let actualMediaId = mediaId;
  if (cookieOrMediaId && cookieOrMediaId.includes("=")) {
    cookie = cookieOrMediaId;
  } else if (cookieOrMediaId) {
    actualMediaId = cookieOrMediaId;
  }

  // Normalize quality for third-party resolvers
  const huibqQuality = normalizeQqSdkQuality(quality);
  const errors: string[] = [];

  // Resolver chain (matches original VoiceHub resolve-url.post.ts):
  // 1. lx-music-api (Huibq)
  // 2. music.3e0.cn
  // 3. Meting mirror
  // 4. Official vkey API (with cookie if available)
  const resolvers: Array<{ name: string; fn: () => Promise<string> }> = [
    { name: "huibq", fn: async () => validateResolvedTxUrl(await resolveTxWithHuibq(songmid, huibqQuality), "huibq") },
    { name: "music.3e0.cn", fn: async () => validateResolvedTxUrl(await resolveTxWithDreamMeting(songmid), "music.3e0.cn") },
    { name: "meting", fn: async () => validateResolvedTxUrl(await resolveTxWithMeting(songmid), "meting") },
  ];

  // Try third-party resolvers first (they don't need login cookies)
  for (const resolver of resolvers) {
    try {
      const url = await resolver.fn();
      console.log(`[qq_sdk] Resolved via ${resolver.name}`);
      return url;
    } catch (err) {
      const msg = (err as Error).message;
      errors.push(`${resolver.name}: ${msg}`);
      console.warn(`[qq_sdk] ${resolver.name} failed: ${msg}`);
    }
  }

  // Fall back to official vkey API
  const qualityKey = normalizeQqSdkQuality(quality);
  const fileType = QQ_PLAY_FILE_TYPE_MAP[qualityKey] || QQ_PLAY_FILE_TYPE_MAP["320"];
  const playableFileId = String(actualMediaId || songmid || "").trim();
  if (!songmid) throw new Error("QQ 官方接口缺少 songmid");
  if (!playableFileId) throw new Error("QQ 官方接口缺少播放文件 ID");
  const guid = QQ_PLAY_GUID;

  let uin = "0";
  let authst = "";
  if (cookie) {
    const cookieParts = cookie.split(";").map(c => c.trim());
    for (const c of cookieParts) {
      if (c.startsWith("uin=")) uin = c.slice(4).replace(/^o/, "");
      if (c.startsWith("qqmusic_key=")) authst = c.slice("qqmusic_key=".length);
    }
  }

  const filename = `${fileType.prefix}${playableFileId}${fileType.suffix}`;
  const payload = createQqOfficialVkeyPayload(songmid, filename, guid, uin, authst);

  let url = "";
  let info: Record<string, any> | undefined;

  if (cookie) {
    try {
      const res = await fetch(TX_MUSICU_URL, {
        method: "POST",
        headers: { ...txHeaders, Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const response = await res.json();
        const parsed = parseQqOfficialPlayUrl(response, songmid, guid);
        url = parsed.url;
        info = parsed.info;
      }
    } catch (err) {
      console.warn("[qq_sdk] cookie request failed:", err);
    }
  }

  if (!url) {
    try {
      const normalResponse = await txRequest(TX_MUSICU_URL, payload);
      const parsed = parseQqOfficialPlayUrl(normalResponse, songmid, guid);
      url = parsed.url;
      info = parsed.info;
    } catch (err) {
      console.warn("[qq_sdk] 未签名请求失败:", err);
    }
  }
  if (!url) {
    try {
      const signedResponse = await txSignedRequest(payload);
      const signedResult = parseQqOfficialPlayUrl(signedResponse, songmid, guid);
      url = signedResult.url || url;
      info = signedResult.info || info;
    } catch (err) {
      console.error("[qq_sdk] 签名请求也失败:", err);
    }
  }
  if (!url) {
    throw new Error(
      `QQ音乐播放链接解析失败：${errors.join("；")}；官方接口: filename=${filename}, result=${info?.result ?? "missing"}`
    );
  }
  return upgradeTxAudioUrl(url);
}

// ─── 歌词 (原生 GetPlayLyricInfo + QRC 解密) ──────────────────────────────
// QRC triple-DES decryption (ported verbatim from qq_music_sdk.ts)
const QRC_KEY = Buffer.from("!@#)(*$%123ZXC!@!@#)(NHL", "utf8");

const SBOX: number[][] = [
  [14,4,13,1,2,15,11,8,3,10,6,12,5,9,0,7,0,15,7,4,14,2,13,1,10,6,12,11,9,5,3,8,4,1,14,8,13,6,2,11,15,12,9,7,3,10,5,0,15,12,8,2,4,9,1,7,5,11,3,14,10,0,6,13],
  [15,1,8,14,6,11,3,4,9,7,2,13,12,0,5,10,3,13,4,7,15,2,8,15,12,0,1,10,6,9,11,5,0,14,7,11,10,4,13,1,5,8,12,6,9,3,2,15,13,8,10,1,3,15,4,2,11,6,7,12,0,5,14,9],
  [10,0,9,14,6,3,15,5,1,13,12,7,11,4,2,8,13,7,0,9,3,4,6,10,2,8,5,14,12,11,15,1,13,6,4,9,8,15,3,0,11,1,2,12,5,10,14,7,1,10,13,0,6,9,8,7,4,15,14,3,11,5,2,12],
  [7,13,14,3,0,6,9,10,1,2,8,5,11,12,4,15,13,8,11,5,6,15,0,3,4,7,2,12,1,10,14,9,10,6,9,0,12,11,7,13,15,1,3,14,5,2,8,4,3,15,0,6,10,10,13,8,9,4,5,11,12,7,2,14],
  [2,12,4,1,7,10,11,6,8,5,3,15,13,0,14,9,14,11,2,12,4,7,13,1,5,0,15,10,3,9,8,6,4,2,1,11,10,13,7,8,15,9,12,5,6,3,0,14,11,8,12,7,1,14,2,13,6,15,0,9,10,4,5,3],
  [12,1,10,15,9,2,6,8,0,13,3,4,14,7,5,11,10,15,4,2,7,12,9,5,6,1,13,14,0,11,3,8,9,14,15,5,2,8,12,3,7,0,4,10,1,13,11,6,4,3,2,12,9,5,15,10,11,14,1,7,6,0,8,13],
  [4,11,2,14,15,0,8,13,3,12,9,7,5,10,6,1,13,0,11,7,4,9,1,10,14,3,5,12,2,15,8,6,1,4,11,13,12,3,7,14,10,15,6,8,0,5,9,2,6,11,13,8,1,4,10,7,9,5,0,15,14,2,3,12],
  [13,2,8,4,6,15,11,1,10,9,3,14,5,0,12,7,1,15,13,8,10,3,7,4,12,5,6,11,0,14,9,2,7,11,4,1,9,12,14,2,0,6,10,13,15,3,5,8,2,1,14,7,4,10,8,13,15,12,9,0,3,5,6,11],
];

const _bn = (a: Buffer, b: number, c: number): number => {
  const bi = Math.floor(b / 32) * 4 + 3 - Math.floor((b % 32) / 8);
  return ((a[bi] >> (7 - (b % 8))) & 1) << c;
};
const _bni = (a: number, b: number, c: number): number => ((a >> (31 - b)) & 1) << c;
const _bnl = (a: number, b: number, c: number): number => (((a << b) & 0x80000000) >>> c) >>> 0;
const _sb = (a: number): number => (a & 32) | ((a & 31) >> 1) | ((a & 1) << 4);

const _ip = (inp: Buffer): [number, number] => {
  const s0 = ((_bn(inp,57,31)|_bn(inp,49,30)|_bn(inp,41,29)|_bn(inp,33,28)|_bn(inp,25,27)|_bn(inp,17,26)|_bn(inp,9,25)|_bn(inp,1,24)|_bn(inp,59,23)|_bn(inp,51,22)|_bn(inp,43,21)|_bn(inp,35,20)|_bn(inp,27,19)|_bn(inp,19,18)|_bn(inp,11,17)|_bn(inp,3,16)|_bn(inp,61,15)|_bn(inp,53,14)|_bn(inp,45,13)|_bn(inp,37,12)|_bn(inp,29,11)|_bn(inp,21,10)|_bn(inp,13,9)|_bn(inp,5,8)|_bn(inp,63,7)|_bn(inp,55,6)|_bn(inp,47,5)|_bn(inp,39,4)|_bn(inp,31,3)|_bn(inp,23,2)|_bn(inp,15,1)|_bn(inp,7,0))) >>> 0;
  const s1 = ((_bn(inp,56,31)|_bn(inp,48,30)|_bn(inp,40,29)|_bn(inp,32,28)|_bn(inp,24,27)|_bn(inp,16,26)|_bn(inp,8,25)|_bn(inp,0,24)|_bn(inp,58,23)|_bn(inp,50,22)|_bn(inp,42,21)|_bn(inp,34,20)|_bn(inp,26,19)|_bn(inp,18,18)|_bn(inp,10,17)|_bn(inp,2,16)|_bn(inp,60,15)|_bn(inp,52,14)|_bn(inp,44,13)|_bn(inp,36,12)|_bn(inp,28,11)|_bn(inp,20,10)|_bn(inp,12,9)|_bn(inp,4,8)|_bn(inp,62,7)|_bn(inp,54,6)|_bn(inp,46,5)|_bn(inp,38,4)|_bn(inp,30,3)|_bn(inp,22,2)|_bn(inp,14,1)|_bn(inp,6,0))) >>> 0;
  return [s0, s1];
};

const _fp = (s0: number, s1: number): Buffer => {
  const d = Buffer.alloc(8);
  d[3] = (_bni(s1,7,7)|_bni(s0,7,6)|_bni(s1,15,5)|_bni(s0,15,4)|_bni(s1,23,3)|_bni(s0,23,2)|_bni(s1,31,1)|_bni(s0,31,0));
  d[2] = (_bni(s1,6,7)|_bni(s0,6,6)|_bni(s1,14,5)|_bni(s0,14,4)|_bni(s1,22,3)|_bni(s0,22,2)|_bni(s1,30,1)|_bni(s0,30,0));
  d[1] = (_bni(s1,5,7)|_bni(s0,5,6)|_bni(s1,13,5)|_bni(s0,13,4)|_bni(s1,21,3)|_bni(s0,21,2)|_bni(s1,29,1)|_bni(s0,29,0));
  d[0] = (_bni(s1,4,7)|_bni(s0,4,6)|_bni(s1,12,5)|_bni(s0,12,4)|_bni(s1,20,3)|_bni(s0,20,2)|_bni(s1,28,1)|_bni(s0,28,0));
  d[7] = (_bni(s1,3,7)|_bni(s0,3,6)|_bni(s1,11,5)|_bni(s0,11,4)|_bni(s1,19,3)|_bni(s0,19,2)|_bni(s1,27,1)|_bni(s0,27,0));
  d[6] = (_bni(s1,2,7)|_bni(s0,2,6)|_bni(s1,10,5)|_bni(s0,10,4)|_bni(s1,18,3)|_bni(s0,18,2)|_bni(s1,26,1)|_bni(s0,26,0));
  d[5] = (_bni(s1,1,7)|_bni(s0,1,6)|_bni(s1,9,5)|_bni(s0,9,4)|_bni(s1,17,3)|_bni(s0,17,2)|_bni(s1,25,1)|_bni(s0,25,0));
  d[4] = (_bni(s1,0,7)|_bni(s0,0,6)|_bni(s1,8,5)|_bni(s0,8,4)|_bni(s1,16,3)|_bni(s0,16,2)|_bni(s1,24,1)|_bni(s0,24,0));
  return d;
};

const _f = (state: number, key: number[]): number => {
  const t1 = (_bnl(state,31,0)|((state&0xf0000000)>>>1)|_bnl(state,4,5)|_bnl(state,3,6)|((state&0x0f000000)>>>3)|_bnl(state,8,11)|_bnl(state,7,12)|((state&0x00f00000)>>>5)|_bnl(state,12,17)|_bnl(state,11,18)|((state&0x000f0000)>>>7)|_bnl(state,16,23)) >>> 0;
  const t2 = (_bnl(state,15,0)|((state&0x0000f000)<<15)|_bnl(state,20,5)|_bnl(state,19,6)|((state&0x00000f00)<<13)|_bnl(state,24,11)|_bnl(state,23,12)|((state&0x000000f0)<<11)|_bnl(state,28,17)|_bnl(state,27,18)|((state&0x0000000f)<<9)|_bnl(state,0,23)) >>> 0;
  const lg = [((t1>>>24)&0xff)^key[0],((t1>>>16)&0xff)^key[1],((t1>>>8)&0xff)^key[2],((t2>>>24)&0xff)^key[3],((t2>>>16)&0xff)^key[4],((t2>>>8)&0xff)^key[5]];
  state = ((SBOX[0][_sb(lg[0]>>>2)]<<28)|(SBOX[1][_sb(((lg[0]&3)<<4)|(lg[1]>>>4))]<<24)|(SBOX[2][_sb(((lg[1]&15)<<2)|(lg[2]>>>6))]<<20)|(SBOX[3][_sb(lg[2]&63)]<<16)|(SBOX[4][_sb(lg[3]>>>2)]<<12)|(SBOX[5][_sb(((lg[3]&3)<<4)|(lg[4]>>>4))]<<8)|(SBOX[6][_sb(((lg[4]&15)<<2)|(lg[5]>>>6))]<<4)|SBOX[7][_sb(lg[5]&63)]) >>> 0;
  return (_bnl(state,15,0)|_bnl(state,6,1)|_bnl(state,19,2)|_bnl(state,20,3)|_bnl(state,28,4)|_bnl(state,11,5)|_bnl(state,27,6)|_bnl(state,16,7)|_bnl(state,0,8)|_bnl(state,14,9)|_bnl(state,22,10)|_bnl(state,25,11)|_bnl(state,4,12)|_bnl(state,17,13)|_bnl(state,30,14)|_bnl(state,9,15)|_bnl(state,1,16)|_bnl(state,7,17)|_bnl(state,23,18)|_bnl(state,13,19)|_bnl(state,31,20)|_bnl(state,26,21)|_bnl(state,2,22)|_bnl(state,8,23)|_bnl(state,18,24)|_bnl(state,12,25)|_bnl(state,29,26)|_bnl(state,5,27)|_bnl(state,21,28)|_bnl(state,10,29)|_bnl(state,3,30)|_bnl(state,24,31)) >>> 0;
};

const _ks = (key: Buffer, mode: number): number[][] => {
  const sch: number[][] = Array.from({ length: 16 }, () => Array(6).fill(0));
  const sh = [1,1,2,2,2,2,2,2,1,2,2,2,2,2,2,1];
  const pC = [56,48,40,32,24,16,8,0,57,49,41,33,25,17,9,1,58,50,42,34,26,18,10,2,59,51,43,35];
  const pD = [62,54,46,38,30,22,14,6,61,53,45,37,29,21,13,5,60,52,44,36,28,20,12,4,27,19,11,3];
  const cp = [13,16,10,23,0,4,2,27,14,5,20,9,22,18,11,3,25,7,15,6,26,19,12,1,40,51,30,36,46,54,29,39,50,44,32,47,43,48,38,55,33,52,45,41,49,35,28,31];
  let c = 0, d = 0;
  for (let i = 0; i < 28; i++) { c |= _bn(key, pC[i], 31 - i); d |= _bn(key, pD[i], 31 - i); }
  for (let i = 0; i < 16; i++) {
    c = (((c << sh[i]) | (c >>> (28 - sh[i]))) & 0xfffffff0) >>> 0;
    d = (((d << sh[i]) | (d >>> (28 - sh[i]))) & 0xfffffff0) >>> 0;
    const t = mode === 0 ? 15 - i : i;
    for (let j = 0; j < 24; j++) sch[t][Math.floor(j / 8)] |= _bni(c, cp[j], 7 - (j % 8));
    for (let j = 24; j < 48; j++) sch[t][Math.floor(j / 8)] |= _bni(d, cp[j] - 27, 7 - (j % 8));
  }
  return sch;
};

const _desBlock = (inp: Buffer, key: number[][]): Buffer => {
  const [s0, s1] = _ip(inp);
  let a = s0, b = s1;
  for (let i = 0; i < 15; i++) { const p = b; b = (_f(b, key[i]) ^ a) >>> 0; a = p; }
  a = (_f(b, key[15]) ^ a) >>> 0;
  return _fp(a, b);
};

const QRC_DES_KEYS = {
  k1: _ks(QRC_KEY.slice(16, 24), 0),
  k2: _ks(QRC_KEY.slice(8, 16), 1),
  k3: _ks(QRC_KEY.slice(0, 8), 0),
};

import { inflateSync, inflateRawSync, unzipSync } from "node:zlib";

function tripleDesDecrypt(data: Buffer): Buffer {
  const { k1, k2, k3 } = QRC_DES_KEYS;
  const result = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 8) {
    const b = data.slice(i, i + 8);
    _desBlock(_desBlock(_desBlock(b, k1), k2), k3).copy(result, i);
  }
  return result;
}

function decryptQrc(encryptedHex: string): string {
  if (!encryptedHex?.trim()) throw new Error("QRC 密文为空");
  const decrypted = tripleDesDecrypt(Buffer.from(encryptedHex, "hex"));
  for (const decompress of [inflateSync, inflateRawSync, unzipSync]) {
    try { return decompress(decrypted).toString("utf8"); } catch { /* continue */ }
  }
  const raw = decrypted.toString("utf8");
  if (raw.includes("[") || raw.includes("<")) return raw;
  throw new Error("QRC 解压失败");
}

function tryDecryptQrc(hex: string | undefined): string | undefined {
  if (!hex) return undefined;
  try { return decryptQrc(hex); } catch { return undefined; }
}

export async function resolveQqNativeLyric(songId: string | number, cookie?: string, opts?: { name?: string; artist?: string; album?: string; duration?: number }): Promise<{ lrc?: string; qrc?: string; trans?: string }> {
  const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64");
  const baseParam = {
    albumName: b64(opts?.album || ""),
    crypt: 1, ct: 19, cv: 2111, interval: opts?.duration || 0,
    lrc_t: 0, qrc: 1, qrc_t: 0, roma: 1, roma_t: 0,
    singerName: b64(opts?.artist || ""),
    songID: Number(songId), songName: b64(opts?.name || ""),
    trans: 1, trans_t: 0, type: 0,
  };
  const buildBody = (param: Record<string, unknown>) => ({
    comm: { ct: "19", cv: "1859", uin: "0" },
    req: { module: "music.musichallSong.PlayLyricInfo", method: "GetPlayLyricInfo", param },
  });
  const doRequest = async (param: Record<string, unknown>) => {
    const body = buildBody(param);
    const headers: Record<string, string> = { ...txHeaders, "Content-Type": "application/json" };
    if (cookie) headers["Cookie"] = cookie;
    try {
      const sign = await zzcSign(JSON.stringify(body));
      const res = await fetch(`${TX_MUSICS_URL}?sign=${sign}`, {
        method: "POST", headers,
        body: JSON.stringify(body), signal: AbortSignal.timeout(8000),
      });
      return res.json();
    } catch {
      const res = await fetch(TX_MUSICU_URL, {
        method: "POST", headers,
        body: JSON.stringify(body), signal: AbortSignal.timeout(8000),
      });
      return res.json();
    }
  };
  const resp = await doRequest(baseParam);
  const data = resp?.req?.data ?? resp?.request?.data ?? {};
  const result: { lrc?: string; qrc?: string; trans?: string } = {};
  const mainDecrypted = tryDecryptQrc(data.lyric);
  if (mainDecrypted) {
    if (typeof data.qrc_t === "number" && data.qrc_t !== 0) result.qrc = mainDecrypted;
    else result.lrc = mainDecrypted;
  }
  if (result.qrc && !result.lrc) {
    try {
      const lrcResp = await doRequest({ ...baseParam, qrc: 0, qrc_t: 0 });
      const lrcData = lrcResp?.req?.data ?? lrcResp?.request?.data ?? {};
      const lrcText = tryDecryptQrc(lrcData.lyric);
      if (lrcText) result.lrc = lrcText;
    } catch { /* secondary failure */ }
  }
  result.trans = tryDecryptQrc(data.trans) || undefined;
  return result;
}

/** Legacy fallback: fcg_query_lyric_new (returns base64 LRC). */
export async function fetchQqLegacyLyric(songmid: string, songid?: string): Promise<string | null> {
  const params = new URLSearchParams({
    format: "json", outCharset: "utf-8", pcachetime: String(Date.now()), loginUin: "0",
    ...(songmid ? { songmid } : {}),
    ...(songid ? { songid } : {}),
  });
  const res = await fetch(`https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?${params.toString()}`, {
    headers: { Referer: "https://y.qq.com/portal/player.html", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`QQ 歌词接口 HTTP ${res.status}`);
  const text = await res.text();
  let legacyData: any;
  try { legacyData = JSON.parse(text); }
  catch { legacyData = JSON.parse(text.replace(/^\w+\(/, "").replace(/\)\s*$/, "")); }
  if (!legacyData || legacyData.code !== 0) throw new Error(`QQ 歌词接口异常: code=${legacyData?.code}`);
  const decodeBase64 = (value: unknown): string => {
    if (typeof value !== "string" || !value) return "";
    try { return Buffer.from(value, "base64").toString() || value; } catch { return value; }
  };
  return decodeBase64(legacyData.lyric) || null;
}

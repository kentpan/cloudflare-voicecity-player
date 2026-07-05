/**
 * Bilibili (哔哩哔哩) platform plugin.
 *
 * Verbatim port of VoiceHub's
 *   server/api/bilibili/search.get.ts +
 *   server/api/bilibili/playurl.get.ts
 *
 * Adapted for Next.js:
 *   - $fetch(url, { params }) → fetch(url + '?' + new URLSearchParams(...))
 *   - buvid3=0 (no Vercel proxy failover, no getBuvid3 spi fetch)
 *   - client IP forwarding preserved
 */

const BILI_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

interface SongInfo {
  id: number
  bvid: string
  title: string
  author: string
  pic: string
  duration: string
}

interface VideoPage {
  cid: number
  page: number
  part: string
  duration: number
}

interface VideoInfoRes {
  code: number
  message: string
  data: {
    pages: VideoPage[]
  }
}

interface SearchRes {
  code: number
  message: string
  data: {
    result: SongInfo[]
  }
}

interface CidRes {
  code: number
  message: string
  data: {
    pages: [{ cid: string }]
  }
}

interface NoRefererPlayUrlRes {
  code: number
  message: string
  data: {
    durl: [{ url: string }]
  }
}

export interface BilibiliTrack {
  id: string
  title: string
  artist: string
  source: 'bilibili'
  musicPlatform: 'bilibili'
  cover: string
  duration: number
  album: string
  pages: VideoPage[]
}

function htmlDecode(value: string) {
  return value.replace(/<[^>]*>/g, '')
}

function bi_convert_song(song_info: SongInfo, pages?: VideoPage[]): BilibiliTrack {
  let imgUrl = song_info.pic
  const durationStr = song_info.duration
    .split(':')
    .map((x) => Number.parseInt(x))
    .reverse()
  let duration = durationStr[0] + durationStr[1] * 60
  if (durationStr.length === 3) {
    duration += durationStr[2] * 60 * 60
  }
  if (imgUrl.startsWith('//')) {
    imgUrl = `https:${imgUrl}`
  }
  return {
    id: song_info.bvid,
    title: htmlDecode(song_info.title),
    artist: htmlDecode(song_info.author),
    source: 'bilibili',
    musicPlatform: 'bilibili',
    cover: imgUrl,
    duration,
    album: 'Bilibili Video',
    pages: pages || []
  }
}

function buildBiliHeaders(clientIp?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Cookie: 'buvid3=0',
    Referer: 'https://www.bilibili.com/',
    'User-Agent': BILI_UA
  }
  if (clientIp) {
    headers['X-Forwarded-For'] = clientIp
    headers['X-Real-IP'] = clientIp
    headers['Client-IP'] = clientIp
  }
  return headers
}

/**
 * Search Bilibili videos. Verbatim port of VoiceHub bilibili/search.get.ts.
 * Throws on failure (no silent fallback, no proxy failover).
 */
export async function searchBilibili(keyword: string, limit = 15): Promise<BilibiliTrack[]> {
  if (!keyword) return []

  const params = new URLSearchParams({
    __refresh__: 'true',
    page: '1',
    page_size: String(limit),
    platform: 'pc',
    highlight: '1',
    single_column: '0',
    keyword,
    search_type: 'video',
    dynamic_offset: '0',
    preload: 'true',
    com2co: 'true'
  })
  const target_url = `https://api.bilibili.com/x/web-interface/search/type?${params.toString()}`

  const resp = await fetch(target_url, {
    method: 'GET',
    headers: buildBiliHeaders(),
    signal: AbortSignal.timeout(12000)
  })
  if (!resp.ok) throw new Error(`B站搜索失败: HTTP ${resp.status}`)

  const json = (await resp.json()) as SearchRes
  if (json.code !== 0 || !json.data?.result) {
    throw new Error(`B站搜索接口异常: ${json.message || `code=${json.code}`}`)
  }

  const results = await Promise.all(
    json.data.result.map(async (song) => {
      try {
        const viewUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(song.bvid)}`
        const viewRes = await fetch(viewUrl, {
          method: 'GET',
          headers: buildBiliHeaders(),
          signal: AbortSignal.timeout(8000)
        })
        if (!viewRes.ok) return bi_convert_song(song)
        const videoInfo = (await viewRes.json()) as VideoInfoRes
        if (videoInfo.code !== 0) return bi_convert_song(song)
        return bi_convert_song(song, videoInfo.data?.pages || [])
      } catch (error) {
        console.log(`[bilibili] Failed to fetch video info for ${song.bvid}:`, error)
        return bi_convert_song(song)
      }
    })
  )
  return results
}

/**
 * Resolve a playable audio URL for a Bilibili video.
 * Verbatim port of VoiceHub bilibili/playurl.get.ts.
 *
 * @param bvid   B站视频 bvid
 * @param cid    可选 cid;若未提供,自动通过 view 接口获取
 * @param clientIp 客户端真实 IP,用于转发给 B站接口分配最快 CDN 节点
 */
export async function resolveBilibiliUrl(
  bvid: string,
  cid?: string | number,
  clientIp?: string
): Promise<{ url: string; pay: false }> {
  if (!bvid) throw new Error('缺少 id 参数')

  const headers = buildBiliHeaders(clientIp)
  let finalCid = cid ? String(cid) : ''

  if (!finalCid) {
    const viewUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`
    const resp1 = await fetch(viewUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(8000)
    })
    if (!resp1.ok) throw new Error(`获取 B站视频信息失败: HTTP ${resp1.status}`)
    const viewJson = (await resp1.json()) as CidRes
    if (!viewJson?.data?.pages?.[0]?.cid) {
      throw new Error('获取 CID 失败')
    }
    finalCid = viewJson.data.pages[0].cid
  }

  // 使用 platform=html5 参数绕过严格防盗链验证（允许前端使用 referrerpolicy="no-referrer"）
  const playParams = new URLSearchParams({
    fnval: '1',
    platform: 'html5',
    high_quality: '1',
    bvid,
    cid: finalCid
  })
  const playUrl = `https://api.bilibili.com/x/player/playurl?${playParams.toString()}`

  const resp2 = await fetch(playUrl, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(10000)
  })
  if (!resp2.ok) throw new Error(`获取 B站播放链接失败: HTTP ${resp2.status}`)
  const playJson = (await resp2.json()) as NoRefererPlayUrlRes
  if (playJson.code !== 0 || !playJson.data?.durl?.length) {
    throw new Error(`获取歌曲链接失败: ${playJson.message || '未知错误'}`)
  }
  return { url: playJson.data.durl[0].url, pay: false }
}

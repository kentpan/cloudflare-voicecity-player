/**
 * 播放器配置类型 + 默认值。
 * 配置存储在 Cloudflare KV（voicecity-kv 命名空间），通过 /api/player-config 读写。
 */

export interface PlayerConfig {
  /** 是否启用代理 API */
  proxyEnabled: boolean;
  /** 播放器名称（显示在 footer 等） */
  playerName: string;
  /** 页面 title 文字 */
  titleText: string;
  /** GitHub 项目地址 */
  githubUrl: string;
  /** 底部 copyright 文字 */
  copyrightText: string;
}

export const DEFAULT_PLAYER_CONFIG: PlayerConfig = {
  proxyEnabled: true,
  playerName: "随心音乐",
  titleText: "随心音乐播放器",
  githubUrl: "https://github.com/kentpan/cloudflare-voicecity-player",
  copyrightText: "© 2026 VoiceCity",
};

const KV_KEY = "player-config";

/** 读取播放器配置（公开，所有用户可读） */
export async function getPlayerConfig(): Promise<PlayerConfig> {
  const { getKV } = await import("./kv");
  const kv = await getKV();
  const stored = await kv.get<Partial<PlayerConfig>>(KV_KEY);
  if (!stored) return DEFAULT_PLAYER_CONFIG;
  return { ...DEFAULT_PLAYER_CONFIG, ...stored };
}

/** 保存播放器配置（仅 admin 可写） */
export async function setPlayerConfig(config: Partial<PlayerConfig>): Promise<PlayerConfig> {
  const { getKV } = await import("./kv");
  const kv = await getKV();
  const current = await getPlayerConfig();
  const updated = { ...current, ...config };
  await kv.put(KV_KEY, updated);
  return updated;
}

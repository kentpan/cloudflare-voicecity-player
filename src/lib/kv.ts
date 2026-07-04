/**
 * KV 存储适配器 — 用于 Cloudflare KV 绑定。
 *
 * 在 Cloudflare 环境下，通过 @opennextjs/cloudflare 的 getCloudflareContext()
 * 获取 env.KV 绑定。
 *
 * 在本地开发环境下（无 KV 绑定），使用内存 Map 作为回退（仅用于开发测试，
 * 重启后丢失数据）。
 *
 * 用途：保存播放器配置 + passkey 凭证 + 临时 challenge。
 */

interface KVLike {
  get<T = unknown>(key: string): Promise<T | null>;
  put<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

let cached: KVLike | null = null;
const memoryStore = new Map<string, string>();

/** 内存回退 KV 实现（本地开发用） */
const memoryKV: KVLike = {
  async get<T>(key: string): Promise<T | null> {
    const v = memoryStore.get(key);
    if (!v) return null;
    try { return JSON.parse(v) as T; } catch { return null; }
  },
  async put<T>(key: string, value: T): Promise<void> {
    memoryStore.set(key, JSON.stringify(value));
  },
  async delete(key: string): Promise<void> {
    memoryStore.delete(key);
  },
};

/** 检测是否运行在 Cloudflare 环境（有 KV 绑定） */
async function detectCloudflareKV(): Promise<KVLike | null> {
  try {
    const mod = await import("@opennextjs/cloudflare");
    const getCtx = (mod as { getCloudflareContext?: () => { env?: Record<string, unknown> } | Promise<{ env?: Record<string, unknown> }> }).getCloudflareContext;
    if (typeof getCtx === "function") {
      const ctx = await getCtx();
      const kv = (ctx?.env as Record<string, unknown> | undefined)?.KV as
        | { get: (k: string) => Promise<string | null>; put: (k: string, v: string) => Promise<void>; delete?: (k: string) => Promise<void> }
        | undefined;
      if (kv && typeof kv.get === "function" && typeof kv.put === "function") {
        return {
          async get<T>(key: string): Promise<T | null> {
            const v = await kv.get(key);
            if (!v) return null;
            try { return JSON.parse(v) as T; } catch { return null; }
          },
          async put<T>(key: string, value: T): Promise<void> {
            await kv.put(key, JSON.stringify(value));
          },
          async delete(key: string): Promise<void> {
            await kv.delete?.(key);
          },
        };
      }
    }
  } catch { /* not in cloudflare env */ }
  return null;
}

/** 获取 KV 实例（自动检测 Cloudflare 或回退到内存） */
export async function getKV(): Promise<KVLike> {
  if (cached) return cached;
  const cfKV = await detectCloudflareKV();
  cached = cfKV || memoryKV;
  return cached;
}

/** 是否运行在 Cloudflare KV 环境 */
export async function isCloudflareKV(): Promise<boolean> {
  const kv = await getKV();
  return kv !== memoryKV;
}

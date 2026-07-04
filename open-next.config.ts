import type { OpenNextConfig } from "@opennextjs/cloudflare";

/**
 * OpenNext Cloudflare 配置文件
 *
 * 这是 @opennextjs/cloudflare 构建所必需的配置文件。
 * 参考: https://opennext.js.org/cloudflare/get-started
 *
 * 说明：
 *   - wrapper: "cloudflare-node" 使用 Node.js 兼容层（支持完整 Node API）
 *   - incrementalCache/tagCache/queue: "dummy" 不使用 ISR 缓存（D1 已是数据源）
 *   - proxyExternalRequest: "fetch" 使用 fetch 代理外部请求
 */
const config: OpenNextConfig = {
  default: {
    override: {
      wrapper: "cloudflare-node",
      converter: "edge",
      proxyExternalRequest: "fetch",
      incrementalCache: "dummy",
      tagCache: "dummy",
      queue: "dummy",
    },
  },
  edgeExternals: ["node:crypto"],
  middleware: {
    external: true,
    override: {
      wrapper: "cloudflare-edge",
      converter: "edge",
      proxyExternalRequest: "fetch",
      incrementalCache: "dummy",
      tagCache: "dummy",
      queue: "dummy",
    },
  },
};

export default config;

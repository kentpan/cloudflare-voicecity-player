/**
 * Passkey (WebAuthn) RP_ID 和 RP_ORIGIN 自动派生工具
 *
 * WebAuthn 要求 RP_ID 必须是当前页面的有效域名（准确说是 registrable domain，
 * 即 eTLD+1）。从请求 Host header 自动派生，兼容 localhost / 127.0.0.1 / IP / 自定义域名。
 * 生产环境优先使用 RP_ID / RP_ORIGIN 环境变量。
 */

/**
 * 已知的公共后缀列表（多级 TLD）。
 * 这些后缀本身不可注册，需要再往上一级才是 registrable domain。
 * 注意：只有那些在浏览器 PSL 中被标记为公共后缀的才应该列在这里。
 * .fcapp.run / .workers.dev / .pages.dev 等 Cloudflare/阿里云后缀在浏览器 PSL 中
 * 通常不被标记为公共后缀，因此 eTLD+1 就是后缀本身（如 fcapp.run），
 * 可以直接作为 RP_ID 使用。
 */
const MULTI_LABEL_PUBLIC_SUFFIXES = [
  // 这些是 PSL 中的公共后缀（不可注册）
  "github.io",
  "gitlab.io",
  "herokuapp.com",
  "pythonanywhere.com",
  "bubbleapps.io",
  "loca.lt",
  // 通配后缀
  "nip.io",
  "sslip.io",
];

/**
 * 从完整 hostname 提取 registrable domain (eTLD+1)。
 *
 * 规则：
 *   1. localhost / IP 地址 → 直接返回
 *   2. 先检查是否命中已知多级公共后缀（如 fcapp.run）
 *      - 命中则返回「后缀 + 后缀前面一段」
 *   3. 否则按通用规则：取最后两段（如 example.com）
 *      - 但若只有一段（如 localhost）则直接返回
 */
function getRegistrableDomain(hostname: string): string {
  // localhost / IP 地址直接返回
  if (hostname === "localhost") return hostname;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return hostname;
  if (/^\[?[0-9a-f:]+\]?$/i.test(hostname)) return hostname; // IPv6

  const parts = hostname.split(".");
  if (parts.length <= 2) return hostname;

  // 检查是否命中已知多级公共后缀
  for (const suffix of MULTI_LABEL_PUBLIC_SUFFIXES) {
    const suffixParts = suffix.split(".");
    if (parts.length > suffixParts.length) {
      const tail = parts.slice(-suffixParts.length).join(".");
      if (tail === suffix) {
        // eTLD+1 = suffix + 前面一段
        return parts.slice(-suffixParts.length - 1).join(".");
      }
    }
  }

  // 通用规则：取最后两段
  return parts.slice(-2).join(".");
}

export function getRpId(req?: Request): string {
  // 优先使用环境变量（生产环境自定义域名时配置，开发环境也可用）
  if (process.env.RP_ID) {
    return process.env.RP_ID;
  }
  if (req) {
    try {
      const host = req.headers.get("host") || req.headers.get("x-forwarded-host");
      if (host) {
        const hostname = host.split(":")[0];
        if (hostname) return getRegistrableDomain(hostname);
      }
    } catch { /* ignore */ }
  }
  return "localhost";
}

export function getRpOrigin(req?: Request): string {
  if (process.env.NODE_ENV === "production" && process.env.RP_ORIGIN) {
    return process.env.RP_ORIGIN;
  }
  if (req) {
    try {
      const url = new URL(req.url);
      return `${url.protocol}//${url.host}`;
    } catch { /* ignore */ }
  }
  if (process.env.RP_ORIGIN) return process.env.RP_ORIGIN;
  return "http://localhost:3000";
}

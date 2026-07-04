/**
 * Patch @radix-ui precompiled .mjs bundles to remove `?.()` syntax that
 * iOS 13.0-13.3 / WeChat 8.0.48 can't parse.
 *
 * SWC's transpilePackages (in webpack mode) handles most files, but a couple
 * of nested .mjs files (react-use-effect-event, react-use-callback-ref) ship
 * precompiled `ref.current?.(...args)` and slip through un-transpiled into the
 * client bundle. This script rewrites those specific patterns to ES2019 code.
 *
 * Run automatically via `pnpm install` (postinstall hook), or manually:
 *   node scripts/patch-ios13.mjs
 *
 * Idempotent: skips files that don't contain the pattern.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// 在 pnpm .pnpm 目录中查找 @radix-ui 包的 dist 文件
function findRadixDistFiles(pkg) {
  const pnpmDir = join(root, 'node_modules/.pnpm');
  if (!existsSync(pnpmDir)) return [];
  const escaped = pkg.replace('/', '+');
  const dirs = readdirSync(pnpmDir);
  const matches = dirs.filter((d) => d === escaped || d.startsWith(`${escaped}@`));
  const files = [];
  for (const m of matches) {
    const distDir = join(pnpmDir, m, 'node_modules', pkg, 'dist');
    if (!existsSync(distDir)) continue;
    for (const f of ['index.mjs', 'index.js']) {
      const p = join(distDir, f);
      if (existsSync(p)) files.push(p);
    }
  }
  return files;
}

const files = [
  ...findRadixDistFiles('@radix-ui/react-use-callback-ref'),
  ...findRadixDistFiles('@radix-ui/react-use-effect-event'),
];

let patched = 0;
for (const f of files) {
  let content;
  try {
    content = readFileSync(f, 'utf-8');
  } catch {
    continue;
  }
  const original = content;
  // <name>.current?.(...args)  →  <name>.current && <name>.current(...args)
  // iOS 13.0-13.3 Safari 13.0.4 无法解析 ?.() 可选调用语法
  content = content.replace(
    /(\w+)\.current\?\.\(\.\.\.args\)/g,
    '$1.current && $1.current(...args)',
  );
  if (content !== original) {
    writeFileSync(f, content, 'utf-8');
    patched++;
    console.log(`[patch-ios13] patched: ${f}`);
  }
}
console.log(`[patch-ios13] done: ${patched} file(s) patched`);

# 🎵 随心音乐播放器

> 一个基于 Next.js 16 的轻量音乐播放应用，支持网易云 / QQ音乐 / B站 多平台搜索、扫码登录、听歌识曲、统一播放器与本地播放历史，可一键部署到 Cloudflare Workers。

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)](https://www.typescriptlang.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange.svg)](https://workers.cloudflare.com/)

🌐 **在线 Demo**：<https://x18.ccwu.cc>

> ⭐ 如果这个项目对你有帮助，请您点个 Star 支持一下！你的 Star 是我持续更新的动力。

## ✨ 功能特性

### 🎯 核心功能

- **🔍 多平台音乐搜索** — 支持网易云音乐、QQ音乐、哔哩哔哩三大平台，一键切换搜索源
- **🎵 统一底部播放器** — 音频/视频双模式播放，支持进度拖拽、音量调节、歌词同步滚动
- **🎤 听歌识曲** — 录音 8 秒识别歌曲，基于 NetEase 音频指纹识别引擎（WASM）
- **📋 本地播放历史** — 基于 indexedDB 的播放记录，支持分页、收藏、删除确认
- **⭐ 收藏功能** — 收藏的歌曲始终居顶，清空历史不会删除收藏，收藏歌曲单独删除
- **🎬 B站视频播放** — 支持 B站视频全屏播放，移动端自动横屏

### 🔐 平台登录（VIP 歌曲）

- **网易云音乐扫码登录** — 扫码后可播放 VIP 歌曲、获取完整歌词
- **QQ音乐扫码登录** — 同样支持 VIP 歌曲播放
- 登录态以 httpOnly cookie 形式保存在服务端，安全可靠
- B站无需登录

### 🛠️ 管理员功能

- **密钥登录** — 使用 `ADMIN_SECRET` 环境变量登录管理员
- **Passkey 登录** — 支持 WebAuthn 无密码登录（注册后可用）
- **播放器配置管理** — 通过弹窗管理播放器配置（存储在 Cloudflare KV）：
  - 代理 API 开关
  - 播放器名称
  - 页面 Title 文字
  - GitHub 项目地址
  - 底部 Copyright 文字
- **初始化守卫** — 未配置 `ADMIN_SECRET` 时全屏阻断提示

## 🚀 快速开始

### 环境要求

- Node.js 18+（推荐 20+）；包管理器任选其一：[bun](https://bun.sh/) / [pnpm](https://pnpm.io/) / [npm](https://www.npmjs.com/) / [yarn](https://yarnpkg.com/)
- 现代浏览器（支持 indexedDB、AudioWorklet）

> 本项目与包管理器无关，`package.json` 中的脚本使用 `next` / `npx` 通用命令，bun / pnpm / npm / yarn 均可直接运行。下方命令以 `bun` 为例，其他包管理器对应关系：
>
> | 操作 | bun | pnpm | npm | yarn |
> |------|-----|------|-----|------|
> | 安装依赖 | `bun install` | `pnpm install` | `npm install` | `yarn` |
> | 开发服务器 | `bun run dev` | `pnpm dev` | `npm run dev` | `yarn dev` |
> | 生产构建 | `bun run build` | `pnpm build` | `npm run build` | `yarn build` |
> | 启动生产服务 | `bun run start` | `pnpm start` | `npm run start` | `yarn start` |
> | Cloudflare 构建 | `bun run build:cf` | `pnpm build:cf` | `npm run build:cf` | `yarn build:cf` |
> | 部署到 Workers | `bun run deploy` | `pnpm deploy` | `npm run deploy` | `yarn deploy` |

### 本地开发

```bash
# 克隆项目
git clone https://github.com/kentpan/cloudflare-voicecity-player.git
cd cloudflare-voicecity-player

# 安装依赖（任选一种包管理器）
bun install      # 或 pnpm install / npm install / yarn

# 启动开发服务器
bun run dev      # 或 pnpm dev / npm run dev / yarn dev
```

打开 [http://localhost:3000](http://localhost:3000) 即可使用。

> 本地开发无需配置数据库、无需 KV。播放历史存储在浏览器 indexedDB，播放器配置使用内存回退。设置 `ADMIN_SECRET` 环境变量后可使用管理员登录功能。

### 生产构建

```bash
bun run build    # 或 pnpm build / npm run build / yarn build
bun run start    # 或 pnpm start / npm run start / yarn start
```

## ☁️ 部署到 Cloudflare（Workers）

> ⚠️ **重要**：本项目使用 [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare) 适配器，
> 部署目标是 **Cloudflare Workers**（不是 Pages）。
>
> **不要**在 Cloudflare Pages 控制台使用 `@cloudflare/next-on-pages` 构建工具！
> 两者是完全不同的工具链：
>
> | 工具 | 运行时 | Node.js API | 本项目兼容性 |
> |------|--------|-------------|--------------|
> | `@cloudflare/next-on-pages`（旧，已弃用） | Edge Runtime | ❌ 不支持 `node:crypto`/`node:zlib`/`jsonwebtoken`/`@simplewebauthn/server` | ❌ 不兼容 |
> | `@opennextjs/cloudflare`（本项目使用） | Workers + `nodejs_compat` | ✅ 完整支持 | ✅ 正确选择 |
>
> 本项目服务端依赖 `node:crypto`（QQ 音乐 zzcSign/QRC 解密、网易云 EAPI 加密、JWT 签名）、
> `node:zlib`（QRC 歌词解压）、`jsonwebtoken`、`@simplewebauthn/server`（Passkey）等 Node.js API，
> 在 Edge Runtime 下无法运行，因此**必须**使用 `@opennextjs/cloudflare` + Workers 部署。

### 部署方式 A：GitHub 仓库 + Cloudflare Workers Builds（Git 集成自动部署，推荐）

适合希望 push 后自动构建部署的用户，无需本地环境。

1. **Fork / 导入仓库**：将本项目 Fork 到自己的 GitHub 账号（或导入到 GitLab，Workers Builds 也支持 GitLab）。

2. **创建 KV 命名空间**（在 Cloudflare 控制台或本地 wrangler 都可创建）：

   ```bash
   npx wrangler kv namespace create voicecity-kv
   ```

   记下返回的 `id`，下一步要用。

3. **在 Cloudflare 控制台创建 Workers 项目并连接 Git 仓库**：
   - 进入 Cloudflare Dashboard → **Workers & Pages** → **Create** → **Workers** → **Connect to Git**
   - 选择刚才 Fork 的仓库
   - 构建配置：
     - **构建命令**：`bun run build:cf`（若用其他包管理器：`pnpm build:cf` / `npm run build:cf` / `yarn build:cf`）
     - **部署命令**：`npx @opennextjs/cloudflare deploy`
     - **兼容性标志**：在 Workers 设置中开启 `nodejs_compat`（`wrangler.toml` 已配置，Workers Builds 会自动读取）

4. **配置环境变量与绑定**（在 Workers 项目的 Settings 中）：
   - **Variables** → 添加 `ADMIN_SECRET`，类型选 **Encrypt**（加密存储），填入你的管理员密钥
   - **Bindings** → **Add binding** → **KV Namespace**，变量名填 `KV`，选择步骤 2 创建的命名空间

5. **触发首次部署**：push 一次代码到 main 分支，或在控制台手动 **Retry deployment**。后续每次 push 自动构建部署。

> 也可以先在本地把 `wrangler.toml` 中 `[[kv_namespaces]]` 的 `id` 替换为步骤 2 返回的真实 id，再 push 到 GitHub，这样 Workers Builds 会自动读取绑定配置。

### 部署方式 B：本地直接使用 wrangler deploy（命令行部署）

适合本地环境齐全、希望手动控制部署时机的用户。

```bash
# 1. 克隆并安装依赖
git clone https://github.com/kentpan/cloudflare-voicecity-player.git
cd cloudflare-voicecity-player
bun install      # 或 pnpm install / npm install / yarn

# 2. 登录 Cloudflare（首次需要）
npx wrangler login

# 3. 创建 KV 命名空间（用于存储播放器配置 + Passkey 凭证）
npx wrangler kv namespace create voicecity-kv
# 将返回的 id 填入 wrangler.toml 中 [[kv_namespaces]] 的 id 字段（替换 REPLACE_WITH_YOUR_KV_NAMESPACE_ID）

# 4. 配置 ADMIN_SECRET 密钥（以 secret 形式存储，不写入文件）
npx wrangler secret put ADMIN_SECRET
# 按提示输入密钥值后回车

# 5. 构建并部署到 Workers
bun run deploy   # 或 pnpm deploy / npm run deploy / yarn deploy
# 等价于：npm run build:cf && npx @opennextjs/cloudflare deploy
```

> `ADMIN_SECRET` 是登录管理员的唯一凭据。配置后，在首页右上角点击「登录」按钮，输入此密钥即可登录管理员。
> 登录后可在「播放器管理」弹窗中配置播放器参数、注册 Passkey 等。

### 部署说明

- **部署目标**：Cloudflare Workers（非 Pages）。`wrangler.toml` 中的 `main = ".open-next/worker.js"` 是 Worker 入口。
- **KV 命名空间**：用于存储播放器配置（代理开关、播放器名称、title、github url、copyright）和 Passkey 凭证。创建后填入 `wrangler.toml`，或在 Workers 控制台 Bindings 中绑定（变量名 `KV`）。
- **ADMIN_SECRET**：管理员登录密钥，**必须**通过 `wrangler secret put` 或 Workers 控制台的 Encrypt 变量配置，不要写在 `wrangler.toml` 明文中。未配置时前端会全屏阻断提示。
- **nodejs_compat**：`wrangler.toml` 中已配置 `compatibility_flags = ["nodejs_compat"]`，Workers 控制台部署时也需在设置中开启此标志。
- **无需数据库**：播放历史存储在浏览器 indexedDB，音乐代理 API 为无状态服务端 fetch。

## 🛠️ 技术栈

| 技术 | 说明 |
|------|------|
| [Next.js 16](https://nextjs.org/) | React 全栈框架（App Router） |
| [TypeScript 5](https://www.typescriptlang.org/) | 类型安全 |
| [Tailwind CSS 3](https://tailwindcss.com/) | 原子化 CSS |
| [shadcn/ui](https://ui.shadcn.com/) | UI 组件库（New York 风格） |
| [Zustand](https://github.com/pmndrs/zustand) | 客户端状态管理 |
| [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) | JWT 认证 |
| [@simplewebauthn](https://simplewebauthn.dev/) | Passkey (WebAuthn) 无密码登录 |
| [Sonner](https://sonner.emilkowal.ski/) | Toast 通知 |
| [Lucide Icons](https://lucide.dev/) | 图标库 |
| [@opennextjs/cloudflare](https://opennext.js.org/cloudflare) | Cloudflare 部署适配器 |
| Cloudflare KV | 播放器配置 + Passkey 凭证存储 |
| indexedDB | 浏览器本地数据库（播放历史） |

## 📁 项目结构

```
.
├── public/
│   └── audio-match/              # 听歌识曲 WASM 资源
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/             # 认证
│   │   │   │   ├── admin-secret-login/  # 密钥登录
│   │   │   │   ├── passkey/             # Passkey 注册/登录
│   │   │   │   ├── me/                  # 当前用户
│   │   │   │   ├── logout/              # 退出登录
│   │   │   │   └── music-cookie/        # 音乐平台 cookie 存储
│   │   │   ├── player-config/    # 播放器配置（KV 存储）
│   │   │   ├── setup-status/     # 初始化状态检测
│   │   │   ├── search/           # 多平台音乐搜索
│   │   │   ├── music/            # 音乐接口
│   │   │   └── bilibili/         # B站接口
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── ui/                   # shadcn/ui 基础组件
│   │   └── voicehub/
│   │       ├── music-player.tsx          # 统一底部播放器
│   │       ├── audio-match-dialog.tsx    # 听歌识曲弹窗
│   │       ├── music-login-dialog.tsx    # 平台扫码登录弹窗
│   │       ├── login-dialog.tsx          # 管理员登录弹窗
│   │       ├── account-dialog.tsx        # 播放器管理弹窗
│   │       ├── setup-guard.tsx           # 初始化守卫
│   │       ├── hero-actions.tsx          # Hero区域 GitHub+登录按钮
│   │       ├── preview-player.tsx        # 试听按钮
│   │       ├── site-footer.tsx           # 页脚
│   │       └── views/
│   │           ├── find-music-view.tsx   # 找歌视图
│   │           └── play-history-view.tsx # 播放历史视图
│   ├── lib/
│   │   ├── api-client.ts         # 前端 API 封装
│   │   ├── api.ts                # 后端响应工具
│   │   ├── auth.ts               # JWT 认证工具
│   │   ├── kv.ts                 # KV 存储适配器
│   │   ├── player-config.ts      # 播放器配置类型 + KV 读写
│   │   ├── passkey-config.ts     # Passkey RP 配置
│   │   ├── indexeddb.ts          # 播放历史 indexedDB 封装
│   │   ├── lrc-parser.ts         # LRC 歌词解析器
│   │   ├── music/                # 平台 SDK
│   │   ├── store.ts              # Zustand 全局状态
│   │   └── utils.ts              # 工具函数
│   └── types/
│       └── voicehub.ts           # 类型定义
├── next.config.ts
├── tailwind.config.ts
├── wrangler.toml                 # Cloudflare 配置（KV + 环境变量）
├── open-next.config.ts           # OpenNext 配置
└── package.json
```

## 📖 使用说明

### 搜索与播放

1. 在「找歌」Tab 选择音乐平台（网易云 / QQ音乐 / B站）
2. 输入关键词搜索，点击搜索结果即可在底部统一播放器播放
3. 播放的歌曲会自动记录到本地播放历史

### 听歌识曲

1. 点击搜索框右侧的麦克风图标，或在播放器面板点击听歌识曲按钮
2. 授权麦克风权限后，点击「开始识曲」
3. 录音 8 秒后自动识别，识别结果点击即可播放

### 平台登录（播放 VIP 歌曲）

1. 选择网易云或 QQ音乐平台后，搜索框上方会出现「登录网易云」/「登录QQ音乐」按钮
2. 点击按钮，使用对应 APP 扫描二维码登录
3. 登录成功后即可播放 VIP 歌曲

### 播放历史管理

- 切换到「播放历史」Tab 查看本地播放记录（每页 10 条，支持分页）
- 点击列表中的歌曲可再次播放，重听后自动置顶
- 点击收藏按钮（星形图标）收藏歌曲，收藏的歌曲始终居顶
- 点击单条记录右侧的删除按钮，**需确认后**才会删除
- 点击「清空未收藏」可清空所有未收藏的历史记录（收藏歌曲保留）

### 管理员功能

1. 点击右上角「登录」按钮，输入 `ADMIN_SECRET` 密钥登录
2. 登录后右上角显示头像（首字符），点击可打开「播放器管理」弹窗
3. 在弹窗中可配置：代理 API 开关、播放器名称、页面 Title、GitHub 地址、Copyright 文字
4. 在左侧个人资料中可注册 Passkey（注册后可用 Passkey 快速登录）

## 🔧 配置说明

### 环境变量

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `ADMIN_SECRET` | 是 | 管理员登录密钥。配置后在首页右上角点击「登录」输入此密钥即可登录管理员。未配置时前端会全屏阻断提示。 |
| `JWT_SECRET` | 否 | JWT 签名密钥。不配置时使用默认值（仅适合开发，生产环境建议配置）。 |
| `RP_ID` | 否 | Passkey WebAuthn RP ID。**通常无需配置** — 代码 `src/lib/passkey-config.ts` 会自动从请求头 Host 派生 registrable domain，兼容 localhost / IP / 自定义域名 / `*.workers.dev` / `*.pages.dev`。仅在访问域名与期望 RP 不一致时才需显式覆盖。 |
| `RP_ORIGIN` | 否 | Passkey WebAuthn RP Origin。**通常无需配置** — 代码会自动从请求 URL 派生 `${protocol}//${host}`。仅在反代/转发场景下才需显式覆盖。 |

### Cloudflare KV

| 绑定名 | 必填 | 说明 |
|--------|------|------|
| `KV` | 是 | 播放器配置 + Passkey 凭证存储。通过 `wrangler kv namespace create voicecity-kv` 创建。 |

> 本地开发无需 KV（自动回退到内存存储，重启后丢失）。

### 浏览器兼容性

- iOS 13+ / Safari 13+
- Chrome 70+
- Firefox 70+
- Edge 79+

## ⚠️ 免责声明

本项目仅作为技术学习与研究的工具开源，供开发者学习 Next.js、Cloudflare Pages 部署、音乐播放器实现等技术方案使用。

- 本项目**不存储、不缓存、不分发**任何音乐作品，所有播放内容均来自第三方音乐平台的公开接口，版权归原版权方所有。
- 本项目不对第三方音乐平台接口的可用性、合法性作任何担保，使用本项目访问第三方平台需遵守对应平台的服务条款。
- **本项目仅供源码学习和研究使用，禁止用于任何商业用途。** 因使用本项目进行商业行为导致的任何侵权或法律纠纷，本项目作者概不负责，由使用者自行承担全部责任。
- 请在所在地区的法律框架内合理使用本项目，尊重知识产权与版权。

## 🤝 致谢

本项目从 [VoiceHub](https://github.com/laoshuikaixue/VoiceHub) 项目剥离而来，感谢原作者的开源贡献。在此基础上精简为核心的音乐搜索、播放、识曲与本地历史功能，去除了用户系统、管理后台、数据库等依赖，使其更适合轻量化部署个人学习使用。

## 📄 开源协议

本项目基于 [MIT License](./LICENSE) 开源，可自由使用、修改和分发。

## 🐛 问题反馈

如果遇到问题或有功能建议，欢迎提交 [Issue](https://github.com/kentpan/cloudflare-voicecity-player/issues)。

---

> ⭐ 觉得好用的话，给个 Star 吧！

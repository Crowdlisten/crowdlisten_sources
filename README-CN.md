# CrowdListen Sources

> 让你的 AI 智能体研究用户洞察，进行主题建模和深度分析 —— 覆盖全网和社交媒体。

[English](README.md) | [中文文档](README-CN.md)

## 亮点

1. **零配置启动** — `npx crowdlisten search reddit "query"` 即刻运行。无需 API 密钥，无需配置，无需服务器。
2. **7大平台，统一接口** — Reddit、YouTube、TikTok、Twitter/X、Instagram、小红书、Moltbook。每次返回相同的 JSON 结构。
3. **MCP 原生，为 AI 智能体而生** — 作为 MCP 服务器构建。你的智能体直接调用工具 —— 无需 REST 封装，无需中间件。
4. **观点聚类与主题建模** — 语义聚类按主题归类评论。发现共识、异议和新兴趋势。
5. **免费核心，付费智能** — 搜索、评论、热门和分析完全免费在本地运行。深度分析和研究综合通过 CrowdListen API 提供。

## 立即体验

零配置 -- Reddit 即刻可用：

```bash
npx crowdlisten search reddit "cursor vs claude code" --limit 5
```

## 为你的智能体安装

```bash
npx @crowdlisten/planner login
```

一条命令同时安装 CrowdListen Planner 和 Sources 到你的智能体 MCP 配置中。重启智能体即可。

或手动添加：

```json
{
  "mcpServers": {
    "crowdlisten/sources": {
      "command": "npx",
      "args": ["-y", "crowdlisten"]
    }
  }
}
```

## 功能介绍

用户反馈分散在各个渠道。CrowdListen Sources 将跨渠道对话整合为结构化信号 —— 每次返回相同的 JSON 结构。搜索、提取评论、按主题聚类观点、追踪情感。所有平台统一接口。

开源是因为数据提取是基础设施 —— DOM 选择器会失效，API 会变更，社区修复这些比任何单一团队都快。[分析层](https://crowdlisten.com)才是智能所在。

## 接口

| 接口 | 使用方式 | 适用场景 |
|------|---------|---------|
| **MCP** | 添加到智能体配置，智能体直接调用工具 | AI 智能体（Claude Code、Cursor、Gemini CLI 等） |
| **CLI** | `npx crowdlisten search reddit "query"` | 脚本、命令行、快速查询 |

两种接口共享相同的处理逻辑，返回相同的 JSON 结构。

## 功能矩阵

| 功能 | MCP | CLI | 需要认证 |
|------|-----|-----|---------|
| 搜索 | Y | Y | 无（Reddit 免费） |
| 评论 | Y | Y | 无 |
| 分析（表面/标准） | Y | Y | 无 |
| 分析（深度/全面） | Y | Y | `CROWDLISTEN_API_KEY` |
| 观点聚类 | Y | Y | `OPENAI_API_KEY` |
| 深度分析 | Y | Y | `CROWDLISTEN_API_KEY` |
| 洞察提取 | Y | Y | `CROWDLISTEN_API_KEY` |
| 研究综合 | Y | Y | `CROWDLISTEN_API_KEY` |
| 热门内容 | Y | Y | 无 |
| 用户内容 | Y | Y | 无 |
| 平台状态 | Y | Y | 无 |
| 健康检查 | Y | Y | 无 |

## 免费 vs 付费

**免费（开源，无需密钥）：**
- `search_content` — 跨平台搜索帖子
- `get_content_comments` — 获取帖子评论
- `analyze_content`（表面/标准） — 本地情感和主题分析
- `cluster_opinions` — 语义观点聚类（需要 `OPENAI_API_KEY`）
- `get_trending_content` — 热门帖子
- `get_user_content` — 特定用户的帖子
- `get_platform_status` / `health_check` — 诊断

**付费（需要 `CROWDLISTEN_API_KEY` — 在 [crowdlisten.com/api](https://crowdlisten.com/api) 获取）：**
- `deep_analyze` — AI 驱动的受众洞察：用户细分、痛点、功能需求、竞争信号
- `extract_insights` — 分类洞察提取（痛点、功能需求、好评、投诉）
- `research_synthesis` — 单一查询生成跨平台研究报告
- `analyze_content`（深度/全面） — 自动升级为 deep_analyze，无密钥时降级为本地分析

## 平台

| 平台 | 需要认证 | 备注 |
|------|---------|------|
| Reddit | 否 | 即刻可用，公开 JSON API |
| YouTube | API 密钥 | YouTube Data API v3（免费：10k 单位/天） |
| TikTok | 可选 | Playwright 浏览器搜索 + 视频管道 |
| Twitter/X | 是 | 开发者账号（免费：1,500 推文/月） |
| Instagram | 否 | Playwright 浏览器抓取 |
| 小红书 | 可选 | Playwright 浏览器抓取（设置 `XHS_CHROME_PROFILE_PATH` 效果最佳） |

## CLI 命令

```bash
# 搜索
crowdlisten search reddit "AI agents" --limit 20
crowdlisten search youtube "AI agent frameworks" --limit 10
crowdlisten search all "remote work productivity" --limit 30

# 评论
crowdlisten comments reddit t3_abc123 --limit 50
crowdlisten comments youtube dQw4w9WgXcQ --limit 100

# 分析（评论 + 聚类 + 情感）
crowdlisten analyze reddit t3_abc123
crowdlisten analyze youtube dQw4w9WgXcQ --depth deep

# 按主题聚类观点
crowdlisten cluster reddit t3_abc123 --clusters 8

# 热门 / 用户内容
crowdlisten trending reddit --limit 10
crowdlisten user reddit spez --limit 5

# 平台信息
crowdlisten status
crowdlisten health
```

## 智能体接入

**方式一 — 一条命令（推荐）：**
```bash
npx @crowdlisten/planner login
```
打开浏览器，登录 CrowdListen，自动为 5 个智能体配置 MCP（Claude Code、Cursor、Gemini CLI、Codex、OpenClaw）。同时安装 Sources 和 Planner。

**方式二 — 手动配置：**
添加到你的智能体 MCP 配置文件：
```json
{
  "mcpServers": {
    "crowdlisten/sources": {
      "command": "npx",
      "args": ["-y", "crowdlisten"]
    }
  }
}
```

**方式三 — 网页：**
在 [crowdlisten.com](https://crowdlisten.com) 登录。你的智能体可以阅读 [AGENTS.md](AGENTS.md) 获取工具参考。

## 智能体参考

查看 [AGENTS.md](AGENTS.md) 获取机器可读的工具描述、MCP 配置和示例调用。

## 配置

```bash
cp .env.example .env
```

```bash
# YouTube（有免费额度）
YOUTUBE_API_KEY=your-key

# Twitter/X（4 个密钥全部需要）
TWITTER_API_KEY=your-key
TWITTER_API_KEY_SECRET=your-secret
TWITTER_ACCESS_TOKEN=your-token
TWITTER_ACCESS_TOKEN_SECRET=your-token-secret

# 可选 -- 语义观点聚类
OPENAI_API_KEY=your-key

# 可选 -- TikTok 视频理解
GEMINI_API_KEY=your-key
ANTHROPIC_API_KEY=your-key

# 可选 -- 付费分析功能
CROWDLISTEN_API_KEY=your-key
```

平台详细配置：[docs/PLATFORMS.md](docs/PLATFORMS.md)

## 架构

```
src/
  cli.ts              -- CLI 入口（commander）
  index.ts            -- MCP 服务器（stdio）
  handlers.ts         -- 共享处理逻辑
  service-config.ts   -- 平台配置工厂
  services/           -- UnifiedSocialMediaService
  platforms/          -- 平台适配器（每个平台一个）
  core/
    base/             -- BaseAdapter 抽象类
    interfaces/       -- TypeScript 类型
    utils/            -- 聚类、URL 解析、视频分析
```

两个入口点调用相同的处理函数。

## 开发

```bash
git clone https://github.com/Crowdlisten/crowdlisten_sources.git
cd crowdlisten_sources
npm install && npm run build
npm test              # 单元测试
npm run test:e2e      # E2E 测试（需要 API 密钥）
```

## 贡献

查看 [CONTRIBUTING.md](CONTRIBUTING.md)。最有价值的贡献：新平台适配器（Threads、Bluesky、Hacker News、Product Hunt、Mastodon）和浏览器抓取修复。

## 背景

- [The Very Beginning](https://chenterry.com/posts/the_very_beginning/)
- [MCPs vs Skills for Agents](https://chenterry.com/posts/skills_vs_mcps_for_agents/)

## 许可证

MIT

[CrowdListen](https://crowdlisten.com) 开源生态的一部分 —— 另见 [@crowdlisten/planner](https://github.com/Crowdlisten/crowdlisten_tasks)。

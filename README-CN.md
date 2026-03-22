# CrowdListen Insights

> 给你的 AI 智能体装上耳朵。搜索 7 大平台、提取评论、聚类观点、分析情感 — 结构化 JSON，每次如此。

[English](README.md) | [中文文档](README-CN.md)

## 为什么选择 CrowdListen

你的用户正在告诉你该构建什么。问题是他们分散在 Reddit、YouTube、TikTok、Twitter/X、Instagram、小红书等各处 — 而你的智能体什么都听不到。

CrowdListen 给你的智能体一个统一工具来搜索所有平台、提取评论，并将原始对话转化为结构化信号：痛点、功能需求、情感倾向、共识与分歧。

**一条 `npx` 命令。7 大平台。结构化 JSON。无需 API 密钥即可开始。**

## 立即体验

```bash
npx crowdlisten search reddit "cursor vs claude code" --limit 5
```

## 亮点

1. **零配置启动** — Reddit、TikTok、Twitter/X、Instagram 和小红书开箱即用。无需 API 密钥，无需 OAuth，无需配置。
2. **7 大平台，统一 JSON** — Reddit、YouTube、TikTok、Twitter/X、Instagram、小红书、Moltbook。每次返回相同的 `Post[]` 和 `Comment[]`。
3. **MCP 原生** — 作为 MCP 服务器构建。你的智能体直接调用工具 — 无需 REST 封装，无需中间件。
4. **视觉模式** — 无法抓取？将 CrowdListen 指向任意 URL，它会截图页面、发送给 LLM、返回结构化数据。适用于任何网站。
5. **免费核心，付费智能** — 搜索、评论、热门和视觉提取完全免费在本地运行。深度分析和研究综合通过 CrowdListen API 提供。

## 演示

https://github.com/user-attachments/assets/DEMO_VIDEO_ID

> 获取完整系统及更多功能，部署在 [crowdlisten.com](https://crowdlisten.com)

## 为你的智能体安装

```bash
npx @crowdlisten/planner login
```

一条命令同时安装 CrowdListen Planner 和 Insights 到你的智能体 MCP 配置中。重启智能体即可。

或手动添加：

```json
{
  "mcpServers": {
    "crowdlisten/insights": {
      "command": "npx",
      "args": ["-y", "crowdlisten"]
    }
  }
}
```

## 两个系统如何协作

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        CrowdListen 生态系统                              │
│                                                                         │
│  ┌─────────────────────────────┐    ┌─────────────────────────────┐    │
│  │   CrowdListen Insights      │    │   CrowdListen Planner       │    │
│  │                             │    │                             │    │
│  │   "用户在说什么？"           │    │   "我们应该构建什么？"       │    │
│  │                             │    │                             │    │
│  │   搜索 7 大平台             │    │   带上下文规划              │    │
│  │   提取评论                   │    │   用智能体执行              │    │
│  │   聚类观点                   │    │   捕获经验                  │    │
│  │   视觉提取                   │    │   复合知识                  │    │
│  │                             │    │                             │    │
│  └──────────────┬──────────────┘    └──────────────┬──────────────┘    │
│                 │                                   │                   │
│                 └────────►  你的 AI 智能体  ◄────────┘                   │
│                     (Claude Code, Cursor, Gemini CLI, Codex...)         │
│                                                                         │
│                    npx @crowdlisten/planner login                       │
│                    一条命令安装两者。                                     │
└──────────────────────────────────────────────────────────────────────────┘
```

**Insights** 发现受众在各社交平台上的讨论。**Planner** 将信号转化为有计划、可追踪的工作。两者配合，你的智能体可以研究话题、规划应对、执行任务，并记住所学以备下次使用。

## 平台

| 平台 | 认证 | 方法 | 说明 |
|------|------|------|------|
| Reddit | 无 | 公开 JSON API | 即刻可用，零配置 |
| YouTube | `YOUTUBE_API_KEY` | YouTube Data API v3 | 免费额度：10k 单位/天 |
| TikTok | 无 | 浏览器 + API 拦截 | Playwright 捕获内部 API 响应 |
| Twitter/X | `TWITTER_USERNAME` + `TWITTER_PASSWORD` | Cookie 认证抓取 | 无需开发者账号 |
| Instagram | 无 | 浏览器 + API 拦截 | Playwright 捕获 GraphQL 响应 |
| 小红书 | 无 | 浏览器 + API 拦截 | 保守限速，移动端视口 |
| Moltbook | `MOLTBOOK_API_KEY` | REST API | 直接 API 访问 |
| 任意 URL | LLM API 密钥 | 视觉（截图 + LLM） | 适用于任何网站 |

## CLI 命令

```bash
# 搜索
crowdlisten search reddit "AI agents" --limit 20
crowdlisten search twitter "LLM frameworks" --limit 10
crowdlisten search all "remote work" --limit 30

# 评论
crowdlisten comments reddit t3_abc123 --limit 50
crowdlisten comments youtube dQw4w9WgXcQ --limit 100

# 视觉 — 从任意 URL 提取
crowdlisten vision https://news.ycombinator.com --limit 10
crowdlisten vision https://tiktok.com/@user/video/123 --mode comments
crowdlisten search twitter "AI" --vision   # 强制视觉模式

# 分析（需要 CROWDLISTEN_API_KEY）
crowdlisten analyze reddit t3_abc123 --depth deep
crowdlisten cluster reddit t3_abc123 --clusters 8
crowdlisten insights reddit t3_abc123
crowdlisten research "AI code editors" --platforms reddit,twitter,youtube

# 热门 / 用户内容
crowdlisten trending reddit --limit 10
crowdlisten user reddit spez --limit 5

# 诊断
crowdlisten status
crowdlisten health
```

## MCP 工具

| 工具 | 描述 | 认证 |
|------|------|------|
| `search_content` | 跨平台搜索帖子 | 免费 |
| `get_content_comments` | 获取帖子评论 | 免费 |
| `get_trending_content` | 平台热门帖子 | 免费 |
| `get_user_content` | 特定用户的帖子 | 免费 |
| `extract_url` | 从任意 URL 视觉提取 | LLM API 密钥 |
| `get_platform_status` | 可用平台和功能 | 免费 |
| `health_check` | 平台连接检查 | 免费 |
| `analyze_content` | 情感 + 主题分析 | `CROWDLISTEN_API_KEY` |
| `cluster_opinions` | 语义观点聚类 | `CROWDLISTEN_API_KEY` |
| `enrich_content` | 意图检测 + 立场分析 | `CROWDLISTEN_API_KEY` |
| `deep_analyze` | 完整受众智能报告 | `CROWDLISTEN_API_KEY` |
| `extract_insights` | 分类洞察提取 | `CROWDLISTEN_API_KEY` |
| `research_synthesis` | 跨平台研究报告 | `CROWDLISTEN_API_KEY` |

## 配置

```bash
cp .env.example .env
```

```bash
# YouTube（有免费额度）
YOUTUBE_API_KEY=your-key

# Twitter/X（Cookie 认证，无需开发者账号）
TWITTER_USERNAME=your-username
TWITTER_PASSWORD=your-password

# 视觉提取（至少需要一个用于视觉模式）
ANTHROPIC_API_KEY=your-key    # Claude（首选）
GEMINI_API_KEY=your-key       # Gemini（备选）
OPENAI_API_KEY=your-key       # OpenAI（备选）

# 浏览器提供商（默认：本地 Playwright）
# BROWSER_PROVIDER=docker
# BROWSER_PROVIDER=remote
# BROWSER_CDP_URL=ws://localhost:9222

# 付费分析功能
CROWDLISTEN_API_KEY=your-key
```

## 架构

```
src/
  cli.ts                — CLI 入口（commander）
  index.ts              — MCP 服务器（stdio）
  handlers.ts           — 共享处理逻辑（CLI + MCP）
  service-config.ts     — 平台配置工厂
  services/
    UnifiedSocialMediaService.ts  — 协调所有平台适配器
  platforms/
    reddit/             — 公开 JSON API（axios）
    youtube/            — YouTube Data API v3（axios）
    moltbook/           — Moltbook REST API（axios）
    twitter/            — Cookie 认证抓取（twitter-scraper）
    tiktok/             — 浏览器 + API 拦截（Playwright）
    instagram/          — 浏览器 + API 拦截（Playwright）
    xiaohongshu/        — 浏览器 + API 拦截（Playwright）
  browser/
    BrowserPool.ts      — 浏览器生命周期：本地、Docker 或远程 CDP
    RequestInterceptor.ts — 按 URL 模式捕获内部 API 响应
  vision/
    VisionExtractor.ts  — 截图 + LLM 提取，适用于任意 URL
  core/
    base/               — BaseAdapter 抽象类
    interfaces/         — TypeScript 类型（Post, Comment, User 等）
    utils/              — URL 解析工具
```

每个平台一个适配器，各司其职。无层级，无回退链。视觉模式是独立工具，显式调用 — 不是埋在回调链中的后备方案。

## 智能体接入

**方式一 — 一条命令（推荐）：**
```bash
npx @crowdlisten/planner login
```
打开浏览器，登录 CrowdListen，自动为 5 个智能体配置 MCP（Claude Code、Cursor、Gemini CLI、Codex、OpenClaw）。同时安装 Insights 和 Planner。

**方式二 — 手动配置：**
```json
{
  "mcpServers": {
    "crowdlisten/insights": {
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

## 开发

```bash
git clone https://github.com/Crowdlisten/crowdlisten_insights.git
cd crowdlisten_insights
npm install && npm run build
npm test              # 单元测试
npm run test:e2e      # E2E 测试（需要 API 密钥）
```

## 贡献

查看 [CONTRIBUTING.md](CONTRIBUTING.md)。最有价值的贡献：新平台适配器（Threads、Bluesky、Hacker News、Product Hunt、Mastodon）和提取修复。

## 背景

- [The Very Beginning](https://chenterry.com/posts/the_very_beginning/)
- [MCPs vs Skills for Agents](https://chenterry.com/posts/skills_vs_mcps_for_agents/)

## 许可证

MIT

获取完整系统及更多功能，部署在 [crowdlisten.com](https://crowdlisten.com)。另见 [@crowdlisten/planner](https://github.com/Crowdlisten/crowdlisten_harness)。

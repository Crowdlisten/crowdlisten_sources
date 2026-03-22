# CrowdListen Insights

> 给你的 AI 智能体装上耳朵。搜索 7 大平台，提取真实对话，将分散的反馈转化为结构化信号。

[English](README.md) | [中文文档](README-CN.md)

## 问题所在

你的用户已经在告诉你该构建什么。他们在 Reddit 上抱怨你的引导流程，在 YouTube 评论中请求新功能，在 Twitter 上讨论竞品，在 TikTok 上分享临时方案。信号就在那里——只是分散在七个平台、七种格式中，埋在你的团队永远不会阅读的帖子里。

CrowdListen Insights 给你的 AI 智能体一个统一接口，一次搜索所有平台。它提取评论，将所有内容标准化为相同的 JSON 格式，返回你的智能体可以推理的结构化数据。痛点、功能需求、情感倾向、共识与分歧——全部来自真实对话，而非问卷调查。

## 你能用它做什么

**了解人们的真实想法。** 一条命令搜索 Reddit、YouTube、TikTok、Twitter/X、Instagram、小红书和 Moltbook。返回带有互动指标、时间戳和作者信息的结构化帖子——无论来自哪个平台，格式完全一致。

**深入任何讨论。** 发现一个有 500 条评论讨论你产品的 Reddit 帖子？全部拉取，结构化并标准化。你的智能体可以通读它们，识别模式，总结要点——你甚至不需要打开浏览器。

**从任意网站提取。** CrowdListen 的视觉模式对任意 URL 截图，发送给 LLM（Claude、Gemini 或 OpenAI），返回结构化数据。没有 API 的论坛？有付费墙的新闻网站评论？直接用视觉模式搞定。

**让你的智能体做分析。** 付费 API 层增加了观点聚类（将数百条评论按主题分组）、深度分析（受众细分、竞争信号）和研究综合（单条查询生成跨平台报告）。但核心提取功能完全免费且开源。

## 立即体验

Reddit 开箱即用——无需 API 密钥，无需配置，无需账号：

```bash
npx crowdlisten search reddit "cursor vs claude code" --limit 5
```

你将获得带有帖子、作者、互动指标和时间戳的结构化 JSON。每个平台返回相同的格式。

## 安装配置

### 为 AI 智能体安装（MCP）

最快路径——一条命令同时安装 CrowdListen Insights 和 [CrowdListen Harness](https://github.com/Crowdlisten/crowdlisten_harness) 到你的智能体 MCP 配置：

```bash
npx @crowdlisten/planner login
```

浏览器打开，登录 CrowdListen，自动为 Claude Code、Cursor、Gemini CLI、Codex 和 OpenClaw 配置 MCP。重启智能体即可开始调用工具。

如果只需要 Insights（不要 Harness），手动添加到智能体的 MCP 配置：

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

### CLI 使用

无需安装——`npx` 直接运行：

```bash
npx crowdlisten search reddit "your query"
npx crowdlisten comments youtube dQw4w9WgXcQ
npx crowdlisten vision https://news.ycombinator.com
```

### 平台配置

大多数平台零配置即可工作。以下是实际需要的配置：

| 平台 | 需要什么 | 不配置会怎样 |
|------|---------|-------------|
| Reddit | 无 | 即刻可用 |
| TikTok | 无 | 即刻可用（基于浏览器） |
| Instagram | 无 | 即刻可用（基于浏览器） |
| 小红书 | 无 | 即刻可用（基于浏览器） |
| Twitter/X | `.env` 中设置 `TWITTER_USERNAME` + `TWITTER_PASSWORD` | 跳过——添加凭据即可使用 |
| YouTube | `.env` 中设置 `YOUTUBE_API_KEY` | 跳过——从 Google Cloud Console 获取免费密钥 |
| 视觉模式 | `ANTHROPIC_API_KEY`、`GEMINI_API_KEY` 或 `OPENAI_API_KEY` 之一 | 视觉命令返回明确错误提示 |
| 付费分析 | `CROWDLISTEN_API_KEY` | 免费工具正常使用；付费工具返回明确错误和注册链接 |

配置可选平台：

```bash
cp .env.example .env
# 编辑 .env 文件，填入你的密钥
```

## CLI 命令

```bash
# 跨平台搜索
crowdlisten search reddit "AI agents" --limit 20
crowdlisten search twitter "LLM frameworks" --limit 10
crowdlisten search all "remote work" --limit 30

# 获取特定帖子的评论
crowdlisten comments reddit t3_abc123 --limit 50
crowdlisten comments youtube dQw4w9WgXcQ --limit 100

# 视觉模式——从任意 URL 提取结构化数据
crowdlisten vision https://news.ycombinator.com --limit 10
crowdlisten vision https://tiktok.com/@user/video/123 --mode comments

# 强制使用视觉模式
crowdlisten search twitter "AI" --vision

# 付费分析（需要 CROWDLISTEN_API_KEY）
crowdlisten analyze reddit t3_abc123 --depth deep
crowdlisten cluster reddit t3_abc123 --clusters 8
crowdlisten insights reddit t3_abc123
crowdlisten research "AI code editors" --platforms reddit,twitter,youtube

# 发现
crowdlisten trending reddit --limit 10
crowdlisten user reddit spez --limit 5

# 诊断
crowdlisten status
crowdlisten health
```

## MCP 工具

当你的智能体通过 MCP 连接时，可以使用以下工具：

**免费工具（无需 API 密钥）：**

| 工具 | 功能 |
|------|------|
| `search_content` | 跨平台搜索帖子。支持 `useVision` 标志。 |
| `get_content_comments` | 获取特定帖子的评论。支持 `useVision` 标志。 |
| `get_trending_content` | 平台当前热门帖子 |
| `get_user_content` | 特定用户的近期帖子 |
| `extract_url` | 视觉提取——对任意 URL 截图，返回结构化数据 |
| `get_platform_status` | 可用平台及其功能 |
| `health_check` | 平台连接检查 |

**付费工具（需要 `CROWDLISTEN_API_KEY`——在 [crowdlisten.com/api](https://crowdlisten.com/api) 获取）：**

| 工具 | 功能 |
|------|------|
| `analyze_content` | 帖子及评论的情感 + 主题分析 |
| `cluster_opinions` | 按主题将评论分组为语义观点聚类 |
| `enrich_content` | 意图检测、立场分析、互动评分 |
| `deep_analyze` | 完整受众智能：细分、痛点、竞争信号 |
| `extract_insights` | 分类洞察提取（痛点、功能需求、好评） |
| `research_synthesis` | 单条查询生成跨平台研究报告 |

## 底层工作原理

每个平台一个适配器，各司其职。无回退链，无层级，无回调嵌套。

- **Reddit、YouTube、Moltbook** 使用直接 HTTP API——快速可靠。
- **Twitter** 使用基于 Cookie 的抓取器——无需开发者账号，只需用户名和密码。
- **TikTok、Instagram、小红书** 通过 Playwright 启动真实浏览器，导航到页面，拦截平台自身的内部 API 响应。这比逆向工程私有 API 更可靠，因为你捕获的是应用本身渲染的数据。
- **视觉模式** 是独立工具。它打开浏览器，截取全页面，发送给 LLM 进行结构化提取。适用于任何网站——不限于支持的平台。

浏览器可以在本地运行（默认）、Docker 容器中运行，或通过远程 CDP 端点运行（用于 Browserbase 等云浏览器服务）：

```bash
# 默认：本地 Playwright
crowdlisten search tiktok "AI agents"

# Docker：沙盒浏览器
BROWSER_PROVIDER=docker crowdlisten search tiktok "AI agents"

# 远程：云浏览器
BROWSER_PROVIDER=remote BROWSER_CDP_URL=wss://connect.browserbase.com?apiKey=KEY crowdlisten search tiktok "AI agents"
```

## CrowdListen 生态系统

CrowdListen 是两个协同工作的 MCP 服务器：

**Insights**（本仓库）发现受众在各社交平台上的讨论。**[Harness](https://github.com/Crowdlisten/crowdlisten_harness)** 将信号转化为有计划、可追踪的工作——知识库在每个任务间不断积累。两者配合，你的智能体可以研究话题、规划应对、执行任务，并记住所学以备下次使用。

```bash
# 一条命令安装两者
npx @crowdlisten/planner login
```

## 开发

```bash
git clone https://github.com/Crowdlisten/crowdlisten_insights.git
cd crowdlisten_insights
npm install && npm run build
npm test
```

## 贡献

查看 [CONTRIBUTING.md](CONTRIBUTING.md)。最有价值的贡献：新平台适配器（Threads、Bluesky、Hacker News、Product Hunt、Mastodon）和提取修复。

## 许可证

MIT — [crowdlisten.com](https://crowdlisten.com)

---
name: crowdlisten-deep-analysis
description: "Deep cross-channel feedback analysis with AI-powered tension mapping, structured insight extraction, and multi-source research synthesis. Converts fragmented audience signal into decision-grade context. Requires CrowdListen API key from crowdlisten.com/api."
version: 1.0.0
homepage: https://crowdlisten.com
metadata: {"openclaw":{"emoji":"brain","requires":{"bins":["crowdlisten"],"env":["CROWDLISTEN_API_KEY"]},"primaryEnv":"CROWDLISTEN_API_KEY","install":[{"id":"crowdlisten","kind":"node","package":"crowdlisten","bins":["crowdlisten"],"label":"CrowdListen CLI"}]}}
allowed-tools: "Bash Read"
---

# CrowdListen Deep Analysis

Premium audience intelligence powered by the CrowdListen agent. Goes beyond basic clustering to deliver tension-first synthesis, structured insights with confidence scores, and multi-source research synthesis.

**Requires a CrowdListen API key.** Get one at https://crowdlisten.com/api

## Commands

### Deep Analysis

Tension-first synthesis that identifies what audiences actually disagree about, not just what they say.

```bash
crowdlisten analyze <platform> <contentId> --depth deep
crowdlisten analyze <platform> <contentId> --depth comprehensive
```

**Output includes:**
- Tension mapping (opposing viewpoints with evidence)
- Synthesized narrative connecting themes
- Confidence-scored conclusions
- Actionable strategic recommendations

### Structured Insights

Extract categorized insights with confidence scores from any social media content.

```bash
crowdlisten insights <platform> <contentId>
crowdlisten insights <platform> <contentId> --categories "pain-points,feature-requests,praise"
```

**Output includes:**
- Categorized insights (pain points, feature requests, praise, complaints, suggestions)
- Confidence scores per insight (0-1)
- Supporting evidence quotes
- Engagement metrics per insight category

### Research Synthesis

Multi-source research across platforms with AI-powered synthesis into a structured report.

```bash
crowdlisten research "What do developers think about AI coding assistants?"
crowdlisten research "electric vehicle market sentiment" --platforms reddit,twitter,youtube --depth deep
```

**Output includes:**
- Cross-platform theme synthesis
- Source diversity analysis
- Key opinion leaders identified
- Consensus vs. controversy mapping
- Strategic implications

## When to Use

- "Give me a deep analysis of sentiment on this post"
- "Extract structured insights from this Reddit thread"
- "Research what people think about [topic] across platforms"
- "What are the main tensions in this audience discussion?"
- "Generate a research report on [market/product/trend]"
- "What are the pain points users mention about [product]?"

## Free vs. Paid

| Feature | Free (crowdlisten-analyze) | Paid (this skill) |
|---------|---------------------------|-------------------|
| Raw comments | Yes | Yes |
| Basic clustering | Yes (needs OPENAI_API_KEY) | Yes (built-in) |
| Tension-first synthesis | No | Yes |
| Structured insights | No | Yes |
| Multi-source research | No | Yes |
| Confidence scoring | No | Yes |

## Setup

1. Install the CrowdListen CLI: `npm install -g crowdlisten`
2. Get an API key at https://crowdlisten.com/api
3. Set `CROWDLISTEN_API_KEY` in your environment
4. Start using premium commands

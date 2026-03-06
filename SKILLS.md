# SKILLS.md — CrowdListen Sources MCP Control Layer

This file defines how agents should use `crowdlisten_sources_mcp` safely and consistently.

## Layering Contract

- **MCP layer (this repo):** platform access, retrieval, normalization, deterministic tool calls.
- **Skills layer (agent behavior):** routing, policy, retries, confidence thresholds, provenance, and handoff decisions.

Rule: **MCP handles calls; Skills handle judgment.**

## Core Skills to Implement

1. **sources-router**
   - Chooses workflow by source type: URL / keyword / account / media.
   - Chooses MCP tool: `search_content`, `get_trending_content`, `get_user_content`, `get_content_comments`, `analyze_content`.

2. **sources-ingest**
   - Standardizes output envelope for CrowdListen ingestion.
   - Enforces idempotency key + request trace id on every ingest operation.

3. **sources-analysis-bridge**
   - Routes enriched MCP output into CrowdListen analysis endpoints.
   - Default GA path first; beta paths behind explicit feature flags.

4. **sources-governance**
   - PII redaction policy.
   - Retry rules (`4xx` fail-fast, `429/5xx` bounded exponential backoff).
   - Budget policy (rate limits + per-run caps).

## TikTok Policy

Use `TikTokAdapter` + video pipeline in this repo as canonical for TikTok source understanding.

Do not rely on direct TikTok comment extraction patterns that are known to be skipped/degraded in older stacks.

## Canonical Output Contract (minimum)

Every item emitted from Skills into downstream APIs should include:

- `source_url`
- `platform`
- `tool_name`
- `retrieved_at`
- `raw_payload_ref` (or raw hash)
- `normalized_payload`
- `provenance.model` (if LLM used)
- `provenance.model_version`
- `provenance.prompt_version`
- `trace_id`

Raw source must remain immutable.

## Operational Controls

- Feature flags per workflow:
  - `skills.router.enabled`
  - `skills.tiktok_pipeline.enabled`
  - `skills.analysis_bridge.beta_enabled`
- Kill switch:
  - `skills.global_disable`
- Canary rollout:
  - allowlist by tenant/account/source

## Verification Checklist (before enabling in prod)

1. `npm test` passes
2. MCP `tools/list` contains expected tools
3. One successful end-to-end flow per platform in staging
4. Retry + timeout behavior validated with failure injection
5. Rollback via flag tested (<15 min)


## Reusable OpenClaw Skills — Realigned to Core Needs

### Core now
- **openai-whisper-api**: audio/video speech-to-text normalization for analysis
- **video-frames**: timestamped visual evidence extraction for QA/citation
- **gemini**: structured enrichment (topics, claims, summary) with schema constraints
- **blogwatcher**: include only if RSS/blog ingestion is in current product scope

### Optional (non-core pipeline)
- **slack**: reviewer notifications/escalations only
- **healthcheck**: infra posture checks run by ops cadence, outside Sources feature logic

### Out of scope for Sources
- weather, image-generation skills, and unrelated consumer/productivity skills

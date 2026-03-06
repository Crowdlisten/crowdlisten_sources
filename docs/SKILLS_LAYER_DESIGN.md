# CrowdListen Sources MCP — Skills Layer Design

## Goal

Design a **Skills control layer** on top of `crowdlisten_sources_mcp` so CrowdListen can run source workflows with consistent routing, governance, and reliability.

---

## 1) Architecture: MCP vs Skills

### MCP layer (existing, this repo)
Responsibilities:
- Platform adapters (TikTok, Reddit, YouTube, Twitter/X, Instagram)
- Data retrieval (`search_content`, `get_trending_content`, `get_user_content`, `get_content_comments`)
- Deterministic analysis primitives (`analyze_content`, clustering/synthesis tools)
- Cross-platform normalization

### Skills layer (new control plane)
Responsibilities:
- Workflow routing and tool selection
- Policy and safety controls
- Retry/backoff and failure handling
- Provenance, idempotency, and trace metadata
- GA vs beta endpoint bridging to downstream CrowdListen APIs

**Rule:** MCP handles calls; Skills handle judgment.

---

## 2) Skills Layer Blueprint

## A. Core orchestrator skills

1. `sources-router`
- Decide path by input type: keyword query, direct URL, account handle, uploaded media.
- Pick MCP toolchain:
  - Discovery: `search_content` / `get_trending_content`
  - Targeted fetch: `get_user_content` / `get_content_comments`
  - Deep understanding: `analyze_content`

2. `sources-ingest`
- Convert MCP outputs into CrowdListen ingestion envelope.
- Attach required metadata:
  - `trace_id`, `idempotency_key`, `source_url`, `platform`, `retrieved_at`, `tool_name`, `raw_hash`
- Enforce immutable raw payload + derived normalized layer.

3. `sources-analysis-bridge`
- Route normalized source payloads into CrowdListen analysis endpoints.
- Default stable/GA APIs first.
- Use beta/proxy paths only behind explicit feature flags.

4. `sources-governance`
- Auth boundary checks (service key vs user context)
- PII redaction policy
- Retry policy:
  - `4xx` fail fast (except `409` conflict recovery)
  - `429/5xx` bounded exponential backoff
- Cost controls and quotas per run/tenant

## B. Optional domain skills

5. `tiktok-deep-analysis`
- Canonical TikTok path = adapter + downloader + Gemini video understanding in this repo.
- Produce structured timeline/key moments + transcript fields for downstream evidence.

6. `cross-platform-synthesis-policy`
- Define when to run synthesis vs return platform-local results.
- Confidence thresholding and “insufficient evidence” behavior.

---

## 3) OpenClaw Skills Readiness Matrix (realigned to core needs)

| Skill | Priority | Role in Sources | Decision |
|---|---|---|---|
| `openai-whisper-api` | P0 | Audio/video transcription normalization | **Core now** |
| `video-frames` | P0 | Timestamped evidence extraction | **Core now** |
| `gemini` | P0 | Structured enrichment and triage | **Core now** |
| `blogwatcher` | P1 (conditional) | RSS/blog polling and discovery | **Core only if RSS is in active scope** |
| `slack` | P2 | Human review/ops notifications | **Optional** |
| `healthcheck` | P2 | Host hardening and audit cadence | **Optional (platform ops)** |
| `coding-agent` | P2 | Engineering acceleration for implementation | **Enablement only** |
| `weather`, image-gen skills | N/A | No Sources pipeline value | **Exclude** |

## 4) What is already ready in this repo

- Multi-platform adapters and MCP tool surface are present.
- TikTok pipeline components exist (search/downloader/video-understanding modules).
- MCP contract can be tested via `tools/list` and `health_check`.

Local readiness checks done:
- Added `npm test` script (`node test_mcp.js`)
- Added `npm audit` script
- Updated `axios` dependency to reduce known risk exposure
- Added root `SKILLS.md` control-layer contract

---

## 5) What must be built next (custom skills)

Must implement as first-class skills:
- `sources-router`
- `sources-ingest`
- `sources-analysis-bridge`
- `sources-governance`

Recommended implementation shape:
- Keep skill instructions concise and deterministic.
- Put large schemas in `skills/<name>/references/*.md`.
- Put deterministic transforms/validators in `skills/<name>/scripts/*.py|.ts`.

---

## 6) Integration Flow (end-to-end)

1. Input arrives (query/url/media)
2. `sources-router` selects tool path
3. MCP fetch/analyze executes
4. `sources-ingest` wraps output in canonical envelope
5. `sources-governance` validates policy + retries
6. `sources-analysis-bridge` submits to CrowdListen analysis path
7. Results persisted with immutable raw + derived layers
8. Trace + metrics emitted

---

## 7) Rollout Plan (low-risk)

### Phase 1 (Week 1)
- Build `sources-router` + `sources-ingest`
- Enable for one platform lane (Reddit or YouTube)
- Add trace/idempotency metadata and basic dashboards

### Phase 2 (Week 2)
- Add `sources-analysis-bridge` + `sources-governance`
- Canary by tenant/source allowlist
- Add rollback and kill-switch drills

### Phase 3 (Week 3+)
- Enable `tiktok-deep-analysis`
- Add conditional `blogwatcher` lane if RSS/blog is in-scope
- Add optional `slack` notifications and ops-owned `healthcheck` cadence
- Tune quotas, latency budgets, and quality thresholds

---

## 8) Guardrails

- Never overwrite raw source payloads.
- Store provenance for all generated/enriched fields (`model`, `version`, `prompt_version`).
- Enforce feature flags per skill path.
- Enforce retry caps and circuit breakers on cost/latency anomalies.
- Keep beta endpoints gated; default to stable paths.

---

## 9) Acceptance Criteria

- `npm test` passes consistently in CI.
- One successful end-to-end run per enabled platform in staging.
- Retry and timeout behavior validated with failure injection.
- Rollback to baseline path tested in under 15 minutes.
- No raw-data mutation; derived outputs always provenance-tagged.


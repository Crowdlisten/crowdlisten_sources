---
name: sources-ingest
description: Build and validate canonical ingestion envelopes for CrowdListen Sources. Use when wrapping MCP outputs into immutable raw + normalized payloads with idempotency and provenance metadata.
---

# sources-ingest

1. Preserve raw payload unchanged.
2. Attach normalized payload in separate field.
3. Require `trace_id`, `idempotency_key`, `source_url`, `platform`, `retrieved_at`.
4. Validate envelope before queue handoff.

Use `scripts/envelope.ts` for deterministic envelope building and validation.

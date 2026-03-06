---
name: sources-analysis-bridge
description: Route validated source envelopes into CrowdListen analysis endpoints with stable-first policy and optional beta fallback behind flags.
---

# sources-analysis-bridge

1. Validate routing input and flags.
2. Prefer GA path by default.
3. Use beta route only when explicitly enabled and rule-matched.
4. Emit routing decision + dispatch result metadata.

Use `scripts/routing.ts`.

---
name: sources-governance
description: Enforce policy guardrails for CrowdListen Sources workflows including auth scope, PII controls, retry policy, and deny/review/allow decisions.
---

# sources-governance

1. Evaluate policy context with deterministic rules.
2. Apply precedence: `deny` > `review` > `allow`.
3. Fail fast for non-retryable classes.
4. Return machine-checkable decision and reasons.

Use `scripts/policy.ts`.

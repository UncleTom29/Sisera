# ADR-008 — LLM execution isolation

**Status:** Accepted
**Date:** 2026-09-22

## Context

Sisera uses LLMs for research, summarization, and intent compilation. The critical
invariant is that an LLM must never directly place a trade or bypass risk controls.

## Decision

- **LLMs never emit `LLM response → exchange order`.** The execution path is strictly:

```text
User / Strategy / Agent → AI Intent Compiler → Typed TradeIntent → TradePlan
  → Deterministic Policy Engine → Pre-Trade Risk Engine → Approval Engine
  → OMS → Execution Engine → Smart Order Router → Venue Adapter → Venue
```

- LLMs may research, summarize, reason, explain, propose strategies, generate **typed
  intents**, generate strategy manifests, and analyze results — but may not bypass
  validation, authorization, risk rules, approval policies, capital limits, venue
  permissions, or execution policies.
- The AI Intent Compiler (spec §21) converts natural language into a schema-validated
  `TradeIntent`, shown to the user; the deterministic policy engine is the only thing that
  controls actual execution.
- Risk is deterministic: LLMs do not decide whether risk constraints apply.

## Consequences

- The V1 "no LLM in the live trading decision critical path" principle is preserved and
  strengthened into a hard architectural boundary.
- Any AI output entering the execution pipeline is typed and validated against strict
  schemas (`packages/schemas`).

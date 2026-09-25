# Legacy capability migration

Sisera's original static web interface is retired. Domain and quantitative work is migrated by behavior, not copied as an architectural dependency.

| Legacy capability | Production destination | Status |
| --- | --- | --- |
| Technical and composite indicators | `packages/quant` | Ported: EMA trend, RSI momentum, ATR regime, relative volume, composite confidence |
| Drift detection | `packages/quant` | Ported: distribution-shift guard |
| Expected shortfall / CVaR | `packages/quant` | Ported |
| Portfolio valuation | `packages/portfolio` | Ported with decimal arithmetic |
| Factor stress testing | `packages/portfolio` | Ported with position and factor attribution |
| Transaction-cost analysis | `packages/portfolio` | Ported: slippage and implementation shortfall |
| Double-entry ledger invariant | `packages/portfolio`, `packages/db` | Ported and persisted |
| Venue reconciliation | `packages/portfolio`, `packages/db` | Ported with run and break records |
| Risk gates and circuit-breaker posture | `packages/risk`, `apps/api` | Ported; execution fails closed |
| OMS lifecycle | `packages/oms`, `packages/db` | Ported with legal transition guards |
| Agent promotion governance | `packages/agent-runtime`, `packages/db` | Ported |
| Decision provenance | `packages/db` | Ported as append-only, hash-ready ledger |
| Backtesting engine | future isolated research runtime | Pending: retain point-in-time and no-lookahead constraints |
| Bybit, Deribit, macro, and event adapters | provider workers | Pending production adapters; old behavior remains the specification |

## Migration rule

Every migrated capability must have deterministic tests, explicit data provenance, and no synthetic production fallback. Historical research code must preserve point-in-time alignment and must not reuse live-only or lookahead-contaminated features.

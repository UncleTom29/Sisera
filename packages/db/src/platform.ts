import postgres from "postgres";

/**
 * Data access for the platform runtime: the unified fill ledger, trading policies, the agent
 * lifecycle, launches and classified market events. A single pool per connection string is shared
 * by request handlers and the background scheduler.
 */
const pools = new Map<string, postgres.Sql>();

export function pool(connectionString: string): postgres.Sql {
  let sql = pools.get(connectionString);
  if (!sql) {
    sql = postgres(connectionString, { max: 8, idle_timeout: 30, connect_timeout: 10 });
    pools.set(connectionString, sql);
  }
  return sql;
}

export async function closePools(): Promise<void> {
  await Promise.all([...pools.values()].map((sql) => sql.end({ timeout: 5 })));
  pools.clear();
}

const json = (value: unknown) => JSON.stringify(value ?? null);
const iso = (value: unknown) =>
  value == null ? null : new Date(value as string | Date).toISOString();

/** Runs `task` only if this process wins the named advisory lock, so one API instance schedules. */
export async function withAdvisoryLock<T>(
  connectionString: string,
  key: number,
  task: () => Promise<T>,
): Promise<{ ran: boolean; value?: T }> {
  const reserved = await pool(connectionString).reserve();
  try {
    const [row] = await reserved`SELECT pg_try_advisory_lock(${key}) AS locked`;
    if (!row?.locked) return { ran: false };
    try {
      return { ran: true, value: await task() };
    } finally {
      await reserved`SELECT pg_advisory_unlock(${key})`;
    }
  } finally {
    reserved.release();
  }
}

// ----------------------------------------------------------------------------- preferences

export type RiskPreferences = {
  liquidityThresholdUsd: number;
  mandate: Record<string, number>;
};

export async function getRiskPreferences(
  connectionString: string,
  subject: string,
): Promise<RiskPreferences> {
  const [row] = await pool(connectionString)`
    SELECT liquidity_threshold_usd::float8 AS "liquidityThresholdUsd", mandate
    FROM account_preferences WHERE subject = ${subject}
  `;
  return {
    liquidityThresholdUsd: row ? Number(row.liquidityThresholdUsd) : 250_000,
    mandate: (row?.mandate as Record<string, number> | undefined) ?? {},
  };
}

export async function saveRiskPreferences(
  connectionString: string,
  subject: string,
  preferences: RiskPreferences,
): Promise<RiskPreferences> {
  await pool(connectionString)`
    INSERT INTO account_preferences (subject, liquidity_threshold_usd, mandate)
    VALUES (${subject}, ${preferences.liquidityThresholdUsd}, ${json(preferences.mandate)}::text::jsonb)
    ON CONFLICT (subject) DO UPDATE SET
      liquidity_threshold_usd = EXCLUDED.liquidity_threshold_usd,
      mandate = EXCLUDED.mandate,
      updated_at = now()
  `;
  return preferences;
}

// ----------------------------------------------------------------------------- ledger

export type FillRow = {
  id: string;
  mode: "paper" | "live";
  book: string;
  venue: string;
  assetClass: string | null;
  instrumentKey: string;
  side: "buy" | "sell";
  quantity: string;
  priceUsd: string;
  feeUsd: string;
  arrivalPriceUsd: string | null;
  signature: string | null;
  source: string;
  occurredAt: string;
};

export async function listPortfolioFills(
  connectionString: string,
  subject: string,
): Promise<FillRow[]> {
  const rows = await pool(connectionString)`
    SELECT id, mode, book, venue, asset_class AS "assetClass", instrument_key AS "instrumentKey", side,
           quantity::text, price_usd::text AS "priceUsd", fee_usd::text AS "feeUsd",
           arrival_price_usd::text AS "arrivalPriceUsd", signature, source, occurred_at AS "occurredAt"
    FROM portfolio_fills
    WHERE subject = ${subject} AND quantity > 0 AND price_usd > 0
    ORDER BY occurred_at ASC
    LIMIT 20000
  `;
  return rows.map((row) => ({
    id: String(row.id),
    mode: row.mode as "paper" | "live",
    book: String(row.book),
    venue: String(row.venue),
    assetClass: row.assetClass == null ? null : String(row.assetClass),
    instrumentKey: String(row.instrumentKey),
    side: row.side as "buy" | "sell",
    quantity: String(row.quantity),
    priceUsd: String(row.priceUsd),
    feeUsd: String(row.feeUsd),
    arrivalPriceUsd: row.arrivalPriceUsd == null ? null : String(row.arrivalPriceUsd),
    signature: row.signature == null ? null : String(row.signature),
    source: String(row.source),
    occurredAt: iso(row.occurredAt) ?? "",
  }));
}

export async function countUnnormalizedLiveSwaps(
  connectionString: string,
  subject: string,
): Promise<number> {
  const [row] = await pool(connectionString)`
    SELECT count(*)::int AS count FROM solana_swap_orders
    WHERE subject = ${subject} AND mode = 'live' AND status = 'confirmed' AND token_decimals IS NULL
  `;
  return Number(row?.count ?? 0);
}

export type PaperAccountState = {
  solana: { cashUsd: string; holdings: Record<string, string> } | null;
  market: {
    cashUsd: string;
    spotHoldings: Record<string, string>;
    perpPositions: Record<string, { size: string; entryPrice: string }>;
  } | null;
  prediction: { cashUsd: string } | null;
};

export async function getPaperAccounts(
  connectionString: string,
  subject: string,
): Promise<PaperAccountState> {
  const sql = pool(connectionString);
  const [[solana], [market], [prediction]] = await Promise.all([
    sql`SELECT cash_usd::text AS "cashUsd", holdings FROM solana_paper_accounts WHERE subject = ${subject}`,
    sql`SELECT cash_usd::text AS "cashUsd", spot_holdings AS "spotHoldings", perp_positions AS "perpPositions" FROM market_paper_accounts WHERE subject = ${subject}`,
    sql`SELECT cash_usd::text AS "cashUsd" FROM prediction_paper_accounts WHERE subject = ${subject}`,
  ]);
  return {
    solana: solana
      ? { cashUsd: String(solana.cashUsd), holdings: solana.holdings as Record<string, string> }
      : null,
    market: market
      ? {
          cashUsd: String(market.cashUsd),
          spotHoldings: market.spotHoldings as Record<string, string>,
          perpPositions: market.perpPositions as Record<
            string,
            { size: string; entryPrice: string }
          >,
        }
      : null,
    prediction: prediction ? { cashUsd: String(prediction.cashUsd) } : null,
  };
}

export async function listLiveWallets(
  connectionString: string,
  subject: string,
): Promise<string[]> {
  const rows = await pool(connectionString)`
    SELECT DISTINCT wallet FROM solana_swap_orders
    WHERE subject = ${subject} AND mode = 'live' AND wallet NOT LIKE 'paper:%'
    UNION SELECT DISTINCT wallet FROM token_launches WHERE subject = ${subject}
  `;
  return rows.map((row) => String(row.wallet));
}

// ----------------------------------------------------------------------------- policies

export type PolicyStatus =
  | "draft"
  | "active"
  | "awaiting_approval"
  | "executing"
  | "executed"
  | "failed"
  | "cancelled"
  | "expired"
  | "invalidated";

export type PolicyRow = {
  id: string;
  tenantId: string;
  subject: string;
  name: string;
  policy: Record<string, unknown>;
  policyHash: string;
  mode: "paper" | "live";
  status: PolicyStatus;
  source: string;
  lastEvaluation: Record<string, unknown> | null;
  lastEvaluatedAt: string | null;
  execution: Record<string, unknown> | null;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function policyRow(row: postgres.Row): PolicyRow {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    subject: String(row.subject),
    name: String(row.name),
    policy: row.policy as Record<string, unknown>,
    policyHash: String(row.policy_hash),
    mode: row.mode as "paper" | "live",
    status: row.status as PolicyStatus,
    source: String(row.source),
    lastEvaluation: (row.last_evaluation as Record<string, unknown> | null) ?? null,
    lastEvaluatedAt: iso(row.last_evaluated_at),
    execution: (row.execution as Record<string, unknown> | null) ?? null,
    activatedAt: iso(row.activated_at),
    createdAt: iso(row.created_at) ?? "",
    updatedAt: iso(row.updated_at) ?? "",
  };
}

export async function createTradingPolicy(
  connectionString: string,
  input: {
    tenantId: string;
    subject: string;
    name: string;
    policy: unknown;
    policyHash: string;
    mode: "paper" | "live";
    status: "draft" | "active";
    source: string;
  },
): Promise<PolicyRow> {
  const [row] = await pool(connectionString)`
    INSERT INTO trading_policies (tenant_id, subject, name, policy, policy_hash, mode, status, source, activated_at)
    VALUES (${input.tenantId}, ${input.subject}, ${input.name}, ${json(input.policy)}::text::jsonb, ${input.policyHash},
            ${input.mode}, ${input.status}, ${input.source}, ${input.status === "active" ? new Date() : null})
    RETURNING *
  `;
  if (!row) throw new Error("Policy was not created");
  return policyRow(row);
}

export async function listTradingPolicies(
  connectionString: string,
  subject: string,
): Promise<PolicyRow[]> {
  const rows = await pool(connectionString)`
    SELECT * FROM trading_policies WHERE subject = ${subject} ORDER BY created_at DESC LIMIT 100
  `;
  return rows.map(policyRow);
}

export async function getTradingPolicy(
  connectionString: string,
  subject: string,
  id: string,
): Promise<PolicyRow | null> {
  const [row] = await pool(connectionString)`
    SELECT * FROM trading_policies WHERE id = ${id} AND subject = ${subject}
  `;
  return row ? policyRow(row) : null;
}

export async function listSchedulablePolicies(
  connectionString: string,
  limit = 200,
): Promise<PolicyRow[]> {
  const rows = await pool(connectionString)`
    SELECT * FROM trading_policies WHERE status = 'active'
    ORDER BY last_evaluated_at ASC NULLS FIRST LIMIT ${limit}
  `;
  return rows.map(policyRow);
}

/** Compare-and-set on status so concurrent schedulers or users never double-execute a policy. */
export async function transitionTradingPolicy(
  connectionString: string,
  id: string,
  from: readonly PolicyStatus[],
  to: PolicyStatus,
  patch: { lastEvaluation?: unknown; execution?: unknown; subject?: string } = {},
): Promise<PolicyRow | null> {
  const [row] = await pool(connectionString)`
    UPDATE trading_policies SET
      status = ${to},
      last_evaluation = COALESCE(${patch.lastEvaluation === undefined ? null : json(patch.lastEvaluation)}::text::jsonb, last_evaluation),
      last_evaluated_at = CASE WHEN ${patch.lastEvaluation !== undefined} THEN now() ELSE last_evaluated_at END,
      execution = COALESCE(${patch.execution === undefined ? null : json(patch.execution)}::text::jsonb, execution),
      activated_at = CASE WHEN ${to} = 'active' AND activated_at IS NULL THEN now() ELSE activated_at END
    WHERE id = ${id} AND status = ANY(${from as string[]})
      AND (${patch.subject ?? null}::text IS NULL OR subject = ${patch.subject ?? null})
    RETURNING *
  `;
  return row ? policyRow(row) : null;
}

export async function recordPolicyEvaluation(
  connectionString: string,
  id: string,
  evaluation: unknown,
) {
  await pool(connectionString)`
    UPDATE trading_policies SET last_evaluation = ${json(evaluation)}::text::jsonb, last_evaluated_at = now()
    WHERE id = ${id} AND status = 'active'
  `;
}

// ----------------------------------------------------------------------------- agents

export type AgentManifestRow = {
  id: string;
  version: string;
  tenantId: string;
  name: string;
  ownerSubject: string;
  manifestHash: string;
  policy: Record<string, unknown>;
  createdAt: string;
};

function manifestRow(row: postgres.Row): AgentManifestRow {
  return {
    id: String(row.id),
    version: String(row.version),
    tenantId: String(row.tenant_id),
    name: String(row.name),
    ownerSubject: String(row.owner_subject ?? ""),
    manifestHash: String(row.manifest_hash ?? ""),
    policy: row.policy as Record<string, unknown>,
    createdAt: iso(row.created_at) ?? "",
  };
}

export async function getLatestAgentManifest(
  connectionString: string,
  id: string,
): Promise<AgentManifestRow | null> {
  const [row] = await pool(connectionString)`
    SELECT * FROM agent_manifests WHERE id = ${id}
    ORDER BY string_to_array(version, '.')::int[] DESC LIMIT 1
  `;
  return row ? manifestRow(row) : null;
}

export async function listAgentManifestVersions(
  connectionString: string,
  id: string,
): Promise<AgentManifestRow[]> {
  const rows = await pool(connectionString)`
    SELECT * FROM agent_manifests WHERE id = ${id}
    ORDER BY string_to_array(version, '.')::int[] DESC
  `;
  return rows.map(manifestRow);
}

export async function insertAgentManifestVersion(
  connectionString: string,
  manifest: {
    id: string;
    version: string;
    tenantId: string;
    name: string;
    ownerSubject: string;
    manifestHash: string;
    policy: unknown;
  },
): Promise<AgentManifestRow> {
  const [row] = await pool(connectionString)`
    INSERT INTO agent_manifests (id, version, tenant_id, name, stage, autonomy, owner_subject, manifest_hash, policy)
    VALUES (${manifest.id}, ${manifest.version}, ${manifest.tenantId}, ${manifest.name}, 'draft', 'research',
            ${manifest.ownerSubject}, ${manifest.manifestHash}, ${json(manifest.policy)}::text::jsonb)
    RETURNING *
  `;
  if (!row) throw new Error("Manifest was not created");
  return manifestRow(row);
}

export type AgentStateRow = {
  agentId: string;
  manifestVersion: string;
  stage: string;
  autonomy: string;
  reason: string;
  actorSubject: string;
  evaluationId: string | null;
  createdAt: string;
};

function stateRow(row: postgres.Row): AgentStateRow {
  return {
    agentId: String(row.agent_id),
    manifestVersion: String(row.manifest_version),
    stage: String(row.stage),
    autonomy: String(row.autonomy),
    reason: String(row.reason),
    actorSubject: String(row.actor_subject),
    evaluationId: row.evaluation_id == null ? null : String(row.evaluation_id),
    createdAt: iso(row.created_at) ?? "",
  };
}

export async function getAgentState(
  connectionString: string,
  agentId: string,
): Promise<AgentStateRow | null> {
  const [row] = await pool(connectionString)`
    SELECT * FROM agent_state_events WHERE agent_id = ${agentId} ORDER BY created_at DESC LIMIT 1
  `;
  return row ? stateRow(row) : null;
}

export async function listAgentStateHistory(
  connectionString: string,
  agentId: string,
): Promise<AgentStateRow[]> {
  const rows = await pool(connectionString)`
    SELECT * FROM agent_state_events WHERE agent_id = ${agentId} ORDER BY created_at DESC LIMIT 100
  `;
  return rows.map(stateRow);
}

export async function listAgentStates(
  connectionString: string,
  agentIds: readonly string[],
): Promise<Map<string, AgentStateRow>> {
  if (!agentIds.length) return new Map();
  const rows = await pool(connectionString)`
    SELECT DISTINCT ON (agent_id) * FROM agent_state_events
    WHERE agent_id = ANY(${agentIds as string[]}) ORDER BY agent_id, created_at DESC
  `;
  return new Map(rows.map((row) => [String(row.agent_id), stateRow(row)]));
}

export async function appendAgentState(
  connectionString: string,
  event: {
    agentId: string;
    manifestVersion: string;
    stage: string;
    autonomy: string;
    reason: string;
    actorSubject: string;
    evaluationId?: string | null;
  },
): Promise<AgentStateRow> {
  const [row] = await pool(connectionString)`
    INSERT INTO agent_state_events (agent_id, manifest_version, stage, autonomy, reason, actor_subject, evaluation_id)
    VALUES (${event.agentId}, ${event.manifestVersion}, ${event.stage}, ${event.autonomy}, ${event.reason},
            ${event.actorSubject}, ${event.evaluationId ?? null})
    RETURNING *
  `;
  if (!row) throw new Error("Agent state was not recorded");
  return stateRow(row);
}

export type AgentEvaluationRow = {
  id: string;
  agentId: string;
  manifestVersion: string;
  stage: string;
  outcome: "passed" | "failed" | "inconclusive";
  evidence: Record<string, unknown>;
  dataWindowStart: string;
  dataWindowEnd: string;
  reviewerSubject: string;
  recordedAt: string;
};

export async function recordAgentEvaluation(
  connectionString: string,
  input: {
    agentId: string;
    manifestVersion: string;
    manifestHash: string;
    stage: string;
    outcome: "passed" | "failed" | "inconclusive";
    evidence: unknown;
    dataWindowStart: string;
    dataWindowEnd: string;
    reviewerSubject: string;
  },
): Promise<AgentEvaluationRow> {
  const [row] = await pool(connectionString)`
    INSERT INTO agent_evaluations (agent_id, manifest_version, manifest_hash, stage, outcome, evidence,
      data_window_start, data_window_end, reviewer_subject)
    VALUES (${input.agentId}, ${input.manifestVersion}, ${input.manifestHash}, ${input.stage}, ${input.outcome},
      ${json(input.evidence)}::text::jsonb, ${input.dataWindowStart}, ${input.dataWindowEnd}, ${input.reviewerSubject})
    RETURNING *
  `;
  if (!row) throw new Error("Evaluation was not recorded");
  return evaluationRow(row);
}

function evaluationRow(row: postgres.Row): AgentEvaluationRow {
  return {
    id: String(row.id),
    agentId: String(row.agent_id),
    manifestVersion: String(row.manifest_version),
    stage: String(row.stage),
    outcome: row.outcome as AgentEvaluationRow["outcome"],
    evidence: row.evidence as Record<string, unknown>,
    dataWindowStart: iso(row.data_window_start) ?? "",
    dataWindowEnd: iso(row.data_window_end) ?? "",
    reviewerSubject: String(row.reviewer_subject),
    recordedAt: iso(row.recorded_at) ?? "",
  };
}

export async function listAgentEvaluations(
  connectionString: string,
  agentId: string,
): Promise<AgentEvaluationRow[]> {
  const rows = await pool(connectionString)`
    SELECT * FROM agent_evaluations WHERE agent_id = ${agentId} ORDER BY recorded_at DESC LIMIT 100
  `;
  return rows.map(evaluationRow);
}

export type RunnableAgent = { manifest: AgentManifestRow; state: AgentStateRow };

/** Agents whose latest state is an executing stage for the latest manifest version they run. */
export async function listRunnableAgents(connectionString: string): Promise<RunnableAgent[]> {
  const rows = await pool(connectionString)`
    WITH latest AS (
      SELECT DISTINCT ON (agent_id) * FROM agent_state_events ORDER BY agent_id, created_at DESC
    )
    SELECT m.*, l.agent_id AS s_agent_id, l.manifest_version AS s_manifest_version, l.stage AS s_stage,
           l.autonomy AS s_autonomy, l.reason AS s_reason, l.actor_subject AS s_actor_subject,
           l.evaluation_id AS s_evaluation_id, l.created_at AS s_created_at
    FROM latest l JOIN agent_manifests m ON m.id = l.agent_id AND m.version = l.manifest_version
    WHERE l.stage IN ('paper', 'shadow', 'limited_live', 'live')
    LIMIT 500
  `;
  return rows.map((row) => ({
    manifest: manifestRow(row),
    state: {
      agentId: String(row.s_agent_id),
      manifestVersion: String(row.s_manifest_version),
      stage: String(row.s_stage),
      autonomy: String(row.s_autonomy),
      reason: String(row.s_reason),
      actorSubject: String(row.s_actor_subject),
      evaluationId: row.s_evaluation_id == null ? null : String(row.s_evaluation_id),
      createdAt: iso(row.s_created_at) ?? "",
    },
  }));
}

export type AgentRuntimeState = {
  agentId: string;
  manifestVersion: string;
  subject: string;
  tenantId: string;
  stage: string;
  stageStartedAt: string;
  startingEquityUsd: number;
  maxDrawdownPct: number;
  cashUsd: number;
  positions: Record<
    string,
    {
      quantity: number;
      entryPrice: number;
      openedAt: string;
      barsHeld: number;
      instrumentKey: string;
      symbol: string;
    }
  >;
  day: string;
  dayStartEquityUsd: number;
  peakEquityUsd: number;
  lastTickAt: string | null;
  lastDataAt: string | null;
  lastError: string | null;
};

function runtimeRow(row: postgres.Row): AgentRuntimeState {
  return {
    agentId: String(row.agent_id),
    manifestVersion: String(row.manifest_version),
    subject: String(row.subject),
    tenantId: String(row.tenant_id),
    stage: String(row.stage),
    stageStartedAt: iso(row.stage_started_at) ?? "",
    startingEquityUsd: Number(row.starting_equity_usd),
    maxDrawdownPct: Number(row.max_drawdown_pct),
    cashUsd: Number(row.cash_usd),
    positions: row.positions as AgentRuntimeState["positions"],
    day: new Date(row.day as string | Date).toISOString().slice(0, 10),
    dayStartEquityUsd: Number(row.day_start_equity_usd),
    peakEquityUsd: Number(row.peak_equity_usd),
    lastTickAt: iso(row.last_tick_at),
    lastDataAt: iso(row.last_data_at),
    lastError: row.last_error == null ? null : String(row.last_error),
  };
}

export async function getAgentRuntimeState(
  connectionString: string,
  agentId: string,
  manifestVersion: string,
) {
  const [row] = await pool(connectionString)`
    SELECT * FROM agent_runtime_state WHERE agent_id = ${agentId} AND manifest_version = ${manifestVersion}
  `;
  return row ? runtimeRow(row) : null;
}

export async function saveAgentRuntimeState(connectionString: string, state: AgentRuntimeState) {
  await pool(connectionString)`
    INSERT INTO agent_runtime_state (agent_id, manifest_version, subject, tenant_id, stage, stage_started_at,
      starting_equity_usd, max_drawdown_pct, cash_usd, positions, day,
      day_start_equity_usd, peak_equity_usd, last_tick_at, last_data_at, last_error, updated_at)
    VALUES (${state.agentId}, ${state.manifestVersion}, ${state.subject}, ${state.tenantId}, ${state.stage},
      ${state.stageStartedAt}, ${state.startingEquityUsd}, ${state.maxDrawdownPct}, ${state.cashUsd},
      ${json(state.positions)}::text::jsonb, ${state.day}, ${state.dayStartEquityUsd}, ${state.peakEquityUsd},
      ${state.lastTickAt}, ${state.lastDataAt}, ${state.lastError}, now())
    ON CONFLICT (agent_id, manifest_version) DO UPDATE SET
      stage = EXCLUDED.stage, stage_started_at = EXCLUDED.stage_started_at,
      starting_equity_usd = EXCLUDED.starting_equity_usd, max_drawdown_pct = EXCLUDED.max_drawdown_pct,
      cash_usd = EXCLUDED.cash_usd, positions = EXCLUDED.positions, day = EXCLUDED.day,
      day_start_equity_usd = EXCLUDED.day_start_equity_usd, peak_equity_usd = EXCLUDED.peak_equity_usd,
      last_tick_at = EXCLUDED.last_tick_at, last_data_at = EXCLUDED.last_data_at,
      last_error = EXCLUDED.last_error, updated_at = now()
  `;
}

export async function recordAgentDecision(
  connectionString: string,
  decision: {
    agentId: string;
    manifestVersion: string;
    subject: string;
    stage: string;
    autonomy: string;
    symbol: string;
    action: "enter" | "exit" | "hold" | "abstain" | "breaker";
    disposition: "record" | "recommend" | "await_approval" | "execute" | "blocked";
    marketState: unknown;
    ruleResults: unknown;
    riskDecision?: unknown;
    reasons: readonly string[];
  },
): Promise<string> {
  const [row] = await pool(connectionString)`
    INSERT INTO agent_decisions (agent_id, manifest_version, subject, stage, autonomy, symbol, action, disposition,
      market_state, rule_results, risk_decision, reasons)
    VALUES (${decision.agentId}, ${decision.manifestVersion}, ${decision.subject}, ${decision.stage},
      ${decision.autonomy}, ${decision.symbol}, ${decision.action}, ${decision.disposition},
      ${json(decision.marketState)}::text::jsonb, ${json(decision.ruleResults)}::text::jsonb, ${decision.riskDecision === undefined ? null : json(decision.riskDecision)}::text::jsonb,
      ${json(decision.reasons)}::text::jsonb)
    RETURNING id
  `;
  return String(row?.id);
}

export async function listAgentDecisions(connectionString: string, agentId: string, limit = 100) {
  const rows = await pool(connectionString)`
    SELECT id, manifest_version AS "manifestVersion", stage, autonomy, symbol, action, disposition,
           market_state AS "marketState", rule_results AS "ruleResults", risk_decision AS "riskDecision",
           reasons, created_at AS "createdAt"
    FROM agent_decisions WHERE agent_id = ${agentId}
    ORDER BY created_at DESC LIMIT ${limit}
  `;
  return rows.map((row) => ({ ...row, id: String(row.id), createdAt: iso(row.createdAt) }));
}

export type AgentOrderRow = {
  id: string;
  subject: string;
  tenantId: string;
  agentId: string;
  manifestVersion: string;
  decisionId: string;
  mode: "paper" | "shadow" | "live";
  side: "buy" | "sell";
  symbol: string;
  instrumentKey: string;
  notionalUsd: number;
  quantity: number | null;
  arrivalPriceUsd: number | null;
  fillPriceUsd: number | null;
  status: string;
  approvedBy: string | null;
  signature: string | null;
  detail: Record<string, unknown>;
  expiresAt: string | null;
  createdAt: string;
};

function agentOrderRow(row: postgres.Row): AgentOrderRow {
  const number = (value: unknown) => (value == null ? null : Number(value));
  return {
    id: String(row.id),
    subject: String(row.subject),
    tenantId: String(row.tenant_id),
    agentId: String(row.agent_id),
    manifestVersion: String(row.manifest_version),
    decisionId: String(row.decision_id),
    mode: row.mode as AgentOrderRow["mode"],
    side: row.side as "buy" | "sell",
    symbol: String(row.symbol),
    instrumentKey: String(row.instrument_key),
    notionalUsd: Number(row.notional_usd),
    quantity: number(row.quantity),
    arrivalPriceUsd: number(row.arrival_price_usd),
    fillPriceUsd: number(row.fill_price_usd),
    status: String(row.status),
    approvedBy: row.approved_by == null ? null : String(row.approved_by),
    signature: row.signature == null ? null : String(row.signature),
    detail: row.detail as Record<string, unknown>,
    expiresAt: iso(row.expires_at),
    createdAt: iso(row.created_at) ?? "",
  };
}

export async function createAgentOrder(
  connectionString: string,
  order: Omit<AgentOrderRow, "id" | "createdAt" | "approvedBy" | "signature" | "fillPriceUsd"> & {
    fillPriceUsd?: number | null;
  },
): Promise<AgentOrderRow> {
  const [row] = await pool(connectionString)`
    INSERT INTO agent_orders (tenant_id, subject, agent_id, manifest_version, decision_id, mode, side, symbol,
      instrument_key, notional_usd, quantity, arrival_price_usd, fill_price_usd, status, detail, expires_at)
    VALUES (${order.tenantId}, ${order.subject}, ${order.agentId}, ${order.manifestVersion}, ${order.decisionId},
      ${order.mode}, ${order.side}, ${order.symbol}, ${order.instrumentKey}, ${order.notionalUsd}, ${order.quantity},
      ${order.arrivalPriceUsd}, ${order.fillPriceUsd ?? null}, ${order.status}, ${json(order.detail)}::text::jsonb, ${order.expiresAt})
    RETURNING *
  `;
  if (!row) throw new Error("Agent order was not created");
  return agentOrderRow(row);
}

export async function transitionAgentOrder(
  connectionString: string,
  id: string,
  from: readonly string[],
  to: string,
  patch: {
    approvedBy?: string;
    fillPriceUsd?: number;
    quantity?: number;
    signature?: string;
    detail?: unknown;
    subject?: string;
  } = {},
): Promise<AgentOrderRow | null> {
  const [row] = await pool(connectionString)`
    UPDATE agent_orders SET status = ${to},
      approved_by = COALESCE(${patch.approvedBy ?? null}, approved_by),
      fill_price_usd = COALESCE(${patch.fillPriceUsd ?? null}, fill_price_usd),
      quantity = COALESCE(${patch.quantity ?? null}, quantity),
      signature = COALESCE(${patch.signature ?? null}, signature),
      detail = detail || COALESCE(${patch.detail === undefined ? null : json(patch.detail)}::text::jsonb, '{}'::jsonb),
      updated_at = now()
    WHERE id = ${id} AND status = ANY(${from as string[]})
      AND (${patch.subject ?? null}::text IS NULL OR subject = ${patch.subject ?? null})
    RETURNING *
  `;
  return row ? agentOrderRow(row) : null;
}

export async function listAgentOrders(
  connectionString: string,
  filter: { subject?: string; agentId?: string; status?: string },
): Promise<AgentOrderRow[]> {
  const rows = await pool(connectionString)`
    SELECT * FROM agent_orders
    WHERE (${filter.subject ?? null}::text IS NULL OR subject = ${filter.subject ?? null})
      AND (${filter.agentId ?? null}::text IS NULL OR agent_id = ${filter.agentId ?? null})
      AND (${filter.status ?? null}::text IS NULL OR status = ${filter.status ?? null})
    ORDER BY created_at DESC LIMIT 200
  `;
  return rows.map(agentOrderRow);
}

export async function expireAgentOrders(connectionString: string): Promise<number> {
  const rows = await pool(connectionString)`
    UPDATE agent_orders SET status = 'expired', updated_at = now()
    WHERE status IN ('awaiting_approval', 'recommended') AND expires_at IS NOT NULL AND expires_at < now()
    RETURNING id
  `;
  return rows.length;
}

export async function recordAgentFill(
  connectionString: string,
  fill: {
    tenantId: string;
    subject: string;
    agentId: string;
    manifestVersion: string;
    mode: "paper" | "live";
    venue: string;
    assetClass: string;
    instrumentKey: string;
    symbol: string;
    side: "buy" | "sell";
    quantity: number;
    priceUsd: number;
    feeUsd: number;
    arrivalPriceUsd: number | null;
    slippageBps: number | null;
    decisionId: string | null;
    signature?: string | null;
  },
) {
  await pool(connectionString)`
    INSERT INTO agent_fills (tenant_id, subject, agent_id, manifest_version, mode, venue, asset_class, instrument_key,
      symbol, side, quantity, price_usd, fee_usd, arrival_price_usd, slippage_bps, decision_id, signature)
    VALUES (${fill.tenantId}, ${fill.subject}, ${fill.agentId}, ${fill.manifestVersion}, ${fill.mode}, ${fill.venue},
      ${fill.assetClass}, ${fill.instrumentKey}, ${fill.symbol}, ${fill.side}, ${fill.quantity}, ${fill.priceUsd},
      ${fill.feeUsd}, ${fill.arrivalPriceUsd}, ${fill.slippageBps}, ${fill.decisionId}, ${fill.signature ?? null})
  `;
}

export async function listAgentFills(connectionString: string, agentId: string, since?: string) {
  const rows = await pool(connectionString)`
    SELECT id, manifest_version AS "manifestVersion", mode, symbol, instrument_key AS "instrumentKey", side,
           quantity::float8, price_usd::float8 AS "priceUsd", fee_usd::float8 AS "feeUsd",
           slippage_bps::float8 AS "slippageBps", occurred_at AS "occurredAt"
    FROM agent_fills WHERE agent_id = ${agentId}
      AND (${since ?? null}::timestamptz IS NULL OR occurred_at >= ${since ?? null})
    ORDER BY occurred_at DESC LIMIT 500
  `;
  return rows.map((row) => ({
    id: String(row.id),
    manifestVersion: String(row.manifestVersion),
    mode: String(row.mode),
    symbol: String(row.symbol),
    instrumentKey: String(row.instrumentKey),
    side: row.side as "buy" | "sell",
    quantity: Number(row.quantity),
    priceUsd: Number(row.priceUsd),
    feeUsd: Number(row.feeUsd),
    slippageBps: row.slippageBps == null ? null : Number(row.slippageBps),
    occurredAt: iso(row.occurredAt) ?? "",
  }));
}

// ----------------------------------------------------------------------------- launches

export type LaunchRow = {
  id: string;
  tenantId: string;
  subject: string;
  venue: "clawpump" | "meteora_dbc";
  agentId: string | null;
  status: string;
  name: string;
  symbol: string;
  description: string;
  imageUrl: string | null;
  wallet: string;
  quoteMint: string;
  quoteSymbol: string;
  referenceSymbol: string | null;
  config: Record<string, unknown>;
  providerState: Record<string, unknown>;
  baseMint: string | null;
  poolAddress: string | null;
  configAddress: string | null;
  unsignedTransaction: string | null;
  signature: string | null;
  error: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function launchRow(row: postgres.Row): LaunchRow {
  const text = (value: unknown) => (value == null ? null : String(value));
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    subject: String(row.subject),
    venue: row.venue as LaunchRow["venue"],
    agentId: text(row.agent_id),
    status: String(row.status),
    name: String(row.name),
    symbol: String(row.symbol),
    description: String(row.description),
    imageUrl: text(row.image_url),
    wallet: String(row.wallet),
    quoteMint: String(row.quote_mint),
    quoteSymbol: String(row.quote_symbol),
    referenceSymbol: text(row.reference_symbol),
    config: row.config as Record<string, unknown>,
    providerState: row.provider_state as Record<string, unknown>,
    baseMint: text(row.base_mint),
    poolAddress: text(row.pool_address),
    configAddress: text(row.config_address),
    unsignedTransaction: text(row.unsigned_transaction),
    signature: text(row.signature),
    error: text(row.error),
    expiresAt: iso(row.expires_at),
    createdAt: iso(row.created_at) ?? "",
    updatedAt: iso(row.updated_at) ?? "",
  };
}

export async function createLaunch(
  connectionString: string,
  launch: Pick<
    LaunchRow,
    | "tenantId"
    | "subject"
    | "venue"
    | "agentId"
    | "status"
    | "name"
    | "symbol"
    | "description"
    | "imageUrl"
    | "wallet"
    | "quoteMint"
    | "quoteSymbol"
    | "referenceSymbol"
    | "config"
  > &
    Partial<
      Pick<
        LaunchRow,
        | "providerState"
        | "baseMint"
        | "poolAddress"
        | "configAddress"
        | "unsignedTransaction"
        | "expiresAt"
      >
    >,
): Promise<LaunchRow> {
  const [row] = await pool(connectionString)`
    INSERT INTO token_launches (tenant_id, subject, venue, agent_id, status, name, symbol, description, image_url, wallet,
      quote_mint, quote_symbol, reference_symbol, config, provider_state, base_mint, pool_address, config_address,
      unsigned_transaction, expires_at)
    VALUES (${launch.tenantId}, ${launch.subject}, ${launch.venue}, ${launch.agentId}, ${launch.status}, ${launch.name},
      ${launch.symbol}, ${launch.description}, ${launch.imageUrl}, ${launch.wallet}, ${launch.quoteMint},
      ${launch.quoteSymbol}, ${launch.referenceSymbol}, ${json(launch.config)}::text::jsonb, ${json(launch.providerState ?? {})}::text::jsonb,
      ${launch.baseMint ?? null}, ${launch.poolAddress ?? null}, ${launch.configAddress ?? null},
      ${launch.unsignedTransaction ?? null}, ${launch.expiresAt ?? null})
    RETURNING *
  `;
  if (!row) throw new Error("Launch was not recorded");
  return launchRow(row);
}

export async function updateLaunch(
  connectionString: string,
  id: string,
  from: readonly string[],
  patch: Partial<
    Pick<
      LaunchRow,
      | "status"
      | "providerState"
      | "baseMint"
      | "poolAddress"
      | "configAddress"
      | "unsignedTransaction"
      | "signature"
      | "error"
      | "expiresAt"
      | "agentId"
    >
  >,
): Promise<LaunchRow | null> {
  const [row] = await pool(connectionString)`
    UPDATE token_launches SET
      status = COALESCE(${patch.status ?? null}, status),
      provider_state = provider_state || COALESCE(${patch.providerState === undefined ? null : json(patch.providerState)}::text::jsonb, '{}'::jsonb),
      base_mint = COALESCE(${patch.baseMint ?? null}, base_mint),
      pool_address = COALESCE(${patch.poolAddress ?? null}, pool_address),
      config_address = COALESCE(${patch.configAddress ?? null}, config_address),
      unsigned_transaction = CASE WHEN ${patch.unsignedTransaction !== undefined} THEN ${patch.unsignedTransaction ?? null} ELSE unsigned_transaction END,
      signature = COALESCE(${patch.signature ?? null}, signature),
      error = CASE WHEN ${patch.error !== undefined} THEN ${patch.error ?? null} ELSE error END,
      expires_at = CASE WHEN ${patch.expiresAt !== undefined} THEN ${patch.expiresAt ?? null}::timestamptz ELSE expires_at END,
      agent_id = COALESCE(${patch.agentId ?? null}, agent_id),
      updated_at = now()
    WHERE id = ${id} AND status = ANY(${from as string[]})
    RETURNING *
  `;
  return row ? launchRow(row) : null;
}

export async function getLaunch(connectionString: string, id: string): Promise<LaunchRow | null> {
  const [row] = await pool(connectionString)`SELECT * FROM token_launches WHERE id = ${id}`;
  return row ? launchRow(row) : null;
}

export async function listLaunches(
  connectionString: string,
  filter: { subject?: string; venue?: string; status?: string; limit?: number },
) {
  const rows = await pool(connectionString)`
    SELECT * FROM token_launches
    WHERE (${filter.subject ?? null}::text IS NULL OR subject = ${filter.subject ?? null})
      AND (${filter.venue ?? null}::text IS NULL OR venue = ${filter.venue ?? null})
      AND (${filter.status ?? null}::text IS NULL OR status = ${filter.status ?? null})
    ORDER BY created_at DESC LIMIT ${filter.limit ?? 100}
  `;
  return rows.map(launchRow);
}

// ----------------------------------------------------------------------------- market events

export type StoredEvent = {
  id: string;
  headline: string;
  primaryCategory: string;
  severity: string;
  sentiment: string;
  certainty: string;
  impactScore: number;
  firstSeenAt: string;
  lastSeenAt: string;
  assets: Array<{ key: string }>;
};

export async function upsertMarketEvents(connectionString: string, events: readonly StoredEvent[]) {
  if (!events.length) return 0;
  const sql = pool(connectionString);
  await sql.begin(async (transaction) => {
    for (const event of events)
      await transaction`
        INSERT INTO market_events (id, headline, category, severity, sentiment, certainty, asset_keys, impact_score,
          payload, first_seen_at, last_seen_at)
        VALUES (${event.id}, ${event.headline}, ${event.primaryCategory}, ${event.severity}, ${event.sentiment},
          ${event.certainty}, ${event.assets.map((asset) => asset.key)}, ${event.impactScore}, ${json(event)}::text::jsonb,
          ${event.firstSeenAt}, ${event.lastSeenAt})
        ON CONFLICT (id) DO UPDATE SET
          headline = EXCLUDED.headline, severity = EXCLUDED.severity, sentiment = EXCLUDED.sentiment,
          certainty = EXCLUDED.certainty, asset_keys = EXCLUDED.asset_keys, impact_score = EXCLUDED.impact_score,
          payload = EXCLUDED.payload, last_seen_at = GREATEST(market_events.last_seen_at, EXCLUDED.last_seen_at),
          recorded_at = now()
      `;
  });
  return events.length;
}

export async function listMarketEvents<T = unknown>(
  connectionString: string,
  filter: { since?: string; assetKey?: string; limit?: number },
): Promise<T[]> {
  const rows = await pool(connectionString)`
    SELECT payload FROM market_events
    WHERE (${filter.since ?? null}::timestamptz IS NULL OR last_seen_at >= ${filter.since ?? null})
      AND (${filter.assetKey ?? null}::text IS NULL OR ${filter.assetKey ?? null} = ANY(asset_keys))
    ORDER BY last_seen_at DESC LIMIT ${filter.limit ?? 200}
  `;
  return rows.map((row) => row.payload as T);
}

// ----------------------------------------------------------------------------- copilot

export async function saveCopilotMessages(
  connectionString: string,
  subject: string,
  threadId: string,
  messages: ReadonlyArray<{
    role: "user" | "assistant";
    content: string;
    intent?: string | null;
    evidence?: unknown;
  }>,
) {
  const sql = pool(connectionString);
  await sql.begin(async (transaction) => {
    for (const message of messages)
      await transaction`
        INSERT INTO copilot_messages (subject, thread_id, role, content, intent, evidence)
        VALUES (${subject}, ${threadId}, ${message.role}, ${message.content.slice(0, 8000)}, ${message.intent ?? null},
          ${message.evidence === undefined ? null : json(message.evidence)}::text::jsonb)
      `;
  });
}

export async function listCopilotThread(
  connectionString: string,
  subject: string,
  threadId: string,
) {
  const rows = await pool(connectionString)`
    SELECT role, content, intent, evidence, created_at AS "createdAt" FROM copilot_messages
    WHERE subject = ${subject} AND thread_id = ${threadId} ORDER BY created_at ASC LIMIT 200
  `;
  return rows.map((row) => ({
    role: row.role as "user" | "assistant",
    content: String(row.content),
    intent: row.intent == null ? null : String(row.intent),
    evidence: row.evidence,
    createdAt: iso(row.createdAt),
  }));
}

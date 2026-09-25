import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const orderStatus = pgEnum("order_status", [
  "draft",
  "risk_rejected",
  "accepted",
  "working",
  "partially_filled",
  "filled",
  "cancelled",
  "expired",
]);

export const instruments = pgTable(
  "instruments",
  {
    id: text("id").primaryKey(),
    venue: text("venue").notNull(),
    venueSymbol: text("venue_symbol").notNull(),
    assetClass: text("asset_class").notNull(),
    type: text("type").notNull(),
    baseAsset: text("base_asset").notNull(),
    quoteAsset: text("quote_asset").notNull(),
    priceIncrement: numeric("price_increment").notNull(),
    quantityIncrement: numeric("quantity_increment").notNull(),
    active: boolean("active").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("instrument_venue_symbol_idx").on(table.venue, table.venueSymbol, table.type),
  ],
);

export const portfolios = pgTable(
  "portfolios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id").notNull(),
    name: text("name").notNull(),
    baseCurrency: text("base_currency").notNull().default("USD"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("portfolio_tenant_name_idx").on(table.tenantId, table.name)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id").notNull(),
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id),
    venue: text("venue").notNull(),
    venueAccountRef: text("venue_account_ref").notNull(),
    mode: text("mode").notNull().default("paper"),
    permissions: jsonb("permissions").notNull().default([]),
    status: text("status").notNull().default("pending"),
    lastReconciledAt: timestamp("last_reconciled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("account_venue_reference_idx").on(
      table.tenantId,
      table.venue,
      table.venueAccountRef,
    ),
  ],
);

export const balances = pgTable(
  "balances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    asset: text("asset").notNull(),
    total: numeric("total").notNull(),
    available: numeric("available").notNull(),
    sourceTimestamp: timestamp("source_timestamp", { withTimezone: true }).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("balance_account_asset_idx").on(table.accountId, table.asset)],
);

export const positions = pgTable(
  "positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    instrumentId: text("instrument_id")
      .notNull()
      .references(() => instruments.id),
    side: text("side").notNull(),
    quantity: numeric("quantity").notNull(),
    entryPrice: numeric("entry_price").notNull(),
    markPrice: numeric("mark_price").notNull(),
    marginUsed: numeric("margin_used").notNull().default("0"),
    sourceTimestamp: timestamp("source_timestamp", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("position_account_instrument_idx").on(table.accountId, table.instrumentId),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientOrderId: text("client_order_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    portfolioId: text("portfolio_id").notNull(),
    accountId: text("account_id").notNull(),
    instrumentId: text("instrument_id")
      .notNull()
      .references(() => instruments.id),
    side: text("side").notNull(),
    type: text("type").notNull(),
    quantity: numeric("quantity").notNull(),
    limitPrice: numeric("limit_price"),
    status: orderStatus("status").notNull().default("draft"),
    filledQuantity: numeric("filled_quantity").notNull().default("0"),
    averageFillPrice: numeric("average_fill_price"),
    correlationId: text("correlation_id").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("order_tenant_client_id_idx").on(table.tenantId, table.clientOrderId),
    index("order_portfolio_created_idx").on(table.portfolioId, table.createdAt),
  ],
);

export const riskDecisions = pgTable("risk_decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id),
  outcome: text("outcome").notNull(),
  reasons: jsonb("reasons").notNull(),
  limitsSnapshot: jsonb("limits_snapshot").notNull(),
  portfolioSnapshot: jsonb("portfolio_snapshot").notNull(),
  quoteSnapshot: jsonb("quote_snapshot").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fills = pgTable(
  "fills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    venueFillId: text("venue_fill_id").notNull(),
    quantity: numeric("quantity").notNull(),
    price: numeric("price").notNull(),
    fee: numeric("fee").notNull().default("0"),
    feeAsset: text("fee_asset").notNull(),
    filledAt: timestamp("filled_at", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("fill_order_venue_id_idx").on(table.orderId, table.venueFillId)],
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id").notNull(),
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id),
    entryType: text("entry_type").notNull(),
    referenceId: text("reference_id").notNull(),
    correlationId: text("correlation_id").notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ledger_portfolio_reference_idx").on(
      table.portfolioId,
      table.entryType,
      table.referenceId,
    ),
  ],
);

export const ledgerPostings = pgTable(
  "ledger_postings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => ledgerEntries.id),
    accountCode: text("account_code").notNull(),
    asset: text("asset").notNull(),
    amount: numeric("amount").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (table) => [index("posting_entry_idx").on(table.entryId)],
);

export const reconciliationRuns = pgTable("reconciliation_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id),
  status: text("status").notNull(),
  venueSnapshotAt: timestamp("venue_snapshot_at", { withTimezone: true }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  summary: jsonb("summary").notNull().default({}),
});

export const reconciliationBreaks = pgTable(
  "reconciliation_breaks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => reconciliationRuns.id),
    asset: text("asset").notNull(),
    venueAmount: numeric("venue_amount").notNull(),
    ledgerAmount: numeric("ledger_amount").notNull(),
    difference: numeric("difference").notNull(),
    severity: text("severity").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [index("reconciliation_break_run_idx").on(table.runId)],
);

export const agentManifests = pgTable(
  "agent_manifests",
  {
    id: text("id").notNull(),
    version: text("version").notNull(),
    tenantId: text("tenant_id").notNull(),
    name: text("name").notNull(),
    stage: text("stage").notNull(),
    autonomy: text("autonomy").notNull(),
    policy: jsonb("policy").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("agent_manifest_version_idx").on(table.id, table.version)],
);

export const agentProposals = pgTable(
  "agent_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: text("agent_id").notNull(),
    manifestVersion: text("manifest_version").notNull(),
    status: text("status").notNull().default("proposed"),
    payload: jsonb("payload").notNull(),
    riskDecisionId: uuid("risk_decision_id").references(() => riskDecisions.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("agent_proposal_agent_time_idx").on(table.agentId, table.createdAt)],
);

export const decisionLedger = pgTable(
  "decision_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id").notNull(),
    actorId: text("actor_id").notNull(),
    actorType: text("actor_type").notNull(),
    action: text("action").notNull(),
    correlationId: text("correlation_id").notNull(),
    payload: jsonb("payload").notNull(),
    previousHash: text("previous_hash"),
    entryHash: text("entry_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("decision_tenant_time_idx").on(table.tenantId, table.createdAt)],
);

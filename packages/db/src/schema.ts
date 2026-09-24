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

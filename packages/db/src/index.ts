import { and, desc, eq, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export function createDatabase(connectionString: string) {
  const client = postgres(connectionString, { max: 10, idle_timeout: 20, connect_timeout: 10 });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}

export { schema };

export async function listAgentManifests(connectionString: string, tenantId: string) {
  const connection = createDatabase(connectionString);
  try {
    return connection.db
      .select()
      .from(schema.agentManifests)
      .where(eq(schema.agentManifests.tenantId, tenantId))
      .orderBy(desc(schema.agentManifests.createdAt))
      .limit(100);
  } finally {
    await connection.close();
  }
}

export async function createAgentManifest(
  connectionString: string,
  manifest: typeof schema.agentManifests.$inferInsert,
) {
  const connection = createDatabase(connectionString);
  try {
    const [created] = await connection.db
      .insert(schema.agentManifests)
      .values(manifest)
      .returning();
    return created;
  } finally {
    await connection.close();
  }
}

export type SolanaSwapOrder = typeof schema.solanaSwapOrders.$inferInsert;

export async function applySolanaPaperTrade(
  connectionString: string,
  subject: string,
  order: SolanaSwapOrder,
  decide: (state: { cashUsd: string; holdings: Record<string, string> }) => {
    cashUsd: string;
    holdings: Record<string, string>;
  },
) {
  const connection = postgres(connectionString, { max: 2, connect_timeout: 10 });
  try {
    return await connection.begin(async (transaction) => {
      await transaction`INSERT INTO solana_paper_accounts (subject) VALUES (${subject}) ON CONFLICT DO NOTHING`;
      const [account] =
        await transaction`SELECT cash_usd::text AS cash_usd, holdings FROM solana_paper_accounts WHERE subject = ${subject} FOR UPDATE`;
      if (!account) throw new Error("Paper account unavailable");
      const next = decide({
        cashUsd: String(account.cash_usd),
        holdings: account.holdings as Record<string, string>,
      });
      await transaction`UPDATE solana_paper_accounts SET cash_usd = ${next.cashUsd}, holdings = ${JSON.stringify(next.holdings)}::jsonb, updated_at = now() WHERE subject = ${subject}`;
      await transaction`INSERT INTO solana_swap_orders (id, tenant_id, subject, wallet, input_mint, output_mint, in_amount, out_amount, risk_decision, mode, status) VALUES (${order.id}, ${order.tenantId}, ${subject}, ${order.wallet}, ${order.inputMint}, ${order.outputMint}, ${order.inAmount}, ${order.outAmount}, ${JSON.stringify(order.riskDecision)}::jsonb, 'paper', 'paper_filled')`;
      return next;
    });
  } finally {
    await connection.end();
  }
}

export async function saveSolanaSwapOrder(connectionString: string, order: SolanaSwapOrder) {
  const connection = createDatabase(connectionString);
  try {
    await connection.db.insert(schema.solanaSwapOrders).values(order);
  } finally {
    await connection.close();
  }
}

export async function claimSolanaSwapOrder(connectionString: string, id: string, subject: string) {
  const connection = createDatabase(connectionString);
  try {
    const [order] = await connection.db
      .update(schema.solanaSwapOrders)
      .set({ status: "submitting", updatedAt: new Date() })
      .where(
        and(
          eq(schema.solanaSwapOrders.id, id),
          eq(schema.solanaSwapOrders.subject, subject),
          eq(schema.solanaSwapOrders.status, "prepared"),
          gt(schema.solanaSwapOrders.expiresAt, new Date()),
        ),
      )
      .returning();
    return order ?? null;
  } finally {
    await connection.close();
  }
}

export async function finishSolanaSwapOrder(
  connectionString: string,
  id: string,
  status: "confirmed" | "failed" | "unknown",
  signature?: string,
) {
  const connection = createDatabase(connectionString);
  try {
    await connection.db
      .update(schema.solanaSwapOrders)
      .set({ status, signature: signature ?? null, updatedAt: new Date() })
      .where(eq(schema.solanaSwapOrders.id, id));
  } finally {
    await connection.close();
  }
}

export async function listSolanaSwapOrders(connectionString: string, subject: string) {
  const connection = createDatabase(connectionString);
  try {
    return connection.db
      .select({
        id: schema.solanaSwapOrders.id,
        mode: schema.solanaSwapOrders.mode,
        status: schema.solanaSwapOrders.status,
        wallet: schema.solanaSwapOrders.wallet,
        inputMint: schema.solanaSwapOrders.inputMint,
        outputMint: schema.solanaSwapOrders.outputMint,
        inAmount: schema.solanaSwapOrders.inAmount,
        outAmount: schema.solanaSwapOrders.outAmount,
        signature: schema.solanaSwapOrders.signature,
        createdAt: schema.solanaSwapOrders.createdAt,
      })
      .from(schema.solanaSwapOrders)
      .where(eq(schema.solanaSwapOrders.subject, subject))
      .orderBy(desc(schema.solanaSwapOrders.createdAt))
      .limit(50);
  } finally {
    await connection.close();
  }
}

export async function listPaperAccounts(connectionString: string) {
  const connection = createDatabase(connectionString);
  try {
    return connection.db.select().from(schema.solanaPaperAccounts).limit(1000);
  } finally {
    await connection.close();
  }
}

export type MarketPaperState = {
  cashUsd: string;
  spotHoldings: Record<string, string>;
  perpPositions: Record<string, { size: string; entryPrice: string }>;
};

export async function applyMarketPaperOrder(
  connectionString: string,
  order: {
    id: string;
    tenantId: string;
    subject: string;
    venue: "binance" | "hyperliquid";
    symbol: string;
    side: "buy" | "sell";
    quantity: string;
    fillPrice: string;
    feeUsd: string;
  },
  decide: (state: MarketPaperState) => MarketPaperState,
) {
  const connection = postgres(connectionString, { max: 2, connect_timeout: 10 });
  try {
    return await connection.begin(async (transaction) => {
      await transaction`INSERT INTO market_paper_accounts (subject) VALUES (${order.subject}) ON CONFLICT DO NOTHING`;
      const [account] =
        await transaction`SELECT cash_usd::text AS cash_usd, spot_holdings, perp_positions FROM market_paper_accounts WHERE subject = ${order.subject} FOR UPDATE`;
      if (!account) throw new Error("Paper account unavailable");
      const next = decide({
        cashUsd: String(account.cash_usd),
        spotHoldings: account.spot_holdings as Record<string, string>,
        perpPositions: account.perp_positions as Record<
          string,
          { size: string; entryPrice: string }
        >,
      });
      await transaction`UPDATE market_paper_accounts SET cash_usd = ${next.cashUsd}, spot_holdings = ${JSON.stringify(next.spotHoldings)}::jsonb, perp_positions = ${JSON.stringify(next.perpPositions)}::jsonb, updated_at = now() WHERE subject = ${order.subject}`;
      await transaction`INSERT INTO market_paper_orders (id, tenant_id, subject, venue, symbol, side, quantity, fill_price, fee_usd) VALUES (${order.id}, ${order.tenantId}, ${order.subject}, ${order.venue}, ${order.symbol}, ${order.side}, ${order.quantity}, ${order.fillPrice}, ${order.feeUsd})`;
      return next;
    });
  } finally {
    await connection.end();
  }
}

export async function listMarketPaperOrders(connectionString: string, subject: string) {
  const connection = postgres(connectionString, { max: 2, connect_timeout: 10 });
  try {
    return await connection`SELECT id, venue, symbol, side, quantity::text, fill_price::text AS "fillPrice", fee_usd::text AS "feeUsd", status, created_at AS "createdAt" FROM market_paper_orders WHERE subject = ${subject} ORDER BY created_at DESC LIMIT 50`;
  } finally {
    await connection.end();
  }
}

export async function createMarketLiveOrder(
  connectionString: string,
  order: {
    id: string;
    tenantId: string;
    subject: string;
    venue: "binance" | "hyperliquid";
    symbol: string;
    side: "buy" | "sell";
    quantity: string;
    clientOrderId: string;
  },
) {
  const connection = postgres(connectionString, { max: 2, connect_timeout: 10 });
  try {
    await connection`INSERT INTO market_live_orders (id, tenant_id, subject, venue, symbol, side, quantity, client_order_id, status) VALUES (${order.id}, ${order.tenantId}, ${order.subject}, ${order.venue}, ${order.symbol}, ${order.side}, ${order.quantity}, ${order.clientOrderId}, 'submitting')`;
  } finally {
    await connection.end();
  }
}

export async function updateMarketLiveOrder(
  connectionString: string,
  id: string,
  status: "filled" | "rejected" | "unknown",
  venueOrderId?: string,
) {
  const connection = postgres(connectionString, { max: 2, connect_timeout: 10 });
  try {
    await connection`UPDATE market_live_orders SET status = ${status}, venue_order_id = ${venueOrderId ?? null}, updated_at = now() WHERE id = ${id}`;
  } finally {
    await connection.end();
  }
}

export async function listMarketLiveOrders(connectionString: string, subject: string) {
  const connection = postgres(connectionString, { max: 2, connect_timeout: 10 });
  try {
    return await connection`SELECT id, venue, symbol, side, quantity::text, client_order_id AS "clientOrderId", venue_order_id AS "venueOrderId", status, created_at AS "createdAt" FROM market_live_orders WHERE subject = ${subject} ORDER BY created_at DESC LIMIT 50`;
  } finally {
    await connection.end();
  }
}

export async function savePredictionOrder(
  connectionString: string,
  order: {
    id: string;
    tenantId: string;
    subject: string;
    wallet: string;
    marketId: string;
    outcome: "yes" | "no";
    depositAmount: string;
    orderPubkey: string;
    unsignedTransaction: string;
    expiresAt: Date;
  },
) {
  const connection = postgres(connectionString, { max: 2, connect_timeout: 10 });
  try {
    await connection`INSERT INTO prediction_orders (id, tenant_id, subject, wallet, market_id, outcome, deposit_amount, order_pubkey, unsigned_transaction, status, expires_at) VALUES (${order.id}, ${order.tenantId}, ${order.subject}, ${order.wallet}, ${order.marketId}, ${order.outcome}, ${order.depositAmount}, ${order.orderPubkey}, ${order.unsignedTransaction}, 'prepared', ${order.expiresAt})`;
  } finally {
    await connection.end();
  }
}

export async function claimPredictionOrder(connectionString: string, id: string, subject: string) {
  const connection = postgres(connectionString, { max: 2, connect_timeout: 10 });
  try {
    const [order] =
      await connection`UPDATE prediction_orders SET status = 'submitting', updated_at = now() WHERE id = ${id} AND subject = ${subject} AND status = 'prepared' AND expires_at > now() RETURNING wallet, unsigned_transaction AS "unsignedTransaction", order_pubkey AS "orderPubkey"`;
    return order ?? null;
  } finally {
    await connection.end();
  }
}

export async function finishPredictionOrder(
  connectionString: string,
  id: string,
  status: "submitted" | "failed" | "unknown",
  signature?: string,
) {
  const connection = postgres(connectionString, { max: 2, connect_timeout: 10 });
  try {
    await connection`UPDATE prediction_orders SET status = ${status}, signature = ${signature ?? null}, updated_at = now() WHERE id = ${id}`;
  } finally {
    await connection.end();
  }
}

export async function listPredictionOrders(connectionString: string, subject: string) {
  const connection = postgres(connectionString, { max: 2, connect_timeout: 10 });
  try {
    return await connection`SELECT id, wallet, market_id AS "marketId", outcome, deposit_amount AS "depositAmount", order_pubkey AS "orderPubkey", status, signature, created_at AS "createdAt" FROM prediction_orders WHERE subject = ${subject} ORDER BY created_at DESC LIMIT 50`;
  } finally {
    await connection.end();
  }
}

export async function listMarketPaperAccounts(connectionString: string) {
  const connection = postgres(connectionString, { max: 2, connect_timeout: 10 });
  try {
    return await connection`SELECT subject, cash_usd::text AS "cashUsd", spot_holdings AS "spotHoldings", perp_positions AS "perpPositions", updated_at AS "updatedAt" FROM market_paper_accounts LIMIT 1000`;
  } finally {
    await connection.end();
  }
}

export async function recordSolanaWebhookEvents(
  connectionString: string,
  events: Array<{ signature: string; eventType: string }>,
) {
  if (!events.length) return 0;
  const connection = createDatabase(connectionString);
  try {
    const uniqueEvents = [...new Map(events.map((event) => [event.signature, event])).values()];
    const inserted = await connection.db
      .insert(schema.solanaWebhookEvents)
      .values(uniqueEvents)
      .onConflictDoNothing()
      .returning({ signature: schema.solanaWebhookEvents.signature });
    return inserted.length;
  } finally {
    await connection.close();
  }
}

export async function resolvePrivyMembership(connectionString: string, privyUserId: string) {
  const connection = createDatabase(connectionString);
  try {
    const userId = `privy:${privyUserId}`;
    const personalOrganizationId = `personal:${privyUserId}`;
    await connection.db
      .insert(schema.siseraUsers)
      .values({ id: userId, privyUserId })
      .onConflictDoNothing();
    const existing = await connection.db
      .select({
        organizationId: schema.organizationMemberships.organizationId,
        role: schema.organizationMemberships.role,
      })
      .from(schema.organizationMemberships)
      .where(eq(schema.organizationMemberships.userId, userId))
      .limit(20);
    if (existing.length) return { userId, memberships: existing };
    await connection.db
      .insert(schema.organizations)
      .values({ id: personalOrganizationId, name: "Personal workspace" })
      .onConflictDoNothing();
    await connection.db
      .insert(schema.organizationMemberships)
      .values({ userId, organizationId: personalOrganizationId, role: "trader" })
      .onConflictDoNothing();
    return { userId, memberships: [{ organizationId: personalOrganizationId, role: "trader" }] };
  } finally {
    await connection.close();
  }
}

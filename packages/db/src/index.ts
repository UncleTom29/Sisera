import { and, desc, eq, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export function createDatabase(connectionString: string) {
  const client = postgres(connectionString, { max: 10, idle_timeout: 20, connect_timeout: 10 });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}

export { schema };

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

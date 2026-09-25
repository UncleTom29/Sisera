import type { OrderIntent, RiskDecision } from "@sisera/domain";

export type OrderStatus =
  | "draft"
  | "risk_rejected"
  | "accepted"
  | "working"
  | "partially_filled"
  | "filled"
  | "cancelled"
  | "expired";

export type OrderRecord = {
  orderId: string;
  intent: OrderIntent;
  status: OrderStatus;
  filledQuantity: string;
  averageFillPrice: string | null;
  riskDecision: RiskDecision | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type OrderEvent =
  | { type: "risk_evaluated"; decision: RiskDecision; at: string }
  | { type: "routed"; at: string }
  | { type: "filled"; quantity: string; price: string; at: string }
  | { type: "cancelled"; at: string };

export function createOrderRecord(
  orderId: string,
  intent: OrderIntent,
  now = new Date(),
): OrderRecord {
  return {
    orderId,
    intent,
    status: "draft",
    filledQuantity: "0",
    averageFillPrice: null,
    riskDecision: null,
    version: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export function applyOrderEvent(order: OrderRecord, event: OrderEvent): OrderRecord {
  if (["filled", "cancelled", "expired", "risk_rejected"].includes(order.status)) {
    throw new Error(`Order ${order.orderId} is terminal`);
  }
  if (event.type === "risk_evaluated") {
    if (order.status !== "draft") throw new Error("Risk may only be evaluated from draft");
    return next(order, {
      status: event.decision.outcome === "approved" ? "accepted" : "risk_rejected",
      riskDecision: event.decision,
      updatedAt: event.at,
    });
  }
  if (event.type === "routed") {
    if (order.status !== "accepted") throw new Error("Only accepted orders may be routed");
    return next(order, { status: "working", updatedAt: event.at });
  }
  if (event.type === "filled") {
    if (!order.intent.mode || !["accepted", "working", "partially_filled"].includes(order.status)) {
      throw new Error("Order is not fillable");
    }
    return next(order, {
      status: "filled",
      filledQuantity: event.quantity,
      averageFillPrice: event.price,
      updatedAt: event.at,
    });
  }
  if (!new Set<OrderStatus>(["accepted", "working", "partially_filled"]).has(order.status)) {
    throw new Error("Order is not cancellable");
  }
  return next(order, { status: "cancelled", updatedAt: event.at });
}

function next(order: OrderRecord, change: Partial<OrderRecord>): OrderRecord {
  return { ...order, ...change, version: order.version + 1 };
}

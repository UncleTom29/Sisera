import type { PortfolioPosition, PortfolioSnapshot } from "@sisera/domain";
import Decimal from "decimal.js";

export type PortfolioValuation = {
  nav: string;
  grossExposure: string;
  netExposure: string;
  unrealizedPnl: string;
  marginUsed: string;
  leverage: string;
};

export type StressScenario = { name: string; shocks: Readonly<Record<string, string>> };
export type StressImpact = {
  scenario: string;
  totalPnl: string;
  projectedEquity: string;
  projectedMarginRatio: string;
  byInstrument: Readonly<Record<string, string>>;
  byFactor: Readonly<Record<string, string>>;
  breaches: readonly string[];
};

export type LedgerPosting = { account: string; asset: string; amount: string };
export type LedgerEntry = {
  id: string;
  type: "fill" | "fee" | "funding" | "transfer" | "prediction_settlement" | "adjustment";
  referenceId: string;
  timestamp: string;
  postings: readonly LedgerPosting[];
};

export function valuePortfolio(portfolio: PortfolioSnapshot): PortfolioValuation {
  const cash = Object.values(portfolio.cash).reduce(
    (sum, amount) => sum.add(amount),
    new Decimal(0),
  );
  let gross = new Decimal(0);
  let net = new Decimal(0);
  let pnl = new Decimal(0);
  let margin = new Decimal(0);
  for (const position of portfolio.positions) {
    const signed = position.side === "buy" ? new Decimal(1) : new Decimal(-1);
    const quantity = new Decimal(position.quantity).mul(position.contractMultiplier);
    const markNotional = quantity.mul(position.markPrice);
    gross = gross.add(markNotional.abs());
    net = net.add(markNotional.mul(signed));
    pnl = pnl.add(
      new Decimal(position.markPrice).sub(position.entryPrice).mul(quantity).mul(signed),
    );
    margin = margin.add(position.marginUsed);
  }
  const nav = cash.add(pnl);
  return {
    nav: nav.toFixed(),
    grossExposure: gross.toFixed(),
    netExposure: net.toFixed(),
    unrealizedPnl: pnl.toFixed(),
    marginUsed: margin.toFixed(),
    leverage: nav.isZero() ? "0" : gross.div(nav).toFixed(8),
  };
}

export function stressPortfolio(
  portfolio: PortfolioSnapshot,
  scenario: StressScenario,
  thresholds = { marginRatio: "0.85", equityLoss: "0.30" },
): StressImpact {
  const valuation = valuePortfolio(portfolio);
  const byInstrument: Record<string, string> = {};
  const byFactor = new Map<string, Decimal>();
  let totalPnl = new Decimal(0);
  for (const position of portfolio.positions) {
    const notional = new Decimal(position.quantity)
      .mul(position.contractMultiplier)
      .mul(position.markPrice);
    const side = position.side === "buy" ? new Decimal(1) : new Decimal(-1);
    let positionPnl = new Decimal(0);
    for (const [factor, shock] of Object.entries(scenario.shocks)) {
      const factorPnl = notional
        .mul(position.betaMap[factor] ?? "0")
        .mul(shock)
        .mul(side);
      positionPnl = positionPnl.add(factorPnl);
      byFactor.set(factor, (byFactor.get(factor) ?? new Decimal(0)).add(factorPnl));
    }
    byInstrument[position.instrumentId] = positionPnl.toFixed();
    totalPnl = totalPnl.add(positionPnl);
  }
  const equity = new Decimal(valuation.nav);
  const projectedEquity = equity.add(totalPnl);
  const marginRatio = projectedEquity.lte(0)
    ? new Decimal(1)
    : new Decimal(valuation.marginUsed).div(projectedEquity);
  const lossRatio = equity.lte(0) ? new Decimal(0) : totalPnl.negated().div(equity);
  const breaches: string[] = [];
  if (marginRatio.gt(thresholds.marginRatio)) breaches.push("MARGIN_RATIO");
  if (lossRatio.gt(thresholds.equityLoss)) breaches.push("EQUITY_LOSS");
  return {
    scenario: scenario.name,
    totalPnl: totalPnl.toFixed(),
    projectedEquity: projectedEquity.toFixed(),
    projectedMarginRatio: marginRatio.toFixed(8),
    byInstrument,
    byFactor: Object.fromEntries([...byFactor].map(([factor, value]) => [factor, value.toFixed()])),
    breaches,
  };
}

export function reconcileBalances(
  venue: Readonly<Record<string, string>>,
  ledger: Readonly<Record<string, string>>,
  tolerance = "0.00000001",
): Array<{ asset: string; venue: string; ledger: string; difference: string }> {
  const assets = new Set([...Object.keys(venue), ...Object.keys(ledger)]);
  return [...assets].flatMap((asset) => {
    const venueAmount = new Decimal(venue[asset] ?? 0);
    const ledgerAmount = new Decimal(ledger[asset] ?? 0);
    const difference = venueAmount.sub(ledgerAmount);
    return difference.abs().gt(tolerance)
      ? [
          {
            asset,
            venue: venueAmount.toFixed(),
            ledger: ledgerAmount.toFixed(),
            difference: difference.toFixed(),
          },
        ]
      : [];
  });
}

export function calculateTca(input: {
  side: "buy" | "sell";
  arrivalPrice: string;
  fillPrice: string;
  quantity: string;
  fees: string;
}): { slippageBps: string; implementationShortfall: string } {
  const direction = input.side === "buy" ? new Decimal(1) : new Decimal(-1);
  const arrival = new Decimal(input.arrivalPrice);
  const fill = new Decimal(input.fillPrice);
  const quantity = new Decimal(input.quantity);
  const slippage = fill.sub(arrival).mul(direction);
  return {
    slippageBps: arrival.isZero() ? "0" : slippage.div(arrival).mul(10_000).toFixed(),
    implementationShortfall: slippage.mul(quantity).add(input.fees).toFixed(),
  };
}

export class InMemoryLedger {
  readonly #entries: LedgerEntry[] = [];

  post(entry: LedgerEntry): LedgerEntry {
    if (this.#entries.some((existing) => existing.id === entry.id))
      throw new Error("Duplicate ledger entry");
    const totals = new Map<string, Decimal>();
    for (const posting of entry.postings) {
      totals.set(posting.asset, (totals.get(posting.asset) ?? new Decimal(0)).add(posting.amount));
    }
    if ([...totals.values()].some((total) => !total.isZero()))
      throw new Error("Ledger entry is not balanced by asset");
    const immutable = Object.freeze({ ...entry, postings: Object.freeze([...entry.postings]) });
    this.#entries.push(immutable);
    return immutable;
  }

  entries(): readonly LedgerEntry[] {
    return [...this.#entries];
  }
}

export function positionNotional(position: PortfolioPosition): string {
  return new Decimal(position.quantity)
    .mul(position.contractMultiplier)
    .mul(position.markPrice)
    .toFixed();
}

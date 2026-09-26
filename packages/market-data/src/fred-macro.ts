import { MarketDataUnavailableError } from "./errors.js";

export type MacroRegime = {
  state: "risk_on" | "mixed" | "risk_off";
  rationale: string;
  sources: Array<{
    id: "VIXCLS" | "DGS10" | "T10Y2Y";
    value: number;
    asOf: string;
    source: "fred";
  }>;
  tenYearChange20d: number;
  fetchedAt: string;
};

type SeriesId = MacroRegime["sources"][number]["id"];
type Observation = { date: string; value: number };

export function classifyMacro(
  vix: number,
  curve: number,
  yieldChange20d: number,
): MacroRegime["state"] {
  if (vix >= 25 || curve <= -0.25 || yieldChange20d >= 0.4) return "risk_off";
  if (vix < 20 && curve > 0 && yieldChange20d < 0.25) return "risk_on";
  return "mixed";
}

export class FredMacroProvider {
  private cache: { until: number; value: MacroRegime } | null = null;
  private pending: Promise<MacroRegime> | null = null;
  constructor(
    private readonly baseUrl = "https://fred.stlouisfed.org",
    private readonly fetcher: typeof fetch = globalThis.fetch,
  ) {}

  async getRegime(): Promise<MacroRegime> {
    if (this.cache && this.cache.until > Date.now()) return this.cache.value;
    this.pending ??= this.load().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async load(): Promise<MacroRegime> {
    const ids: SeriesId[] = ["VIXCLS", "DGS10", "T10Y2Y"];
    const results = await Promise.all(ids.map((id) => this.getSeries(id)));
    const [vixObservation, yieldObservation, curveObservation] = results.map((rows) => rows.at(-1));
    if (!vixObservation || !yieldObservation || !curveObservation)
      throw new MarketDataUnavailableError("Macro observations are incomplete.");
    const now = Date.now();
    for (const row of [vixObservation, yieldObservation, curveObservation]) {
      if (now - Date.parse(`${row.date}T00:00:00Z`) > 5 * 86_400_000)
        throw new MarketDataUnavailableError(
          "A macro source has not updated within five calendar days.",
        );
    }
    const tenYear = results[1];
    if (!tenYear || tenYear.length < 21)
      throw new MarketDataUnavailableError("Treasury yield history is incomplete.");
    const yieldChange20d = (tenYear.at(-1)?.value ?? 0) - (tenYear.at(-21)?.value ?? 0);
    const vix = vixObservation.value;
    const curve = curveObservation.value;
    const state = classifyMacro(vix, curve, yieldChange20d);
    const rationale =
      state === "risk_off"
        ? "Elevated volatility, an inverted yield curve, or a sharp monthly rise in the 10-year yield."
        : state === "risk_on"
          ? "Volatility below 20, a positive 10Y–2Y curve, and no sharp monthly rise in the 10-year yield."
          : "The volatility, curve, and yield-change signals do not agree on a directional regime.";
    const value: MacroRegime = {
      state,
      rationale,
      tenYearChange20d: Number(yieldChange20d.toFixed(3)),
      sources: [
        { id: "VIXCLS", value: vixObservation.value, asOf: vixObservation.date, source: "fred" },
        { id: "DGS10", value: yieldObservation.value, asOf: yieldObservation.date, source: "fred" },
        {
          id: "T10Y2Y",
          value: curveObservation.value,
          asOf: curveObservation.date,
          source: "fred",
        },
      ],
      fetchedAt: new Date().toISOString(),
    };
    this.cache = { until: Date.now() + 15 * 60_000, value };
    return value;
  }

  private async getSeries(id: SeriesId): Promise<Observation[]> {
    const start = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}/graph/fredgraph.csv?id=${id}&cosd=${start}`, {
        headers: { accept: "text/csv" },
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      throw new MarketDataUnavailableError(`FRED ${id} request failed.`);
    }
    if (!response.ok)
      throw new MarketDataUnavailableError(`FRED ${id} returned ${response.status}.`);
    const csv = await response.text();
    const rows = csv.trim().split(/\r?\n/);
    if (!rows[0]?.includes(id))
      throw new MarketDataUnavailableError(`FRED ${id} response is invalid.`);
    return rows.slice(1).flatMap((line) => {
      const [date, raw] = line.split(",");
      const value = Number(raw);
      return date && /^\d{4}-\d{2}-\d{2}$/.test(date) && raw !== "." && Number.isFinite(value)
        ? [{ date, value }]
        : [];
    });
  }
}

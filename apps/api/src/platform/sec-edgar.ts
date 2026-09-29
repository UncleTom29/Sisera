import type { RawItem } from "@sisera/intelligence";
import { z } from "zod";

const ITEM_DESCRIPTIONS: Record<string, string> = {
  "1.01": "entered a material agreement",
  "1.02": "terminated a material agreement",
  "1.03": "reported bankruptcy or receivership",
  "1.05": "disclosed a material cybersecurity incident",
  "2.01": "completed an acquisition or disposition",
  "2.02": "reported results of operations (earnings)",
  "2.03": "created a material financial obligation",
  "2.05": "announced exit or restructuring costs",
  "2.06": "recorded a material impairment",
  "3.01": "received a delisting or listing-standard notice",
  "3.02": "sold unregistered equity",
  "4.01": "changed its auditor",
  "4.02": "said prior financial statements should no longer be relied upon",
  "5.02": "reported a director or officer departure or appointment",
  "5.03": "amended its articles or bylaws",
  "5.07": "reported shareholder vote results",
  "7.01": "made a Regulation FD disclosure",
  "8.01": "reported other material events",
};
const FORM_TITLES: Record<string, string> = {
  "10-K": "filed its annual report (10-K)",
  "10-Q": "filed its quarterly report (10-Q)",
  "20-F": "filed its annual report (20-F)",
  "6-K": "furnished a foreign issuer report (6-K)",
  "S-1": "filed a registration statement (S-1)",
  "S-3": "filed a shelf registration (S-3)",
  "SC 13D": "received a 13D activist ownership filing",
  "SC 13G": "received a 13G ownership filing",
  "DEF 14A": "filed its proxy statement",
};
const RELEVANT_FORMS = new Set(["8-K", ...Object.keys(FORM_TITLES)]);

const Tickers = z.record(z.object({ cik_str: z.number(), ticker: z.string(), title: z.string() }));
const Submissions = z.object({
  name: z.string(),
  filings: z.object({
    recent: z.object({
      accessionNumber: z.array(z.string()),
      filingDate: z.array(z.string()),
      acceptanceDateTime: z.array(z.string()).optional(),
      form: z.array(z.string()),
      items: z.array(z.string()).optional(),
      primaryDocument: z.array(z.string()),
    }),
  }),
});

/**
 * SEC EDGAR filings for US-listed underlyings. Filings are the highest-certainty source Sisera
 * has: they are tagged as regulatory filings, so events they confirm are never shown as rumors.
 */
export class SecEdgarClient {
  private tickers: { until: number; value: Map<string, number> } | null = null;
  private readonly cache = new Map<string, { until: number; value: RawItem[] }>();

  constructor(
    private readonly userAgent: string,
    private readonly fetcher: typeof fetch = globalThis.fetch,
  ) {}

  private async cikFor(ticker: string): Promise<number | null> {
    if (!this.tickers || this.tickers.until < Date.now()) {
      const response = await this.fetcher("https://www.sec.gov/files/company_tickers.json", {
        headers: { "user-agent": this.userAgent, accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`SEC returned ${response.status}`);
      const parsed = Tickers.parse(await response.json());
      this.tickers = {
        until: Date.now() + 24 * 3_600_000,
        value: new Map(Object.values(parsed).map((row) => [row.ticker.toUpperCase(), row.cik_str])),
      };
    }
    return (
      this.tickers.value.get(ticker.toUpperCase().replace(".", "-")) ??
      this.tickers.value.get(ticker.toUpperCase()) ??
      null
    );
  }

  async filings(ticker: string, maxAgeDays = 30): Promise<RawItem[]> {
    const key = ticker.toUpperCase();
    const cached = this.cache.get(key);
    if (cached && cached.until > Date.now()) return cached.value;
    const cik = await this.cikFor(key);
    if (!cik) {
      this.cache.set(key, { until: Date.now() + 6 * 3_600_000, value: [] });
      return [];
    }
    const padded = String(cik).padStart(10, "0");
    const response = await this.fetcher(`https://data.sec.gov/submissions/CIK${padded}.json`, {
      headers: { "user-agent": this.userAgent, accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`SEC EDGAR returned ${response.status}`);
    const submissions = Submissions.parse(await response.json());
    const recent = submissions.filings.recent;
    const cutoff = Date.now() - maxAgeDays * 86_400_000;
    const items: RawItem[] = [];
    for (let index = 0; index < recent.form.length && items.length < 20; index++) {
      const form = recent.form[index] ?? "";
      if (!RELEVANT_FORMS.has(form)) continue;
      const acceptance = recent.acceptanceDateTime?.[index];
      const publishedAt = acceptance
        ? new Date(acceptance).toISOString()
        : `${recent.filingDate[index]}T12:00:00.000Z`;
      if (Date.parse(publishedAt) < cutoff) break;
      const accession = (recent.accessionNumber[index] ?? "").replaceAll("-", "");
      const codes = (recent.items?.[index] ?? "")
        .split(",")
        .map((code) => code.trim())
        .filter(Boolean);
      const described = codes.map((code) => ITEM_DESCRIPTIONS[code]).filter(Boolean);
      const action =
        form === "8-K"
          ? described.length
            ? described.join("; ")
            : "filed a current report (8-K)"
          : (FORM_TITLES[form] ?? `filed ${form}`);
      items.push({
        title: `${submissions.name} ${action}`,
        summary:
          form === "8-K" && codes.length ? `Form 8-K items ${codes.join(", ")}.` : `Form ${form}.`,
        url: `https://www.sec.gov/Archives/edgar/data/${cik}/${accession}/${recent.primaryDocument[index]}`,
        publishedAt,
        publisher: "SEC EDGAR",
        provider: "sec-edgar",
        kind: "filing",
      });
    }
    this.cache.set(key, { until: Date.now() + 15 * 60_000, value: items });
    if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value ?? "");
    return items;
  }
}

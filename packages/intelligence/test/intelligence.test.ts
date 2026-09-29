import { describe, expect, it } from "vitest";
import {
  type RawItem,
  type UniverseAsset,
  classifyItem,
  clusterEvents,
  explainMove,
  filterEvents,
  isUsableItem,
  sourceTier,
} from "../src/index.js";

const now = Date.parse("2026-09-29T12:00:00Z");
const universe: UniverseAsset[] = [
  { key: "AAPLx", symbol: "AAPLx", name: "Apple Inc.", kind: "public_equity", aliases: ["AAPL"] },
  { key: "OPENAI", symbol: "OPENAI", name: "OpenAI", kind: "pre_ipo" },
];
const item = (overrides: Partial<RawItem>): RawItem => ({
  title: "Apple beats estimates as iPhone revenue grows",
  summary: null,
  url: "https://www.reuters.com/technology/apple-results",
  publishedAt: "2026-09-29T10:00:00Z",
  publisher: "Reuters",
  provider: "gdelt",
  ...overrides,
});

describe("source tiers", () => {
  it("ranks regulators and issuers above press and aggregators", () => {
    expect(sourceTier(item({ url: "https://www.sec.gov/Archives/x" }))).toBe("regulatory_filing");
    expect(sourceTier(item({ kind: "announcement" }))).toBe("official");
    expect(sourceTier(item({}))).toBe("tier1_press");
    expect(sourceTier(item({ url: "https://news.google.com/rss/x", publisher: "Bloomberg" }))).toBe(
      "tier1_press",
    );
    expect(sourceTier(item({ url: "https://www.benzinga.com/x", publisher: "Benzinga" }))).toBe(
      "aggregator",
    );
  });
});

describe("classification", () => {
  it("maps categories, sentiment and assets", () => {
    const classified = classifyItem(item({}), universe);
    expect(classified.categories).toContain("earnings");
    expect(classified.sentiment).toBe("positive");
    expect(classified.assets[0]?.key).toBe("AAPLx");
    expect(classified.rumor).toBe(false);
  });

  it("flags rumors and caps their severity", () => {
    const classified = classifyItem(
      item({
        title: "OpenAI reportedly in talks over fraud probe settlement, people familiar say",
        url: "https://example.com/story",
        publisher: "Example",
      }),
      universe,
    );
    expect(classified.rumor).toBe(true);
    expect(classified.severity).not.toBe("critical");
    expect(classified.assets[0]?.key).toBe("OPENAI");
  });

  it("labels leadership changes and capital returns precisely", () => {
    expect(
      classifyItem(
        item({ title: "Nvidia's record buyback shows CEO Huang is confident" }),
        universe,
      ).categories,
    ).toEqual(["capital_return"]);
    expect(
      classifyItem(item({ title: "Apple CFO steps down after a decade" }), universe).categories,
    ).toContain("executive");
  });

  it("requires tickers to be upper case", () => {
    const classified = classifyItem(item({ title: "Why aapl fans love the aapl brand" }), [
      { key: "AAPLx", symbol: "AAPLx", name: "Zzzz", kind: "public_equity" },
    ]);
    expect(classified.assets).toHaveLength(0);
  });

  it("drops converter pages and stale items", () => {
    expect(isUsableItem(item({ title: "AAPL currency converter" }), now)).toBe(false);
    expect(isUsableItem(item({ publishedAt: "2026-01-01T00:00:00Z" }), now)).toBe(false);
    expect(isUsableItem(item({}), now)).toBe(true);
  });
});

describe("events", () => {
  it("corroborates across independent publishers and confirms with a filing", () => {
    const events = clusterEvents(
      [
        classifyItem(item({}), universe),
        classifyItem(
          item({
            title: "Apple beats estimates as iPhone revenue grows strongly",
            url: "https://www.cnbc.com/apple",
            publisher: "CNBC",
            publishedAt: "2026-09-29T10:30:00Z",
          }),
          universe,
        ),
      ],
      now,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.certainty).toBe("corroborated");
    expect(events[0]?.corroboration).toBe(2);

    const confirmed = clusterEvents(
      [
        classifyItem(item({}), universe),
        classifyItem(
          item({
            title: "Apple beats estimates as iPhone revenue grows (8-K)",
            url: "https://www.sec.gov/Archives/edgar/data/320193/x.htm",
            publisher: "SEC EDGAR",
            kind: "filing",
          }),
          universe,
        ),
      ],
      now,
    );
    expect(confirmed[0]?.certainty).toBe("confirmed");
  });

  it("keeps unrelated stories separate and explains moves without asserting causation", () => {
    const events = clusterEvents(
      [
        classifyItem(item({}), universe),
        classifyItem(
          item({
            title: "OpenAI launches new reasoning model",
            url: "https://techcrunch.com/openai",
            publisher: "TechCrunch",
          }),
          universe,
        ),
      ],
      now,
    );
    expect(events).toHaveLength(2);
    expect(filterEvents(events, { assetKey: "OPENAI" })).toHaveLength(1);
    const explanation = explainMove(universe[0] as UniverseAsset, 3.2, events, 24, now);
    expect(explanation.evidenceStrength).toBe("weak");
    expect(explanation.explanation[0]).toContain("up 3.20%");
  });
});

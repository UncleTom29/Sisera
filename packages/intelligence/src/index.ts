/**
 * Deterministic news and event intelligence. Every classification here is rule-based and
 * explainable: a source tier comes from the publisher, a category from matched keywords, and
 * certainty from how many independent sources report the same event. A rumor is never promoted
 * to the certainty of an official filing or announcement.
 */

export type RawItem = {
  title: string;
  summary: string | null;
  url: string;
  publishedAt: string;
  publisher: string;
  provider: string;
  /** Items from a regulator or the issuer are marked by the adapter that fetched them. */
  kind?: "news" | "filing" | "announcement" | "social" | "macro";
};

export type SourceTier =
  | "regulatory_filing"
  | "official"
  | "wire"
  | "tier1_press"
  | "press"
  | "aggregator"
  | "social"
  | "unknown";

export type EventCategory =
  | "earnings"
  | "guidance"
  | "product"
  | "fundraising"
  | "m_and_a"
  | "executive"
  | "legal"
  | "regulatory"
  | "government"
  | "macro"
  | "rates"
  | "analyst"
  | "partnership"
  | "security_incident"
  | "listing"
  | "capital_return"
  | "market_move"
  | "other";

export type Severity = "low" | "medium" | "high" | "critical";
export type Sentiment = "positive" | "negative" | "neutral" | "mixed";
export type Certainty =
  | "confirmed"
  | "corroborated"
  | "single_source"
  | "rumor"
  | "unverified_social";

export type UniverseAsset = {
  /** Stable Sisera key, e.g. the xStock symbol, PreStocks symbol or an agent token mint. */
  key: string;
  symbol: string;
  name: string;
  kind: "public_equity" | "pre_ipo" | "agent_token" | "crypto";
  /** Additional names or tickers that identify the asset in text. */
  aliases?: readonly string[];
  sector?: string | null;
};

export type AssetMatch = { key: string; symbol: string; relevance: number; via: string };

export type ClassifiedItem = RawItem & {
  id: string;
  domain: string;
  tier: SourceTier;
  categories: EventCategory[];
  primaryCategory: EventCategory;
  severity: Severity;
  sentiment: Sentiment;
  rumor: boolean;
  assets: AssetMatch[];
};

export type MarketEvent = {
  id: string;
  headline: string;
  primaryCategory: EventCategory;
  categories: EventCategory[];
  severity: Severity;
  sentiment: Sentiment;
  certainty: Certainty;
  /** Number of distinct publishers reporting the event. */
  corroboration: number;
  rumor: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  impactScore: number;
  assets: AssetMatch[];
  sources: Array<{
    publisher: string;
    domain: string;
    url: string;
    tier: SourceTier;
    publishedAt: string;
    provider: string;
    title: string;
  }>;
  /** Plain-language explanation of how certainty and severity were assigned. */
  basis: string[];
};

const REGULATORY_DOMAINS = [
  "sec.gov",
  "federalreserve.gov",
  "bls.gov",
  "treasury.gov",
  "fca.org.uk",
];
const WIRE_DOMAINS = ["businesswire.com", "prnewswire.com", "globenewswire.com", "accesswire.com"];
const TIER1_DOMAINS = [
  "reuters.com",
  "bloomberg.com",
  "wsj.com",
  "ft.com",
  "apnews.com",
  "cnbc.com",
  "nytimes.com",
  "theinformation.com",
  "economist.com",
  "washingtonpost.com",
];
const PRESS_DOMAINS = [
  "techcrunch.com",
  "theverge.com",
  "barrons.com",
  "marketwatch.com",
  "forbes.com",
  "businessinsider.com",
  "fortune.com",
  "axios.com",
  "semafor.com",
  "coindesk.com",
  "theblock.co",
  "decrypt.co",
  "cointelegraph.com",
  "finance.yahoo.com",
  "investors.com",
  "bbc.co.uk",
  "bbc.com",
  "cnn.com",
  "wired.com",
  "arstechnica.com",
  "seekingalpha.com",
  "thestreet.com",
];
const AGGREGATOR_DOMAINS = [
  "news.google.com",
  "bing.com",
  "msn.com",
  "finviz.com",
  "investing.com",
  "benzinga.com",
  "zacks.com",
  "fool.com",
  "stocktitan.net",
  "marketbeat.com",
  "tipranks.com",
  "gurufocus.com",
  "nasdaq.com",
];
const PUBLISHER_TIERS: Array<[RegExp, SourceTier]> = [
  [/\breuters\b/i, "tier1_press"],
  [/\bbloomberg\b/i, "tier1_press"],
  [/wall street journal|\bwsj\b/i, "tier1_press"],
  [/financial times|\bft\.com\b/i, "tier1_press"],
  [/associated press|\bap news\b/i, "tier1_press"],
  [/\bcnbc\b/i, "tier1_press"],
  [/new york times/i, "tier1_press"],
  [/the information/i, "tier1_press"],
  [/business wire|pr newswire|globenewswire|accesswire/i, "wire"],
  [
    /techcrunch|the verge|barron|marketwatch|forbes|business insider|fortune|axios|coindesk|the block|yahoo finance|decrypt|cointelegraph/i,
    "press",
  ],
  [/benzinga|zacks|motley fool|investing\.com|marketbeat|tipranks|msn/i, "aggregator"],
];

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

const matchesDomain = (domain: string, list: readonly string[]) =>
  list.some((candidate) => domain === candidate || domain.endsWith(`.${candidate}`));

export function sourceTier(item: RawItem, asset?: UniverseAsset): SourceTier {
  if (item.kind === "filing") return "regulatory_filing";
  if (item.kind === "announcement") return "official";
  if (item.kind === "social") return "social";
  const domain = domainOf(item.url);
  if (matchesDomain(domain, REGULATORY_DOMAINS)) return "regulatory_filing";
  if (matchesDomain(domain, WIRE_DOMAINS)) return "wire";
  if (asset && /^(ir|investors?|newsroom|press)\./.test(domain)) return "official";
  if (/^(ir|investors?)\./.test(domain)) return "official";
  if (matchesDomain(domain, ["x.com", "twitter.com", "reddit.com", "t.me", "discord.com"]))
    return "social";
  if (matchesDomain(domain, TIER1_DOMAINS)) return "tier1_press";
  if (matchesDomain(domain, PRESS_DOMAINS)) return "press";
  // RSS aggregators link through their own domain; fall back to the named publisher.
  const byPublisher = PUBLISHER_TIERS.find(([pattern]) => pattern.test(item.publisher));
  if (byPublisher) return byPublisher[1];
  if (matchesDomain(domain, AGGREGATOR_DOMAINS)) return "aggregator";
  return "unknown";
}

const CATEGORY_RULES: Array<[EventCategory, RegExp]> = [
  [
    "earnings",
    /\b(earnings|quarterly results|q[1-4] results|revenue (?:rose|fell|grew|beat|miss)|eps|profit (?:rose|fell)|net income|beats? estimates|miss(?:es|ed)? estimates|10-q|10-k)\b/i,
  ],
  [
    "guidance",
    /\b(guidance|outlook|forecast(?:s|ed)?|raises? (?:its )?(?:full-year )?view|cuts? (?:its )?(?:full-year )?view)\b/i,
  ],
  [
    "fundraising",
    /\b(raises? \$|funding round|series [a-h]\b|valuation of \$|valued at \$|tender offer|secondary sale|fundrais|ipo filing|files? for (?:an )?ipo|goes public|direct listing|share sale|convertible notes?)\b/i,
  ],
  [
    "m_and_a",
    /\b(acquir(?:e|es|ed|ing|ition)|merger|merge with|takeover|buyout|to buy\b|deal to buy|spin-?off|divest)\b/i,
  ],
  [
    "executive",
    /\b(steps? down|stepping down|resign(?:s|ed|ation)?|appoint(?:s|ed|ment)|names? (?:a )?new (?:ceo|cfo|coo|cto|chief|president|chair)|ousted|fired|succession|to succeed|departs?|departure of)\b/i,
  ],
  [
    "capital_return",
    /\b(buybacks?|share repurchases?|repurchase program|dividend|special dividend|stock split)\b/i,
  ],
  [
    "legal",
    /\b(lawsuit|sued|sues|court|judge|jury|settle(?:s|ment|d)|litigation|class action|indict|antitrust|verdict|injunction)\b/i,
  ],
  [
    "regulatory",
    /\b(sec\b|ftc\b|doj\b|cftc|regulator|regulatory|probe|investigation|subpoena|fine[sd]? \$|approval|approves|cleared by|fda|8-k|filing)\b/i,
  ],
  [
    "government",
    /\b(tariff|sanction|export control|white house|congress|senate|executive order|ban(?:s|ned)?\b|government|ministry|president (?:trump|biden))\b/i,
  ],
  [
    "rates",
    /\b(federal reserve|the fed\b|fomc|rate (?:cut|hike)|interest rates?|treasury yields?|bond yields?|powell)\b/i,
  ],
  [
    "macro",
    /\b(cpi|inflation|jobs report|nonfarm|payrolls|gdp|recession|unemployment|pce|pmi|consumer confidence|retail sales)\b/i,
  ],
  [
    "product",
    /\b(launch(?:es|ed)?|unveil(?:s|ed)?|release(?:s|d)?|announces? new|rollout|model|chip|iphone|feature|recall)\b/i,
  ],
  [
    "partnership",
    /\b(partner(?:s|ship)?|collaborat|teams up|contract with|agreement with|signs deal|supply deal)\b/i,
  ],
  [
    "analyst",
    /\b(upgrade[sd]?|downgrade[sd]?|price target|initiat(?:es|ed) coverage|overweight|underweight|outperform|underperform|buy rating|sell rating)\b/i,
  ],
  [
    "security_incident",
    /\b(hack(?:ed)?|breach|exploit|outage|cyberattack|ransomware|vulnerability|drained)\b/i,
  ],
  [
    "listing",
    /\b(delist|listing|listed on|index inclusion|s&p 500 (?:addition|inclusion)|halted|trading halt)\b/i,
  ],
  [
    "market_move",
    /\b(shares? (?:jump|surge|soar|plunge|tumble|slide|sink|fall|rise|rally)|stock (?:jumps|surges|soars|plunges|tumbles|slides|sinks|falls|rises)|all-time high|52-week)\b/i,
  ],
];

const RUMOR_PATTERN =
  /\b(reportedly|rumou?r(?:s|ed)?|sources? (?:say|said|familiar)|people familiar|according to (?:people|sources|a person)|in (?:early |advanced )?talks|considering|exploring (?:a )?(?:sale|options)|could|may be|weighs?|mulls?|speculat|unconfirmed|leak(?:ed|s)?|is said to)\b/i;

const POSITIVE =
  /\b(beat|beats|surge[sd]?|soar(?:s|ed)?|jump(?:s|ed)?|rall(?:y|ies|ied)|record|growth|grows|upgrade[sd]?|raises?|approv(?:al|ed|es)|wins?|won|expands?|strong|profit|outperform|partnership|breakthrough|bullish|higher)\b/gi;
const NEGATIVE =
  /\b(miss(?:es|ed)?|plunge[sd]?|tumble[sd]?|slump(?:s|ed)?|sink(?:s|ing)?|fall(?:s|ing)?|fell|drop(?:s|ped)?|downgrade[sd]?|cuts?|lawsuit|sued|probe|investigation|fine[sd]?|recall|layoffs?|resign(?:s|ed)?|loss(?:es)?|weak|warns?|warning|bankrupt|fraud|breach|hack(?:ed)?|halt(?:ed)?|delist|ban(?:s|ned)?|bearish|lower|default)\b/gi;
const CRITICAL_TERMS =
  /\b(bankrupt(?:cy)?|chapter 11|fraud|charged|indicted|trading halt|halted|delist(?:ed|ing)?|default(?:ed|s)?|drained|exploit(?:ed)?|insolven)/i;
const HIGH_TERMS =
  /\b(plunge[sd]?|soar(?:s|ed)?|surge[sd]?|recall|subpoena|probe|layoffs?|guidance cut|cuts? (?:its )?outlook|takeover|acquire[sd]?)\b/i;

const BASE_SEVERITY: Record<EventCategory, number> = {
  earnings: 2,
  guidance: 2,
  fundraising: 2,
  m_and_a: 3,
  executive: 2,
  legal: 2,
  regulatory: 2,
  government: 2,
  rates: 2,
  macro: 1,
  product: 1,
  partnership: 1,
  analyst: 1,
  security_incident: 3,
  listing: 2,
  capital_return: 1,
  market_move: 1,
  other: 0,
};
const SEVERITIES: readonly Severity[] = ["low", "medium", "high", "critical"];

function stableId(text: string): string {
  // FNV-1a keeps identifiers stable across processes without a crypto dependency.
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function categorize(text: string): EventCategory[] {
  const categories = CATEGORY_RULES.filter(([, pattern]) => pattern.test(text)).map(
    ([category]) => category,
  );
  return categories.length ? categories : ["other"];
}

export function detectRumor(text: string): boolean {
  return RUMOR_PATTERN.test(text);
}

export function scoreSentiment(text: string): Sentiment {
  const positive = text.match(POSITIVE)?.length ?? 0;
  const negative = text.match(NEGATIVE)?.length ?? 0;
  if (positive === 0 && negative === 0) return "neutral";
  if (positive > 0 && negative > 0 && Math.abs(positive - negative) <= 1) return "mixed";
  return positive > negative ? "positive" : "negative";
}

export function scoreSeverity(
  text: string,
  categories: readonly EventCategory[],
  tier: SourceTier,
  rumor: boolean,
): Severity {
  let level = Math.max(...categories.map((category) => BASE_SEVERITY[category]));
  if (CRITICAL_TERMS.test(text)) level = 3;
  else if (HIGH_TERMS.test(text)) level = Math.max(level, 2);
  if (tier === "aggregator" || tier === "unknown") level -= 1;
  // Unconfirmed reports cannot reach the critical level on their own.
  if (rumor || tier === "social") level = Math.min(level, 2);
  return SEVERITIES[Math.max(0, Math.min(3, level))] ?? "low";
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const STOP_TERMS = new Set([
  "the",
  "inc",
  "corp",
  "group",
  "holdings",
  "company",
  "technologies",
  "technology",
  "xstock",
  "class",
  "trust",
  "labs",
  "and",
  "fund",
]);

function assetTerms(
  asset: UniverseAsset,
): Array<{ term: string; weight: number; ticker: boolean }> {
  const terms: Array<{ term: string; weight: number; ticker: boolean }> = [];
  const name = asset.name
    .replace(
      /\b(?:incorporated|corporation|company|limited|inc|corp|ltd|plc|xstock|class [a-z])\b\.?/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  if (name.length >= 3 && !STOP_TERMS.has(name.toLowerCase()))
    terms.push({ term: name, weight: 1, ticker: false });
  for (const alias of asset.aliases ?? [])
    if (alias.length >= 2)
      terms.push({ term: alias, weight: 0.9, ticker: /^[A-Z.]{1,6}$/.test(alias) });
  const ticker = asset.symbol.replace(/x$/, "");
  if (/^[A-Z][A-Z.]{1,5}$/.test(ticker)) terms.push({ term: ticker, weight: 0.8, ticker: true });
  return terms;
}

/** Maps text onto the known asset universe. Tickers must appear in upper case or as a cashtag. */
export function mapAssets(
  title: string,
  summary: string | null,
  universe: readonly UniverseAsset[],
  pinned?: UniverseAsset,
): AssetMatch[] {
  const matches = new Map<string, AssetMatch>();
  const consider = (asset: UniverseAsset) => {
    for (const { term, weight, ticker } of assetTerms(asset)) {
      const pattern = ticker
        ? new RegExp(`(?:\\$|\\b)${escapeRegex(term)}\\b`)
        : new RegExp(`\\b${escapeRegex(term)}\\b`, "i");
      const inTitle = pattern.test(title);
      const inSummary = summary ? pattern.test(summary) : false;
      if (!inTitle && !inSummary) continue;
      const relevance = Math.min(1, weight * (inTitle ? 1 : 0.6));
      const existing = matches.get(asset.key);
      if (!existing || existing.relevance < relevance)
        matches.set(asset.key, { key: asset.key, symbol: asset.symbol, relevance, via: term });
    }
  };
  for (const asset of universe) consider(asset);
  if (pinned && !matches.has(pinned.key)) {
    consider(pinned);
    // Items fetched specifically for an asset keep a weak link even without a textual match.
    if (!matches.has(pinned.key))
      matches.set(pinned.key, {
        key: pinned.key,
        symbol: pinned.symbol,
        relevance: 0.3,
        via: "query",
      });
  }
  return [...matches.values()].sort((a, b) => b.relevance - a.relevance);
}

export function classifyItem(
  item: RawItem,
  universe: readonly UniverseAsset[] = [],
  pinned?: UniverseAsset,
): ClassifiedItem {
  const text = `${item.title} ${item.summary ?? ""}`;
  const tier = sourceTier(item, pinned);
  const categories =
    item.kind === "macro" ? (["macro", ...categorize(text)] as EventCategory[]) : categorize(text);
  const unique = [
    ...new Set(
      categories.filter((category, _index, all) => category !== "other" || all.length === 1),
    ),
  ];
  const rumor = tier !== "regulatory_filing" && tier !== "official" && detectRumor(text);
  return {
    ...item,
    id: stableId(item.url),
    domain: domainOf(item.url),
    tier,
    categories: unique,
    primaryCategory: unique[0] ?? "other",
    severity: scoreSeverity(text, unique, tier, rumor),
    sentiment: scoreSentiment(text),
    rumor,
    assets: mapAssets(item.title, item.summary, universe, pinned),
  };
}

const TITLE_STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "at",
  "by",
  "from",
  "as",
  "is",
  "are",
  "its",
  "it",
  "after",
  "over",
  "into",
  "new",
  "says",
  "said",
  "report",
  "reports",
  "stock",
  "shares",
  "inc",
  "corp",
]);

function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/\s[-|–—]\s[^-|–—]{2,40}$/, "") // strip trailing " - Publisher"
      .split(/[^a-z0-9$%]+/)
      .filter((token) => token.length >= 3 && !TITLE_STOPWORDS.has(token)),
  );
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  return shared / (left.size + right.size - shared);
}

const CERTAINTY_WEIGHT: Record<Certainty, number> = {
  confirmed: 1,
  corroborated: 0.85,
  single_source: 0.55,
  rumor: 0.35,
  unverified_social: 0.2,
};
const SEVERITY_WEIGHT: Record<Severity, number> = { low: 1, medium: 2, high: 4, critical: 7 };
const INDEPENDENT_TIERS: ReadonlySet<SourceTier> = new Set(["wire", "tier1_press", "press"]);

function assignCertainty(items: readonly ClassifiedItem[]): {
  certainty: Certainty;
  basis: string[];
} {
  const publishers = new Set(items.map((item) => item.domain || item.publisher.toLowerCase()));
  const official = items.find(
    (item) => item.tier === "regulatory_filing" || item.tier === "official",
  );
  if (official)
    return {
      certainty: "confirmed",
      basis: [
        `Confirmed by ${official.tier === "regulatory_filing" ? "a regulatory filing" : "an issuer announcement"} (${official.publisher}).`,
      ],
    };
  if (items.every((item) => item.tier === "social"))
    return {
      certainty: "unverified_social",
      basis: ["Only social posts report this; no publisher has confirmed it."],
    };
  const rumorShare = items.filter((item) => item.rumor).length / items.length;
  if (rumorShare >= 0.5)
    return {
      certainty: "rumor",
      basis: [
        `${Math.round(rumorShare * 100)}% of reports use unconfirmed language (reportedly, people familiar, in talks).`,
      ],
    };
  const independent = new Set(
    items
      .filter((item) => INDEPENDENT_TIERS.has(item.tier))
      .map((item) => item.domain || item.publisher.toLowerCase()),
  );
  if (independent.size >= 2)
    return {
      certainty: "corroborated",
      basis: [`Reported independently by ${independent.size} established publishers.`],
    };
  return {
    certainty: "single_source",
    basis: [
      `Reported by ${publishers.size} publisher${publishers.size === 1 ? "" : "s"} without independent confirmation.`,
    ],
  };
}

/**
 * Groups items that describe the same development and scores each event. Items join an event
 * when their titles overlap strongly, they were published within 48 hours of each other, and
 * they concern at least one common asset (or are both macro items).
 */
export function clusterEvents(items: readonly ClassifiedItem[], now = Date.now()): MarketEvent[] {
  const sorted = [...items].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
  const clusters: Array<{ items: ClassifiedItem[]; tokens: Set<string> }> = [];
  for (const item of sorted) {
    const tokens = titleTokens(item.title);
    const time = Date.parse(item.publishedAt);
    const keys = new Set(item.assets.map((asset) => asset.key));
    const cluster = clusters.find((candidate) => {
      const last = candidate.items.at(-1);
      if (!last || Math.abs(time - Date.parse(last.publishedAt)) > 48 * 3_600_000) return false;
      const sharesAsset =
        candidate.items.some((other) => other.assets.some((asset) => keys.has(asset.key))) ||
        (keys.size === 0 && candidate.items.every((other) => other.assets.length === 0));
      return sharesAsset && jaccard(tokens, candidate.tokens) >= 0.4;
    });
    if (cluster) {
      cluster.items.push(item);
      for (const token of tokens) cluster.tokens.add(token);
    } else clusters.push({ items: [item], tokens });
  }
  return clusters
    .map(({ items: members }) => {
      const { certainty, basis } = assignCertainty(members);
      const severityIndex = Math.max(...members.map((item) => SEVERITIES.indexOf(item.severity)));
      // Corroborated reports keep their severity; a lone rumor is capped at medium.
      let cappedIndex =
        certainty === "rumor" || certainty === "unverified_social"
          ? Math.min(severityIndex, 1)
          : severityIndex;
      // An event only loosely tied to any tracked asset cannot be rated high on that asset's behalf.
      const strongestLink = Math.max(
        0,
        ...members.flatMap((item) => item.assets.map((asset) => asset.relevance)),
      );
      const marketWide = members.some((item) => item.kind === "macro");
      if (!marketWide && strongestLink < 0.5) cappedIndex = Math.min(cappedIndex, 1);
      const severity = SEVERITIES[cappedIndex] ?? "low";
      const sentiments = new Set(
        members.map((item) => item.sentiment).filter((value) => value !== "neutral"),
      );
      const sentiment: Sentiment =
        sentiments.size === 0
          ? "neutral"
          : sentiments.size === 1
            ? ([...sentiments][0] as Sentiment)
            : "mixed";
      const categories = [...new Set(members.flatMap((item) => item.categories))];
      const assetMap = new Map<string, AssetMatch>();
      for (const member of members)
        for (const asset of member.assets) {
          const existing = assetMap.get(asset.key);
          if (!existing || existing.relevance < asset.relevance) assetMap.set(asset.key, asset);
        }
      const headlineItem =
        members.find((item) => item.tier === "regulatory_filing" || item.tier === "official") ??
        members.find((item) => item.tier === "tier1_press" || item.tier === "wire") ??
        members[0];
      const firstSeenAt = members[0]?.publishedAt ?? new Date(now).toISOString();
      const lastSeenAt = members.at(-1)?.publishedAt ?? firstSeenAt;
      const ageHours = Math.max(0, (now - Date.parse(lastSeenAt)) / 3_600_000);
      const recency = Math.exp(-ageHours / 24);
      const publishers = new Set(
        members.map((item) => item.domain || item.publisher.toLowerCase()),
      );
      const impactScore =
        Math.round(
          SEVERITY_WEIGHT[severity] *
            CERTAINTY_WEIGHT[certainty] *
            (0.35 + 0.65 * recency) *
            (1 + Math.min(publishers.size - 1, 4) * 0.1) *
            100,
        ) / 100;
      basis.push(
        `Severity ${severity}: ${categories.join(", ")}${members.some((item) => CRITICAL_TERMS.test(item.title)) ? " with critical language" : ""}.`,
      );
      return {
        id: stableId(
          members
            .map((item) => item.id)
            .sort()
            .join("|"),
        ),
        headline: headlineItem?.title ?? "",
        primaryCategory: headlineItem?.primaryCategory ?? "other",
        categories,
        severity,
        sentiment,
        certainty,
        corroboration: publishers.size,
        rumor: certainty === "rumor",
        firstSeenAt,
        lastSeenAt,
        impactScore,
        assets: [...assetMap.values()].sort((a, b) => b.relevance - a.relevance),
        sources: members.map((item) => ({
          publisher: item.publisher,
          domain: item.domain,
          url: item.url,
          tier: item.tier,
          publishedAt: item.publishedAt,
          provider: item.provider,
          title: item.title,
        })),
        basis,
      } satisfies MarketEvent;
    })
    .sort((a, b) => b.impactScore - a.impactScore || b.lastSeenAt.localeCompare(a.lastSeenAt));
}

/** Drops items that are clearly not company intelligence or are outside the lookback window. */
export function isUsableItem(item: RawItem, now = Date.now(), maxAgeDays = 14): boolean {
  const published = Date.parse(item.publishedAt);
  if (!Number.isFinite(published) || published > now + 5 * 60_000) return false;
  if (now - published > maxAgeDays * 86_400_000) return false;
  return !/\b(currency converter|exchange rate|usd to|price prediction|live price chart|token price today|how to buy)\b/i.test(
    `${item.title} ${item.url}`,
  );
}

export function dedupeByUrl<T extends { url: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.url.replace(/[?#].*$/, "").replace(/\/$/, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type EventFilter = {
  assetKey?: string;
  minSeverity?: Severity;
  sentiment?: Sentiment;
  since?: string;
  excludeRumors?: boolean;
};

export function filterEvents(events: readonly MarketEvent[], filter: EventFilter): MarketEvent[] {
  const minimum = filter.minSeverity ? SEVERITIES.indexOf(filter.minSeverity) : 0;
  return events.filter(
    (event) =>
      SEVERITIES.indexOf(event.severity) >= minimum &&
      (!filter.assetKey || event.assets.some((asset) => asset.key === filter.assetKey)) &&
      (!filter.sentiment || event.sentiment === filter.sentiment) &&
      (!filter.since || event.lastSeenAt >= filter.since) &&
      (!filter.excludeRumors ||
        (event.certainty !== "rumor" && event.certainty !== "unverified_social")),
  );
}

export function severityAtLeast(severity: Severity, minimum: Severity): boolean {
  return SEVERITIES.indexOf(severity) >= SEVERITIES.indexOf(minimum);
}

export type PriceMove = {
  key: string;
  symbol: string;
  changePct: number | null;
  windowLabel: string;
};

/**
 * Answers "what changed": new or updated events since a point in time, joined with any price
 * moves for the assets they touch. The explanation never asserts causation; it lists coincident
 * evidence so the reader can judge.
 */
export function summarizeChanges(
  events: readonly MarketEvent[],
  since: string,
  moves: readonly PriceMove[] = [],
) {
  const recent = events.filter((event) => event.lastSeenAt >= since);
  const moveByKey = new Map(moves.map((move) => [move.key, move]));
  return {
    since,
    eventCount: recent.length,
    highSeverity: recent.filter((event) => severityAtLeast(event.severity, "high")).length,
    events: recent.slice(0, 25).map((event) => ({
      ...event,
      coincidentMoves: event.assets
        .map((asset) => moveByKey.get(asset.key))
        .filter((move): move is PriceMove => Boolean(move && move.changePct != null)),
    })),
    largestMoves: [...moves]
      .filter((move) => move.changePct != null)
      .sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0))
      .slice(0, 10),
  };
}

/** Explains a price move from events concerning the asset, strongest evidence first. */
export function explainMove(
  asset: Pick<UniverseAsset, "key" | "symbol" | "name">,
  changePct: number | null,
  events: readonly MarketEvent[],
  windowHours = 24,
  now = Date.now(),
) {
  const since = new Date(now - windowHours * 3_600_000).toISOString();
  const relevant = filterEvents(events, { assetKey: asset.key, since });
  const direction = changePct == null ? null : changePct >= 0 ? "positive" : "negative";
  const aligned = relevant.filter((event) => direction && event.sentiment === direction);
  const lines: string[] = [];
  if (changePct == null)
    lines.push(`No reliable ${windowHours}h price change is available for ${asset.symbol}.`);
  else
    lines.push(
      `${asset.symbol} is ${changePct >= 0 ? "up" : "down"} ${Math.abs(changePct).toFixed(2)}% over ${windowHours}h.`,
    );
  if (!relevant.length)
    lines.push(
      "No classified news or filings about this asset appeared in the window; the move may reflect flows, sector moves or macro conditions.",
    );
  for (const event of (aligned.length ? aligned : relevant).slice(0, 3))
    lines.push(
      `${event.certainty === "confirmed" ? "Confirmed" : event.certainty === "corroborated" ? "Corroborated" : event.certainty === "rumor" ? "Unconfirmed report" : event.certainty === "unverified_social" ? "Unverified social post" : "Single-source report"} (${event.severity}, ${event.sentiment}): ${event.headline}`,
    );
  if (relevant.length && !aligned.length && direction)
    lines.push(
      "None of the events points in the same direction as the move, so they are unlikely to be the full explanation.",
    );
  return {
    asset: asset.symbol,
    changePct,
    windowHours,
    candidates: (aligned.length ? aligned : relevant).slice(0, 5),
    explanation: lines,
    evidenceStrength: aligned.some(
      (event) => event.certainty === "confirmed" || event.certainty === "corroborated",
    )
      ? ("strong" as const)
      : aligned.length
        ? ("weak" as const)
        : ("none" as const),
  };
}

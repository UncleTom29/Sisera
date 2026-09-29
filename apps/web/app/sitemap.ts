import type { MetadataRoute } from "next";
import { getPredictionMarkets, getPrivateMarkets, getPublicStocks } from "../lib/api";
import { publicPages, site } from "../lib/site";

export const revalidate = 3600;

const marketSections = [
  "/stocks",
  "/private-markets",
  "/markets",
  "/terminal?venue=hyperliquid",
  "/predictions",
  "/intelligence",
  "/macro",
  "/clawpump",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();
  const [stocks, privateMarkets, predictions] = await Promise.all([
    getPublicStocks({}).catch(() => []),
    getPrivateMarkets({}).catch(() => []),
    getPredictionMarkets({}, { limit: 500, sort: "volume" })
      .then((page) => page.data)
      .catch(() => []),
  ]);
  return [
    ...publicPages.map((page) => ({
      url: `${site.url}${page.path === "/" ? "" : page.path}`,
      lastModified,
      changeFrequency: page.changeFrequency,
      priority: page.priority,
    })),
    ...marketSections.map((path) => ({
      url: `${site.url}${path}`,
      lastModified,
      changeFrequency: "hourly" as const,
      priority: 0.8,
    })),
    ...stocks
      .filter((stock) => stock.dexPriceUsd != null)
      .map((stock) => ({
        url: `${site.url}/stocks/${encodeURIComponent(stock.symbol)}`,
        lastModified,
        changeFrequency: "hourly" as const,
        priority: 0.7,
      })),
    ...privateMarkets.map((market) => ({
      url: `${site.url}/private-markets/${encodeURIComponent(market.instrument.baseAsset)}`,
      lastModified,
      changeFrequency: "hourly" as const,
      priority: 0.7,
    })),
    ...predictions.map((market) => ({
      url: `${site.url}/predictions/${encodeURIComponent(market.id)}`,
      lastModified,
      changeFrequency: "hourly" as const,
      priority: 0.5,
    })),
    { url: `${site.url}/llms.txt`, lastModified, changeFrequency: "monthly", priority: 0.2 },
  ];
}

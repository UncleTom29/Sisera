import { describe, expect, it } from "vitest";
import { FredMacroProvider, MarketDataUnavailableError, classifyMacro } from "../src/index.js";

const today = new Date().toISOString().slice(0, 10);
const history = Array.from({ length: 25 }, (_, index) => {
  const date = new Date(Date.now() - (24 - index) * 86_400_000).toISOString().slice(0, 10);
  return { date, value: 4 + index * 0.001 };
});
const csv = (id: string) =>
  `DATE,${id}\n${(id === "DGS10" ? history : [{ date: today, value: id === "VIXCLS" ? 18 : 0.5 }]).map(({ date, value }) => `${date},${value}`).join("\n")}`;

describe("FRED macro regime", () => {
  it("classifies fresh public series and retains source dates", async () => {
    const fetcher = async (url: string | URL | Request) => {
      const id = new URL(String(url)).searchParams.get("id") ?? "";
      return new Response(csv(id), { status: 200 });
    };
    const regime = await new FredMacroProvider(
      "https://fred.test",
      fetcher as typeof fetch,
    ).getRegime();
    expect(regime.state).toBe("risk_on");
    expect(regime.sources).toHaveLength(3);
    expect(regime.tenYearChange20d).toBeCloseTo(0.02);
  });

  it("rejects stale observations", async () => {
    const fetcher = async (url: string | URL | Request) => {
      const id = new URL(String(url)).searchParams.get("id") ?? "";
      return new Response(csv(id).replaceAll(today, "2020-01-01"), { status: 200 });
    };
    await expect(
      new FredMacroProvider("https://fred.test", fetcher as typeof fetch).getRegime(),
    ).rejects.toBeInstanceOf(MarketDataUnavailableError);
  });

  it("uses explicit risk thresholds", () => {
    expect(classifyMacro(27, 0.5, 0)).toBe("risk_off");
    expect(classifyMacro(18, 0.5, 0)).toBe("risk_on");
    expect(classifyMacro(22, 0.5, 0)).toBe("mixed");
  });
});

import { Boxes, CircleAlert, Search } from "lucide-react";
import { auth } from "../../../auth";
import { LiveRefresh } from "../../../components/live-refresh";
import { PageHeader } from "../../../components/page-header";
import { accountErrorMessage, searchClawpump } from "../../../lib/api";

export const dynamic = "force-dynamic";

export default async function ClawpumpMarkets({
  searchParams,
}: { searchParams: Promise<{ query?: string }> }) {
  const { query: rawQuery } = await searchParams;
  const query = (rawQuery ?? "stock").trim().slice(0, 80);
  const session = await auth();
  const identity = {
    accessToken: session?.accessToken,
    localOperator: process.env.SISERA_LOCAL_OPERATOR_MODE === "true",
  };
  const response =
    query.length >= 2
      ? await searchClawpump(query, identity).then(
          (value) => ({ value, error: null as unknown }),
          (error: unknown) => ({ value: null, error }),
        )
      : { value: null, error: null };
  const result = response.value;
  const tokens = result?.data.tokens ?? [];

  return (
    <div className="min-h-full bg-ink">
      <PageHeader
        eyebrow="Agent assets"
        title="Agent markets"
        description="Discover tokens tied to trading agents, explore their activity and inspect each asset before making a decision."
        actions={<LiveRefresh />}
      />
      <div className="space-y-5 p-4 md:p-6">
        <form action="/clawpump" className="flex max-w-2xl gap-2">
          <label className="flex flex-1 items-center gap-3 rounded-md border border-line bg-panel px-3 text-slate-400">
            <Search size={16} />
            <span className="sr-only">Search agent tokens</span>
            <input
              name="query"
              defaultValue={query}
              minLength={2}
              maxLength={80}
              className="h-11 w-full bg-transparent text-sm text-white outline-none"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-cyan-300 px-5 text-xs font-semibold text-[#14202a]"
          >
            Search
          </button>
        </form>
        <div className="flex flex-wrap gap-2 text-xs text-slate-400">
          <span>Try:</span>
          {["stock", "agent", "AAPL", "TSLA"].map((term) => (
            <a
              key={term}
              href={`/clawpump?query=${term}`}
              className="rounded border border-line px-2 py-1 hover:text-white"
            >
              {term}
            </a>
          ))}
        </div>
        {result ? (
          <section className="overflow-x-auto rounded-lg border border-line bg-panel">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div className="flex items-center gap-2">
                <Boxes size={16} className="text-cyan-300" />
                <h2 className="text-sm font-semibold text-white">Search results</h2>
              </div>
              <span className="font-mono text-[10px] text-slate-500">{tokens.length} assets</span>
            </div>
            <table className="w-full min-w-[660px] text-left text-xs">
              <thead className="border-b border-line font-mono text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Asset</th>
                  <th className="px-5 py-3 font-medium">Mint</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Market data</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((token, index) => (
                  <tr
                    key={`${token.mint ?? token.address ?? token.symbol}-${index}`}
                    className="border-b border-line/70 last:border-0"
                  >
                    <td className="px-5 py-3">
                      <div className="font-semibold text-slate-100">{token.name}</div>
                      <div className="font-mono text-[10px] text-slate-500">{token.symbol}</div>
                    </td>
                    <td className="px-5 py-3 font-mono text-slate-400">
                      {token.mint ?? token.address ?? "Not supplied"}
                    </td>
                    <td className="px-5 py-3 text-slate-400">
                      {token.verified ? "Verified" : "Check details"}
                    </td>
                    <td className="px-5 py-3">
                      {token.price != null ? (
                        <span className="text-slate-200">
                          ${Number(token.price).toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-slate-500">Price pending</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!tokens.length && (
              <p className="p-5 text-sm text-slate-400">
                No assets match this search. Try “agent”, “stock” or a company symbol above.
              </p>
            )}
          </section>
        ) : (
          <div className="flex max-w-2xl gap-3 rounded-lg border border-amber-500/20 bg-amber-500/[.05] p-5">
            <CircleAlert size={17} className="shrink-0 text-amber-300" />
            <div>
              <p className="text-sm text-white">Agent markets are reconnecting</p>
              <p className="mt-1 text-xs text-slate-400">
                {response.error
                  ? accountErrorMessage(response.error)
                  : "Enter at least two characters to search."}{" "}
                Try another search or explore stock markets while new results arrive.
              </p>
            </div>
          </div>
        )}
        <p className="max-w-3xl text-xs leading-5 text-slate-500">
          Agent tokens can be volatile. Review the creator, token address and available liquidity
          before trading.
        </p>
      </div>
    </div>
  );
}

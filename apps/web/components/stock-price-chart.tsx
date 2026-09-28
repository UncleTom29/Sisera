import type { TokenHistoryPoint } from "../lib/api";

const usd = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);

export function StockPriceChart({
  history,
  current,
  currentAt,
  token,
  scope = "Solana token trading",
}: {
  history: TokenHistoryPoint[];
  current: number | null;
  currentAt: string | null;
  token: string;
  scope?: string;
}) {
  const closes = history
    .filter((item) => Number.isFinite(item.close) && item.close > 0)
    .map((item) => ({ time: Date.parse(item.time), value: item.close }));
  const points =
    current && current > 0 && currentAt && Date.parse(currentAt) > (closes.at(-1)?.time ?? 0)
      ? [...closes, { time: Date.parse(currentAt), value: current }]
      : closes;
  if (points.length < 2) {
    return (
      <div className="rounded-lg border border-line bg-panel p-6">
        <p className="text-sm font-semibold text-white">{token} price</p>
        <p className="mt-3 font-mono text-3xl text-white">
          {current == null ? "Price history unavailable" : usd(current)}
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Current token price. A historical chart will appear when market history is available.
        </p>
      </div>
    );
  }
  const min = Math.min(...points.map((item) => item.value));
  const max = Math.max(...points.map((item) => item.value));
  const spread = Math.max(max - min, max * 0.01);
  const start = points[0]?.time ?? 0;
  const end = points.at(-1)?.time ?? start + 1;
  const x = (time: number) => 36 + ((time - start) / Math.max(end - start, 1)) * 722;
  const y = (value: number) => 230 - ((value - min) / spread) * 190;
  const line = points
    .map(
      (item, index) => `${index ? "L" : "M"}${x(item.time).toFixed(1)},${y(item.value).toFixed(1)}`,
    )
    .join(" ");
  const latest = points.at(-1) ?? { time: Date.now(), value: current ?? 0 };
  const first = points[0] ?? latest;
  const change = (latest.value / first.value - 1) * 100;
  return (
    <section className="rounded-lg border border-line bg-panel p-5 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{token} token price</p>
          <p className="mt-1 text-xs text-slate-400">{scope}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-xl text-white">{usd(latest.value)}</p>
          <p className={`font-mono text-xs ${change >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
            {change > 0 ? "+" : ""}
            {change.toFixed(2)}% over this chart
          </p>
        </div>
      </div>
      <svg
        viewBox="0 0 800 270"
        role="img"
        aria-label={`${token} price from ${usd(first.value)} to ${usd(latest.value)}`}
        className="mt-5 h-auto w-full"
      >
        {[0, 1, 2, 3].map((step) => (
          <g key={step}>
            <line
              x1="36"
              x2="758"
              y1={40 + step * 63}
              y2={40 + step * 63}
              stroke="#293945"
              strokeWidth="1"
            />
            <text x="766" y={44 + step * 63} fill="#94a3b8" fontSize="11">
              {usd(max - (step / 3) * spread)}
            </text>
          </g>
        ))}
        <path
          d={line}
          fill="none"
          stroke="#e9bd8c"
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={x(latest.time)} cy={y(latest.value)} r="4" fill="#e9bd8c" />
      </svg>
      <div className="flex justify-between text-[11px] text-slate-500">
        <span>{new Date(start).toLocaleDateString()}</span>
        <span>{new Date(end).toLocaleDateString()}</span>
      </div>
      <p className="mt-3 text-[11px] text-slate-500">
        Latest point:{" "}
        {currentAt && Date.parse(currentAt) > end
          ? new Date(currentAt).toLocaleString()
          : new Date(end).toLocaleString()}
        . The price available when you trade may differ.
      </p>
    </section>
  );
}

export function PrivatePriceComparison({
  token,
  mark,
  company,
}: { token: number; mark: number; company: string }) {
  const max = Math.max(token, mark, 1);
  const gap = mark > 0 ? (token / mark - 1) * 100 : null;
  return (
    <section className="rounded-lg border border-line bg-panel p-5 md:p-6">
      <h2 className="text-base font-semibold text-white">How {company} trades against its mark</h2>
      <p className="mt-2 text-xs text-slate-400">
        Current token price and issuer mark. These are two different measures, not a historical
        trend.
      </p>
      <div className="mt-7 space-y-5">
        {(
          [
            ["Token price", token, "bg-bronze-300"],
            ["Issuer mark", mark, "bg-slate-500"],
          ] as const
        ).map(([label, value, color]) => (
          <div key={label}>
            <div className="mb-2 flex justify-between text-xs">
              <span className="text-slate-300">{label}</span>
              <span className="font-mono text-white">{usd(value)}</span>
            </div>
            <div className="h-4 rounded bg-ink">
              <div
                className={`h-4 rounded ${color}`}
                style={{ width: `${Math.max(2, (value / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-6 text-sm text-slate-300">
        {gap == null
          ? "A comparable issuer mark is unavailable."
          : gap >= 0
            ? `The token trades ${gap.toFixed(1)}% above the issuer mark.`
            : `The token trades ${Math.abs(gap).toFixed(1)}% below the issuer mark.`}
      </p>
      <p className="mt-2 text-xs text-slate-500">
        A gap may reflect liquidity, transfer rights, fees, or the mark's timing. Check the trading
        route before acting.
      </p>
    </section>
  );
}

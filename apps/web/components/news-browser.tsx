"use client";

import { useMemo, useState } from "react";
import type { StockNewsItem } from "../lib/api";

type Article = StockNewsItem & { company: string };

export function NewsBrowser({ articles }: { articles: Article[] }) {
  const [company, setCompany] = useState("all");
  const [period, setPeriod] = useState("7d");
  const [query, setQuery] = useState("");
  const companies = useMemo(
    () => [...new Set(articles.map((item) => item.company))].sort(),
    [articles],
  );
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const cutoff =
      Date.now() -
      (period === "24h" ? 86_400_000 : period === "7d" ? 7 * 86_400_000 : 14 * 86_400_000);
    return articles
      .filter((item) => company === "all" || item.company === company)
      .filter((item) => Date.parse(item.publishedAt) >= cutoff)
      .filter(
        (item) =>
          !needle ||
          `${item.title} ${item.summary ?? ""} ${item.company}`.toLowerCase().includes(needle),
      )
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  }, [articles, company, period, query]);
  return (
    <div>
      <div className="grid gap-2 border-b border-line p-4 sm:grid-cols-[1fr_auto_auto]">
        <input
          aria-label="Search news"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search headlines"
          className="h-9 rounded border border-line bg-ink px-3 text-xs text-white outline-none focus:border-bronze-300"
        />
        <select
          aria-label="Filter news by company"
          value={company}
          onChange={(event) => setCompany(event.target.value)}
          className="h-9 rounded border border-line bg-ink px-2 text-xs text-white"
        >
          <option value="all">All companies</option>
          {companies.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter news by time"
          value={period}
          onChange={(event) => setPeriod(event.target.value)}
          className="h-9 rounded border border-line bg-ink px-2 text-xs text-white"
        >
          <option value="24h">Past 24 hours</option>
          <option value="7d">Past 7 days</option>
          <option value="14d">Past 14 days</option>
        </select>
      </div>
      {visible.length ? (
        <div className="divide-y divide-line">
          {visible.map((article) => (
            <a
              key={`${article.url}:${article.company}`}
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-5 py-4 hover:bg-white/[.025]"
            >
              <p className="text-xs font-medium leading-5 text-slate-100">{article.title}</p>
              {article.summary && (
                <p className="mt-1 line-clamp-2 text-xs text-slate-400">{article.summary}</p>
              )}
              <p className="mt-2 text-[10px] text-slate-500">
                {article.company} · {article.publisher} ·{" "}
                {new Date(article.publishedAt).toLocaleString()}
              </p>
            </a>
          ))}
        </div>
      ) : (
        <p className="p-5 text-sm text-slate-400">
          No headlines match these filters. Try a wider time range or another company.
        </p>
      )}
      <p className="border-t border-line px-5 py-3 text-[10px] text-slate-500">
        {visible.length} of {articles.length} headlines
      </p>
    </div>
  );
}

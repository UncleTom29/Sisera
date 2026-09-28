"use client";

import { type ReactNode, useState } from "react";

/** Underline tabs for the lower half of an asset page. Every panel is server-rendered up front. */
export function AssetTabs({
  tabs,
}: { tabs: Array<{ id: string; label: string; panel: ReactNode }> }) {
  const [active, setActive] = useState(tabs[0]?.id);
  return (
    <section className="border border-line bg-panel">
      <div role="tablist" className="hide-scrollbar flex overflow-x-auto border-b border-line">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={active === tab.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => setActive(tab.id)}
            className={`shrink-0 border-b-2 px-5 py-3.5 text-[13px] transition-colors ${
              active === tab.id
                ? "border-bronze-300 text-bone"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`panel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          hidden={active !== tab.id}
        >
          {tab.panel}
        </div>
      ))}
    </section>
  );
}

import type { ReactNode } from "react";
import { site } from "../lib/site";
import { SiteFooter, SiteHeader } from "./site-chrome";
import { StructuredData, breadcrumbSchema } from "./structured-data";

/** Long-form public page: about, legal, and brand pages share this reading layout. */
export function ProsePage({
  eyebrow,
  title,
  intro,
  path,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  path: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-ink-deep text-bone">
      <StructuredData
        data={breadcrumbSchema([
          { name: site.name, path: "/" },
          { name: title, path },
        ])}
      />
      <SiteHeader />
      <header className="border-b border-line">
        <div className="mx-auto max-w-[1320px] px-4 pb-14 pt-16 md:px-8 md:pt-24">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="display mt-5 max-w-4xl text-[clamp(2.5rem,5vw,4.5rem)] leading-[1.02]">
            {title}
          </h1>
          <p className="mt-6 max-w-2xl text-[17px] leading-8 text-slate-300">{intro}</p>
          {updated && (
            <p className="mt-6 font-mono text-[11px] text-slate-400">Last updated {updated}</p>
          )}
        </div>
      </header>
      <article className="prose-sisera mx-auto max-w-[1320px] px-4 py-16 md:px-8">
        <div className="max-w-3xl">{children}</div>
      </article>
      <SiteFooter />
    </main>
  );
}

export function ContactLine() {
  return site.contactEmail ? (
    <p>
      Questions? Email{" "}
      <a
        href={`mailto:${site.contactEmail}`}
        className="text-bronze-300 underline underline-offset-4"
      >
        {site.contactEmail}
      </a>
      .
    </p>
  ) : null;
}

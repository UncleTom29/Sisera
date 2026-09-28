import { Download } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { ProsePage } from "../../components/prose-page";
import ribbon from "../../public/brand/sisera-signal.png";

export const metadata: Metadata = {
  title: "Brand & press kit",
  description: "Sisera logos, colours, typography, and imagery for press and partners.",
  alternates: { canonical: "/brand" },
};

const colors = [
  ["Ink", "#0C141B", "Backgrounds and type on light surfaces"],
  ["Bone", "#F2F0E9", "Primary type and light sections"],
  ["Bronze", "#E9BD8C", "Brand accent, primary actions"],
  ["Deep bronze", "#B77D4E", "Accent on light surfaces"],
  ["Verdigris", "#78B9AD", "Logo and illustration only"],
  ["Line", "#2A3943", "Hairlines and dividers"],
] as const;

const downloads = [
  ["Mark, colour (SVG)", "/brand/sisera-mark.svg"],
  ["Mark, bone (SVG)", "/brand/sisera-mark-bone.svg"],
  ["Mark, ink (SVG)", "/brand/sisera-mark-ink.svg"],
  ["Horizontal logo, dark (PNG)", "/brand/assets/logo-horizontal-dark.png"],
  ["Horizontal logo, light (PNG)", "/brand/assets/logo-horizontal-light.png"],
  ["Stacked logo (PNG)", "/brand/assets/logo-stacked-dark.png"],
  ["Social avatar 400×400 (PNG)", "/brand/assets/avatar.png"],
  ["X header 1500×500 (PNG)", "/brand/assets/x-header.png"],
  ["Link preview 1200×630 (PNG)", "/opengraph-image"],
  ["Bronze ribbon key art (PNG)", "/brand/sisera-signal.png"],
] as const;

export default function BrandPage() {
  return (
    <ProsePage
      eyebrow="Brand & press kit"
      title="Ink, bone, and bronze."
      intro="Everything you need to write about or link to Sisera. Please keep the mark unaltered, give it clear space, and never place it on a gradient."
      path="/brand"
    >
      <h2>Downloads</h2>
      <div className="not-prose mt-6 grid gap-px border border-line bg-line sm:grid-cols-2">
        {downloads.map(([label, href]) => (
          <a
            key={href}
            href={href}
            download
            className="flex items-center justify-between gap-4 bg-ink px-5 py-4 text-[14px] text-bone no-underline hover:bg-panel"
          >
            {label}
            <Download size={15} className="shrink-0 text-bronze-300" />
          </a>
        ))}
      </div>

      <h2>Colour</h2>
      <p>
        Flat colour only. No gradients, glows, or blurred shapes. Green and red are reserved for
        price moves and never used as brand colours.
      </p>
      <div className="mt-6 grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
        {colors.map(([name, hex, use]) => (
          <div key={hex} className="bg-ink p-4">
            <div className="h-16 border border-line" style={{ background: hex }} />
            <p className="mt-3 text-[14px] font-semibold text-bone">{name}</p>
            <p className="font-mono text-[12px] text-slate-400">{hex}</p>
            <p className="mt-1 text-[12px] text-slate-400">{use}</p>
          </div>
        ))}
      </div>

      <h2>Typography</h2>
      <div className="mt-6 grid gap-px border border-line bg-line">
        <div className="bg-ink p-6">
          <p className="display text-5xl text-bone">Newsreader</p>
          <p className="mt-2 font-mono text-[12px] text-slate-400">
            Display · headlines and figures
          </p>
        </div>
        <div className="bg-ink p-6">
          <p className="text-4xl font-medium text-bone">Schibsted Grotesk</p>
          <p className="mt-2 font-mono text-[12px] text-slate-400">
            Interface · body and navigation
          </p>
        </div>
        <div className="bg-ink p-6">
          <p className="font-mono text-4xl text-bone">Commit Mono 0123456789</p>
          <p className="mt-2 font-mono text-[12px] text-slate-400">
            Data · prices, symbols, labels
          </p>
        </div>
      </div>

      <h2>Imagery</h2>
      <p>
        Sculpted bronze and verdigris objects, photographed on flat ink under a single soft light,
        with generous empty space. No people, screens, coins with logos, or rocket imagery.
      </p>
      <Image
        src={ribbon}
        alt="Sisera bronze ribbon key art"
        className="mt-6 h-auto w-full border border-line"
        sizes="(min-width: 768px) 768px, 100vw"
      />

      <h2>Describing Sisera</h2>
      <p>
        <strong className="text-bone">Short:</strong> Sisera is a research terminal for tokenized
        stocks and private markets.
      </p>
      <p>
        <strong className="text-bone">Long:</strong> Sisera puts a token's price beside the
        underlying share or issuer mark, company news, and your portfolio, so traders can see why a
        price moved before they trade. It covers tokenized stocks on Solana, pre-IPO company tokens,
        crypto spot and perpetuals, and prediction markets, with rule-bound research agents.
      </p>
      <p>Write the name as “Sisera”, with a capital S, and the wordmark as “SISERA”.</p>
    </ProsePage>
  );
}

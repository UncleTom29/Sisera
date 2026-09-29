import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";
import type { ReactElement } from "react";
import { Mark, brandColors as c, ogFonts, ribbonDataUrl } from "../../../../lib/og";

export const dynamic = "force-static";

type Asset = { width: number; height: number; render: (ribbon: string) => ReactElement };

const wordmark = (size: number, color: string) => (
  <span
    style={{
      fontFamily: "Mona Sans",
      fontWeight: 600,
      fontSize: size,
      letterSpacing: size * 0.2,
      color,
    }}
  >
    SISERA
  </span>
);

const lockup = (background: string, text: string, stroke: string, accent: string) => (
  <div
    style={{
      width: "100%",
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 36,
      background,
    }}
  >
    <Mark size={150} stroke={stroke} accent={accent} />
    {wordmark(96, text)}
  </div>
);

const assets: Record<string, Asset> = {
  "logo-horizontal-dark.png": {
    width: 1200,
    height: 360,
    render: () => lockup(c.ink, c.bone, c.bronze, c.verdigris),
  },
  "logo-horizontal-light.png": {
    width: 1200,
    height: 360,
    render: () => lockup(c.bone, c.ink, "#B77D4E", "#57978C"),
  },
  "logo-stacked-dark.png": {
    width: 800,
    height: 800,
    render: () => (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 40,
          background: c.ink,
        }}
      >
        <Mark size={280} />
        {wordmark(80, c.bone)}
      </div>
    ),
  },
  "avatar.png": {
    width: 400,
    height: 400,
    render: () => (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: c.ink,
        }}
      >
        <Mark size={250} />
      </div>
    ),
  },
  "x-header.png": {
    width: 1500,
    height: 500,
    render: (ribbon) => (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: c.ribbonEdge,
        }}
      >
        {/* biome-ignore lint/a11y/useAltText: decorative background in a generated image */}
        <img
          src={ribbon}
          width={1000}
          height={500}
          style={{ position: "absolute", left: 540, top: 0 }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 0 0 300px",
            maxWidth: 1100,
          }}
        >
          <span
            style={{
              fontFamily: "Mona Sans",
              fontWeight: 600,
              letterSpacing: -1.5,
              fontSize: 58,
              lineHeight: 1.05,
              color: c.bone,
            }}
          >
            See the move.
          </span>
          <span
            style={{
              fontFamily: "Mona Sans",
              fontWeight: 600,
              letterSpacing: -1.5,
              fontSize: 58,
              lineHeight: 1.05,
              color: c.bronze,
            }}
          >
            Know the reason.
          </span>
          <span style={{ marginTop: 24, fontFamily: "Commit Mono", fontSize: 20, color: c.muted }}>
            sisera.xyz · tokenized stocks · private markets
          </span>
        </div>
      </div>
    ),
  },
};

export function generateStaticParams() {
  return Object.keys(assets).map((name) => ({ name }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const asset = assets[(await params).name];
  if (!asset) notFound();
  const [fonts, ribbon] = await Promise.all([ogFonts(), ribbonDataUrl()]);
  return new ImageResponse(asset.render(ribbon), {
    width: asset.width,
    height: asset.height,
    fonts,
  });
}

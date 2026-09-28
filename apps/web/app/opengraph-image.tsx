import { ImageResponse } from "next/og";
import { Mark, brandColors as c, ogFonts, ribbonDataUrl } from "../lib/og";

export const alt = "Sisera — research terminal for tokenized stocks and private markets";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const [fonts, ribbon] = await Promise.all([ogFonts(), ribbonDataUrl()]);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        background: c.ribbonEdge,
        color: c.bone,
        fontFamily: "Schibsted Grotesk",
      }}
    >
      {/* biome-ignore lint/a11y/useAltText: decorative background in a generated image */}
      <img
        src={ribbon}
        width={1260}
        height={630}
        style={{ position: "absolute", left: 300, top: 0 }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          width: "100%",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Mark size={52} />
          <span style={{ fontSize: 26, fontWeight: 600, letterSpacing: 6 }}>SISERA</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 660 }}>
          <span
            style={{
              fontFamily: "Newsreader",
              fontSize: 66,
              lineHeight: 1.02,
              letterSpacing: -1.5,
            }}
          >
            The research terminal for tokenized stocks and
          </span>
          <span
            style={{
              fontFamily: "Newsreader",
              fontStyle: "italic",
              fontSize: 66,
              lineHeight: 1.02,
              color: c.bronze,
            }}
          >
            private markets.
          </span>
        </div>
        <div
          style={{
            display: "flex",
            gap: 28,
            fontFamily: "Commit Mono",
            fontSize: 20,
            color: c.muted,
          }}
        >
          <span>sisera.xyz</span>
          <span>Token vs share</span>
          <span>Pre-IPO marks</span>
        </div>
      </div>
    </div>,
    { ...size, fonts },
  );
}

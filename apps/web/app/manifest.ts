import type { MetadataRoute } from "next";
import { site } from "../lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sisera Terminal",
    short_name: "Sisera",
    description: site.shortDescription,
    id: "/",
    start_url: "/stocks",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: site.themeColor,
    theme_color: site.themeColor,
    categories: ["finance", "business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Tokenized stocks", url: "/stocks" },
      { name: "Private markets", url: "/private-markets" },
      { name: "Portfolio", url: "/portfolio" },
    ],
  };
}

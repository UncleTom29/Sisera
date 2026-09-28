import type { MetadataRoute } from "next";
import { publicPages, site } from "../lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    ...publicPages.map((page) => ({
      url: `${site.url}${page.path === "/" ? "" : page.path}`,
      lastModified,
      changeFrequency: page.changeFrequency,
      priority: page.priority,
    })),
    { url: `${site.url}/llms.txt`, lastModified, changeFrequency: "monthly", priority: 0.2 },
  ];
}

import { site } from "../../lib/site";

export const dynamic = "force-static";

// Search and AI answer engines are welcome on public pages. Cloudflare's managed robots.txt, when
// enabled, is prepended to this file; keep its content signals consistent with the line below.
const aiAgents = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "Meta-ExternalAgent",
  "Amazonbot",
  "DuckAssistBot",
  "MistralAI-User",
  "cohere-ai",
];

export function GET() {
  const privatePaths = ["Disallow: /api/", "Disallow: /sign-in"];
  const body = [
    "Content-Signal: search=yes, ai-input=yes, ai-train=yes",
    "",
    "User-agent: *",
    "Allow: /",
    ...privatePaths,
    "",
    ...aiAgents.flatMap((agent) => [`User-agent: ${agent}`, "Allow: /", ...privatePaths, ""]),
    `Sitemap: ${site.url}/sitemap.xml`,
    "",
  ].join("\n");
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}

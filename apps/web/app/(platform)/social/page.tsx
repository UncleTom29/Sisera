import { Rss } from "lucide-react";
import { auth } from "../../../auth";
import { PageHeader } from "../../../components/page-header";
import { getSocialFeed } from "../../../lib/api";

export const dynamic = "force-dynamic";

export default async function SocialPage() {
  const session = await auth();
  const feed = await getSocialFeed({
    accessToken: session?.accessToken,
    localOperator: process.env.SISERA_LOCAL_OPERATOR_MODE === "true",
  }).catch(() => null);
  const posts = feed?.data ?? [];
  return (
    <div className="min-h-full">
      <PageHeader
        eyebrow="Public community observations"
        title="Social feeds"
        description="Recent posts from major crypto communities. Open the original source to read context; posts are observations, not verified trading signals."
      />
      <div className="p-4 md:p-6">
        <div className="mb-4 flex flex-wrap gap-2">
          {Object.entries(feed?.sources ?? {}).map(([source, status]) => (
            <span
              key={source}
              className="rounded border border-line px-2 py-1 font-mono text-[10px] text-slate-400"
            >
              {source} · {status.replaceAll("_", " ")}
            </span>
          ))}
        </div>
        {posts.length ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {posts.map((post) => (
              <article key={post.id} className="border border-line bg-panel p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] uppercase text-cyan-300">
                  <span>
                    {post.platform} · {post.community}
                  </span>
                  <time dateTime={post.publishedAt} className="text-slate-500">
                    {new Date(post.publishedAt).toLocaleString()}
                  </time>
                </div>
                <p className="mt-3 line-clamp-5 whitespace-pre-wrap text-xs leading-5 text-slate-200">
                  {post.text}
                </p>
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block text-[11px] text-cyan-300"
                >
                  Open source →
                </a>
              </article>
            ))}
          </div>
        ) : (
          <div className="border border-line bg-panel p-8 text-center">
            <Rss className="mx-auto text-slate-500" size={22} />
            <p className="mt-3 text-sm text-slate-300">No live community posts are available.</p>
            <p className="mt-1 text-xs text-slate-500">
              Source access and community activity determine the feed.
            </p>
          </div>
        )}
        {!feed && (
          <p className="mt-3 text-xs text-amber-200">
            Social feed service is temporarily unavailable.
          </p>
        )}
      </div>
    </div>
  );
}

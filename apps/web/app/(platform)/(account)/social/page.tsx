import type { Metadata } from "next";
import { auth } from "../../../../auth";
import { PageHeader } from "../../../../components/page-header";
import { SocialFeedBrowser } from "../../../../components/social-feed-browser";
import { getSocialFeed } from "../../../../lib/api";

export const metadata: Metadata = {
  title: "Social feeds",
  description: "Market chatter from tracked X, Telegram, Reddit, and Discord communities.",
};

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
        eyebrow="Market conversation"
        title="What people are saying"
        description="Follow public conversations about the assets you watch. Open the original post to judge the context for yourself."
      />
      <div className="p-4 md:p-6">
        <SocialFeedBrowser posts={posts} sources={feed?.sources ?? {}} />
        {!feed && (
          <p className="mt-3 text-xs text-amber-200">
            Conversations are refreshing. Explore market news and research while new posts arrive.
          </p>
        )}
      </div>
    </div>
  );
}

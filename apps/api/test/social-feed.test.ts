import { afterEach, describe, expect, it, vi } from "vitest";
import { SocialFeedClient } from "../src/social-feed.js";

afterEach(() => vi.unstubAllGlobals());
describe("social feed source boundaries", () => {
  it("shows a real Reddit Atom post and marks inaccessible sources unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if (String(url).includes("/r/Bitcoin/"))
          return new Response(
            `<?xml version="1.0"?><feed><entry><id>reddit:test</id><title>Bitcoin community update</title><updated>2026-09-25T12:00:00Z</updated><link href="https://www.reddit.com/r/Bitcoin/comments/test"/></entry></feed>`,
          );
        return new Response("unavailable", { status: 503 });
      }),
    );
    const result = await new SocialFeedClient({ telegramChannels: "" }).list();
    expect(result.posts[0]?.text).toBe("Bitcoin community update");
    expect(result.sources["reddit:Bitcoin"]).toBe("live");
    expect(result.sources.discord).toBe("bot_access_required");
  });
});

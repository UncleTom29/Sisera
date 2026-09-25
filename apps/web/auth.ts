import { PrivyClient } from "@privy-io/server-auth";
import { cookies } from "next/headers";

export const sessionCookieName = "sisera-privy-session";

const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const appSecret = process.env.PRIVY_APP_SECRET;
const privy = appId && appSecret ? new PrivyClient(appId, appSecret) : null;

export async function verifyPrivyAccessToken(token: string) {
  if (!privy) throw new Error("Privy server authentication is not configured");
  return privy.verifyAuthToken(token);
}

export async function auth() {
  const token = (await cookies()).get(sessionCookieName)?.value;
  if (!token || !privy) return null;
  try {
    const claims = await privy.verifyAuthToken(token);
    return { accessToken: token, user: { id: claims.userId, name: claims.userId } };
  } catch {
    return null;
  }
}

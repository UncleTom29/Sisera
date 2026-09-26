import { PrivyClient } from "@privy-io/server-auth";
import { cookies } from "next/headers";

export const sessionCookieName = "sisera-privy-session";

const appId = process.env.PRIVY_APP_ID || process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const appSecret = process.env.PRIVY_APP_SECRET;
const privy = appId && appSecret ? new PrivyClient(appId, appSecret) : null;

export async function verifyPrivyAccessToken(token: string) {
  if (!privy) throw new Error("Privy server authentication is not configured");
  return privy.verifyAuthToken(token);
}

export async function auth() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) return null;

  if (process.env.NODE_ENV !== "production" && token.startsWith("guest:")) {
    return {
      accessToken: token,
      user: { id: "guest", name: "Guest Operator", isGuest: true },
    };
  }

  if (process.env.NODE_ENV !== "production" && token.startsWith("wallet:")) {
    const parts = token.split(":");
    const address = parts[1];
    if (address && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
      return {
        accessToken: token,
        user: {
          id: `solana:${address}`,
          name: `${address.slice(0, 4)}...${address.slice(-4)}`,
          wallet: address,
        },
      };
    }
  }

  if (!privy) return null;
  try {
    const claims = await privy.verifyAuthToken(token);
    return { accessToken: token, user: { id: claims.userId, name: "Operator" } };
  } catch {
    return null;
  }
}

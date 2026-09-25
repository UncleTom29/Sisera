import NextAuth from "next-auth";
import Keycloak from "next-auth/providers/keycloak";

const oidcConfigured = Boolean(
  process.env.AUTH_KEYCLOAK_ID &&
    process.env.AUTH_KEYCLOAK_SECRET &&
    process.env.AUTH_KEYCLOAK_ISSUER,
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: process.env.NODE_ENV !== "production" || process.env.AUTH_TRUST_HOST === "true",
  providers: oidcConfigured
    ? [
        Keycloak({
          clientId: process.env.AUTH_KEYCLOAK_ID as string,
          clientSecret: process.env.AUTH_KEYCLOAK_SECRET as string,
          issuer: process.env.AUTH_KEYCLOAK_ISSUER as string,
        }),
      ]
    : [],
  pages: { signIn: "/sign-in" },
  session: { strategy: "jwt" },
  callbacks: {
    jwt({ token, account, profile }) {
      if (account?.access_token) token.accessToken = account.access_token;
      if (profile && typeof profile === "object" && "tenant_id" in profile)
        token.tenantId = profile.tenant_id;
      return token;
    },
    session({ session, token }) {
      if (typeof token.accessToken === "string") session.accessToken = token.accessToken;
      if (typeof token.tenantId === "string") session.tenantId = token.tenantId;
      return session;
    },
  },
});

export const isOidcConfigured = oidcConfigured;

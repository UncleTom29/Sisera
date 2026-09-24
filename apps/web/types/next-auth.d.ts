import "next-auth";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    tenantId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    tenantId?: string;
  }
}

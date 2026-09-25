import { PrivyClient } from "@privy-io/server-auth";
import { resolvePrivyMembership } from "@sisera/db";
import type { Permission, UserRole } from "@sisera/domain";
import { UserRole as UserRoleSchema, roleCan } from "@sisera/domain";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ApiConfig } from "./config.js";

export type Principal = { subject: string; tenantId: string; roles: UserRole[] };

declare module "fastify" {
  interface FastifyRequest {
    principal: Principal | null;
  }
}

export function createAuthenticator(config: ApiConfig) {
  const privy =
    config.PRIVY_APP_ID && config.PRIVY_APP_SECRET
      ? new PrivyClient(config.PRIVY_APP_ID, config.PRIVY_APP_SECRET)
      : null;

  return async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    request.principal = null;
    if (
      request.url === "/health/live" ||
      request.url === "/health/ready" ||
      request.url === "/metrics" ||
      request.url === "/v1/helius/webhook"
    )
      return;

    if (config.SISERA_ALLOW_DEV_AUTH && config.NODE_ENV !== "production") {
      const role = UserRoleSchema.safeParse(request.headers["x-sisera-dev-role"]);
      if (role.success) {
        request.principal = {
          subject: String(request.headers["x-sisera-dev-subject"] ?? "local-operator"),
          tenantId: String(request.headers["x-sisera-dev-tenant"] ?? "local"),
          roles: [role.data],
        };
        return;
      }
    }

    const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token || !privy) {
      await reply
        .code(401)
        .send({ error: "unauthorized", message: "A valid operator session is required." });
      return;
    }

    let userId: string;
    try {
      userId = (await privy.verifyAuthToken(token)).userId;
    } catch {
      await reply
        .code(401)
        .send({ error: "unauthorized", message: "The Privy session is invalid." });
      return;
    }

    try {
      const identity = config.DATABASE_URL
        ? await resolvePrivyMembership(config.DATABASE_URL, userId)
        : config.NODE_ENV !== "production"
          ? {
              userId: `privy:${userId}`,
              memberships: [{ organizationId: `personal:${userId}`, role: "viewer" }],
            }
          : null;
      if (!identity) {
        await reply.code(503).send({
          error: "identity_store_unavailable",
          message: "Sisera organization mapping is not configured.",
        });
        return;
      }
      const requestedOrganization = request.headers["x-sisera-organization"]?.toString();
      const membership =
        identity.memberships.find((item) => item.organizationId === requestedOrganization) ??
        (requestedOrganization ? null : identity.memberships[0]);
      const role = UserRoleSchema.safeParse(membership?.role);
      if (!membership || !role.success) {
        await reply
          .code(403)
          .send({ error: "forbidden", message: "No Sisera organization membership." });
        return;
      }
      request.principal = {
        subject: identity.userId,
        tenantId: membership.organizationId,
        roles: [role.data],
      };
    } catch {
      await reply.code(503).send({
        error: "identity_store_unavailable",
        message: "Sisera could not resolve the organization membership.",
      });
    }
  };
}

export function requirePermission(permission: Permission) {
  return async function authorize(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const authorized = request.principal?.roles.some((role) => roleCan(role, permission)) ?? false;
    if (!authorized) {
      await reply
        .code(403)
        .send({ error: "forbidden", message: `Missing permission: ${permission}` });
    }
  };
}

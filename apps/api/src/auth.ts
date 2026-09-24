import type { Permission, UserRole } from "@sisera/domain";
import { UserRole as UserRoleSchema, roleCan } from "@sisera/domain";
import type { FastifyReply, FastifyRequest } from "fastify";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { ApiConfig } from "./config.js";

export type Principal = { subject: string; tenantId: string; roles: UserRole[] };

declare module "fastify" {
  interface FastifyRequest {
    principal: Principal | null;
  }
}

export function createAuthenticator(config: ApiConfig) {
  const jwks = config.OIDC_ISSUER
    ? createRemoteJWKSet(
        new URL(`${config.OIDC_ISSUER.replace(/\/$/, "")}/protocol/openid-connect/certs`),
      )
    : null;

  return async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    request.principal = null;
    if (
      request.url === "/health/live" ||
      request.url === "/health/ready" ||
      request.url === "/metrics"
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
    if (!token || !jwks || !config.OIDC_ISSUER) {
      await reply
        .code(401)
        .send({ error: "unauthorized", message: "A valid operator session is required." });
      return;
    }

    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: config.OIDC_ISSUER,
        audience: config.OIDC_AUDIENCE,
      });
      const realmAccess = payload.realm_access;
      const realmRoles =
        realmAccess &&
        typeof realmAccess === "object" &&
        "roles" in realmAccess &&
        Array.isArray(realmAccess.roles)
          ? realmAccess.roles
          : [];
      const directRoles = Array.isArray(payload.roles) ? payload.roles : [];
      const roles = [...realmRoles, ...directRoles]
        .map((role) => UserRoleSchema.safeParse(role))
        .filter((result) => result.success)
        .map((result) => result.data);
      request.principal = {
        subject: payload.sub ?? "unknown",
        tenantId: typeof payload.tenant_id === "string" ? payload.tenant_id : "default",
        roles,
      };
    } catch {
      await reply
        .code(401)
        .send({ error: "unauthorized", message: "The operator session is invalid or expired." });
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

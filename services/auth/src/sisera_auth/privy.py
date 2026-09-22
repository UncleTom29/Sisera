"""Privy authentication (email + Google).

Verifies Privy JWTs (issued by Privy's email/Google login) via JWKS, extracting the
user identity for Sisera's RBAC. The JWKS fetcher and clock are injected so verification
is deterministic and testable without network or credentials. Without a configured App ID
+ JWKS, verification refuses (no silent pass-through).

Credential requirements are documented in `docs/auth-privy.md`.
"""

from __future__ import annotations

from typing import Any, Protocol

import jwt
from pydantic import BaseModel, ConfigDict


class VerifiedUser(BaseModel):
    model_config = ConfigDict(frozen=True)

    user_id: str
    email: str | None = None
    provider: str | None = None  # "email" | "google" | ...


class JWKSetFetcher(Protocol):
    def get_key(self, key_id: str) -> Any: ...


class PrivyNotConfigured(RuntimeError):
    pass


class PrivyVerificationFailed(ValueError):
    pass


class PrivyVerifier:
    def __init__(
        self,
        app_id: str = "",
        jwks_fetcher: JWKSetFetcher | None = None,
        enabled: bool = False,
    ) -> None:
        self._app_id = app_id
        self._jwks = jwks_fetcher
        self._enabled = enabled

    @property
    def is_configured(self) -> bool:
        return bool(self._enabled and self._app_id and self._jwks is not None)

    def verify(self, token: str) -> VerifiedUser:
        if not self.is_configured:
            raise PrivyNotConfigured(
                "Privy auth is not configured. Set SISERA_PRIVY_APP_ID and "
                "SISERA_PRIVY_ENABLED=true with a JWKS fetcher."
            )
        try:
            header = jwt.get_unverified_header(token)
            key = self._jwks.get_key(header.get("kid", ""))
            payload = jwt.decode(
                token,
                key=key,
                algorithms=["ES256"],
                audience=self._app_id,
                options={"require": ["exp", "sub"]},
            )
        except Exception as exc:
            raise PrivyVerificationFailed(f"Privy token verification failed: {exc}") from exc

        user_id = str(payload.get("sub", ""))
        if not user_id:
            raise PrivyVerificationFailed("Privy token has no subject")
        return VerifiedUser(
            user_id=user_id,
            email=payload.get("email"),
            provider=(payload.get("provider") or payload.get("login_method") or None),
        )

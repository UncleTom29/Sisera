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


class HttpJWKSetFetcher:
    """Fetches and caches Privy JWKS public keys over HTTPS."""

    def __init__(self, app_id: str, cache_ttl_sec: int = 3600) -> None:
        import json
        import urllib.request

        self._app_id = app_id
        self._url = f"https://auth.privy.io/api/v1/apps/{app_id}/jwks.json"
        self._cache_ttl_sec = cache_ttl_sec
        self._jwks: Any = None
        self._last_fetched: float = 0

    def _fetch(self) -> None:
        import json
        import time
        import urllib.request
        from jwt import PyJWKSet

        req = urllib.request.Request(self._url, headers={"User-Agent": "Sisera/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
        self._jwks = PyJWKSet.from_dict(data)
        self._last_fetched = time.time()

    def get_key(self, key_id: str) -> Any:
        import time

        if self._jwks is None or (time.time() - self._last_fetched > self._cache_ttl_sec):
            self._fetch()
        try:
            return self._jwks[key_id].key
        except KeyError:
            # Refresh once in case of key rotation
            self._fetch()
            return self._jwks[key_id].key


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

"""API authentication (Privy JWT).

Mutating endpoints require a valid `Authorization: Bearer <privy-jwt>` token. The
verifier is injected (real `PrivyVerifier` in production, mock in tests). Unauthenticated
requests get 401.
"""

from __future__ import annotations

from typing import Protocol

from fastapi import HTTPException, Request


class TokenVerifier(Protocol):
    def verify(self, token: str) -> object: ...


class VerifiedIdentity:
    def __init__(self, user_id: str, email: str | None = None) -> None:
        self.user_id = user_id
        self.email = email


def _bearer_token(request: Request) -> str | None:
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip() or None
    return None


def require_user(request: Request, verifier: TokenVerifier | None) -> VerifiedIdentity:
    token = _bearer_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    if verifier is None:
        raise HTTPException(status_code=501, detail="Auth not configured")
    try:
        verified = verifier.verify(token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}") from exc
    user_id = getattr(verified, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Token has no subject")
    return VerifiedIdentity(user_id=str(user_id), email=getattr(verified, "email", None))

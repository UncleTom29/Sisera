"""Tests for Privy verification (mocked keys, no network, no credentials)."""

from __future__ import annotations

import time

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from sisera_auth import PrivyNotConfigured, PrivyVerificationFailed, PrivyVerifier


def _keypair() -> tuple[str, str]:
    key = ec.generate_private_key(ec.SECP256R1())
    private = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    public = key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    ).decode()
    return private, public


class FakeJWKS:
    def __init__(self, public_pem: str) -> None:
        self._public_pem = public_pem

    def get_key(self, key_id: str) -> str:
        return self._public_pem


def _token(private_pem: str, app_id: str, sub: str = "user_123") -> str:
    now = int(time.time())
    return jwt.encode(
        {"sub": sub, "email": "trader@example.com", "provider": "google",
         "aud": app_id, "exp": now + 300, "iat": now},
        key=private_pem,
        algorithm="ES256",
        headers={"kid": "k1"},
    )


def test_refuses_when_unconfigured() -> None:
    verifier = PrivyVerifier()
    with pytest.raises(PrivyNotConfigured):
        verifier.verify("anything")


def test_verifies_valid_token() -> None:
    private, public = _keypair()
    verifier = PrivyVerifier(app_id="app_123", jwks_fetcher=FakeJWKS(public), enabled=True)
    user = verifier.verify(_token(private, "app_123"))
    assert user.user_id == "user_123"
    assert user.email == "trader@example.com"
    assert user.provider == "google"


def test_rejects_wrong_audience() -> None:
    private, public = _keypair()
    verifier = PrivyVerifier(app_id="app_123", jwks_fetcher=FakeJWKS(public), enabled=True)
    with pytest.raises(PrivyVerificationFailed):
        verifier.verify(_token(private, "other_app"))


def test_rejects_tampered_token() -> None:
    private, public = _keypair()
    verifier = PrivyVerifier(app_id="app_123", jwks_fetcher=FakeJWKS(public), enabled=True)
    token = _token(private, "app_123") + "tampered"
    with pytest.raises(PrivyVerificationFailed):
        verifier.verify(token)

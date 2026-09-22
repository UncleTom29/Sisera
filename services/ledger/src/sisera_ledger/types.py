"""Exact Decimal type for financial amounts (ADR-002).

Postgres stores `NUMERIC` natively (exact, and supports exact SQL SUM). SQLite has no
native arbitrary-precision decimal type — its NUMERIC affinity stores non-integers as
binary floats — so on SQLite we store the canonical string form and convert to/from
`Decimal` ourselves, preserving exactness. This guarantees monetary amounts never round-trip
through binary floating point on any dialect.
"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import Numeric, String
from sqlalchemy.types import TypeDecorator

_DECIMAL_PRECISION = 36
_DECIMAL_SCALE = 18


class ExactDecimal(TypeDecorator):
    impl = Numeric(_DECIMAL_PRECISION, _DECIMAL_SCALE)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "sqlite":
            return dialect.type_descriptor(String(64))
        return dialect.type_descriptor(Numeric(_DECIMAL_PRECISION, _DECIMAL_SCALE))

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if dialect.name == "sqlite":
            return str(value)
        return Decimal(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return Decimal(value)

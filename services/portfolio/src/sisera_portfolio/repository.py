"""Portfolio repository (spec §15)."""

from __future__ import annotations

from decimal import Decimal

from sisera_domain.money import Asset, Money
from sisera_domain.order import OrderSide
from sisera_domain.portfolio import Portfolio, Position
from sqlalchemy.orm import Session

from sisera_portfolio.models import PortfolioCashRow, PortfolioRow, PositionRow


def _beta_map(row: PositionRow) -> dict[str, Decimal]:
    return {k: Decimal(v) for k, v in (row.beta_map_json or {}).items()}


def row_to_position(row: PositionRow) -> Position:
    return Position(
        instrument_id=row.instrument_id,
        side=OrderSide(row.side),
        quantity=Decimal(row.quantity),
        entry_price=Decimal(row.entry_price),
        mark_price=Decimal(row.mark_price),
        margin=(
            Money(Decimal(row.margin_amount), Asset(row.margin_asset))
            if row.margin_amount is not None and row.margin_asset is not None
            else None
        ),
        leverage=Decimal(row.leverage),
        quote_asset=Asset(row.quote_asset) if row.quote_asset else None,
        beta_map=_beta_map(row),
    )


def row_to_portfolio(row: PortfolioRow) -> Portfolio:
    return Portfolio(
        portfolio_id=row.portfolio_id,
        name=row.name,
        parent_id=row.parent_id,
        quote_asset=Asset(row.quote_asset),
        peak_equity=Decimal(row.peak_equity),
        cash={c.asset: Money(Decimal(c.amount), Asset(c.asset)) for c in row.cash},
        positions={p.instrument_id: row_to_position(p) for p in row.positions},
    )


class PortfolioRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def save_portfolio(self, portfolio: Portfolio) -> Portfolio:
        existing = self._session.get(PortfolioRow, portfolio.portfolio_id)
        if existing is None:
            row = PortfolioRow(
                portfolio_id=portfolio.portfolio_id,
                name=portfolio.name,
                parent_id=portfolio.parent_id,
                quote_asset=portfolio.quote_asset.code if portfolio.quote_asset else "USDT",
                peak_equity=portfolio.peak_equity,
            )
            self._session.add(row)
        else:
            existing.name = portfolio.name
            existing.parent_id = portfolio.parent_id
            existing.peak_equity = portfolio.peak_equity
            self._session.flush()
            row = existing
        return portfolio

    def get_portfolio(self, portfolio_id: str) -> Portfolio | None:
        row = self._session.get(PortfolioRow, portfolio_id)
        return row_to_portfolio(row) if row is not None else None

    def upsert_position(self, portfolio_id: str, position: Position) -> Position:
        row = (
            self._session.query(PositionRow)
            .filter_by(portfolio_id=portfolio_id, instrument_id=position.instrument_id)
            .first()
        )
        if row is None:
            self._session.add(
                PositionRow(
                    portfolio_id=portfolio_id,
                    instrument_id=position.instrument_id,
                    side=position.side.value,
                    quantity=position.quantity,
                    entry_price=position.entry_price,
                    mark_price=position.mark_price,
                    margin_amount=position.margin.amount if position.margin else None,
                    margin_asset=position.margin.asset.code if position.margin else None,
                    leverage=position.leverage,
                    quote_asset=position.quote_asset.code if position.quote_asset else None,
                    beta_map_json={k: str(v) for k, v in position.beta_map.items()},
                )
            )
        else:
            row.side = position.side.value
            row.quantity = position.quantity
            row.entry_price = position.entry_price
            row.mark_price = position.mark_price
            row.margin_amount = position.margin.amount if position.margin else None
            row.margin_asset = position.margin.asset.code if position.margin else None
            row.leverage = position.leverage
            row.quote_asset = position.quote_asset.code if position.quote_asset else None
            row.beta_map_json = {k: str(v) for k, v in position.beta_map.items()}
        self._session.flush()
        return position

    def remove_position(self, portfolio_id: str, instrument_id: str) -> None:
        row = (
            self._session.query(PositionRow)
            .filter_by(portfolio_id=portfolio_id, instrument_id=instrument_id)
            .first()
        )
        if row is not None:
            self._session.delete(row)
            self._session.flush()

    def set_cash(self, portfolio_id: str, asset: Asset, amount: Decimal) -> None:
        row = (
            self._session.query(PortfolioCashRow)
            .filter_by(portfolio_id=portfolio_id, asset=asset.code)
            .first()
        )
        if row is None:
            self._session.add(
                PortfolioCashRow(portfolio_id=portfolio_id, asset=asset.code, amount=amount)
            )
        else:
            row.amount = amount
        self._session.flush()

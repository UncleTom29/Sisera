"""Approval workflows (spec §34).

Four-eyes controls: policies may require approval based on trade notional, leverage,
instrument, venue, strategy, agent, portfolio, or risk state. Every approval and rejection
is auditable (who, when, why, under which policy version).
"""

from __future__ import annotations

import time
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ApprovalRule(BaseModel):
    """A single approval requirement (e.g. orders > $100k require trader + PM)."""

    model_config = ConfigDict(frozen=True)

    rule_id: str
    min_notional: Decimal = Decimal("0")
    required_roles: tuple[str, ...] = Field(default_factory=tuple)
    required_approvals: int = 1
    description: str = ""


class ApprovalPolicy(BaseModel):
    model_config = ConfigDict(frozen=True)

    policy_id: str
    version: str = "v1"
    rules: tuple[ApprovalRule, ...] = Field(default_factory=tuple)


class Approval(BaseModel):
    model_config = ConfigDict(frozen=True)

    approval_id: str
    request_id: str
    approver_id: str
    approver_role: str
    approved: bool
    timestamp_ms: int
    note: str | None = None


class ApprovalRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    request_id: str
    order_id: str
    requester_id: str
    triggered_rules: tuple[str, ...] = Field(default_factory=tuple)
    approvals: tuple[Approval, ...] = Field(default_factory=tuple)
    created_at_ms: int = 0


class ApprovalEngine:
    """Evaluates orders against a policy and collects auditable approvals."""

    def __init__(self, policy: ApprovalPolicy) -> None:
        self._policy = policy
        self._requests: dict[str, ApprovalRequest] = {}

    def evaluate(self, order_id: str, requester_id: str, notional: Decimal) -> ApprovalRequest:
        triggered = tuple(
            r.rule_id for r in self._policy.rules if notional >= r.min_notional
        )
        request = ApprovalRequest(
            request_id=f"apr_{order_id}",
            order_id=order_id,
            requester_id=requester_id,
            triggered_rules=triggered,
            created_at_ms=int(time.time() * 1000),
        )
        self._requests[request.request_id] = request
        return request

    def approve(
        self, request_id: str, approver_id: str, approver_role: str, approved: bool = True,
        note: str | None = None,
    ) -> ApprovalRequest:
        current = self._requests[request_id]
        approval = Approval(
            approval_id=f"{request_id}_{len(current.approvals)}",
            request_id=request_id,
            approver_id=approver_id,
            approver_role=approver_role,
            approved=approved,
            timestamp_ms=int(time.time() * 1000),
            note=note,
        )
        updated = current.model_copy(update={"approvals": current.approvals + (approval,)})
        self._requests[request_id] = updated
        return updated

    def is_approved(self, request_id: str) -> bool:
        request = self._requests[request_id]
        if not request.triggered_rules:
            return True
        rules = {r.rule_id: r for r in self._policy.rules}
        for rule_id in request.triggered_rules:
            rule = rules[rule_id]
            # Count distinct approvers with a required role who approved (not rejected).
            valid = {
                a.approver_id
                for a in request.approvals
                if a.approved and a.approver_role in rule.required_roles
            }
            # Any rejection by an eligible approver blocks.
            rejected = any(
                (not a.approved) and a.approver_role in rule.required_roles
                for a in request.approvals
            )
            if rejected or len(valid) < rule.required_approvals:
                return False
        return True

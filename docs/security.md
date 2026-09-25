# Security model

## Identity and authorization

- Browser sessions use Privy access tokens held in an HttpOnly, same-site cookie.
- The API verifies Privy bearer tokens server-side, then resolves Sisera organization membership.
- Roles map to explicit permissions. Wallet ownership is never sufficient authorization to trade.
- Local development bypasses are opt-in, rejected in production, and visible in the terminal.
- Privy embedded and external wallets never expose private keys to Sisera. Identity alone grants
  only a viewer role until explicit organization permissions are assigned.

## Execution controls

- Paper and future live execution use the same pre-trade risk function.
- Portfolio state and mandate limits are loaded server-side. Clients cannot submit their own limits.
- Quotes have source, observation time, receive time, and quality state. Non-live or old quotes fail.
- Client order IDs are unique per tenant and are the idempotency boundary.
- Agent and copilot output remains a proposal until deterministic validation and required approval.
- Jupiter route checks have no taker address and return quote-only data; live Solana execution is
  disabled until transaction validation, wallet approval, confirmation, and reconciliation exist.

## Secrets and data

- Keep venue credentials in a managed secret store and decrypt only inside the venue gateway.
- Use separate credentials and network policy per venue and environment.
- Encrypt sensitive database columns with a managed KMS envelope key.
- Never log tokens, cookies, API keys, private wallet material, or raw identity-provider payloads.

## Required production work

- Add hardware-backed signing or an MPC policy for live crypto execution.
- Add database row-level tenant isolation and migration checks in staging.
- Add WAF, egress allowlists, dependency scanning, signed images, SBOMs, and secret scanning.
- Complete venue-specific threat models, reconciliation proofs, and incident exercises.

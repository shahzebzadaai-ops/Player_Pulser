# Decisions, assumptions, and open questions

## Chosen so the app can run

- One Next.js app, with admin permission checked on the server.
- Paise as `BIGINT`. Half-away-from-zero rounding. Indian digit grouping for display only.
- Symmetric half-spread, documented in `docs/trading-and-pricing.md` before the quote function was written.
- Firm quotes for 15 seconds. Stale feed after 30 seconds. Confirmation when the shown mid has moved by 0.5% or more.
- Cash and bonus spending follows the trade ticket: bonus cannot fund a buy alone, and at least 50% must be cash.
- Wagering counts completed buy notional only.
- Qualifying deposits are settled payment rows, summed over time.
- On bonus expiry, unused bonus and unconverted proceeds are forfeited. Open units remain, and a later sale forfeits the bonus-funded slice of proceeds.
- Standard withdrawal is 95% of cash, rounded down. The rest stays in the wallet.
- Payments go through one adapter. Only the simulator is enabled.
- Development authentication is impossible when `NODE_ENV` is `production`.
- Local Postgres can start without Docker because Docker is not installed here. Compose files are still the definition for another machine.
- Service worker caches only the icon and manifest. It does not cache `/api`, wallet pages, or offline trades.

## Open

1. What should happen when someone wants to withdraw their whole cash balance, or any amount below ₹500? The app refuses those cases and leaves the cash in the wallet. It does not invent a sweep, a fee, or a permanent lock.
2. Is the half-spread, the 0.5% confirmation band, the 2% simulation cap, and the 30-second stale window what you want in production? They are settings.
3. Should sells, or only buys, count toward wagering?
4. Is 50% the lasting cash minimum on a buy, or only the first design?
5. On bonus expiry, should open bonus-funded units be left with the user (current behaviour) or bought back?
6. Real OTP provider, real payment provider, VPS address, SSH access, and domain are not set. There is no `.ssh` directory on this machine. Staging config is in `deploy/staging` and does not connect anywhere.

## Not claimed

The simulation formula is not an approved pricing model. Seed prices are not market prices. Spread residual in the offset accounts is not a declared revenue policy.

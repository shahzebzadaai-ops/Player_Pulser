# Progress

Updated after checks run in this session on 27 Sep 2026.

## Verified

- `npx tsc --noEmit` passed after the quote and ledger type fixes.
- ESLint passed with zero warnings.
- Unit tests: 20 passed (`npm test` earlier in the session; domain modules were not changed after that).
- Database tests: 8 passed against embedded Postgres on port 54329. Covered concurrent buys, idempotent trades, partial sales, expired quotes, bonus conversion, duplicate webhooks, failed payouts, and admin rejection.
- `npx next build` completed in 62 seconds. Customer, admin, and API routes compiled. Next.js 16 did not print a first-load JavaScript size.
- Local Postgres on port 5432 accepted the init migration and the seed (24 players, demo fan, admin).
- The price worker started and kept writing simulated ticks. Redis is not installed here, so the app reads prices from Postgres.
- Browser, 390px-wide viewport:
  - Development login as Cricket Fan reached Home with cash ₹2,450.00 and bonus ₹200.00.
  - Market search `kohli` returned only Virat Kohli.
  - A 1-unit buy completed. Cash fell by ₹40.35 and bonus by ₹40.34.
  - A 1-unit sale completed and the holding returned to 12. Weighted average became ₹75.47, which matches FIFO (11 units at ₹75.00 and 1 unit at ₹80.69).
  - A simulated ₹500 UPI deposit settled. Cash became ₹2,986.23.
  - Rewards showed wagering ₹80.69 of ₹600.00 and qualifying deposits ₹500.00 of ₹500.00. The bonus stayed active.
  - `/admin` as the customer redirected to `/home`.
  - Log out, then the admin development login, opened the admin overview: 2 users, 3 trades, 1 payment, customer cash ₹2,986.23, bonus liability ₹159.66.
- Slow-network check on `/market`: with 400ms added latency, time to first byte was 438ms and the load event was 1,988ms. The HTML transfer was 162,603 bytes. Dev-mode JavaScript on Home decoded to about 3.6 MB, almost all of it Next.js development runtime. That is not a production size.
- Offline emulation set `navigator.onLine` to false and showed the banner that disables trading.

## Still open

- Real OTP and a real payment provider.
- An approved production pricing formula.
- The sub-₹500 and full-balance withdrawal decision.
- Hostinger staging. No SSH config exists on this machine, and nothing has been deployed.
- A production JavaScript measurement after `next start`. The production build succeeded, but the size table was not printed.

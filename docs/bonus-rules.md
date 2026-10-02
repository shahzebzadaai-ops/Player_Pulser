# Bonus rules

The welcome bonus is ₹200 (`bonus.welcomePaise` = 20000), granted once per user at account creation. It can be used immediately. It expires 14 days later.

## Spending

A buy cannot be paid entirely with bonus. At least `bonus.minCashPortionBps` (5000, meaning 50%) of the notional must be cash, rounded up to a paise. If the user does not choose an amount, the server uses the largest bonus that still leaves that cash share, and never more bonus than the wallet holds. It will not quietly spend extra bonus because cash is short.

## Wagering and deposits

Proposed rule, implemented and configurable by changing which trades set `countsForWagering`:

- A completed buy's full notional (cash plus bonus) counts.
- Sells, deposits, withdrawals, and the seeded opening position do not count.
- The requirement is 3 times the granted bonus (₹600 on a ₹200 bonus).

Qualifying deposits are settled `Payment` rows of kind `DEPOSIT`. The development opening cash is a ledger entry, not a payment, so it does not qualify. The requirement is ₹500 cumulative, not "₹500 still sitting in the wallet".

When the grant is still active, the wagering total is met, the deposit total is met, and the expiry time has not passed, the remaining bonus and bonus proceeds move into cash. Open lots fold their bonus cost into cash cost. After that, those units sell into cash.

## Expiry

Proposed rule, isolated in `expireBonusGrant`:

- Unused bonus is removed with a compensating journal.
- Bonus proceeds that were never converted are removed the same way. The offset is labelled a forfeiture, not revenue.
- Units already held stay in the portfolio.
- Lots that still carry bonus cost are marked `EXPIRED_UNCONVERTED`.
- A later sale pays the cash-funded portion to cash. The bonus-funded portion of the proceeds is forfeited instead of becoming withdrawable cash.

This does not delete the original trades.

## Reporting

Bonus issued, used, expired, and converted are read from existing ledger lines. They do not create new journals.

- Issued is the `BONUS_GRANT` credit to `USER_BONUS`.
- Used is the `TRADE_BUY` debit to `USER_BONUS`.
- Expired is the `BONUS_EXPIRE` removal of unused bonus and unconverted proceeds.
- Converted, which is also Realized Bonus Cost, is the `BONUS_CONVERT` credit to `USER_CASH`.

A grant that has not been converted does not reduce Operational NGR. Operational NGR is GGR minus that realized cost, minus payment processing cost, minus chargebacks. Processing cost and chargebacks are 0 until those amounts exist. See `docs/reporting.md`.

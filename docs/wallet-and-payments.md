# Wallet and payments

## Ledger

Every change is a new journal. The lines of a journal sum to zero. User balances are the sum of that user's lines. A balance is never overwritten. A correction is a compensating journal.

Accounts:

- `USER_CASH` spendable and, when the withdrawal rule allows, withdrawable cash
- `USER_BONUS` bonus that can help pay for a buy
- `USER_BONUS_PROCEEDS` sale proceeds that came from bonus-funded cost and are not withdrawable yet
- `USER_WITHDRAWAL_HOLD` cash reserved for a payout that has not settled
- `OFFSET_*` lines that make each journal balance. They are not customer balances and are not treated as approved company revenue.

Withdrawable cash is the `USER_CASH` balance. Bonus, bonus proceeds, and holds are not added and then subtracted. Pending withdrawals have already left cash and sit on the hold account.

The same user is serialised with a Postgres advisory lock inside one database transaction. Trade, deposit, and withdrawal keys are stored on `IdempotencyRecord`. Reusing a key returns the first result. Reusing it for a different request is rejected.

## Withdrawals

The standard withdrawal is 95% of eligible cash, rounded down to a paise (`withdrawal.standardBps` = 9500). The other 5% stays in `USER_CASH`. It is not moved to a fee account and it is not company revenue.

The minimum configured amount is ₹500. If eligible cash is below ₹500, or if 95% of it would be below ₹500, the withdrawal is refused with `WITHDRAWAL_RULE_UNRESOLVED`. That includes someone whose whole balance is under ₹500, and someone with exactly ₹500 (95% is ₹475). The cash stays in the wallet. How a full-balance or below-minimum withdrawal should work is an open business decision.

## Payments

`PAYMENT_PROVIDER=simulated` is the only wired provider. Production refuses it unless `ALLOW_SIMULATED_PAYMENTS=true` is set on purpose. There is no live UPI or bank debit.

Deposits and payouts are `Payment` rows. Settlement writes the ledger once. Provider events are unique on `(provider, eventId)`. A second copy of the same event is ignored. A later event for a payment that is already settled does not credit cash again.

The worker retries pending simulated payments. Admin reconciliation calls the same settlement function. A failed payout returns the hold to cash.

Webhook bodies are HMAC-SHA256 signed with `PAYMENT_WEBHOOK_SECRET` in `x-playerpulser-signature`. A bad signature is rejected.

Simulated deposits in the app are limited to ₹1 through ₹1,00,000 so a test amount cannot create an accidental huge balance. That limit is part of the simulator, not a product rule.

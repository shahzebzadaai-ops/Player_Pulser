# Reporting definitions

These figures are read from trades, ledger lines, payments, and first-party visits. They do not post new financial rows.

## GGR

For each filled trade, GGR adds the absolute difference between the fill price and the quoted mid, multiplied by the quantity. That is the spread already charged.

## Operational NGR

Operational NGR = GGR − Realized Bonus Cost − Payment Processing Cost − Chargebacks / Refund Cost.

Payment processing cost is 0 and labelled not configured. Chargeback / refund cost is 0 and labelled not configured. Neither number is estimated.

## Bonus

| Metric | Ledger source |
| --- | --- |
| Bonus Issued | `BONUS_GRANT` credits to `USER_BONUS` |
| Bonus Used | `TRADE_BUY` debits to `USER_BONUS` |
| Bonus Expired | `BONUS_EXPIRE` debits to `USER_BONUS` and `USER_BONUS_PROCEEDS` |
| Bonus Converted | `BONUS_CONVERT` credits to `USER_CASH` |
| Realized Bonus Cost | The same amount as Bonus Converted |

An unused grant is issued. It is not a realized cost.

## Visitors

First-party visitor rows begin at the earliest `Visitor.firstSeenAt`. A reporting window that starts earlier shows a coverage warning. Signup rate and first-deposit rate are omitted for that window so tracked visitors are not divided into older account totals.

## CRM thresholds

`crm.highValueDepositThresholdPaise` defaults to 1000000 (₹10,000). `crm.churnRiskInactiveDays` defaults to 14. Changing either requires `settings.manage`, a reason, and an audit row.

## VIP

A customer is VIP when they belong to a segment named VIP, an explicit VIP status is supplied to the resolver, or they have a VIP call task that is open or in progress. The label does not pay a reward.

## Microsoft clicks

`msclkid` without a UTM source is stored as source `microsoft` and medium `paid_search`. `bing` and `msn` normalize to `microsoft`.

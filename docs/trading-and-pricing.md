# Trading and pricing

These rules are implemented as written here. Spread, the simulation, and the confirmation threshold are proposed assumptions. They are settings, not an approved production market.

## Pulsers

One Pulser is one whole unit at the quoted price. Orders are whole numbers, minimum 1. The same player can be bought again. Each buy is its own lot and its own trade row. The screen shows the weighted average cost of the units still held:

`average = round_half_away(total remaining cost / remaining units)`

A sale can take part of a holding, up to the units still held. There is no trading cooldown. Removing a player from a simulated live list does not make them untradable. `tradable` is a separate admin switch.

## Spread

`spreadPpm` is parts per million of the mid. The normal spread is 10,000 (1%). The live-match spread is 12,500 (1.25%). The value must be a non-negative even integer so half of it is an integer.

```
buy  = round_half_away(mid * (1_000_000 + spreadPpm / 2) / 1_000_000)
sell = round_half_away(mid * (1_000_000 - spreadPpm / 2) / 1_000_000)
```

Rounding is half away from zero, in paise. Quotes are at least 1 paise, and the sell quote is kept below the buy quote.

Worked example, mid ₹80.40 (8,040 paise), 1% spread:

- buy ₹80.80 (8,080 paise)
- sell ₹80.00 (8,000 paise)

Same mid, 1.25% live spread:

- buy ₹80.90 (8,090 paise)
- sell ₹79.90 (7,990 paise)

The gap is the platform's bid/ask. It is not booked as a separate fee. The user sees the buy price and the sell price.

## Quotes, stale prices, and confirmation

A quote freezes the unit price for `quote.ttlSeconds` off a live match (30) and `quote.ttlLiveSeconds` during a live match (8). Filling uses that price until it expires. An expired quote is rejected with `QUOTE_EXPIRED`. The user must accept a new quote. That is the price-change confirmation.

If the mid the user was looking at differs from the current mid by at least `quote.confirmBps` (50 bps, 0.5%), quote creation returns `PRICE_CHANGED` until the client sends `confirmPriceChange`.

The feed is stale when the newest tick is older than `feed.staleAfterSeconds` (30), or when there is no tick. Stale feeds reject new quotes and new fills. The screen says trading is paused. Nothing is queued for later.

Financial requests are not cached by the service worker and are not stored for offline replay. The buttons do nothing while the browser is offline.

## Event-driven fair value

`pricing.engineMode` is `SIMULATION` or `EVENT_DRIVEN`. `PRICING_ENGINE_MODE` can set the same two values. The mode is never inferred from `NODE_ENV`.

```
total bps = performance bps + demand bps + news bps
new mid = round_half_away(previous mid × (1_000_000 + total bps × 100) / 1_000_000)
```

Performance, demand, and news are stored separately. The target importance is 55 / 25 / 20. Those weights are not a second multiplier on the event tables. Company profit is not an input. Risk exposure is calculated separately and does not change the mid.

Performance rules live in `PERFORMANCE_RULES`. Context multipliers are 1, 1.25, 1.5, and 2, and they apply only to performance events. A player is capped at ±12% performance per match and ±18% from the match anchor. Demand uses completed notional over `pricing.demandWindowSeconds` (300), needs at least two trades, and is capped at ±25 bps per window and ±200 bps per 24 hours. Unverified news contributes 0. Verified news is capped at ±5% per event. `NOT_SELECTED` moves the mid by −1% to −2.5% and leaves the player tradable.

`newsPriceMovementEnabled` and `demandPriceMovementEnabled` force that contribution to 0. The same match or news id cannot move the price twice.

## Simulation

`src/domain/pricing.ts` is labelled `SIMULATION_ONLY`. It is not a production pricing formula.

```
score = 0.5 * performance + 0.3 * demand + 0.2 * news
```

Each input is clamped to [-1, 1]. The move is capped at `pricing.simulationCapBps` (200 bps, 2% per tick). The next mid cannot fall below ₹1. Set `pricing.mode` to `paused` to stop new simulated ticks. Admin price edits append a tick with source `admin` and do not delete history.

Match events in this build are simulated commentary. They are not a live score feed.

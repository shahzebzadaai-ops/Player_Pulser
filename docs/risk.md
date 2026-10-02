# Risk and exposure

The price engine sets the mid. The risk engine decides whether a new order may add exposure. It does not change performance, demand, news, the mid, or the spread, and it does not close an existing position.

Marked value for a holding is `quantity remaining × current mid`. Customer unrealized P&L is marked value minus the remaining cost stored on the lots. Platform liability for a player is the marked value of every open Pulser in that player.

A buy is projected as the current marked exposure plus `requested quantity × current mid`. There is no partial fill. If the projection crosses a hard limit, the order is rejected with `RISK_LIMIT` and one of `USER_PLAYER_LIMIT`, `USER_TOTAL_LIMIT`, or `PLAYER_PLATFORM_LIMIT`.

Player state uses platform liability against `risk.maxPlatformPlayerLiabilityPaise`:

- below `risk.warningThresholdPct` (70): NORMAL
- from that threshold: WARNING, which alerts staff and still allows buys
- from `risk.restrictedThresholdPct` (90): RESTRICTED, which rejects new buys
- PAUSED is only a manual emergency state

Sells that reduce a holding stay open in WARNING and RESTRICTED. PAUSED rejects both sides. `liveTradingEnabled` still applies before this check.

A holder with at least `risk.singleUserConcentrationAlertPct` (10) of the outstanding Pulsers raises an attention item. That alert does not by itself change the price or pause the player.

Development defaults are ₹100,000 per user per player, ₹500,000 per user in total, and ₹5,000,000 of marked liability per player. Changing a risk setting needs `settings.manage`, a reason, and an audit row.

Pause new buys needs `risk.manage`. Pause all trading needs `risk.pause`. Both require a reason and an audit row. A risk history row is written only when the effective state changes.

The admin pages read the stored state. They do not recalculate it. Reevaluation runs after a filled buy or sell, after a mid price actually changes (simulation, event-driven pricing, or a staff price override), after a platform-limit or threshold setting is saved, and after a manual pause or resume. `PAUSE_ALL` stays in force until staff resume trading. `PAUSE_BUYS` stays in force until staff resume new buys. With `AUTO`, a later fall in marked exposure moves RESTRICTED back to WARNING or NORMAL on its own.

Customer order errors name the position limit or say that buys or trading are temporarily unavailable. They do not include platform liability, company exposure, platform limits, or another customer's holding.

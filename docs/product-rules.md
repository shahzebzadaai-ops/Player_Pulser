# Product rules

PlayerPulser lets a customer buy and sell Pulsers, which are whole-number holdings in a named cricket player, and keep cash and bonus in a wallet.

The customer app has Home, Market, a player screen with the trade ticket, Portfolio, Rewards, and Wallet. Admin has Overview, Players, Users, Wallets, Trades, Bonuses, Payments, and Settings. Admin pages and admin APIs both require an admin session. A customer who opens `/admin` is sent home. An anonymous visitor is sent to log in.

Sign-up is phone-first, with email and password as the second tab from the design. New accounts receive the welcome bonus once. Password login works in every environment. The passwordless development login and the OTP that prints its code on screen do not.

Prices on the seeded board are fictional. The player list is a recognisable set of Indian international players for development. It is not a verified current squad. Portraits are generated marks, not photographs.

Buying the same player more than once is allowed. The portfolio keeps every trade and also shows one average cost per player. Sales can be smaller than the holding.

Cash and bonus are separate. Bonus-derived amounts are not withdrawable until the bonus rules convert them. The 95% withdrawal leaves the other 5% in the customer's cash.

Real-money launch still depends on operating permission, a payment provider, and the right to use player data. This build does not take real payments.

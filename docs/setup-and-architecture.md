# Setup and architecture

## What you need

Node.js 20.9 or newer (this machine has Node 24) and npm. Git is used for history.

Docker Compose is the intended way to run PostgreSQL and Redis:

```bash
docker compose up -d
```

Docker is not installed on this Windows machine, and there is no administrator account for installing it. `npm run dev:all` therefore starts a user-space PostgreSQL on port 5432 via `embedded-postgres`, then migrates, seeds, and starts the web app and the worker. Redis is used when `REDIS_URL` connects. If it does not, live prices are read from PostgreSQL every few seconds. That fallback does not cache private wallet data.

## First run

```bash
copy .env.example .env
npm install
npm run dev:all
```

Open http://localhost:3000.

Development accounts after seeding:

- Customer: `9876543210` / `dev-fan-1`
- Admin: `9000000001` / the value of `ADMIN_SEED_PASSWORD` (local default `dev-admin-1`)

The login screen also shows a development login and a development OTP while `DEV_AUTH_ENABLED=true` and `NODE_ENV` is not `production`. Both routes answer 404 in production even if the flag is left on.

## Layout

- `src/app` customer screens, admin screens, and route handlers
- `src/domain` pure money, quote, bonus, and withdrawal rules
- `src/server` ledger, trading, bonuses, payments, auth, and the worker
- `prisma` schema, migrations, and seed
- `src/proxy.ts` sends anonymous visitors to login. Admin permission is checked again on the server.

The worker (`npm run worker`) is a separate process. It simulates prices, expires bonuses, and retries payments. Page requests do not do that work.

## Data

- Balances are the sum of `LedgerEntry` rows. Journals must sum to zero.
- Holdings are lots. Selling walks the oldest lot first.
- Money in JSON is a paise string. Display text is not parsed back into a balance.
- Timestamps are `timestamptz` (UTC).

## Checks

```bash
npm test
npm run test:db
npm run lint
npm run build
```

## Backup and restore

`scripts/backup.ps1` writes a custom-format dump with `pg_dump`. `scripts/restore.ps1` loads one with `pg_restore`. Point `DATABASE_URL` at the database you mean to change before restoring. Keep dumps outside git. The `backups/` directory is gitignored by the dump files living next to local data; do not commit them.

## Secrets

`.env` is gitignored. `.env.example` lists every variable. Do not put production passwords, provider secrets, or private keys in the repo or in chat.

# PlayerPulser production checklist

Run these on the Ubuntu VPS, from the application directory. Do not copy the Windows `.env` file. Do not run `prisma migrate dev`. Do not start embedded Postgres.

## One-time setup

1. `bash deploy/install-vps.sh`
2. If anything is missing: `bash deploy/install-vps.sh --install-missing`
3. Create the database. PostgreSQL must stay on localhost.

```sql
sudo -u postgres psql
CREATE USER playerpulser WITH PASSWORD 'choose-a-long-password';
CREATE DATABASE playerpulser OWNER playerpulser;
REVOKE ALL ON DATABASE playerpulser FROM PUBLIC;
\c playerpulser
GRANT ALL ON SCHEMA public TO playerpulser;
```

4. Edit `config/production.json`. Replace `example.com` with the real domain.
5. Copy the secrets template and fill it in. This file stays off git.

```bash
cp config/secrets.production.example.json config/secrets.production.json
```

Put the database URL and a random `authSecret` of at least 32 characters in that file.

6. Create the media directory. Deployments do not delete it.

```bash
sudo mkdir -p /var/lib/playerpulser/media
sudo chown "$USER":"$USER" /var/lib/playerpulser/media
```

7. Install, migrate, and build.

```bash
npm ci --include=dev
npx prisma generate
npx prisma migrate deploy
CONFIRM_PRODUCTION_SEED=yes npm run db:production-seed
npm run build
```

8. Create the first admin. The password is typed at the prompt and is not stored in git.

```bash
npm run admin:create
```

9. Edit `deploy/nginx.conf.example`, replace `example.com`, then:

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/playerpulser
sudo ln -s /etc/nginx/sites-available/playerpulser /etc/nginx/sites-enabled/playerpulser
sudo nginx -t && sudo systemctl reload nginx
```

Skip the copy if that site file already exists. Do not replace an existing site by accident.

10. Put HTTPS in front of the site before real logins. Production cookies are Secure.
11. Start the two processes:

```bash
pm2 start deploy/ecosystem.config.js
pm2 save
```

Confirm only these two app names are running: `playerpulser-web` and `playerpulser-worker`.

```bash
pm2 status
```

## Later updates

```bash
bash deploy/update-app.sh
```

## Database backup

```bash
bash deploy/backup-db.sh
```

Backups go to `/var/backups/playerpulser` unless `PP_BACKUP_DIR` is set. Do not commit them.

Media backup:

```bash
tar -C /var/lib/playerpulser -czf /var/backups/playerpulser/media-$(date -u +%Y%m%dT%H%M%SZ).tar.gz media
```

Restore steps are in `deploy/restore-db.md`.

## Smoke test

Open the real domain over HTTPS. Confirm the response is from `next start`, not `next dev`.

- `/`
- Market
- Home
- Virat player page
- `/p/virat-kohli`
- login
- signup
- admin
- wallet
- deposit page
- terms
- privacy
- risk disclosure
- bonus terms
- payment policy
- responsible use
- complaints
- `/robots.txt`
- `/sitemap.xml`
- a player image under `/assets/players/`
- `/api/health` shows `web: alive`, `database: reachable`, and `worker: alive`

Also confirm:

- `pm2 status` shows one web process and one worker
- login stays signed in after a refresh
- Pulse preview is off
- real-source pricing is off
- deposit does not complete a simulated payment
- `/dev/payments` is not available

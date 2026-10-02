# Restore a PlayerPulser backup

Stop the site first so nothing writes during the restore:

```bash
pm2 stop playerpulser-web playerpulser-worker
```

Restore into the existing `playerpulser` database. This replaces the data in that database.

```bash
pg_restore --clean --if-exists --no-owner --dbname="postgresql://playerpulser:PASSWORD@127.0.0.1:5432/playerpulser" /var/backups/playerpulser/playerpulser-TIMESTAMP.dump
```

Use the password from `config/secrets.production.json`. Do not put that password in git.

Start the site again:

```bash
pm2 start playerpulser-web playerpulser-worker
```

Uploaded images are not inside the database dump. Restore `/var/lib/playerpulser/media` from its own copy if you need those files back.

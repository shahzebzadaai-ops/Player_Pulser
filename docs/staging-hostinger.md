# Staging on a Hostinger KVM

Nothing has been deployed. This machine has no SSH config and no `.ssh` directory, so no server was contacted.

## What is prepared

`deploy/staging/docker-compose.yml` builds the app and worker, plus Postgres and Redis. The app listens on `127.0.0.1:3010` only. It does not bind ports 80 or 443, so it does not replace a site that is already on the VPS.

Before that file is used on a server, the impact is: Docker will create new containers and a new database volume named for this compose project. It will not, by itself, stop another site. Pointing a domain at port 3010 is a separate change and should wait until the domain is confirmed free.

## Still needed from you

- The VPS address
- How SSH should authenticate (a key you install, not a password pasted here)
- The staging hostname

Do not send a private key or a password in chat.

## Still blocking a real-money launch

Operating permission, payment-provider approval, and rights to player names and data. Until those exist, keep `PAYMENT_PROVIDER=simulated` and do not set `ALLOW_SIMULATED_PAYMENTS` on a public host unless the host is an explicit simulation.

#!/usr/bin/env bash
# Checks the VPS. Installs missing packages only when you pass --install-missing.
# Does not edit Nginx sites, PostgreSQL config, or the application database.
set -euo pipefail

echo "PlayerPulser VPS check"
echo "This script does not overwrite existing server configuration."
echo

missing=0
check() {
  if command -v "$1" >/dev/null 2>&1; then
    echo "OK  $1"
  else
    echo "MISSING  $1"
    missing=1
  fi
}

check node
check npm
check git
check nginx
check psql
check pm2

if command -v node >/dev/null 2>&1; then
  major="$(node -p "process.versions.node.split('.')[0]")"
  if [ "$major" -lt 20 ]; then
    echo "Node is older than 20. Install Node.js 22 before building. This script will not upgrade an existing Node."
    missing=1
  fi
fi

echo
echo "PostgreSQL must listen on localhost only. This script does not change that."
echo "Create the database yourself:"
echo "  sudo -u postgres psql"
echo "  CREATE USER playerpulser WITH PASSWORD 'choose-a-long-password';"
echo "  CREATE DATABASE playerpulser OWNER playerpulser;"
echo "  REVOKE ALL ON DATABASE playerpulser FROM PUBLIC;"
echo "  \\c playerpulser"
echo "  GRANT ALL ON SCHEMA public TO playerpulser;"
echo
echo "Do not open ports 3000 or 5432 in the firewall. Allow 80 and 443 only."
echo

if [ "${1:-}" != "--install-missing" ]; then
  echo "Re-run with --install-missing to install missing Git, Nginx, PostgreSQL, Node, or PM2."
  echo "Existing installs are left as they are."
  exit 0
fi

if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo is required for package installs."
  exit 1
fi

sudo apt-get update
if ! command -v git >/dev/null 2>&1; then sudo apt-get install -y git; fi
if ! command -v nginx >/dev/null 2>&1; then sudo apt-get install -y nginx; fi
if ! command -v psql >/dev/null 2>&1; then sudo apt-get install -y postgresql postgresql-contrib; fi
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  echo "Node is already installed. Not changing it."
fi
if ! command -v pm2 >/dev/null 2>&1; then sudo npm install -g pm2; fi

echo
echo "Packages checked. Nginx site files and PostgreSQL were not modified."
echo "Next: edit config/production.json, create config/secrets.production.json, then follow deploy/production-checklist.md."

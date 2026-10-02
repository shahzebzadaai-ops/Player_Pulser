const path = require("path");
const root = path.join(__dirname, "..");
const { env } = require(path.join(root, "scripts", "read-production-config.cjs"));

module.exports = {
  apps: [
    {
      name: "playerpulser-web",
      cwd: root,
      script: path.join(root, "node_modules", "next", "dist", "bin", "next"),
      args: "start -H 127.0.0.1 -p 3000",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      kill_timeout: 15000,
      env,
    },
    {
      name: "playerpulser-worker",
      cwd: root,
      script: path.join(root, "node_modules", "tsx", "dist", "cli.mjs"),
      args: "src/server/worker/main.ts",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      kill_timeout: 15000,
      env: { ...env, PLAYERPULSER_DB_ROLE: "worker" },
    },
  ],
};

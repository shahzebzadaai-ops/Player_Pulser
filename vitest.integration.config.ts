import path from "path";
import { defineConfig } from "vitest/config";

const databaseUrl = "postgresql://playerpulser:playerpulser@127.0.0.1:54329/playerpulser_test";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    globalSetup: ["./scripts/test-db.ts"],
    env: {
      DATABASE_URL: databaseUrl,
      DEV_AUTH_ENABLED: "true",
      PAYMENT_PROVIDER: "simulated",
      SIMULATED_PAYMENTS_AUTO_SETTLE: "false",
      PAYMENT_WEBHOOK_SECRET: "test-webhook-secret",
      AUTH_SECRET: "test-secret-test-secret-test-secret",
      NODE_ENV: "test",
    },
    hookTimeout: 180000,
    testTimeout: 60000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});

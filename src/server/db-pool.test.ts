import { describe, expect, it } from "vitest";
import { applyPoolParams, resolveDatabaseUrl } from "./db-pool";

const base = "postgresql://playerpulser:playerpulser@127.0.0.1:5432/playerpulser";

describe("database pool urls", () => {
  it("gives the local app and worker separate limits", () => {
    const app = new URL(resolveDatabaseUrl({ role: "app", nodeEnv: "development", databaseUrl: base }));
    const worker = new URL(resolveDatabaseUrl({ role: "worker", nodeEnv: "development", databaseUrl: base, workerDatabaseUrl: base }));
    expect(app.searchParams.get("connection_limit")).toBe("10");
    expect(app.searchParams.get("pool_timeout")).toBe("30");
    expect(worker.searchParams.get("connection_limit")).toBe("5");
    expect(worker.searchParams.get("pool_timeout")).toBe("30");
  });

  it("leaves production and test urls unchanged", () => {
    expect(resolveDatabaseUrl({ role: "app", nodeEnv: "production", databaseUrl: base })).toBe(base);
    expect(resolveDatabaseUrl({ role: "worker", nodeEnv: "test", databaseUrl: base })).toBe(base);
  });

  it("does not replace an explicit pool already on the url", () => {
    const explicit = `${base}?connection_limit=3&pool_timeout=8`;
    const resolved = applyPoolParams(explicit, { connectionLimit: 10, poolTimeout: 30 });
    const url = new URL(resolved);
    expect(url.searchParams.get("connection_limit")).toBe("3");
    expect(url.searchParams.get("pool_timeout")).toBe("8");
  });

  it("uses the worker url when one is configured", () => {
    const workerUrl = "postgresql://playerpulser:playerpulser@127.0.0.1:5432/playerpulser?connection_limit=4";
    const resolved = resolveDatabaseUrl({
      role: "worker",
      nodeEnv: "development",
      databaseUrl: base,
      workerDatabaseUrl: workerUrl,
    });
    expect(new URL(resolved).searchParams.get("connection_limit")).toBe("4");
    expect(new URL(resolved).searchParams.get("pool_timeout")).toBe("30");
  });
});

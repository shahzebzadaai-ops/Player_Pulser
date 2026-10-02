export type DbRole = "app" | "worker";

const LOCAL_POOL = {
  app: { connectionLimit: 10, poolTimeout: 30 },
  worker: { connectionLimit: 5, poolTimeout: 30 },
} as const;

export function usesLocalPool(nodeEnv: string | undefined): boolean {
  return nodeEnv !== "production" && nodeEnv !== "test";
}

export function resolveDatabaseUrl(input: {
  role: DbRole;
  nodeEnv: string | undefined;
  databaseUrl: string | undefined;
  workerDatabaseUrl?: string | undefined;
}): string {
  const base = (input.role === "worker" ? input.workerDatabaseUrl || input.databaseUrl : input.databaseUrl) ?? "";
  if (!base || !usesLocalPool(input.nodeEnv)) return base;
  return applyPoolParams(base, LOCAL_POOL[input.role]);
}

export function applyPoolParams(databaseUrl: string, pool: { connectionLimit: number; poolTimeout: number }): string {
  try {
    const url = new URL(databaseUrl);
    if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", String(pool.connectionLimit));
    if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", String(pool.poolTimeout));
    return url.toString();
  } catch {
    const separator = databaseUrl.includes("?") ? "&" : "?";
    return `${databaseUrl}${separator}connection_limit=${pool.connectionLimit}&pool_timeout=${pool.poolTimeout}`;
  }
}

export function poolNumbers(databaseUrl: string): { connectionLimit: number | null; poolTimeout: number | null } {
  try {
    const url = new URL(databaseUrl);
    const limit = Number(url.searchParams.get("connection_limit"));
    const timeout = Number(url.searchParams.get("pool_timeout"));
    return {
      connectionLimit: Number.isFinite(limit) ? limit : null,
      poolTimeout: Number.isFinite(timeout) ? timeout : null,
    };
  } catch {
    return { connectionLimit: null, poolTimeout: null };
  }
}

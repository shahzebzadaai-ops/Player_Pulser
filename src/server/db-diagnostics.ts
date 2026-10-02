export type DbDiagnostics = {
  role: "app" | "worker";
  connectionLimit: number | null;
  poolTimeout: number | null;
  active: number;
  poolTimeouts: number;
  slowQueries: number;
  lastSlowQuery: string | null;
};

const state: DbDiagnostics = {
  role: "app",
  connectionLimit: null,
  poolTimeout: null,
  active: 0,
  poolTimeouts: 0,
  slowQueries: 0,
  lastSlowQuery: null,
};

const SLOW_MS = 1_000;

export function configureDbDiagnostics(input: { role: "app" | "worker"; connectionLimit: number | null; poolTimeout: number | null }): void {
  state.role = input.role;
  state.connectionLimit = input.connectionLimit;
  state.poolTimeout = input.poolTimeout;
}

export function dbDiagnostics(): DbDiagnostics {
  return { ...state };
}

export function trackDbOperation<T>(label: string, run: () => Promise<T>): Promise<T> {
  const started = Date.now();
  state.active += 1;
  return run()
    .catch((error: unknown) => {
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      if (code === "P2024") state.poolTimeouts += 1;
      throw error;
    })
    .finally(() => {
      state.active = Math.max(0, state.active - 1);
      const elapsed = Date.now() - started;
      if (elapsed >= SLOW_MS && process.env.NODE_ENV !== "test") {
        state.slowQueries += 1;
        state.lastSlowQuery = `${label} ${elapsed}ms`;
        console.warn(JSON.stringify({ level: "warn", message: "slow database query", label, elapsedMs: elapsed, at: new Date().toISOString() }));
      }
    });
}

import { Prisma, PrismaClient } from "@prisma/client";
import { poolNumbers, resolveDatabaseUrl, usesLocalPool } from "./db-pool";
import { configureDbDiagnostics, trackDbOperation } from "./db-diagnostics";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; prismaRole?: string };

function createPrismaClient(): PrismaClient {
  const role = process.env.PLAYERPULSER_DB_ROLE === "worker" ? "worker" : "app";
  const url = resolveDatabaseUrl({
    role,
    nodeEnv: process.env.NODE_ENV,
    databaseUrl: process.env.DATABASE_URL,
    workerDatabaseUrl: process.env.WORKER_DATABASE_URL,
  });
  const pool = poolNumbers(url);
  configureDbDiagnostics({ role, connectionLimit: pool.connectionLimit, poolTimeout: pool.poolTimeout });
  const base = new PrismaClient({
    ...(url ? { datasources: { db: { url } } } : {}),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  const client = base.$extends({
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          return trackDbOperation(`${model ?? "query"}.${operation}`, () => query(args));
        },
      },
    },
  }) as unknown as PrismaClient;
  if (usesLocalPool(process.env.NODE_ENV)) {
    console.log(JSON.stringify({
      level: "info",
      message: "prisma client ready",
      role,
      pid: process.pid,
      connectionLimit: pool.connectionLimit,
      poolTimeout: pool.poolTimeout,
      at: new Date().toISOString(),
    }));
  }
  return client;
}

const role = process.env.PLAYERPULSER_DB_ROLE === "worker" ? "worker" : "app";
export const prisma = globalForPrisma.prisma && globalForPrisma.prismaRole === role ? globalForPrisma.prisma : createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaRole = role;
}

export type Tx = PrismaClient | Prisma.TransactionClient;

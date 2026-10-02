import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";
import { startPostgres } from "./postgres";

const databaseUrl = "postgresql://playerpulser:playerpulser@127.0.0.1:54329/playerpulser_test";

export default async function setup() {
  await startPostgres(54329, "playerpulser_test");
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length > 0) {
    const list = tables.map((table) => `"${table.tablename}"`).join(", ");
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  }
  await prisma.$disconnect();
}

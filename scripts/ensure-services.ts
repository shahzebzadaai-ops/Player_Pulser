import "dotenv/config";
import { startPostgres } from "./postgres";

async function main() {
  await startPostgres();
  console.log("Local Postgres is running. Leave this process open. Redis is optional; without it, live prices are read from Postgres.");
  await new Promise(() => undefined);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

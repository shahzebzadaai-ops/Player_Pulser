import EmbeddedPostgres from "embedded-postgres";
import net from "net";
import path from "path";

export function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    const finish = (open: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

export async function startPostgres(port = 5432, database = "playerpulser") {
  if (await portOpen(port)) {
    console.log(`Postgres is already accepting connections on ${port}.`);
    return null;
  }
  const pg = new EmbeddedPostgres({
    databaseDir: path.join(process.cwd(), ".data", `postgres-${port}`),
    user: "playerpulser",
    password: "playerpulser",
    port,
    persistent: true,
  });
  try {
    await pg.initialise();
  } catch {
    console.log("Using the existing Postgres data directory.");
  }
  await pg.start();
  try {
    await pg.createDatabase(database);
  } catch {
    console.log(`Database ${database} already exists.`);
  }
  console.log(`Postgres ready on ${port}, database ${database}.`);
  return pg;
}

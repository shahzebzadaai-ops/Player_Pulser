import "dotenv/config";
import { spawn, execSync } from "child_process";
import { startPostgres } from "./postgres";

async function main() {
  await startPostgres();
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
  execSync("npx prisma db seed", { stdio: "inherit" });
  startApp();
}

function startApp() {

const children = [
  spawn("npm", ["run", "dev"], { stdio: "inherit", shell: true }),
  spawn("npm", ["run", "worker"], { stdio: "inherit", shell: true }),
];

process.on("SIGINT", () => {
  for (const child of children) child.kill();
  process.exit(0);
});
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

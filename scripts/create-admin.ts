import { createRequire } from "node:module";
import readline from "node:readline";
import { normalizeIndianPhone, passwordIssue } from "../src/domain/phone";

const require = createRequire(import.meta.url);
const { env } = require("./read-production-config.cjs") as { env: Record<string, string> };

for (const [key, value] of Object.entries(env)) {
  if (value && process.env[key] === undefined) process.env[key] = value;
}

function ask(label: string, hidden: boolean): Promise<string> {
  if (!hidden || !process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
      rl.question(label, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }
  return new Promise((resolve) => {
    process.stdout.write(label);
    const chars: string[] = [];
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const onData = (key: string) => {
      if (key === "\u0003") process.exit(1);
      if (key === "\r" || key === "\n") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.off("data", onData);
        process.stdout.write("\n");
        resolve(chars.join("").trim());
        return;
      }
      if (key === "\u007f" || key === "\b") {
        chars.pop();
        return;
      }
      chars.push(key);
    };
    process.stdin.on("data", onData);
  });
}

async function main() {
  const phoneInput = process.env.ADMIN_PHONE?.trim() || (await ask("Admin phone: ", false));
  const password = process.env.ADMIN_PASSWORD || (await ask("Admin password: ", true));
  const displayName = process.env.ADMIN_NAME?.trim() || "Pulser Admin";
  const force = process.argv.includes("--force");
  const phone = normalizeIndianPhone(phoneInput);
  if (!phone) throw new Error("Enter a valid Indian mobile number.");
  if (password === "dev-admin-1" || password === "dev-fan-1") {
    throw new Error("Choose a new password. Development passwords are refused.");
  }
  const issue = passwordIssue(password);
  if (issue || password.length < 12) {
    throw new Error("Use at least 12 characters, including a number.");
  }

  const { prisma } = await import("../src/server/prisma");
  const { hashPassword } = await import("../src/server/auth");
  const passwordHash = await hashPassword(password);
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing && !force) {
    throw new Error("That phone already exists. Re-run with --force to set a new password.");
  }

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash, role: "ADMIN", displayName },
      })
    : await prisma.user.create({
        data: { phone, displayName, passwordHash, role: "ADMIN" },
      });

  await prisma.staffAccount.upsert({
    where: { userId: user.id },
    create: { userId: user.id, staffRole: "SUPER_ADMIN", active: true },
    update: { staffRole: "SUPER_ADMIN", active: true },
  });
  if (existing && force) {
    await prisma.session.deleteMany({ where: { userId: user.id } });
  }

  console.log(`SUPER_ADMIN ready for ${phone}.`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

import readline from "node:readline";
import { passwordIssue } from "../src/domain/phone";

export function readSecret(label: string, envValue: string | undefined): Promise<string> {
  const fromEnv = envValue ?? "";
  if (fromEnv) return Promise.resolve(fromEnv);
  if (!process.stdin.isTTY) {
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

export function assertAdminPassword(password: string): void {
  if (password === "dev-admin-1" || password === "dev-fan-1") {
    throw new Error("Choose a new password. Development passwords are refused.");
  }
  if (passwordIssue(password) || password.length < 12) {
    throw new Error("Use at least 12 characters, including a number.");
  }
}

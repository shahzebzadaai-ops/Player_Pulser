import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, userFromToken } from "./auth";

export async function getCurrentUser() {
  const jar = await cookies();
  return userFromToken(jar.get(SESSION_COOKIE)?.value);
}

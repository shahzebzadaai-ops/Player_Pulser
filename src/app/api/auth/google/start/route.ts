import { beginGoogle } from "@/server/google-auth";

export async function GET(request: Request) {
  return beginGoogle(request);
}

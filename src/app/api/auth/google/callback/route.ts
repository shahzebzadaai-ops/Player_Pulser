import { finishGoogle } from "@/server/google-auth";

export async function GET(request: Request) {
  return finishGoogle(request);
}

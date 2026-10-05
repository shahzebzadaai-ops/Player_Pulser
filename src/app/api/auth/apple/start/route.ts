import { beginApple } from "@/server/apple-auth";

export async function GET(request: Request) {
  return beginApple(request);
}

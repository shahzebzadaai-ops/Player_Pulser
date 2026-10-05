import { finishApple } from "@/server/apple-auth";

export async function POST(request: Request) {
  return finishApple(request);
}

export async function GET(request: Request) {
  return finishApple(request);
}

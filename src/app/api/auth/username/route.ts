import { z } from "zod";
import { normalizeUsername } from "@/domain/username";
import { assertSameOrigin, handle, json, readBody, requireUser } from "@/server/http";
import { prisma } from "@/server/prisma";

const schema = z.object({ username: z.string().max(40) });

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const body = await readBody(request, schema);
    const username = normalizeUsername(body.username);
    if (!username) return json({ valid: false, available: false });
    const taken = await prisma.user.findFirst({ where: { usernameNormalized: username, NOT: { id: user.id } }, select: { id: true } });
    return json({ valid: true, available: !taken });
  });
}
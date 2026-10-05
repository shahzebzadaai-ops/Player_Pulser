import { z } from "zod";
import { normalizeEmail } from "@/domain/identities";
import { emailAccountNext } from "@/domain/provider-setup";
import { AppError } from "@/domain/errors";
import { assertSameOrigin, handle, json, readBody } from "@/server/http";
import { prisma } from "@/server/prisma";

const schema = z.object({ email: z.string() });

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const body = await readBody(request, schema);
    const email = normalizeEmail(body.email);
    if (!email) throw new AppError("INVALID", "Enter a valid email address.", 400);
    const user = await prisma.user.findUnique({
      where: { email },
      select: { passwordHash: true, identities: { select: { provider: true } } },
    });
    return json({
      next: emailAccountNext(user ? { passwordHash: user.passwordHash, providers: user.identities.map((identity) => identity.provider) } : null),
    });
  });
}

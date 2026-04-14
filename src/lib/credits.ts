import prisma from "@/src/lib/prisma";

export class InsufficientCreditsError extends Error {
  readonly code = "INSUFFICIENT_CREDITS" as const;
  constructor() {
    super("INSUFFICIENT_CREDITS");
  }
}

export async function consumeCredits(params: {
  userEmail: string;
  amount: number;
  action: string;
}) {
  const amount = Math.max(0, Math.floor(params.amount));
  if (!params.userEmail?.trim()) throw new Error("Missing userEmail");
  if (!params.action?.trim()) throw new Error("Missing action");
  if (amount <= 0) {
    // No-op consumption; still return current user.
    const user = await prisma.user.findUnique({ where: { email: params.userEmail } });
    if (!user) throw new Error("User not found");
    return user;
  }

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { email: params.userEmail },
      select: { id: true, email: true, credits: true, plan: true },
    });
    if (!user) throw new Error("User not found");
    if (user.credits < amount) throw new InsufficientCreditsError();

    const updated = await tx.user.update({
      where: { id: user.id },
      data: { credits: { decrement: amount } },
    });

    await tx.creditLog.create({
      data: {
        userId: user.id,
        action: params.action,
        creditsUsed: amount,
      },
    });

    return updated;
  });
}


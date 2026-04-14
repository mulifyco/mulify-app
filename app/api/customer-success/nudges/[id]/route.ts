import { NextResponse } from "next/server";
import { CustomerNudgeStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { updateNudgeStatus } from "@/server/services/customer-success.service";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const u = session?.user as { id?: string } | undefined;
  const userId = u?.id;
  if (!session || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const status = typeof body?.status === "string" ? body.status.trim() : "";
  if (!(Object.values(CustomerNudgeStatus) as string[]).includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  try {
    const updated = await updateNudgeStatus({ userId, nudgeId: id, status: status as CustomerNudgeStatus });
    return NextResponse.json({ ok: true, nudge: updated });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}


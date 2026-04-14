import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { computeCustomerHealth, getLatestHealthSnapshot, upsertCustomerHealthSnapshot } from "@/server/services/customer-success.service";

export const dynamic = "force-dynamic";

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

export async function GET() {
  const session = await auth();
  const u = session?.user as { id?: string } | undefined;
  const userId = u?.id;
  if (!session || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const latest = await getLatestHealthSnapshot({ userId }).catch(() => null);
  if (!latest || latest.createdAt < hoursAgo(12)) {
    await upsertCustomerHealthSnapshot({ userId }).catch(() => null);
  }

  const snapshot = await getLatestHealthSnapshot({ userId }).catch(() => null);
  const computed = await computeCustomerHealth({ userId }).catch(() => null);
  return NextResponse.json({ snapshot, computed });
}


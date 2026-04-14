import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ensureWeeklyDigest, getLatestCustomerDigest } from "@/server/services/customer-success.service";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const u = session?.user as { id?: string } | undefined;
  const userId = u?.id;
  if (!session || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const latest = await getLatestCustomerDigest({ userId }).catch(() => null);
  const digest = latest ?? (await ensureWeeklyDigest({ userId }).catch(() => null));
  if (!digest) return NextResponse.json({ error: "Failed" }, { status: 500 });
  return NextResponse.json({ digest });
}


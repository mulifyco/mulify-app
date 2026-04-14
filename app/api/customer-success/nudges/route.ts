import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateCustomerNudges, listCustomerNudges } from "@/server/services/customer-success.service";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const u = session?.user as { id?: string } | undefined;
  const userId = u?.id;
  if (!session || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await generateCustomerNudges({ userId }).catch(() => null);
  const nudges = await listCustomerNudges({ userId, status: "OPEN", take: 10 }).catch(() => []);
  return NextResponse.json({ nudges });
}


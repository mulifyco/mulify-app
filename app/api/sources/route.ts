import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { SourceRepository } from "@/server/repositories/source.repository";
import { z } from "zod";

const createSourceSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["META_ADS", "SHOPIFY_STOREFRONT", "MANUAL"] as const),
  config: z.record(z.string(), z.unknown()),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10);
  const type = searchParams.get("type") ?? undefined;
  const status = searchParams.get("status") ?? undefined;

  const result = await SourceRepository.list({
    type: type as never,
    status: status as never,
    page,
    pageSize,
  });

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSourceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const source = await SourceRepository.create(parsed.data);
  return NextResponse.json(source, { status: 201 });
}

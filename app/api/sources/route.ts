import { NextRequest, NextResponse } from "next/server";
import { ProductEventType } from "@/lib/analytics/product-event-types";
import { auth } from "@/lib/auth";
import { SourceRepository } from "@/server/repositories/source.repository";
import { z } from "zod";
import { trackProductEventFromSession } from "@/server/services/product-analytics.service";

const createSourceSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(
    [
      "META_ADS",
      "SHOPIFY_STOREFRONT",
      "SHOPIFY_DOMAIN",
      "MANUAL",
      "KEYWORD",
      "META_PAGE",
      "TIKTOK_PAGE",
      "CATEGORY",
    ] as const
  ),
  config: z.record(z.string(), z.unknown()).default({}),
  domain: z.string().min(1).optional(),
  pageUrl: z.string().min(1).optional(),
  query: z.string().min(1).optional(),
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
  void trackProductEventFromSession(session, {
    eventType: ProductEventType.SOURCE_CREATED,
    path: "/api/sources",
    entityType: "SOURCE",
    entityId: source.id,
    metadata: { type: parsed.data.type },
  });
  return NextResponse.json(source, { status: 201 });
}

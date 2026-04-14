import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonWithReadCache } from "@/lib/http/read-cache";
import prisma from "@/lib/prisma";
import { withRouteTiming } from "@/lib/perf/route-timing";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const { id } = await ctx.params;
  const row = await withRouteTiming("/api/reports/[id]", () =>
    prisma.report.findFirst({ where: { id, workspaceId } }).catch(() => null)
  );
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return jsonWithReadCache({ data: row });
}


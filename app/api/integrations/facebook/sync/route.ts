import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";
import { facebookEnqueueSync } from "@/lib/integrations/facebook";

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const res = await facebookEnqueueSync(workspaceId);
  if (!res.ok) {
    return NextResponse.json({ error: res.message }, { status: 409 });
  }
  return NextResponse.json({ queued: true, runId: res.runId });
}


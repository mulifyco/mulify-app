import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runIngestionJob } from "@/jobs/runner";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    // Job runs asynchronously — in Phase 1 this blocks until complete
    // Phase 2: push to a queue and return jobId immediately
    const result = await runIngestionJob(id, "manual");
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

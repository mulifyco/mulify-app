import { Suspense } from "react";
import AcceptInviteClient from "./AcceptInviteClient";

export const dynamic = "force-dynamic";

export default function AcceptInvitePage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="text-[10px] font-semibold text-muted uppercase tracking-[0.25em]">Mulify Library</div>
          <h1 className="text-xl font-semibold tracking-tight mt-1">Workspace invite</h1>
        </div>
        <Suspense fallback={<div className="text-sm text-muted text-center">Loading…</div>}>
          <AcceptInviteClient />
        </Suspense>
      </div>
    </div>
  );
}

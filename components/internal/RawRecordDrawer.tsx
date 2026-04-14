"use client";

import { useState } from "react";
import JsonPayloadViewer from "@/components/internal/JsonPayloadViewer";

export default function RawRecordDrawer({
  triggerLabel = "Open",
  title,
  payload,
}: {
  triggerLabel?: string;
  title: string;
  payload: unknown;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-indigo-400 hover:text-indigo-300"
      >
        {triggerLabel}
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-indigo-400 hover:text-indigo-300"
      >
        {triggerLabel}
      </button>

      <div className="fixed inset-0 z-50">
        <div
          className="absolute inset-0 bg-black/70"
          onClick={() => setOpen(false)}
        />
        <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-background border-l border-border overflow-y-auto">
          <div className="px-4 py-4 border-b border-border flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-muted uppercase tracking-wide">Payload</div>
              <div className="text-sm text-foreground truncate">{title}</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-1.5 text-xs rounded bg-surface-2 text-foreground hover:opacity-90 border border-border"
            >
              Close
            </button>
          </div>
          <div className="p-4">
            <JsonPayloadViewer data={payload} maxCollapsedHeight={520} />
          </div>
        </div>
      </div>
    </>
  );
}


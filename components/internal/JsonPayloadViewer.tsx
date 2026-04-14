"use client";

import { useState } from "react";

interface JsonPayloadViewerProps {
  data: unknown;
  maxCollapsedHeight?: number;
}

export default function JsonPayloadViewer({
  data,
  maxCollapsedHeight = 320,
}: JsonPayloadViewerProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const text = JSON.stringify(data, null, 2);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-surface-2">
        <span className="text-xs font-medium text-muted uppercase tracking-wide">JSON</span>
        <button
          type="button"
          onClick={copy}
          className="text-xs px-2 py-1 rounded bg-surface text-foreground hover:opacity-90 border border-border"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div
        className="relative"
        style={
          expanded
            ? undefined
            : { maxHeight: maxCollapsedHeight, overflow: "hidden" as const }
        }
      >
        <pre className="text-xs text-muted p-4 overflow-x-auto font-mono leading-relaxed whitespace-pre-wrap break-all">
          {text}
        </pre>
        {!expanded && text.length > 400 && (
          <div className="absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-[color:var(--surface)] to-transparent pointer-events-none" />
        )}
      </div>
      {text.length > 400 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full text-xs py-2 text-indigo-500 hover:text-indigo-600 bg-surface-2 border-t border-border"
        >
          {expanded ? "Show less" : "Expand full payload"}
        </button>
      )}
    </div>
  );
}

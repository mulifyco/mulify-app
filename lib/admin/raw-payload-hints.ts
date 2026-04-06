/** Best-effort strings from common payload shapes (adapter-specific). */
export function extractPayloadDebugHints(payload: unknown): string[] {
  const out: string[] = [];
  if (!payload || typeof payload !== "object") return out;
  const o = payload as Record<string, unknown>;
  const keys = ["warning", "warnings", "parseWarnings", "_warnings", "errors"] as const;
  for (const key of keys) {
    const v = o[key];
    if (typeof v === "string" && v.trim()) out.push(v.trim());
    if (Array.isArray(v)) {
      for (const x of v) {
        if (typeof x === "string" && x.trim()) out.push(x.trim());
      }
    }
  }
  return [...new Set(out)].slice(0, 25);
}

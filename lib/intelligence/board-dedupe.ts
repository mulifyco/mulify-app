/** Best-effort: same cluster id should not appear twice in a board API payload. */
export function dedupeBoardRowsByClusterId<T extends { clusterId: string }>(rows: T[]): T[] {
  const m = new Map<string, T>();
  for (const r of rows) {
    if (!m.has(r.clusterId)) m.set(r.clusterId, r);
  }
  return [...m.values()];
}

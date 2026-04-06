export function jsonSnippet(payload: unknown, max = 160): string {
  try {
    const s = JSON.stringify(payload);
    return s.length <= max ? s : `${s.slice(0, max)}…`;
  } catch {
    return "";
  }
}

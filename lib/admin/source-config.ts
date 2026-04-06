const SECRET_KEY_RE = /(token|secret|password|authorization|apikey|api_key|access_token|refresh_token|credential)/i;

function redactValue(key: string, value: unknown): unknown {
  if (SECRET_KEY_RE.test(key)) {
    return value === undefined || value === null || value === "" ? value : "[redacted]";
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return redactSourceConfigForDisplay(value as Record<string, unknown>);
  }
  if (Array.isArray(value)) {
    return value.map((v, i) =>
      typeof v === "object" && v !== null && !Array.isArray(v)
        ? redactSourceConfigForDisplay(v as Record<string, unknown>)
        : v
    );
  }
  return value;
}

/** Deep-clone config for UI / JSON viewer — masks obvious secret fields. */
export function redactSourceConfigForDisplay(config: unknown): unknown {
  if (!config || typeof config !== "object" || Array.isArray(config)) return config;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config as Record<string, unknown>)) {
    out[k] = redactValue(k, v);
  }
  return out;
}

export function isSourceConfigEnabled(config: unknown): boolean {
  if (!config || typeof config !== "object") return true;
  const e = (config as { enabled?: unknown }).enabled;
  if (typeof e === "boolean") return e;
  return true;
}

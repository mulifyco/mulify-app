import { sha256Hex } from "./crypto";

export type IntegrationEntityType = "CAMPAIGN" | "ADSET" | "AD" | "INSIGHT";

export type MappedIntegrationRecord = {
  entityType: IntegrationEntityType;
  externalId: string;
  payload: unknown;
  payloadHash: string;
};

function stableStringify(value: unknown): string {
  // Best-effort stable stringify for hashing.
  if (value === null || value === undefined) return String(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",")}}`;
}

export function mapFacebookPayloadsToIntegrationRecords(input: {
  campaigns: any[];
  adsets: any[];
  ads: any[];
  insights: any[];
}): MappedIntegrationRecord[] {
  const out: MappedIntegrationRecord[] = [];

  for (const c of input.campaigns ?? []) {
    const id = typeof c?.id === "string" ? c.id : null;
    if (!id) continue;
    const payload = c;
    out.push({
      entityType: "CAMPAIGN",
      externalId: id,
      payload,
      payloadHash: sha256Hex(stableStringify(payload)),
    });
  }

  for (const a of input.adsets ?? []) {
    const id = typeof a?.id === "string" ? a.id : null;
    if (!id) continue;
    const payload = a;
    out.push({
      entityType: "ADSET",
      externalId: id,
      payload,
      payloadHash: sha256Hex(stableStringify(payload)),
    });
  }

  for (const ad of input.ads ?? []) {
    const id = typeof ad?.id === "string" ? ad.id : null;
    if (!id) continue;
    const payload = ad;
    out.push({
      entityType: "AD",
      externalId: id,
      payload,
      payloadHash: sha256Hex(stableStringify(payload)),
    });
  }

  for (const ins of input.insights ?? []) {
    const adId = typeof ins?.ad_id === "string" ? ins.ad_id : "";
    const ds = typeof ins?.date_start === "string" ? ins.date_start : "";
    const de = typeof ins?.date_stop === "string" ? ins.date_stop : "";
    const externalId = [adId, ds, de].filter(Boolean).join(":") || stableStringify(ins);
    const payload = ins;
    out.push({
      entityType: "INSIGHT",
      externalId,
      payload,
      payloadHash: sha256Hex(stableStringify(payload)),
    });
  }

  return out;
}


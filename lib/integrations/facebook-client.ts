type FacebookGraphError = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
};

export type FacebookErrorKind =
  | "INVALID_TOKEN"
  | "EXPIRED_TOKEN"
  | "MISSING_PERMISSION"
  | "RATE_LIMIT"
  | "FB_4XX"
  | "FB_5XX"
  | "TIMEOUT"
  | "NETWORK"
  | "UNKNOWN";

export class FacebookApiError extends Error {
  kind: FacebookErrorKind;
  httpStatus: number | null;
  fbCode: number | null;
  fbSubcode: number | null;
  fbType: string | null;
  fbTraceId: string | null;

  constructor(args: {
    kind: FacebookErrorKind;
    message: string;
    httpStatus?: number | null;
    fbCode?: number | null;
    fbSubcode?: number | null;
    fbType?: string | null;
    fbTraceId?: string | null;
  }) {
    super(args.message);
    this.name = "FacebookApiError";
    this.kind = args.kind;
    this.httpStatus = args.httpStatus ?? null;
    this.fbCode = args.fbCode ?? null;
    this.fbSubcode = args.fbSubcode ?? null;
    this.fbType = args.fbType ?? null;
    this.fbTraceId = args.fbTraceId ?? null;
  }
}

function graphErrorMessage(err: FacebookGraphError | null | undefined): string {
  if (!err) return "Facebook API error";
  const parts = [
    err.message ? String(err.message) : null,
    err.code != null ? `code=${err.code}` : null,
    err.error_subcode != null ? `subcode=${err.error_subcode}` : null,
    err.type ? `type=${err.type}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Facebook API error";
}

function classifyGraphError(httpStatus: number, err: FacebookGraphError | null | undefined): FacebookErrorKind {
  const code = err?.code ?? null;
  const sub = err?.error_subcode ?? null;

  // Token-related: OAuthException often uses code 190.
  if (code === 190) {
    // Common expired subcodes vary; treat any 190 as invalid/expired.
    if (sub === 463 || sub === 467) return "EXPIRED_TOKEN";
    return "INVALID_TOKEN";
  }

  // Permissions: (#200) Permissions error.
  if (code === 200) return "MISSING_PERMISSION";

  // Rate limit / throttling: 4, 17, 32 are common.
  if (code === 4 || code === 17 || code === 32 || httpStatus === 429) return "RATE_LIMIT";

  if (httpStatus >= 500) return "FB_5XX";
  if (httpStatus >= 400) return "FB_4XX";
  return "UNKNOWN";
}

export type FacebookCredentials = {
  appId: string;
  appSecret: string;
  accessToken: string;
  adAccountId: string; // act_123...
};

export type FacebookTestResult = {
  tokenValid: boolean;
  adAccountOk: boolean;
  appId?: string;
  userId?: string;
  expiresAt?: number | null;
  scopes?: string[] | null;
};

export type FacebookSyncResult = {
  campaigns: any[];
  adsets: any[];
  ads: any[];
  insights: any[];
};

export class FacebookClient {
  private baseUrl = "https://graph.facebook.com/v19.0";
  private creds: FacebookCredentials;
  private timeoutMs = 12_000;

  constructor(creds: FacebookCredentials) {
    this.creds = creds;
  }

  private async getJson<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url.toString(), { method: "GET", signal: controller.signal });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const fbErr: FacebookGraphError | null =
          json && typeof json === "object" && "error" in json ? ((json as any).error as FacebookGraphError) : null;
        const msg = fbErr ? graphErrorMessage(fbErr) : `Facebook API request failed (${res.status})`;
        throw new FacebookApiError({
          kind: classifyGraphError(res.status, fbErr),
          message: msg,
          httpStatus: res.status,
          fbCode: fbErr?.code ?? null,
          fbSubcode: fbErr?.error_subcode ?? null,
          fbType: fbErr?.type ?? null,
          fbTraceId: fbErr?.fbtrace_id ?? null,
        });
      }
      return json as T;
    } catch (e) {
      if (e instanceof FacebookApiError) throw e;
      if (e instanceof DOMException && e.name === "AbortError") {
        throw new FacebookApiError({ kind: "TIMEOUT", message: "Facebook API timeout" });
      }
      const msg = e instanceof Error ? e.message : "Network error";
      throw new FacebookApiError({ kind: "NETWORK", message: msg });
    } finally {
      clearTimeout(t);
    }
  }

  async debugToken(): Promise<FacebookTestResult> {
    const { appId, appSecret, accessToken } = this.creds;
    const appAccessToken = `${appId}|${appSecret}`;
    const json = await this.getJson<any>("/debug_token", {
      input_token: accessToken,
      access_token: appAccessToken,
    });
    const data = json?.data ?? null;
    const isValid = Boolean(data?.is_valid);
    const scopes = Array.isArray(data?.scopes) ? (data.scopes as string[]) : null;
    const expiresAt = typeof data?.expires_at === "number" ? (data.expires_at as number) : null;
    const userId = typeof data?.user_id === "string" ? (data.user_id as string) : undefined;
    const appIdResp = typeof data?.app_id === "string" ? (data.app_id as string) : undefined;
    return {
      tokenValid: isValid,
      adAccountOk: false,
      scopes,
      expiresAt,
      userId,
      appId: appIdResp,
    };
  }

  async checkAdAccountAccess(): Promise<boolean> {
    const { adAccountId, accessToken } = this.creds;
    // Minimal permission check: can read account name/id.
    const json = await this.getJson<any>(`/${encodeURIComponent(adAccountId)}`, {
      fields: "account_id,name,timezone_name,currency",
      access_token: accessToken,
    });
    return Boolean(json?.account_id || json?.id);
  }

  async fetchSampleData(): Promise<FacebookSyncResult> {
    const { adAccountId, accessToken } = this.creds;
    const [campaigns, adsets, ads, insights] = await Promise.all([
      this.getJson<any>(`/${encodeURIComponent(adAccountId)}/campaigns`, {
        fields: "id,name,status,effective_status,objective,created_time,updated_time",
        limit: "50",
        access_token: accessToken,
      }).then((r) => (Array.isArray(r?.data) ? r.data : [])),
      this.getJson<any>(`/${encodeURIComponent(adAccountId)}/adsets`, {
        fields: "id,name,status,effective_status,campaign_id,created_time,updated_time",
        limit: "50",
        access_token: accessToken,
      }).then((r) => (Array.isArray(r?.data) ? r.data : [])),
      this.getJson<any>(`/${encodeURIComponent(adAccountId)}/ads`, {
        fields: "id,name,status,effective_status,adset_id,campaign_id,created_time,updated_time",
        limit: "50",
        access_token: accessToken,
      }).then((r) => (Array.isArray(r?.data) ? r.data : [])),
      this.getJson<any>(`/${encodeURIComponent(adAccountId)}/insights`, {
        fields: "date_start,date_stop,campaign_id,adset_id,ad_id,impressions,clicks,spend,cpc,cpm",
        level: "ad",
        date_preset: "last_30d",
        limit: "200",
        access_token: accessToken,
      }).then((r) => (Array.isArray(r?.data) ? r.data : [])),
    ]);

    return { campaigns, adsets, ads, insights };
  }
}


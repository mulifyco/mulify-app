export type BrandingConfig = {
  appName: string;
  shortDescription: string;
  tagline: string;
  supportEmail: string;
  logoLabelFallback: string;
  /**
   * Optional white-label overrides.
   * Phase 2: hydrate from DB / tenant settings.
   */
  whiteLabel?: Partial<Omit<BrandingConfig, "whiteLabel">>;
};

const base: BrandingConfig = {
  appName: "Mulify Library",
  shortDescription: "Internal intelligence platform",
  tagline: "Turn signals into actions.",
  supportEmail: "support@mulify.co",
  logoLabelFallback: "ML",
};

function fromEnv(): Partial<BrandingConfig> {
  // Best-effort; keep optional so deployments don't break.
  const appName = process.env.NEXT_PUBLIC_APP_NAME;
  const tagline = process.env.NEXT_PUBLIC_APP_TAGLINE;
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
  return {
    ...(appName ? { appName } : {}),
    ...(tagline ? { tagline } : {}),
    ...(supportEmail ? { supportEmail } : {}),
  };
}

export function getBranding(): BrandingConfig {
  const env = fromEnv();
  const merged: BrandingConfig = { ...base, ...env };
  if (merged.whiteLabel) {
    return { ...merged, ...(merged.whiteLabel as any), whiteLabel: merged.whiteLabel };
  }
  return merged;
}


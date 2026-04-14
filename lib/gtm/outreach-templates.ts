/** Deterministic copy helpers for founder-led outbound (edit in code, no CMS). */

export type OutreachTemplateId =
  | "agency"
  | "ecom_founder"
  | "growth_operator"
  | "follow_up_2"
  | "breakup";

const BRAND = "Mulify";

export function getOutreachTemplate(
  id: OutreachTemplateId,
  ctx: { firstName?: string; company: string; hook?: string },
): { subject: string; body: string } {
  const who = ctx.firstName?.trim() || "there";
  const co = ctx.company.trim();
  const hook = ctx.hook?.trim() || "scaling creative and store intelligence without another dozen tabs";

  switch (id) {
    case "agency":
      return {
        subject: `${BRAND} for ${co} — client intel in one workspace`,
        body: `Hi ${who},\n\nWe built ${BRAND} so agencies can brief clients faster: boards (Ready to Scale, Creative Winners), compare, watchlists, and exec-ready reports — plus lightweight CRM for pipeline.\n\nWorth a 15m walkthrough?\n\n— Founder, ${BRAND}`,
      };
    case "ecom_founder":
      return {
        subject: `Competitor motion for ${co}`,
        body: `Hi ${who},\n\nQuick note: ${BRAND} tracks competitor storefronts, creatives, and cluster signals so you can spot breakout products before they saturate.\n\nIf ${hook} sounds relevant, I can show a live board in 15 minutes.\n\n— Founder, ${BRAND}`,
      };
    case "growth_operator":
      return {
        subject: `Growth stack + ${BRAND}`,
        body: `Hi ${who},\n\n${BRAND} is a founder-led intelligence workspace: discovery-style boards, compare, alerts, and exports your team can actually share.\n\nOpen to a short demo this week?\n\n— Founder, ${BRAND}`,
      };
    case "follow_up_2":
      return {
        subject: `Re: ${co} + ${BRAND}`,
        body: `Hi ${who},\n\nCircling back once — happy to send a 2-slide snapshot of how teams use boards + watchlists for weekly growth reviews.\n\nIf timing is off, just say the word.\n\n— Founder, ${BRAND}`,
      };
    case "breakup":
      return {
        subject: `Closing the loop — ${BRAND}`,
        body: `Hi ${who},\n\nI will assume now is not a fit for ${co}. If priorities shift, you can always book a demo from our site.\n\nWishing you a strong quarter.\n\n— Founder, ${BRAND}`,
      };
    default:
      return { subject: `${BRAND}`, body: "" };
  }
}

export const OUTREACH_TEMPLATE_OPTIONS: Array<{ id: OutreachTemplateId; label: string }> = [
  { id: "agency", label: "Agency outreach" },
  { id: "ecom_founder", label: "Ecom founder" },
  { id: "growth_operator", label: "Growth operator" },
  { id: "follow_up_2", label: "Follow-up #2" },
  { id: "breakup", label: "Breakup email" },
];

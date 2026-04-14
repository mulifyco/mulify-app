import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getLaunchProofStats } from "@/lib/launch/proof-stats";
import MarketingHome from "@/components/launch/MarketingHome";

export const metadata: Metadata = {
  title: "Mulify — Growth intelligence, boards & CRM pipeline",
  description:
    "Minea-style discovery, competitor watchlists, executive reports, and AI copilots — built for revenue and growth teams.",
};

export default async function RootPage() {
  const session = await auth();
  if (session) redirect("/dashboard");
  const stats = await getLaunchProofStats();
  return <MarketingHome stats={stats} />;
}

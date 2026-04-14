import PageHeader from "@/components/ui/PageHeader";
import TeamSettingsClient from "./TeamSettingsClient";

export const dynamic = "force-dynamic";

export default async function TeamSettingsPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const sp = await searchParams;
  const token = (sp.token ?? "").trim();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team"
        description="Members, roles, pending invites, and seat usage for the active workspace. Owners send invites; owners and admins manage members."
      />
      <TeamSettingsClient initialToken={token || null} />
    </div>
  );
}


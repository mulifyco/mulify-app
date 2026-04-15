import PageHeader from "@/components/ui/PageHeader";
import ApisSettingsClient from "./ApisSettingsClient";

export const dynamic = "force-dynamic";

export default async function ApisSettingsPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="API's"
        description="Connect external platforms to sync campaigns, ad sets, ads, and key performance metrics into your workspace."
      />
      <ApisSettingsClient />
    </div>
  );
}


import { refreshSourcesJob } from "@/src/workers/refreshSources";

/**
 * Compatibility wrapper: "ingestSources" == ingestion-first source refresh.
 * Keeps a stable job name for dashboards/scripts while the scheduler evolves.
 */
export async function ingestSourcesJob() {
  return refreshSourcesJob();
}


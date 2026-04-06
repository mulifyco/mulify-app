/**
 * CLI entrypoint: run full intelligence pass (linking, merge candidates, signals, confidence v2).
 * Usage: npx tsx scripts/intelligence-recompute.ts [--sync-legacy]
 */

import "dotenv/config";
import "../lib/env-local";
import { runIntelligenceOrchestrator } from "../server/intelligence/orchestrator";

async function main() {
  const syncLegacy = process.argv.includes("--sync-legacy");
  const result = await runIntelligenceOrchestrator({
    confidence: { syncLegacyScores: syncLegacy, limitPerType: 500 },
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

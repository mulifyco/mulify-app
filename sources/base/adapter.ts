/**
 * Historical note: DB-coupled `BaseSourceAdapter` was removed in favor of
 * `SourceAdapter` + `runPersistedSourceSync` (`@/lib/sources`).
 * Implement new connectors by adding a `SourceAdapter` and a thin job entrypoint.
 */

export type { RawEntityType } from "@/lib/sources/shared/types";

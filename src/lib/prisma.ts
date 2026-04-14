/**
 * Prisma client singleton.
 *
 * This project already uses `lib/prisma.ts` across the codebase.
 * We re-export it here to satisfy `src/lib/prisma.ts` consumers without
 * introducing a second client instance.
 */

export { prisma as default } from "../../lib/prisma";


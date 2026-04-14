import { auth } from "@/lib/auth";
import { trackProductEventFromSession } from "@/server/services/product-analytics.service";

export async function trackBoardViewServer(boardKey: string, path: string): Promise<void> {
  const session = await auth();
  await trackProductEventFromSession(session, {
    eventType: "BOARD_VIEW",
    path,
    metadata: { boardKey },
  });
}

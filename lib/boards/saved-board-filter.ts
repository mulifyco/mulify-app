import type { BoardType } from "@prisma/client";

export const BOARD_TYPE_VALUES: BoardType[] = [
  "READY_TO_SCALE",
  "MARKET_LEADERS",
  "EARLY_MOVERS",
  "SATURATED_PRODUCTS",
  "CREATIVE_WINNERS",
];

export const BOARD_TYPE_LABELS: Record<BoardType, string> = {
  READY_TO_SCALE: "Ready to Scale",
  MARKET_LEADERS: "Market Leaders",
  EARLY_MOVERS: "Early Movers",
  SATURATED_PRODUCTS: "Saturated Products",
  CREATIVE_WINNERS: "Creative Winners",
};

export function parseBoardType(raw: unknown): BoardType | null {
  if (typeof raw !== "string") return null;
  return BOARD_TYPE_VALUES.includes(raw as BoardType) ? (raw as BoardType) : null;
}

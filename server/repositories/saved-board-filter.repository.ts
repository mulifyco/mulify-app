import prisma from "@/lib/prisma";
import type { BoardType, Platform, Prisma, SavedBoardFilter } from "@prisma/client";

export type SavedBoardFilterRow = SavedBoardFilter;

export const SavedBoardFilterRepository = {
  async list(workspaceId: string): Promise<SavedBoardFilterRow[]> {
    return prisma.savedBoardFilter.findMany({
      where: { workspaceId },
      orderBy: [{ updatedAt: "desc" }],
    });
  },

  async findById(workspaceId: string, id: string): Promise<SavedBoardFilterRow | null> {
    return prisma.savedBoardFilter.findFirst({ where: { id, workspaceId } });
  },

  async countEnabled(workspaceId: string): Promise<number> {
    return prisma.savedBoardFilter.count({ where: { workspaceId, isEnabled: true } });
  },

  async create(data: {
    workspaceId: string;
    name: string;
    boardType: BoardType;
    minScore?: number | null;
    minStores?: number | null;
    maxSaturation?: number | null;
    platform?: Platform | null;
    isEnabled?: boolean;
  }): Promise<SavedBoardFilterRow> {
    return prisma.savedBoardFilter.create({
      data: {
        workspaceId: data.workspaceId,
        name: data.name.trim(),
        boardType: data.boardType,
        minScore: data.minScore ?? null,
        minStores: data.minStores ?? null,
        maxSaturation: data.maxSaturation ?? null,
        platform: data.platform ?? null,
        isEnabled: data.isEnabled ?? true,
      },
    });
  },

  async update(
    workspaceId: string,
    id: string,
    data: Partial<{
      name: string;
      boardType: BoardType;
      minScore: number | null;
      minStores: number | null;
      maxSaturation: number | null;
      platform: Platform | null;
      isEnabled: boolean;
      lastMatchedCount: number;
      lastEvaluatedAt: Date | null;
    }>
  ): Promise<SavedBoardFilterRow> {
    const existing = await prisma.savedBoardFilter.findFirst({ where: { id, workspaceId }, select: { id: true } });
    if (!existing) throw new Error("Not found");
    const payload: Prisma.SavedBoardFilterUpdateInput = {};
    if (data.name !== undefined) payload.name = data.name.trim();
    if (data.boardType !== undefined) payload.boardType = data.boardType;
    if (data.minScore !== undefined) payload.minScore = data.minScore;
    if (data.minStores !== undefined) payload.minStores = data.minStores;
    if (data.maxSaturation !== undefined) payload.maxSaturation = data.maxSaturation;
    if (data.platform !== undefined) payload.platform = data.platform;
    if (data.isEnabled !== undefined) payload.isEnabled = data.isEnabled;
    if (data.lastMatchedCount !== undefined) payload.lastMatchedCount = data.lastMatchedCount;
    if (data.lastEvaluatedAt !== undefined) payload.lastEvaluatedAt = data.lastEvaluatedAt;

    return prisma.savedBoardFilter.update({
      where: { id },
      data: payload,
    });
  },

  async delete(workspaceId: string, id: string): Promise<void> {
    const existing = await prisma.savedBoardFilter.findFirst({ where: { id, workspaceId }, select: { id: true } });
    if (!existing) throw new Error("Not found");
    await prisma.savedBoardFilter.delete({ where: { id } });
  },
};

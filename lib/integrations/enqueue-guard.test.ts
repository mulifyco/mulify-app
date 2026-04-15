import { describe, expect, it } from "vitest";
import { shouldBlockNewEnqueue } from "./enqueue-guard";

describe("shouldBlockNewEnqueue", () => {
  it("blocks PENDING/RUNNING and allows others", () => {
    expect(shouldBlockNewEnqueue("PENDING")).toBe(true);
    expect(shouldBlockNewEnqueue("RUNNING")).toBe(true);
    expect(shouldBlockNewEnqueue("FAILED")).toBe(false);
    expect(shouldBlockNewEnqueue("COMPLETED")).toBe(false);
    expect(shouldBlockNewEnqueue("PARTIAL")).toBe(false);
  });
});


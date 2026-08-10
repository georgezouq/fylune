import { describe, expect, it } from "vitest";

import {
  appendChangeActivity,
  changeActivityRetentionMs,
  readChangeActivity,
  updateChangeActivity,
} from "../../src/changeActivity.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

describe("local change activity", () => {
  it("keeps only privacy-safe metadata for seven days", () => {
    const storage = memoryStorage();
    const now = new Date("2026-07-26T10:00:00.000Z");
    appendChangeActivity(storage, {
      id: "merge-1",
      documentId: "doc-1",
      sourceKind: "external",
      displayName: "Do not persist guessed names",
      status: "auto_merged",
      blockCount: 2,
      snapshotId: "snapshot-1",
      path: "secret/plan.md",
      content: "private",
    }, now);
    const [entry] = readChangeActivity(storage, "doc-1", now.getTime());
    expect(entry).toEqual({
      id: "merge-1",
      documentId: "doc-1",
      sourceKind: "external",
      displayName: null,
      status: "auto_merged",
      blockCount: 2,
      snapshotId: "snapshot-1",
      createdAt: now.toISOString(),
    });
    expect(entry).not.toHaveProperty("path");
    expect(entry).not.toHaveProperty("content");
  });

  it("expires old entries and marks a merge reverted", () => {
    const storage = memoryStorage();
    const now = new Date("2026-07-26T10:00:00.000Z");
    appendChangeActivity(storage, {
      id: "old",
      documentId: "doc-1",
      sourceKind: "external",
      status: "auto_merged",
      createdAt: new Date(now.getTime() - changeActivityRetentionMs - 1).toISOString(),
    }, now);
    appendChangeActivity(storage, {
      id: "current",
      documentId: "doc-1",
      sourceKind: "integrated_agent",
      displayName: "Codex",
      status: "auto_merged",
    }, now);
    expect(readChangeActivity(storage, "doc-1", now.getTime())).toHaveLength(1);
    expect(updateChangeActivity(storage, "doc-1", "current", "reverted")[0].status).toBe("reverted");
  });
});

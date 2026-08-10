import { describe, expect, it } from "vitest";

import { shouldStageExternalReview } from "../../src/externalChangePolicy.js";

describe("external document change policy", () => {
  it("shows safe integrated Agent writes in the open document immediately", () => {
    expect(shouldStageExternalReview({
      reviewAgentChanges: true,
      sourceKind: "integrated_agent",
      mergeStatus: "fast_forward",
    })).toBe(false);
    expect(shouldStageExternalReview({
      reviewAgentChanges: true,
      sourceKind: "integrated_agent",
      mergeStatus: "merged",
    })).toBe(false);
  });

  it("continues to review safe changes from unknown external writers when requested", () => {
    expect(shouldStageExternalReview({
      reviewAgentChanges: true,
      sourceKind: undefined,
      mergeStatus: "fast_forward",
    })).toBe(true);
  });

  it("leaves overlapping edits to the merge engine's mandatory review path", () => {
    expect(shouldStageExternalReview({
      reviewAgentChanges: true,
      sourceKind: "integrated_agent",
      mergeStatus: "review",
    })).toBe(false);
    expect(shouldStageExternalReview({
      reviewAgentChanges: true,
      sourceKind: "integrated_agent",
      mergeStatus: "protected",
    })).toBe(false);
  });
});

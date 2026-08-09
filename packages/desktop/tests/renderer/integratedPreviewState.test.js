import { describe, expect, it } from "vitest";

import {
  removeIntegratedPreview,
  resumeIntegratedPreviews,
  suspendIntegratedPreviews,
  updateIntegratedPreviewUnderlying,
  upsertIntegratedPreview,
} from "../../src/integratedPreviewState.js";

const base = "# Plan\n\nUser section.\n\nAgent A section.\n\nAgent B section.\n";

function preview(state, currentSource, transactionId, content) {
  return upsertIntegratedPreview({
    state,
    currentSource,
    baseSource: base,
    change: { transactionId, content },
    previousStatus: "saved",
  });
}

describe("integrated Agent preview state", () => {
  it("updates one preview without duplicating its previous patch", () => {
    const first = preview(null, base, "a", base.replace("Agent A section.", "Agent A draft."));
    const second = preview(
      first.state,
      first.source,
      "a",
      base.replace("Agent A section.", "Agent A final."),
    );

    expect(second.source).toContain("Agent A final.");
    expect(second.source).not.toContain("Agent A draft.");
  });

  it("combines concurrent previews and updates either transaction safely", () => {
    const first = preview(null, base, "a", base.replace("Agent A section.", "Agent A draft."));
    const second = preview(
      first.state,
      first.source,
      "b",
      base.replace("Agent B section.", "Agent B draft."),
    );
    const updated = preview(
      second.state,
      second.source,
      "a",
      base.replace("Agent A section.", "Agent A final."),
    );

    expect(updated.source).toContain("Agent A final.");
    expect(updated.source).toContain("Agent B draft.");
    expect(updated.source).not.toContain("Agent A draft.");
  });

  it("preserves user typing when a preview is cancelled", () => {
    const first = preview(null, base, "a", base.replace("Agent A section.", "Agent A draft."));
    const typed = first.source.replace("User section.", "User section updated.");
    const stateAfterTyping = updateIntegratedPreviewUnderlying({
      state: first.state,
      nextDisplayedSource: typed,
    });
    const cancelled = removeIntegratedPreview({
      state: stateAfterTyping,
      currentSource: typed,
      transactionId: "a",
    });

    expect(cancelled.state).toBeNull();
    expect(cancelled.source).toContain("User section updated.");
    expect(cancelled.source).toContain("Agent A section.");
    expect(cancelled.source).not.toContain("Agent A draft.");
  });

  it("suspends previews for disk reconciliation and resumes remaining transactions", () => {
    const first = preview(null, base, "a", base.replace("Agent A section.", "Agent A final."));
    const second = preview(
      first.state,
      first.source,
      "b",
      base.replace("Agent B section.", "Agent B draft."),
    );
    const suspended = suspendIntegratedPreviews({
      state: second.state,
      currentSource: second.source,
    });
    suspended.items.delete("a");
    const committed = base.replace("Agent A section.", "Agent A final.");
    const resumed = resumeIntegratedPreviews({
      underlying: committed,
      items: suspended.items,
      previousStatus: suspended.previousStatus,
    });

    expect(suspended.source).toBe(base);
    expect(resumed.source).toContain("Agent A final.");
    expect(resumed.source).toContain("Agent B draft.");
  });
});

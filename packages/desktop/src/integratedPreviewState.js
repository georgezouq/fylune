import { mergeDocumentVersions } from "@fylune/document-collaboration";

function mergePreview({ base, local, disk }) {
  const result = mergeDocumentVersions({ base, local, disk });
  if (
    result.status === "review"
    || result.status === "protected"
    || typeof result.content !== "string"
  ) {
    return null;
  }
  return result.content;
}

function renderPreviewItems(underlying, items) {
  let shown = underlying;
  for (const item of items.values()) {
    shown = mergePreview({
      base: item.base,
      local: shown,
      disk: item.content,
    });
    if (shown == null) return null;
  }
  return shown;
}

/**
 * Removes every active Agent preview from the currently displayed document
 * while preserving edits the user typed on top of those previews.
 */
export function stripIntegratedPreviews(state, currentSource) {
  if (!state) return currentSource;
  return mergePreview({
    base: state.shown,
    local: currentSource,
    disk: state.before,
  });
}

export function upsertIntegratedPreview({
  state,
  currentSource,
  baseSource,
  change,
  previousStatus,
}) {
  if (!change?.transactionId || typeof change.content !== "string") return null;
  const underlying = stripIntegratedPreviews(state, currentSource);
  if (underlying == null) return null;

  const items = new Map(state?.items || []);
  const previous = items.get(change.transactionId);
  items.set(change.transactionId, {
    transactionId: change.transactionId,
    base: previous?.base ?? baseSource,
    content: change.content,
  });
  const shown = renderPreviewItems(underlying, items);
  if (shown == null) return null;
  return {
    source: shown,
    state: {
      before: underlying,
      shown,
      items,
      previousStatus: state?.previousStatus ?? previousStatus,
    },
  };
}

export function removeIntegratedPreview({ state, currentSource, transactionId }) {
  if (!state || !transactionId || !state.items.has(transactionId)) {
    return { source: currentSource, state };
  }
  const underlying = stripIntegratedPreviews(state, currentSource);
  if (underlying == null) return null;
  const items = new Map(state.items);
  items.delete(transactionId);
  if (!items.size) return { source: underlying, state: null };
  const shown = renderPreviewItems(underlying, items);
  if (shown == null) return null;
  return {
    source: shown,
    state: { ...state, before: underlying, shown, items },
  };
}

/**
 * Tracks the user's direct input separately from the preview overlay. This is
 * what makes cancel and commit safe even when the user keeps typing while an
 * Agent is still streaming changes.
 */
export function updateIntegratedPreviewUnderlying({ state, nextDisplayedSource }) {
  if (!state) return null;
  const underlying = stripIntegratedPreviews(state, nextDisplayedSource);
  if (underlying == null) return null;
  return {
    ...state,
    before: underlying,
    shown: nextDisplayedSource,
  };
}

export function suspendIntegratedPreviews({ state, currentSource }) {
  if (!state) {
    return {
      source: currentSource,
      items: new Map(),
      previousStatus: null,
    };
  }
  const underlying = stripIntegratedPreviews(state, currentSource);
  if (underlying == null) return null;
  return {
    source: underlying,
    items: new Map(state.items),
    previousStatus: state.previousStatus,
  };
}

export function resumeIntegratedPreviews({ underlying, items, previousStatus }) {
  const previewItems = new Map(items || []);
  if (!previewItems.size) return { source: underlying, state: null };
  const shown = renderPreviewItems(underlying, previewItems);
  if (shown == null) return null;
  return {
    source: shown,
    state: {
      before: underlying,
      shown,
      items: previewItems,
      previousStatus,
    },
  };
}

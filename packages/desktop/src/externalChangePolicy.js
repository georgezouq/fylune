const ALREADY_REVIEWABLE_STATUSES = new Set([
  "unchanged",
  "local_only",
  "review",
  "protected",
]);

/**
 * Integrated Agent writes have already passed Fylune's expected-content check.
 * Safe fast-forwards and non-overlapping merges should therefore appear in the
 * open editor immediately. Real overlaps are still returned as review/protected
 * by the merge engine and never pass through this policy.
 */
export function shouldStageExternalReview({
  reviewAgentChanges,
  sourceKind,
  mergeStatus,
}) {
  if (!reviewAgentChanges) return false;
  if (sourceKind === "integrated_agent") return false;
  return !ALREADY_REVIEWABLE_STATUSES.has(mergeStatus);
}

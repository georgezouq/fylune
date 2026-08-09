const STORAGE_KEY = "fylune-document-change-activity";
const RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_ENTRIES = 80;

function safeParse(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function readChangeActivity(storage, documentId, now = Date.now()) {
  if (!storage || !documentId) return [];
  const cutoff = now - RETENTION_MS;
  return safeParse(storage.getItem(STORAGE_KEY))
    .filter((entry) => entry?.documentId === documentId && Date.parse(entry.createdAt) >= cutoff)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function appendChangeActivity(storage, entry, now = new Date()) {
  if (!storage || !entry?.documentId) return [];
  const createdAt = entry.createdAt || now.toISOString();
  const cutoff = now.getTime() - RETENTION_MS;
  const safeEntry = {
    id: entry.id,
    documentId: entry.documentId,
    sourceKind: entry.sourceKind === "integrated_agent" ? "integrated_agent" : "external",
    displayName: entry.sourceKind === "integrated_agent" ? entry.displayName || null : null,
    status: entry.status,
    blockCount: Math.max(0, Number(entry.blockCount) || 0),
    snapshotId: entry.snapshotId || null,
    createdAt,
  };
  const entries = [safeEntry, ...safeParse(storage.getItem(STORAGE_KEY))]
    .filter((candidate, index, values) => (
      candidate?.id
      && Date.parse(candidate.createdAt) >= cutoff
      && values.findIndex((value) => value?.id === candidate.id) === index
    ))
    .slice(0, MAX_ENTRIES);
  storage.setItem(STORAGE_KEY, JSON.stringify(entries));
  return entries.filter((candidate) => candidate.documentId === entry.documentId);
}

export function updateChangeActivity(storage, documentId, id, nextStatus) {
  if (!storage || !documentId || !id) return [];
  const entries = safeParse(storage.getItem(STORAGE_KEY)).map((entry) => (
    entry?.id === id && entry.documentId === documentId
      ? { ...entry, status: nextStatus }
      : entry
  ));
  storage.setItem(STORAGE_KEY, JSON.stringify(entries));
  return entries.filter((entry) => entry?.documentId === documentId);
}

export const changeActivityRetentionMs = RETENTION_MS;

import path from "node:path";
import { cp, mkdir, stat } from "node:fs/promises";

export const FYLUNE_DATA_DIRECTORY = ".fylune";

const persistedEntries = [
  { source: "recent-projects.json", target: "recent-projects.json" },
  { source: "drafts", target: "drafts" },
  { source: "snapshots", target: "snapshots" },
  { source: "document-sessions", target: "document-sessions" },
  { source: "account.vault", target: "account.vault" },
  { source: "account-session.json", target: "account-session.json" },
  { source: "Local Storage", target: path.join("session", "Local Storage") },
];

async function exists(entryPath) {
  try {
    await stat(entryPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export function resolveFyluneDataPath(homePath) {
  return path.join(homePath, FYLUNE_DATA_DIRECTORY);
}

export async function prepareFyluneDataDirectory({ legacyPath, targetPath }) {
  await mkdir(path.join(targetPath, "session"), { recursive: true, mode: 0o700 });

  if (!legacyPath || path.resolve(legacyPath) === path.resolve(targetPath) || !(await exists(legacyPath))) {
    return { migrated: [] };
  }

  const migrated = [];
  for (const entry of persistedEntries) {
    const sourcePath = path.join(legacyPath, entry.source);
    const targetEntryPath = path.join(targetPath, entry.target);
    if (!(await exists(sourcePath)) || await exists(targetEntryPath)) continue;
    await mkdir(path.dirname(targetEntryPath), { recursive: true, mode: 0o700 });
    await cp(sourcePath, targetEntryPath, {
      recursive: true,
      errorOnExist: false,
      force: false,
      preserveTimestamps: true,
    });
    migrated.push(entry.target);
  }

  return { migrated };
}

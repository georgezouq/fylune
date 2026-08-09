import path from "node:path";
import { mkdir, readFile, readdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import writeFileAtomic from "write-file-atomic";

import { sha256 } from "./hash.mjs";
import { FyluneError } from "./errors.mjs";
import { normalizeRelativePath } from "./path-security.mjs";

function storageKey(value) {
  return sha256(value).slice(0, 32);
}

function projectStorageKey(root) {
  return storageKey(path.resolve(root));
}

function documentStorageKey(relativePath) {
  return storageKey(relativePath);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function markdownBlocks(content) {
  const normalized = String(content ?? "").replaceAll("\r\n", "\n").trim();
  return normalized ? normalized.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean) : [];
}

function mergeDiffSegments(segments) {
  return segments.reduce((merged, segment) => {
    const previous = merged.at(-1);
    if (previous?.type === segment.type) {
      previous.content += `\n\n${segment.content}`;
      previous.count += 1;
    } else {
      merged.push({ ...segment, count: 1 });
    }
    return merged;
  }, []);
}

function fallbackBlockDiff(before, after) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
  let beforeEnd = before.length - 1;
  let afterEnd = after.length - 1;
  while (beforeEnd >= start && afterEnd >= start && before[beforeEnd] === after[afterEnd]) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }
  const segments = [];
  for (let index = 0; index < start; index += 1) {
    segments.push({ type: "unchanged", content: before[index] });
  }
  for (let index = start; index <= beforeEnd; index += 1) {
    segments.push({ type: "removed", content: before[index] });
  }
  for (let index = start; index <= afterEnd; index += 1) {
    segments.push({ type: "added", content: after[index] });
  }
  for (let index = beforeEnd + 1; index < before.length; index += 1) {
    segments.push({ type: "unchanged", content: before[index] });
  }
  return segments;
}

export function createBlockDiff(previousContent, nextContent) {
  const before = markdownBlocks(previousContent);
  const after = markdownBlocks(nextContent);
  let rawSegments;

  if (before.length * after.length > 160_000) {
    rawSegments = fallbackBlockDiff(before, after);
  } else {
    const matrix = Array.from({ length: before.length + 1 }, () => new Uint32Array(after.length + 1));
    for (let beforeIndex = before.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
      for (let afterIndex = after.length - 1; afterIndex >= 0; afterIndex -= 1) {
        matrix[beforeIndex][afterIndex] = before[beforeIndex] === after[afterIndex]
          ? matrix[beforeIndex + 1][afterIndex + 1] + 1
          : Math.max(matrix[beforeIndex + 1][afterIndex], matrix[beforeIndex][afterIndex + 1]);
      }
    }
    rawSegments = [];
    let beforeIndex = 0;
    let afterIndex = 0;
    while (beforeIndex < before.length && afterIndex < after.length) {
      if (before[beforeIndex] === after[afterIndex]) {
        rawSegments.push({ type: "unchanged", content: before[beforeIndex] });
        beforeIndex += 1;
        afterIndex += 1;
      } else if (matrix[beforeIndex + 1][afterIndex] >= matrix[beforeIndex][afterIndex + 1]) {
        rawSegments.push({ type: "removed", content: before[beforeIndex] });
        beforeIndex += 1;
      } else {
        rawSegments.push({ type: "added", content: after[afterIndex] });
        afterIndex += 1;
      }
    }
    while (beforeIndex < before.length) {
      rawSegments.push({ type: "removed", content: before[beforeIndex] });
      beforeIndex += 1;
    }
    while (afterIndex < after.length) {
      rawSegments.push({ type: "added", content: after[afterIndex] });
      afterIndex += 1;
    }
  }

  const segments = mergeDiffSegments(rawSegments);
  return {
    segments,
    summary: {
      added: segments.filter((segment) => segment.type === "added").reduce((total, segment) => total + segment.count, 0),
      removed: segments.filter((segment) => segment.type === "removed").reduce((total, segment) => total + segment.count, 0),
    },
  };
}

export class DraftStore {
  constructor(userDataPath) {
    this.basePath = path.join(userDataPath, "drafts");
  }

  pathFor(root, relativePath) {
    const normalized = normalizeRelativePath(relativePath);
    return path.join(this.basePath, projectStorageKey(root), `${documentStorageKey(normalized)}.json`);
  }

  async save(root, relativePath, content, baseHash = null) {
    const normalized = normalizeRelativePath(relativePath);
    const filePath = this.pathFor(root, normalized);
    await mkdir(path.dirname(filePath), { recursive: true });
    const draft = {
      version: 1,
      path: normalized,
      content,
      contentHash: sha256(content),
      baseHash,
      updatedAt: new Date().toISOString(),
    };
    await writeFileAtomic(filePath, JSON.stringify(draft), { encoding: "utf8", fsync: true });
    const { content: _content, ...metadata } = draft;
    return metadata;
  }

  async load(root, relativePath) {
    try {
      return await readJson(this.pathFor(root, relativePath));
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw new FyluneError("DRAFT_CORRUPTED", "Fylune found a draft it could not safely restore.");
    }
  }

  async clear(root, relativePath) {
    try {
      await unlink(this.pathFor(root, relativePath));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

export class SnapshotStore {
  constructor(userDataPath) {
    this.basePath = path.join(userDataPath, "snapshots");
  }

  directoryFor(root, relativePath) {
    return path.join(this.basePath, projectStorageKey(root), documentStorageKey(normalizeRelativePath(relativePath)));
  }

  async create(root, relativePath, content, source) {
    const normalized = normalizeRelativePath(relativePath);
    const createdAt = new Date();
    const snapshot = {
      version: 1,
      id: randomUUID(),
      path: normalized,
      hash: sha256(content),
      createdAt: createdAt.toISOString(),
      source,
      content,
    };
    const directory = this.directoryFor(root, normalized);
    await mkdir(directory, { recursive: true });
    const filename = `${createdAt.getTime()}-${snapshot.id}.json`;
    await writeFileAtomic(path.join(directory, filename), JSON.stringify(snapshot), {
      encoding: "utf8",
      fsync: true,
    });
    return snapshot;
  }

  async #all(root, relativePath) {
    const normalized = normalizeRelativePath(relativePath);
    const directory = this.directoryFor(root, normalized);
    let names;
    try {
      names = await readdir(directory);
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
    const snapshots = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      try {
        const snapshot = await readJson(path.join(directory, name));
        if (snapshot.path === normalized) snapshots.push(snapshot);
      } catch {
        // A damaged history entry must never prevent the source document opening.
      }
    }
    return snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async list(root, relativePath, currentContent = null) {
    const snapshots = await this.#all(root, relativePath);
    return snapshots.map(({ content, ...metadata }, index) => {
      const nextContent = index === 0 ? currentContent : snapshots[index - 1].content;
      const changes = typeof nextContent === "string" ? createBlockDiff(content, nextContent).summary : null;
      return { ...metadata, changes };
    });
  }

  async get(root, relativePath, snapshotId) {
    const snapshots = await this.#all(root, relativePath);
    const snapshot = snapshots.find((candidate) => candidate.id === snapshotId);
    if (!snapshot) throw new FyluneError("SNAPSHOT_NOT_FOUND", "This snapshot is no longer available.");
    return snapshot;
  }

  async preview(root, relativePath, snapshotId, currentContent) {
    const snapshot = await this.get(root, relativePath, snapshotId);
    return {
      id: snapshot.id,
      path: snapshot.path,
      hash: snapshot.hash,
      createdAt: snapshot.createdAt,
      source: snapshot.source,
      content: snapshot.content,
      changes: createBlockDiff(snapshot.content, currentContent),
    };
  }
}

export async function restoreSnapshot({
  root,
  relativePath,
  snapshotId,
  expectedHash,
  snapshotStore,
  draftStore,
  onWrite,
}) {
  const { saveDocument } = await import("./file-engine.mjs");
  const target = await snapshotStore.get(root, relativePath, snapshotId);
  return saveDocument({
    root,
    relativePath,
    content: target.content,
    expectedHash,
    snapshotStore: {
      create: (projectRoot, documentPath, content) =>
        snapshotStore.create(projectRoot, documentPath, content, "before-snapshot-restore"),
    },
    draftStore,
    onWrite,
  });
}

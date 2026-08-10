import path from "node:path";
import { readFile, realpath } from "node:fs/promises";
import parcelWatcher from "@parcel/watcher";

import { sha256 } from "./hash.mjs";
import {
  isDocumentPath,
  isTechnicalPath,
  scanProject,
  TECHNICAL_DIRECTORIES,
} from "./file-engine.mjs";

const BASELINE_READ_CONCURRENCY = 8;

async function mapWithConcurrency(values, limit, operation) {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      await operation(values[index], index);
    }
  });
  await Promise.all(workers);
}

function documentPathsFromTree(tree, output = []) {
  for (const item of tree?.children || []) {
    if (item.kind === "directory") documentPathsFromTree(item, output);
    else if (item.fileType === "document") output.push(item.path);
  }
  return output;
}

const watcherIgnorePatterns = [...TECHNICAL_DIRECTORIES].flatMap((directory) => [
  directory,
  `**/${directory}/**`,
]);

export class SelfWriteRegistry {
  #entries = new Map();

  mark(absolutePath, hash) {
    this.#entries.set(absolutePath, { hash, expiresAt: Date.now() + 10_000 });
  }

  consume(absolutePath, hash) {
    const entry = this.#entries.get(absolutePath);
    if (!entry) return false;
    this.#entries.delete(absolutePath);
    return entry.expiresAt >= Date.now() && entry.hash === hash;
  }
}

async function contentState(absolutePath) {
  try {
    const content = await readFile(absolutePath, "utf8");
    return { content, hash: sha256(content) };
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export class WatchService {
  constructor({ snapshotStore, selfWrites = new SelfWriteRegistry(), onChange, onError, debounceMs = 500 }) {
    this.snapshotStore = snapshotStore;
    this.selfWrites = selfWrites;
    this.onChange = onChange;
    this.onError = onError;
    this.debounceMs = debounceMs;
    this.projects = new Map();
  }

  markSelfWrite(absolutePath, hash) {
    this.selfWrites.mark(absolutePath, hash);
  }

  async watch(project) {
    const existing = this.projects.get(project.id);
    if (existing) return existing.readyPromise;
    const watchRoot = await realpath(project.root);

    await Promise.all([...this.projects.entries()].map(([projectId, state]) => (
      this.#closeProject(projectId, state)
    )));

    const state = {
      baseline: new Map(),
      closed: false,
      pending: new Map(),
      readyPromise: null,
      subscription: null,
      watchRoot,
    };
    this.projects.set(project.id, state);

    state.readyPromise = this.#initialize(project, state).catch((error) => {
      if (this.projects.get(project.id) === state) this.projects.delete(project.id);
      throw error;
    });
    return state.readyPromise;
  }

  async #initialize(project, state) {
    const tree = await scanProject(project.root, { recursive: true, documentsOnly: true });
    if (state.closed) return;
    const documentPaths = documentPathsFromTree(tree);
    await mapWithConcurrency(documentPaths, BASELINE_READ_CONCURRENCY, async (relativePath) => {
      if (state.closed) return;
      const absolutePath = path.join(project.root, relativePath);
      const current = await contentState(absolutePath);
      if (current) state.baseline.set(absolutePath, current);
    });
    if (state.closed) return;

    const schedule = (absolutePath) => {
      const existing = state.pending.get(absolutePath);
      if (existing) clearTimeout(existing.timer);
      const timer = setTimeout(() => {
        state.pending.delete(absolutePath);
        void this.#process(project, state, absolutePath).catch((error) => this.onError?.(error));
      }, this.debounceMs);
      state.pending.set(absolutePath, { timer });
    };

    state.subscription = await parcelWatcher.subscribe(state.watchRoot, (error, events = []) => {
      if (state.closed) return;
      if (error) {
        this.onError?.(error);
        return;
      }
      for (const event of events) {
        const relativePath = path.relative(state.watchRoot, event.path);
        if (!relativePath || relativePath.startsWith("..")) continue;
        if (isTechnicalPath(relativePath) || !isDocumentPath(relativePath)) continue;
        schedule(path.join(project.root, relativePath));
      }
    }, { ignore: watcherIgnorePatterns });
  }

  async #process(project, state, absolutePath) {
    if (state.closed) return;
    const relativePath = path.relative(project.root, absolutePath).split(path.sep).join("/");
    const previous = state.baseline.get(absolutePath) ?? null;
    const current = await contentState(absolutePath);
    const kind = current ? (previous ? "change" : "add") : "delete";

    if (!previous && kind === "add") {
      if (current) state.baseline.set(absolutePath, current);
      return;
    }
    if (!previous && !current) return;

    if (current && this.selfWrites.consume(absolutePath, current.hash)) {
      state.baseline.set(absolutePath, current);
      return;
    }

    const snapshot = previous && (kind === "change" || kind === "delete")
      ? await this.snapshotStore.create(project.root, relativePath, previous.content, "before-external-update")
      : null;
    if (current) state.baseline.set(absolutePath, current);
    else state.baseline.delete(absolutePath);

    if (previous?.hash === current?.hash) return;
    this.onChange?.({
      projectId: project.id,
      path: relativePath,
      kind,
      previousHash: previous?.hash ?? null,
      hash: current?.hash ?? null,
      snapshotId: snapshot?.id ?? null,
      detectedAt: new Date().toISOString(),
    });
  }

  async #closeProject(projectId, state) {
    state.closed = true;
    for (const { timer } of state.pending.values()) clearTimeout(timer);
    state.pending.clear();
    await state.subscription?.unsubscribe();
    if (this.projects.get(projectId) === state) this.projects.delete(projectId);
  }

  async close() {
    await Promise.all([...this.projects.entries()].map(([projectId, state]) => (
      this.#closeProject(projectId, state)
    )));
  }
}

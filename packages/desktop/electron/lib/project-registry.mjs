import path from "node:path";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath } from "node:fs/promises";
import writeFileAtomic from "write-file-atomic";

import { canonicalProjectRoot } from "./path-security.mjs";
import { FyluneError } from "./errors.mjs";

const RECENT_PROJECTS_VERSION = 1;
const DEFAULT_RECENT_LIMIT = 12;

function isPersistedProject(value) {
  return value
    && typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.root === "string"
    && path.isAbsolute(value.root)
    && typeof value.lastOpenedAt === "string";
}

function publicProject(project) {
  return {
    projectId: project.id,
    name: project.name,
    path: project.root,
    lastOpenedAt: project.lastOpenedAt,
  };
}

export class ProjectRegistry {
  #projects = new Map();
  #filePath;
  #limit;
  #startAccessing;
  #access = new Map();

  constructor({ filePath = null, limit = DEFAULT_RECENT_LIMIT, startAccessing = null } = {}) {
    this.#filePath = filePath;
    this.#limit = limit;
    this.#startAccessing = startAccessing;
  }

  async initialize() {
    if (!this.#filePath) return;
    try {
      const state = JSON.parse(await readFile(this.#filePath, "utf8"));
      if (state?.version !== RECENT_PROJECTS_VERSION || !Array.isArray(state.projects)) return;
      for (const project of state.projects.slice(0, this.#limit)) {
        if (isPersistedProject(project) && !this.#projects.has(project.id)) this.#projects.set(project.id, project);
      }
    } catch (error) {
      if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    }
  }

  async add(root, bookmark) {
    const canonicalRoot = await canonicalProjectRoot(root);
    for (const project of this.#projects.values()) {
      if (project.root === canonicalRoot) {
        project.name = path.basename(canonicalRoot);
        project.lastOpenedAt = new Date().toISOString();
        delete project.ephemeral;
        delete project.externalFile;
        if (typeof bookmark === "string" && bookmark) {
          this.#stopAccessing(project.id);
          project.bookmark = bookmark;
        }
        this.#moveToFront(project);
        await this.#persist();
        return project;
      }
    }
    const project = {
      id: randomUUID(),
      name: path.basename(canonicalRoot),
      root: canonicalRoot,
      lastOpenedAt: new Date().toISOString(),
      ...(typeof bookmark === "string" && bookmark ? { bookmark } : {}),
    };
    this.#moveToFront(project);
    await this.#persist();
    return project;
  }

  async addExternalFile(filePath) {
    const sourceInfo = await lstat(filePath);
    if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink()) {
      throw new FyluneError("UNSUPPORTED_FILE", "The selected path is not a document.");
    }
    const externalFile = await realpath(filePath);
    const root = path.dirname(externalFile);
    const project = {
      id: randomUUID(),
      name: path.basename(root),
      root,
      externalFile,
      ephemeral: true,
      lastOpenedAt: new Date().toISOString(),
    };
    this.#projects = new Map([
      [project.id, project],
      ...[...this.#projects.values()]
        .filter((candidate) => !candidate.ephemeral)
        .map((candidate) => [candidate.id, candidate]),
    ]);
    return project;
  }

  async reopen(projectId) {
    const project = this.get(projectId);
    try {
      project.root = await canonicalProjectRoot(project.root);
    } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "ENOTDIR" || (error instanceof FyluneError && error.code === "INVALID_PROJECT")) {
        await this.remove(projectId);
        throw new FyluneError("RECENT_PROJECT_MISSING", "This recent project folder is no longer available.");
      }
      throw error;
    }
    project.name = path.basename(project.root);
    project.lastOpenedAt = new Date().toISOString();
    this.#moveToFront(project);
    await this.#persist();
    return project;
  }

  async remove(projectId) {
    this.#stopAccessing(projectId);
    const removed = this.#projects.delete(projectId);
    if (removed) await this.#persist();
    return removed;
  }

  get(projectId) {
    const project = this.#projects.get(projectId);
    if (!project) {
      throw new FyluneError("PROJECT_NOT_OPEN", "Open the project folder again to continue.");
    }
    if (this.#startAccessing && typeof project.bookmark === "string" && project.bookmark && !this.#access.has(projectId)) {
      this.#access.set(projectId, this.#startAccessing(project.bookmark));
    }
    return project;
  }

  dispose() {
    for (const projectId of this.#access.keys()) this.#stopAccessing(projectId);
  }

  #stopAccessing(projectId) {
    this.#access.get(projectId)?.();
    this.#access.delete(projectId);
  }

  list() {
    return [...this.#projects.values()].map(({ id, name }) => ({ id, name }));
  }

  listRecent() {
    return [...this.#projects.values()].filter((project) => !project.ephemeral).map(publicProject);
  }

  #moveToFront(project) {
    const ordered = [project, ...this.#projects.values()].filter((candidate, index) => (
      candidate.id !== project.id || index === 0
    )).slice(0, this.#limit);
    this.#projects = new Map(ordered.map((candidate) => [candidate.id, candidate]));
    for (const projectId of this.#access.keys()) {
      if (!this.#projects.has(projectId)) this.#stopAccessing(projectId);
    }
  }

  async #persist() {
    if (!this.#filePath) return;
    await mkdir(path.dirname(this.#filePath), { recursive: true });
    const state = {
      version: RECENT_PROJECTS_VERSION,
      projects: [...this.#projects.values()].filter((project) => !project.ephemeral),
    };
    await writeFileAtomic(this.#filePath, JSON.stringify(state), { encoding: "utf8", fsync: true });
  }
}

import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import writeFileAtomic from "write-file-atomic";

import { sha256 } from "./hash.mjs";
import { normalizeRelativePath } from "./path-security.mjs";

function storageKey(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

/**
 * Crash-safe Base storage for the active three-way merge model.
 *
 * It lives under ~/.fylune and never touches the user's workspace.
 */
export class DocumentSessionStore {
  constructor(userDataPath) {
    this.basePath = path.join(userDataPath, "document-sessions");
  }

  pathFor(root, relativePath) {
    const normalized = normalizeRelativePath(relativePath);
    return path.join(
      this.basePath,
      storageKey(path.resolve(root)),
      `${storageKey(normalized)}.json`,
    );
  }

  async load(root, relativePath) {
    const normalized = normalizeRelativePath(relativePath);
    try {
      const session = JSON.parse(await readFile(this.pathFor(root, normalized), "utf8"));
      if (
        session?.version !== 1
        || session.path !== normalized
        || typeof session.baseContent !== "string"
        || session.baseHash !== sha256(session.baseContent)
      ) {
        return null;
      }
      return session;
    } catch {
      return null;
    }
  }

  async advance(root, relativePath, content, hash = sha256(content)) {
    const normalized = normalizeRelativePath(relativePath);
    if (hash !== sha256(content)) throw new TypeError("Base content does not match its hash");
    const previous = await this.load(root, normalized);
    const session = {
      version: 1,
      path: normalized,
      baseHash: hash,
      baseContent: content,
      generation: (previous?.generation ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    const filePath = this.pathFor(root, normalized);
    await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
    await writeFileAtomic(filePath, JSON.stringify(session), {
      encoding: "utf8",
      fsync: true,
      mode: 0o600,
    });
    return session;
  }
}

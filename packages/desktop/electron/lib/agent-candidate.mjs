import { mergeDocumentVersions, waitForDocumentQuiet } from "@fylune/document-collaboration";

import { FyluneError } from "./errors.mjs";
import { readDocument, saveDocument } from "./file-engine.mjs";

export async function saveAgentCandidate({
  root,
  relativePath,
  candidate,
  baseline,
  previous,
  snapshotStore,
  draftStore,
  onReview,
  onWrite,
}) {
  if (!previous) {
    const safety = mergeDocumentVersions({ base: "", local: candidate, disk: "" });
    if (safety.status === "protected") {
      await draftStore.save(root, relativePath, candidate, null);
      onReview?.(safety, { path: relativePath, content: "", hash: null });
      throw new FyluneError("AGENT_REVIEW_REQUIRED", "Fylune kept this new document as a draft because its structure needs review.");
    }
    try {
      const saved = await saveDocument({
        root,
        relativePath,
        content: candidate,
        expectedHash: null,
        snapshotStore,
        draftStore,
        onWrite,
      });
      return { ...saved, content: candidate, previous: null, merged: false };
    } catch (error) {
      if (error?.code !== "CONTENT_CONFLICT") throw error;
      const disk = await readDocument(root, relativePath);
      await draftStore.save(root, disk.path, candidate, null);
      throw new FyluneError("AGENT_REVIEW_REQUIRED", "Another tool created this document first. Fylune kept both versions for review.");
    }
  }

  if (!baseline || typeof baseline.content !== "string" || typeof baseline.hash !== "string") {
    throw new FyluneError("AGENT_READ_REQUIRED", "Read the latest document before changing it.");
  }
  const candidateSafety = mergeDocumentVersions({
    base: baseline.content,
    local: candidate,
    disk: baseline.content,
  });
  if (candidateSafety.status === "protected") {
    await draftStore.save(root, previous.path, candidate, baseline.hash);
    onReview?.(candidateSafety, previous);
    throw new FyluneError("AGENT_REVIEW_REQUIRED", "Fylune blocked a high-risk rewrite and kept it as a reviewable draft.");
  }

  let disk = previous;
  let waitedForQuiet = false;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let content = candidate;
    let merged = false;
    if (disk.hash !== baseline.hash) {
      await snapshotStore.create(root, disk.path, baseline.content, "before-agent-merge");
      const result = mergeDocumentVersions({ base: baseline.content, local: candidate, disk: disk.content });
      if (result.status === "review" || result.status === "protected") {
        await draftStore.save(root, disk.path, candidate, baseline.hash);
        onReview?.(result, disk);
        throw new FyluneError("AGENT_REVIEW_REQUIRED", "The same area changed elsewhere. Fylune kept both versions for review.");
      }
      content = result.content;
      merged = result.status === "merged";
    }

    try {
      const saved = await saveDocument({
        root,
        relativePath: disk.path,
        content,
        expectedHash: disk.hash,
        snapshotStore,
        draftStore,
        onWrite,
      });
      return { ...saved, content, previous: disk, merged };
    } catch (error) {
      if (error?.code !== "CONTENT_CONFLICT") throw error;
      if (attempt === 2 && !waitedForQuiet) {
        await draftStore.save(root, disk.path, candidate, baseline.hash);
        const quiet = await waitForDocumentQuiet(() => readDocument(root, disk.path));
        if (!quiet.quiet) {
          throw new FyluneError("AGENT_WAITING_FOR_QUIET", "Another tool is still writing this document. The draft is safe.");
        }
        disk = quiet.latest;
        waitedForQuiet = true;
        continue;
      }
      if (attempt === 3) throw error;
      disk = await readDocument(root, disk.path);
    }
  }
  throw new FyluneError("AGENT_WAITING_FOR_QUIET", "The document kept changing while Fylune was saving it.");
}

import { diffArrays } from "diff";

const BUILT_IN_MDX_COMPONENTS = new Set(["Brief", "Decision", "Experiment"]);

/**
 * Merge ordinary Markdown/MDX without normalizing untouched source.
 *
 * The merge is intentionally conservative. It operates on semantic Markdown
 * blocks, so two writers can edit different paragraphs, headings, list items,
 * or frontmatter fields. Two edits to the same block remain reviewable.
 */
export function mergeDocumentVersions({ base, local, disk }) {
  assertSource(base, "base");
  assertSource(local, "local");
  assertSource(disk, "disk");

  if (local === disk) return complete("unchanged", local);

  const protection = protectedReason({ base, local, disk });
  if (protection) {
    return {
      status: "protected",
      reason: protection,
      content: null,
      conflicts: [{
        id: "file",
        section: "Whole document",
        base,
        local,
        disk,
      }],
      parts: [{ type: "conflict", id: "file" }],
    };
  }
  if (local === base) return complete("fast_forward", disk);
  if (disk === base) return complete("local_only", local);

  const baseBlocks = segmentMarkdown(base);
  const localPatches = patchesFromBlocks(baseBlocks, segmentMarkdown(local));
  const diskPatches = patchesFromBlocks(baseBlocks, segmentMarkdown(disk));
  const parts = [];
  const conflicts = [];
  let cursor = 0;
  let localIndex = 0;
  let diskIndex = 0;

  while (localIndex < localPatches.length || diskIndex < diskPatches.length) {
    const localPatch = localPatches[localIndex] ?? null;
    const diskPatch = diskPatches[diskIndex] ?? null;
    if (localPatch && diskPatch && patchesOverlap(localPatch, diskPatch)) {
      const group = collectOverlapGroup(localPatches, diskPatches, localIndex, diskIndex);
      localIndex = group.localIndex;
      diskIndex = group.diskIndex;
      const start = group.start;
      const end = group.end;
      if (start > cursor) parts.push({ type: "text", value: baseBlocks.slice(cursor, start).join("") });
      const localValue = applyPatchGroup(baseBlocks, start, end, group.local);
      const diskValue = applyPatchGroup(baseBlocks, start, end, group.disk);
      if (localValue === diskValue) {
        parts.push({ type: "text", value: localValue });
      } else if (start === end && canCombineConcurrentInsertions(localValue, diskValue)) {
        parts.push({ type: "text", value: stableInsertionOrder(localValue, diskValue) });
      } else if (end - start === 1) {
        const textMerge = mergeTextRanges(baseBlocks[start] || "", localValue, diskValue);
        if (textMerge != null) {
          parts.push({ type: "text", value: textMerge });
        } else {
          const id = `conflict-${conflicts.length + 1}`;
          const conflict = {
            id,
            section: sectionLabel(baseBlocks, start),
            base: baseBlocks.slice(start, end).join(""),
            local: localValue,
            disk: diskValue,
          };
          conflicts.push(conflict);
          parts.push({ type: "conflict", id });
        }
      } else {
        const id = `conflict-${conflicts.length + 1}`;
        const conflict = {
          id,
          section: sectionLabel(baseBlocks, start),
          base: baseBlocks.slice(start, end).join(""),
          local: localValue,
          disk: diskValue,
        };
        conflicts.push(conflict);
        parts.push({ type: "conflict", id });
      }
      cursor = Math.max(cursor, end);
      continue;
    }

    const patch = localPatch && (!diskPatch || patchBefore(localPatch, diskPatch))
      ? localPatch
      : diskPatch;
    if (patch.start > cursor) parts.push({ type: "text", value: baseBlocks.slice(cursor, patch.start).join("") });
    parts.push({ type: "text", value: patch.value.join("") });
    cursor = Math.max(cursor, patch.end);
    if (patch === localPatch) localIndex += 1;
    else diskIndex += 1;
  }

  if (cursor < baseBlocks.length) parts.push({ type: "text", value: baseBlocks.slice(cursor).join("") });
  if (conflicts.length) return { status: "review", content: null, conflicts, parts };
  return complete("merged", parts.map((part) => part.value).join(""), parts);
}

export function resolveDocumentMerge(result, resolutions) {
  if (!result || !Array.isArray(result.parts)) throw new TypeError("A merge result is required");
  const byId = new Map((result.conflicts || []).map((conflict) => [conflict.id, conflict]));
  return result.parts.map((part) => {
    if (part.type === "text") return part.value;
    const conflict = byId.get(part.id);
    const choice = resolutions?.[part.id];
    if (!conflict || (choice !== "local" && choice !== "disk")) {
      throw new Error(`Conflict ${part.id} has not been resolved`);
    }
    return conflict[choice];
  }).join("");
}

/**
 * Waits until consecutive reads report the same disk hash for the requested
 * quiet window. The caller still performs a final CAS write, so this only
 * reduces save storms; it never weakens the expected-content check.
 */
export async function waitForDocumentQuiet(
  readLatest,
  { quietMs = 800, maxMs = 5_000, pollMs = 100, now = () => Date.now(), wait = delay } = {},
) {
  if (typeof readLatest !== "function") throw new TypeError("readLatest must be a function");
  const startedAt = now();
  let latest = await readLatest();
  let stableSince = now();
  while (now() - startedAt < maxMs) {
    await wait(pollMs);
    const next = await readLatest();
    if (next?.hash !== latest?.hash) {
      latest = next;
      stableSince = now();
      continue;
    }
    latest = next;
    if (now() - stableSince >= quietMs) return { quiet: true, latest };
  }
  return { quiet: false, latest };
}

export function segmentMarkdown(source) {
  if (!source) return [];
  const lines = source.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const blocks = [];
  let index = 0;
  let inFrontmatter = lines[0]?.trim() === "---";

  if (inFrontmatter) {
    blocks.push(lines[index++]);
    while (index < lines.length) {
      const line = lines[index++];
      blocks.push(line);
      if (line.trim() === "---") {
        inFrontmatter = false;
        break;
      }
    }
  }

  while (index < lines.length) {
    const line = lines[index];
    if (/^\s*```|^\s*~~~/.test(line)) {
      const fence = line.match(/^\s*(```+|~~~+)/)?.[1] ?? "```";
      let block = line;
      index += 1;
      while (index < lines.length) {
        const next = lines[index++];
        block += next;
        if (new RegExp(`^\\s*${escapeRegExp(fence[0])}{${fence.length},}\\s*$`).test(next.trimEnd())) break;
      }
      blocks.push(block);
      continue;
    }
    if (/^\s*$/.test(line) || /^\s{0,3}#{1,6}\s/.test(line) || /^\s*(?:[-+*]|\d+[.)])\s+/.test(line) || /^\s*[|>]/.test(line)) {
      blocks.push(line);
      index += 1;
      continue;
    }
    let block = line;
    index += 1;
    while (index < lines.length) {
      const next = lines[index];
      if (/^\s*$/.test(next) || /^\s{0,3}#{1,6}\s/.test(next) || /^\s*(?:[-+*]|\d+[.)])\s+/.test(next) || /^\s*[|>]/.test(next) || /^\s*```|^\s*~~~/.test(next)) break;
      block += next;
      index += 1;
    }
    blocks.push(block);
  }
  return blocks;
}

function complete(status, content, parts = [{ type: "text", value: content }]) {
  return { status, content, conflicts: [], parts };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function assertSource(value, name) {
  if (typeof value !== "string") throw new TypeError(`${name} source must be a string`);
}

function protectedReason({ base, local, disk }) {
  if (hasChangedUnsupportedMdx(base, local) || hasChangedUnsupportedMdx(base, disk)) return "unsupported_mdx";
  if (!hasBalancedStructure(local) || !hasBalancedStructure(disk)) return "parse_failed";
  if (hasFrontmatter(base) && (!hasFrontmatter(local) || !hasFrontmatter(disk))) return "frontmatter_removed";
  if (isLargeDeletion(base, local) || isLargeDeletion(base, disk)) return "large_deletion";
  return null;
}

function hasFrontmatter(source) {
  return /^---(?:\r?\n)/.test(source);
}

function unsupportedMdxFragments(source) {
  const withoutFences = source.replace(/(```|~~~)[\s\S]*?\1/g, "");
  const fragments = [];
  for (const line of withoutFences.split(/\r?\n/)) {
    if (/^\s*(?:import|export)\s/.test(line)) fragments.push(line);
    for (const match of line.matchAll(/<\/?([A-Z][A-Za-z0-9.]*)\b(?:[^"'>{}]|"[^"]*"|'[^']*'|\{[^{}]*\})*>/g)) {
      if (!BUILT_IN_MDX_COMPONENTS.has(match[1])) fragments.push(match[0]);
    }
    for (const match of line.matchAll(/(?:^|[^\\])(\{(?:[^{}\n]|\{[^{}\n]*\})+\})/g)) {
      fragments.push(match[1]);
    }
  }
  return fragments;
}

function hasChangedUnsupportedMdx(base, candidate) {
  return JSON.stringify(unsupportedMdxFragments(base)) !== JSON.stringify(unsupportedMdxFragments(candidate));
}

function hasBalancedStructure(source) {
  const lines = source.split(/\r?\n/);
  let fence = null;
  for (const line of lines) {
    const match = line.match(/^\s*(`{3,}|~{3,})/);
    if (!match) continue;
    if (!fence) {
      fence = match[1];
      continue;
    }
    if (match[1][0] === fence[0] && match[1].length >= fence.length) fence = null;
  }
  if (fence) return false;
  if (hasFrontmatter(source) && !lines.slice(1).some((line) => line.trim() === "---")) return false;
  return true;
}

function isLargeDeletion(base, candidate) {
  if (candidate.length >= base.length) return false;
  const removed = base.length - candidate.length;
  const removedLines = Math.max(0, lineCount(base) - lineCount(candidate));
  return removed / Math.max(1, base.length) > 0.3 || removedLines > 20;
}

function lineCount(value) {
  return value ? value.split("\n").length : 0;
}

function patchesFromBlocks(base, changed) {
  const patches = [];
  let baseIndex = 0;
  let active = null;
  const flush = () => {
    if (active) patches.push(active);
    active = null;
  };
  for (const change of diffArrays(base, changed, { oneChangePerToken: false })) {
    if (!change.added && !change.removed) {
      flush();
      baseIndex += change.count ?? change.value.length;
      continue;
    }
    if (!active) active = { start: baseIndex, end: baseIndex, value: [] };
    if (change.removed) {
      baseIndex += change.count ?? change.value.length;
      active.end = baseIndex;
    } else if (change.added) {
      active.value.push(...change.value);
    }
  }
  flush();
  return patches;
}

function patchesOverlap(a, b) {
  if (a.start === a.end && b.start === b.end) return a.start === b.start;
  if (a.start === a.end) return a.start >= b.start && a.start <= b.end;
  if (b.start === b.end) return b.start >= a.start && b.start <= a.end;
  return a.start < b.end && b.start < a.end;
}

function patchBefore(a, b) {
  if (a.start !== b.start) return a.start < b.start;
  return a.end <= b.end;
}

function collectOverlapGroup(localPatches, diskPatches, localIndex, diskIndex) {
  const local = [localPatches[localIndex++]];
  const disk = [diskPatches[diskIndex++]];
  let start = Math.min(local[0].start, disk[0].start);
  let end = Math.max(local[0].end, disk[0].end);
  let changed = true;
  while (changed) {
    changed = false;
    const nextLocal = localPatches[localIndex];
    if (nextLocal && patchTouchesRange(nextLocal, start, end)) {
      local.push(nextLocal);
      localIndex += 1;
      start = Math.min(start, nextLocal.start);
      end = Math.max(end, nextLocal.end);
      changed = true;
    }
    const nextDisk = diskPatches[diskIndex];
    if (nextDisk && patchTouchesRange(nextDisk, start, end)) {
      disk.push(nextDisk);
      diskIndex += 1;
      start = Math.min(start, nextDisk.start);
      end = Math.max(end, nextDisk.end);
      changed = true;
    }
  }
  return { local, disk, localIndex, diskIndex, start, end };
}

function patchTouchesRange(patch, start, end) {
  if (patch.start === patch.end) return patch.start >= start && patch.start <= end;
  return patch.start <= end && patch.end >= start;
}

function applyPatchGroup(base, start, end, patches) {
  let result = "";
  let cursor = start;
  for (const patch of patches) {
    if (patch.start > cursor) result += base.slice(cursor, patch.start).join("");
    result += patch.value.join("");
    cursor = Math.max(cursor, patch.end);
  }
  if (cursor < end) result += base.slice(cursor, end).join("");
  return result;
}

function mergeTextRanges(base, local, disk) {
  const baseUnits = Array.from(base);
  if (baseUnits.length > 12_000) return null;
  const localPatches = patchesFromBlocks(baseUnits, Array.from(local));
  const diskPatches = patchesFromBlocks(baseUnits, Array.from(disk));
  const patches = [];
  for (const localPatch of localPatches) {
    for (const diskPatch of diskPatches) {
      if (patchesOverlap(localPatch, diskPatch)) {
        const localValue = applyPatchGroup(baseUnits, Math.min(localPatch.start, diskPatch.start), Math.max(localPatch.end, diskPatch.end), [localPatch]);
        const diskValue = applyPatchGroup(baseUnits, Math.min(localPatch.start, diskPatch.start), Math.max(localPatch.end, diskPatch.end), [diskPatch]);
        if (localValue !== diskValue) return null;
      }
    }
    patches.push(localPatch);
  }
  for (const diskPatch of diskPatches) {
    if (!patches.some((patch) => (
      patch.start === diskPatch.start
      && patch.end === diskPatch.end
      && patch.value.join("") === diskPatch.value.join("")
    ))) patches.push(diskPatch);
  }
  patches.sort((left, right) => left.start - right.start || left.end - right.end);
  return applyPatchGroup(baseUnits, 0, baseUnits.length, patches);
}

function canCombineConcurrentInsertions(local, disk) {
  const localLines = local.split(/\r?\n/).filter(Boolean);
  const diskLines = disk.split(/\r?\n/).filter(Boolean);
  if (!localLines.length || !diskLines.length) return false;
  const listItem = /^\s*(?:[-+*]|\d+[.)])\s+/;
  return localLines.every((line) => listItem.test(line))
    && diskLines.every((line) => listItem.test(line));
}

function stableInsertionOrder(local, disk) {
  if (local === disk) return local;
  const newline = local.includes("\r\n") || disk.includes("\r\n") ? "\r\n" : "\n";
  const lines = [...local.split(/\r?\n/), ...disk.split(/\r?\n/)]
    .filter(Boolean)
    .filter((line, index, values) => values.indexOf(line) === index);
  return `${lines.join(newline)}${local.endsWith("\n") || disk.endsWith("\n") ? newline : ""}`;
}

function sectionLabel(base, index) {
  for (let cursor = Math.min(index, base.length - 1); cursor >= 0; cursor -= 1) {
    const heading = base[cursor]?.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*(?:\n|$)/);
    if (heading) return heading[1];
  }
  return "Document content";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const WORKSPACE_RESOURCE_DRAG_TYPE = "application/x-fylune-workspace-resource";
export const AGENT_COMPOSER_CLIPBOARD_TYPE = "application/x-fylune-agent-composer";

const BLOCK_ELEMENTS = new Set(["DIV", "P", "LI"]);
const ZERO_WIDTH_PATTERN = /[\u200B\uFEFF]/g;
const CHIP_KINDS = new Set(["document", "resource", "attachment", "skill"]);

function appendTextSegment(segments, value) {
  const normalized = value.replace(ZERO_WIDTH_PATTERN, "").replace(/\u00A0/g, " ");
  if (!normalized) return;
  const previous = segments.at(-1);
  if (previous?.type === "text") {
    previous.value += normalized;
  } else {
    segments.push({ type: "text", value: normalized });
  }
}

function chipFromElement(element) {
  return {
    type: "chip",
    id: element.dataset.chipId || "",
    kind: element.dataset.kind || "resource",
    label: element.dataset.label || "",
    path: element.dataset.path || null,
    skillId: element.dataset.skillId || null,
    skillSource: element.dataset.skillSource || null,
    auto: element.dataset.auto === "true",
  };
}

function normalizeClipboardChip(value) {
  if (!value || value.type !== "chip" || !CHIP_KINDS.has(value.kind)) return null;
  const label = typeof value.label === "string" ? value.label.trim() : "";
  if (!label) return null;
  return {
    type: "chip",
    id: typeof value.id === "string" ? value.id : "",
    kind: value.kind,
    label,
    path: typeof value.path === "string" && value.path ? value.path : null,
    skillId: typeof value.skillId === "string" && value.skillId ? value.skillId : null,
    skillSource: typeof value.skillSource === "string" && value.skillSource ? value.skillSource : null,
    auto: false,
  };
}

function normalizeClipboardSegments(segments) {
  if (!Array.isArray(segments)) return [];
  const normalized = [];
  for (const segment of segments) {
    if (segment?.type === "text" && typeof segment.value === "string") {
      appendTextSegment(normalized, segment.value);
      continue;
    }
    const chip = normalizeClipboardChip(segment);
    if (chip) normalized.push(chip);
  }
  return normalized;
}

function clipboardText(segments) {
  return segments
    .map((segment) => {
      if (segment.type === "text") return segment.value;
      if (segment.kind === "skill") return `/${segment.label}`;
      return segment.label;
    })
    .join("")
    .replace(/[ \t]+\n/g, "\n");
}

function referenceToken(chip) {
  if (chip.kind === "document" && chip.auto) return "";
  if (chip.kind === "skill") return `[skill:${chip.label}]`;
  if (chip.kind === "attachment") return `[attachment:${chip.label}]`;
  const token = chip.path
    ? `[workspace file "${chip.label}" at "${chip.path}"]`
    : `[workspace file "${chip.label}"]`;
  return chip.auto ? ` ${token} ` : token;
}

function uniqueBy(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    const value = key(item);
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

/**
 * Reads the contenteditable composer in DOM order. Reference chips remain
 * atomic UI nodes, while the model receives explicit inline path tokens that
 * preserve the user's sentence structure.
 */
export function readAgentComposer(composer) {
  const segments = [];

  function visit(node) {
    if (node.nodeType === window.Node.TEXT_NODE) {
      appendTextSegment(segments, node.textContent || "");
      return;
    }
    if (node.nodeType !== window.Node.ELEMENT_NODE) return;
    if (node.dataset?.agentChip === "true") {
      segments.push(chipFromElement(node));
      return;
    }
    if (node.tagName === "BR") {
      appendTextSegment(segments, "\n");
      return;
    }
    const isBlock = BLOCK_ELEMENTS.has(node.tagName);
    if (isBlock && segments.length) {
      const previous = segments.at(-1);
      if (previous?.type !== "text" || !previous.value.endsWith("\n")) appendTextSegment(segments, "\n");
    }
    for (const child of node.childNodes) visit(child);
    if (isBlock) {
      const previous = segments.at(-1);
      if (previous?.type !== "text" || !previous.value.endsWith("\n")) appendTextSegment(segments, "\n");
    }
  }

  for (const child of composer?.childNodes || []) visit(child);

  const chips = segments.filter((segment) => segment.type === "chip");
  const documentChip = chips.find((chip) => chip.kind === "document" && chip.auto)
    || chips.find((chip) => chip.kind === "document");
  const attachments = uniqueBy(
    chips
      .filter((chip) => chip.kind === "attachment")
      .map((chip) => ({ name: chip.label, path: chip.path || null })),
    (attachment) => `${attachment.path || ""}:${attachment.name}`,
  );
  const skills = uniqueBy(
    chips
      .filter((chip) => chip.kind === "skill")
      .map((chip) => ({
        id: chip.skillId,
        source: chip.skillSource,
        name: chip.label,
      })),
    (skill) => `${skill.source || ""}:${skill.id || ""}`,
  );
  const references = uniqueBy(
    chips
      .filter((chip) => chip.kind === "resource" && chip.path)
      .map((chip) => chip.path),
    (path) => path,
  );
  const plainText = segments
    .filter((segment) => segment.type === "text")
    .map((segment) => segment.value)
    .join("")
    .trim();
  const text = segments
    .map((segment) => (segment.type === "text" ? segment.value : referenceToken(segment)))
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    text,
    plainText,
    segments,
    chips,
    documentPath: documentChip?.path || null,
    attachments,
    skills,
    references,
  };
}

/**
 * Serializes a copied composer/message fragment. The custom MIME type keeps
 * references structured between Fylune surfaces, while HTML preserves the
 * same structure in clipboard managers that retain rich clipboard data.
 */
export function writeAgentComposerClipboard(clipboardData, fragment) {
  if (!clipboardData || !fragment) return false;
  const state = readAgentComposer(fragment);
  if (!state.chips.length) return false;

  const segments = normalizeClipboardSegments(state.segments);
  const htmlRoot = fragment.cloneNode(true);
  htmlRoot.querySelectorAll?.("[data-agent-chip-remove]").forEach((element) => element.remove());

  clipboardData.setData(AGENT_COMPOSER_CLIPBOARD_TYPE, JSON.stringify({
    version: 1,
    segments,
  }));
  clipboardData.setData("text/plain", clipboardText(segments));
  clipboardData.setData("text/html", htmlRoot.innerHTML);
  return true;
}

/**
 * Reads Fylune references from the custom clipboard payload or copied Fylune
 * HTML. Untrusted rich text is deliberately reduced to text/plain so pasted
 * fonts, colors, links, and layout never enter the composer.
 */
export function readAgentComposerClipboard(clipboardData) {
  if (!clipboardData) return [];

  try {
    const raw = clipboardData.getData?.(AGENT_COMPOSER_CLIPBOARD_TYPE);
    if (raw) {
      const payload = JSON.parse(raw);
      const segments = normalizeClipboardSegments(payload?.segments);
      if (segments.length) return segments;
    }
  } catch {
    // Fall through to the safe HTML/text representations.
  }

  const html = clipboardData.getData?.("text/html") || "";
  if (html) {
    const root = window.document.createElement("div");
    root.innerHTML = html;
    if (root.querySelector('[data-agent-chip="true"]')) {
      const segments = normalizeClipboardSegments(readAgentComposer(root).segments);
      if (segments.length) return segments;
    }
  }

  const text = (clipboardData.getData?.("text/plain") || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00A0/g, " ");
  return text ? [{ type: "text", value: text }] : [];
}

export function writeWorkspaceResourceDrag(dataTransfer, item) {
  if (!dataTransfer || !item?.path || item.type === "folder") return false;
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(WORKSPACE_RESOURCE_DRAG_TYPE, JSON.stringify({
    path: item.path,
    label: item.name || item.title || item.path.split("/").at(-1),
    type: item.type || "file",
  }));
  return true;
}

export function readWorkspaceResourceDrag(dataTransfer) {
  try {
    const raw = dataTransfer?.getData?.(WORKSPACE_RESOURCE_DRAG_TYPE);
    if (!raw) return null;
    const item = JSON.parse(raw);
    if (!item?.path || typeof item.path !== "string") return null;
    return {
      path: item.path,
      label: typeof item.label === "string" && item.label ? item.label : item.path.split("/").at(-1),
      type: typeof item.type === "string" ? item.type : "file",
    };
  } catch {
    return null;
  }
}

export function hasWorkspaceResourceDrag(dataTransfer) {
  return Array.from(dataTransfer?.types || []).includes(WORKSPACE_RESOURCE_DRAG_TYPE);
}

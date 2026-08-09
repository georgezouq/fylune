const MAX_ICON_LENGTH = 64;

function decodeScalar(value) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "null" || trimmed === "~") return null;
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replaceAll("''", "'");
  }
  return trimmed.replace(/\s+#.*$/, "").trim();
}

export function splitDocumentFrontmatter(source = "") {
  const normalized = String(source).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const match = normalized.match(/^---[\t ]*\n([\s\S]*?)\n---[\t ]*(?:\n|$)/);
  if (!match) return { frontmatter: "", content: normalized };
  return {
    frontmatter: match[1],
    content: normalized.slice(match[0].length),
  };
}

export function documentIconFromFrontmatter(frontmatter = "") {
  const iconLine = String(frontmatter).split("\n").find((line) => /^icon\s*:/.test(line));
  if (!iconLine) return null;
  const icon = decodeScalar(iconLine.replace(/^icon\s*:\s*/, ""));
  return typeof icon === "string" && icon.length <= MAX_ICON_LENGTH ? icon : null;
}

export function documentIconFromSource(source = "") {
  return documentIconFromFrontmatter(splitDocumentFrontmatter(source).frontmatter);
}

export function updateDocumentIconFrontmatter(frontmatter = "", icon = null) {
  const nextIcon = typeof icon === "string" && icon.trim() ? icon.trim().slice(0, MAX_ICON_LENGTH) : null;
  const lines = String(frontmatter).split("\n");
  const iconIndex = lines.findIndex((line) => /^icon\s*:/.test(line));
  if (iconIndex >= 0) {
    if (nextIcon) lines[iconIndex] = `icon: ${JSON.stringify(nextIcon)}`;
    else lines.splice(iconIndex, 1);
  } else if (nextIcon) {
    lines.push(`icon: ${JSON.stringify(nextIcon)}`);
  }
  return lines.join("\n").replace(/^\n+|\n+$/g, "");
}

export function serializeDocumentFrontmatter(frontmatter = "", icon = null) {
  const metadata = updateDocumentIconFrontmatter(frontmatter, icon);
  return metadata ? `---\n${metadata}\n---\n\n` : "";
}

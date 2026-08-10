const IMAGE_EXTENSION_PATTERN = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;

function normalizedSegments(value) {
  return String(value || "")
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment && segment !== ".");
}

function encodeRelativePath(value) {
  return value
    .split("/")
    .map((segment) => (segment === ".." || segment === "." ? segment : encodeURIComponent(segment)))
    .join("/");
}

function escapeMarkdownLabel(value) {
  return String(value || "").replace(/([\\\]])/g, "\\$1");
}

export function workspaceRelativePath(documentPath, resourcePath) {
  const from = normalizedSegments(documentPath).slice(0, -1);
  const target = normalizedSegments(resourcePath);
  let shared = 0;
  while (shared < from.length && shared < target.length && from[shared] === target[shared]) shared += 1;
  const relative = [
    ...Array.from({ length: from.length - shared }, () => ".."),
    ...target.slice(shared),
  ].join("/");
  return encodeRelativePath(relative.startsWith(".") ? relative : `./${relative}`);
}

export function workspaceResourceMarkdown(resource, documentPath) {
  if (!resource?.path || !documentPath) return "";
  const label = escapeMarkdownLabel(
    resource.label || resource.path.replaceAll("\\", "/").split("/").at(-1),
  );
  const relativePath = workspaceRelativePath(documentPath, resource.path);
  const isImage = resource.type === "image" || IMAGE_EXTENSION_PATTERN.test(resource.path);
  return isImage
    ? `![${label}](${relativePath})`
    : `[${label}](${relativePath})`;
}

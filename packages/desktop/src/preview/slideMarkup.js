/**
 * Slide text arrives from the parser as HTML fragments carrying the run formatting
 * PowerPoint applied. Fylune opens files the user chose, but a document is still
 * untrusted input inside a renderer process, so nothing reaches the DOM before it has
 * been reduced to an allowlist of presentational tags and attributes.
 */

const ALLOWED_TAGS = new Set(["P", "SPAN", "DIV", "BR", "B", "STRONG", "I", "EM", "U", "S", "SUB", "SUP", "UL", "OL", "LI", "A"]);
const ALLOWED_ATTRIBUTES = new Set(["style", "class", "href", "target", "rel"]);

const ALLOWED_STYLE_PROPERTIES = new Set([
  "color", "background-color", "font-size", "font-family", "font-weight", "font-style",
  "text-align", "text-decoration", "text-decoration-line", "line-height", "letter-spacing",
  "vertical-align", "margin", "margin-top", "margin-bottom", "margin-left", "margin-right",
  "padding", "padding-left", "text-indent", "list-style-type", "white-space", "direction",
]);

function sanitizeStyle(value) {
  return String(value)
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .filter((declaration) => {
      const separator = declaration.indexOf(":");
      if (separator <= 0) return false;
      const property = declaration.slice(0, separator).trim().toLowerCase();
      const propertyValue = declaration.slice(separator + 1).trim().toLowerCase();
      if (!ALLOWED_STYLE_PROPERTIES.has(property)) return false;
      return !propertyValue.includes("url(") && !propertyValue.includes("expression(") && !propertyValue.includes("javascript:");
    })
    .join("; ");
}

function sanitizeElement(element) {
  for (const child of [...element.children]) {
    if (!ALLOWED_TAGS.has(child.tagName)) {
      child.replaceWith(...child.childNodes);
      continue;
    }
    for (const attribute of [...child.attributes]) {
      const name = attribute.name.toLowerCase();
      if (!ALLOWED_ATTRIBUTES.has(name)) {
        child.removeAttribute(attribute.name);
        continue;
      }
      if (name === "style") {
        const safe = sanitizeStyle(attribute.value);
        if (safe) child.setAttribute("style", safe);
        else child.removeAttribute("style");
        continue;
      }
      if (name === "href" && !/^https?:|^mailto:/i.test(attribute.value.trim())) {
        child.removeAttribute("href");
      }
    }
    if (child.tagName === "A" && child.hasAttribute("href")) {
      child.setAttribute("target", "_blank");
      child.setAttribute("rel", "noreferrer noopener");
    }
    sanitizeElement(child);
  }
  return element;
}

export function sanitizeSlideHtml(html) {
  if (typeof html !== "string" || !html) return "";
  if (typeof document === "undefined") return "";
  const container = document.createElement("div");
  container.innerHTML = html;
  for (const removable of container.querySelectorAll("script, style, iframe, object, embed, link, meta, form, input, svg")) {
    removable.remove();
  }
  return sanitizeElement(container).innerHTML;
}

/** Turns any of the parser's fill shapes into a CSS background declaration. */
export function fillToCss(fill) {
  if (!fill || typeof fill !== "object") return null;
  if (fill.type === "color") return fill.value || null;
  if (fill.type === "image") {
    const source = fill.value?.base64 || fill.value?.blob;
    return source ? `center / cover no-repeat url(${JSON.stringify(source)})` : null;
  }
  if (fill.type === "gradient") {
    const stops = (fill.value?.colors || [])
      .map((stop) => `${stop.color} ${stop.pos}`)
      .join(", ");
    if (!stops) return null;
    const rotation = Number.isFinite(fill.value?.rot) ? fill.value.rot : 90;
    return fill.value?.path === "circle" || fill.value?.path === "shape"
      ? `radial-gradient(${stops})`
      : `linear-gradient(${rotation}deg, ${stops})`;
  }
  if (fill.type === "pattern") {
    return fill.value?.backgroundColor || fill.value?.foregroundColor || null;
  }
  return null;
}

export function borderToCss(element) {
  if (!element?.borderWidth || !element.borderColor) return undefined;
  const style = new Set(["solid", "dashed", "dotted"]).has(element.borderType) ? element.borderType : "solid";
  return `${element.borderWidth}px ${style} ${element.borderColor}`;
}

/** Rotation and mirroring compose into one transform so a flipped arrow still points right. */
export function elementTransform({ rotate, isFlipH, isFlipV }) {
  const parts = [];
  if (Number.isFinite(rotate) && rotate !== 0) parts.push(`rotate(${rotate}deg)`);
  if (isFlipH) parts.push("scaleX(-1)");
  if (isFlipV) parts.push("scaleY(-1)");
  return parts.length ? parts.join(" ") : undefined;
}

export const VERTICAL_ALIGNMENT = new Map([
  ["up", "flex-start"],
  ["top", "flex-start"],
  ["mid", "center"],
  ["ctr", "center"],
  ["center", "center"],
  ["down", "flex-end"],
  ["bottom", "flex-end"],
]);

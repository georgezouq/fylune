/**
 * Shared vocabulary for the Office preview surfaces.
 *
 * Everything here is pure so the classification, addressing, and style mapping can be
 * tested without a workbook, a DOM, or the Electron bridge.
 */

const OFFICE_EXTENSIONS = new Map([
  ["docx", { kind: "word", legacy: false }],
  ["xlsx", { kind: "excel", legacy: false }],
  ["pptx", { kind: "powerpoint", legacy: false }],
  ["doc", { kind: "word", legacy: true }],
  ["xls", { kind: "excel", legacy: true }],
  ["ppt", { kind: "powerpoint", legacy: true }],
]);

export const OFFICE_KINDS = new Set(["word", "excel", "powerpoint"]);

export function fileExtension(name = "") {
  const cleaned = String(name).replaceAll(" / ", "/").split("/").at(-1) || "";
  const index = cleaned.lastIndexOf(".");
  return index > 0 ? cleaned.slice(index + 1).toLowerCase() : "";
}

export function officeFormatForName(name) {
  return OFFICE_EXTENSIONS.get(fileExtension(name)) ?? null;
}

/**
 * A legacy binary Office file cannot be parsed in the browser. Fylune still names it
 * correctly so the library and the preview can point at the app that can open it.
 */
export function isLegacyOfficeItem(item) {
  if (!item) return false;
  return Boolean(officeFormatForName(item.path || item.name || item.title)?.legacy);
}

export function isOfficeKind(type) {
  return OFFICE_KINDS.has(type);
}

export function columnLabel(columnNumber) {
  let remaining = Math.max(1, Math.floor(columnNumber));
  let label = "";
  while (remaining > 0) {
    const index = (remaining - 1) % 26;
    label = String.fromCharCode(65 + index) + label;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return label;
}

export function cellAddress(row, column) {
  return `${columnLabel(column)}${row}`;
}

/**
 * Merged ranges arrive as flat tuples. Indexing them once turns the two questions the
 * grid asks per cell — "how far do I span" and "am I hidden" — into map lookups.
 */
export function indexMerges(merges = []) {
  const masters = new Map();
  const covered = new Set();
  for (const merge of merges) {
    const [top, left, bottom, right] = merge;
    if (![top, left, bottom, right].every(Number.isFinite)) continue;
    masters.set(`${top},${left}`, {
      top,
      left,
      bottom,
      right,
      rowSpan: bottom - top + 1,
      colSpan: right - left + 1,
    });
    for (let row = top; row <= bottom; row += 1) {
      for (let column = left; column <= right; column += 1) {
        if (row === top && column === left) continue;
        covered.add(`${row},${column}`);
      }
    }
  }
  return { masters, covered };
}

const BORDER_SIDES = ["top", "right", "bottom", "left"];

/**
 * Maps one deduplicated workbook style onto inline CSS. Values the file did not set
 * are left out entirely so the grid's own tokens keep showing through.
 */
export function cellStyleToCss(style) {
  if (!style) return undefined;
  const css = {};
  if (style.bold) css.fontWeight = 700;
  if (style.italic) css.fontStyle = "italic";
  if (style.underline || style.strike) {
    css.textDecorationLine = [style.underline ? "underline" : null, style.strike ? "line-through" : null]
      .filter(Boolean)
      .join(" ");
  }
  if (style.size) css.fontSize = `${style.size}px`;
  if (style.family) css.fontFamily = `${JSON.stringify(style.family)}, var(--font-ui)`;
  if (style.color) css.color = style.color;
  if (style.background) css.background = style.background;
  if (style.align) css.textAlign = style.align;
  // The cell is a row-direction flex box, so the vertical axis is align-items.
  if (style.valign) css.alignItems = style.valign;
  if (style.wrap) {
    css.whiteSpace = "pre-wrap";
    css.overflowWrap = "anywhere";
    // A row too short for its wrapped text clips at the bottom, as Excel does, rather
    // than centring the block and cutting the first and last lines in half.
    if (!style.valign) css.alignItems = "flex-start";
  }
  if (style.indent) css.paddingInlineStart = `${4 + style.indent * 9}px`;
  for (const side of BORDER_SIDES) {
    const value = style.borders?.[side];
    if (value) css[`border${side[0].toUpperCase()}${side.slice(1)}`] = value;
  }
  return Object.keys(css).length ? css : undefined;
}

/** `#,##0.00;[Red]-#,##0.00` can flip a cell red for negatives; that colour wins over the style's. */
export function numberFormatColor(color) {
  if (!color) return undefined;
  const named = new Set(["black", "blue", "cyan", "green", "magenta", "red", "white", "yellow"]);
  return named.has(String(color).toLowerCase()) ? String(color).toLowerCase() : undefined;
}

export function formatFileSize(bytes, notAvailable = "—") {
  if (!Number.isFinite(bytes) || bytes <= 0) return notAvailable;
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** index);
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

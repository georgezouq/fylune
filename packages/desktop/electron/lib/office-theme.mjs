/**
 * Office colour resolution.
 *
 * A workbook stores most colours as a theme slot plus a tint rather than a literal
 * value, so a cell that looks navy in Excel arrives here as `{ theme: 3, tint: -0.5 }`.
 * Resolving those against the workbook's own theme is what keeps a preview looking
 * like the file instead of looking like a default palette.
 */

// Office 2007 default clrScheme, used when a workbook ships without a theme part.
const FALLBACK_THEME = [
  "FFFFFFFF", "FF000000", "FFEEECE1", "FF1F497D",
  "FF4F81BD", "FFC0504D", "FF9BBB59", "FF8064A2",
  "FF4BACC6", "FFF79646", "FF0000FF", "FF800080",
];

// Legacy indexed palette (ECMA-376 §18.8.27). Only the entries a modern file still
// emits are worth carrying; anything else falls back to the theme lookup.
const INDEXED_COLORS = new Map([
  [0, "FF000000"], [1, "FFFFFFFF"], [2, "FFFF0000"], [3, "FF00FF00"],
  [4, "FF0000FF"], [5, "FFFFFF00"], [6, "FFFF00FF"], [7, "FF00FFFF"],
  [8, "FF000000"], [9, "FFFFFFFF"], [10, "FFFF0000"], [11, "FF00FF00"],
  [12, "FF0000FF"], [13, "FFFFFF00"], [14, "FFFF00FF"], [15, "FF00FFFF"],
  [64, "FF000000"], [65, "FFFFFFFF"],
]);

const CLR_SCHEME_ORDER = ["lt1", "dk1", "lt2", "dk2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"];

function readSchemeSlot(clrScheme, name) {
  const slot = new RegExp(`<a:${name}[^>]*>([\\s\\S]*?)</a:${name}>`).exec(clrScheme);
  if (!slot) return null;
  const srgb = /<a:srgbClr[^>]*val="([0-9A-Fa-f]{6})"/.exec(slot[1]);
  if (srgb) return { value: `FF${srgb[1].toUpperCase()}`, system: false };
  const sys = /<a:sysClr[^>]*lastClr="([0-9A-Fa-f]{6})"/.exec(slot[1]);
  // `windowText` and `window` mean "whatever the OS uses", which is how Excel keeps a
  // black-on-white workbook readable in dark mode. Recording that here lets the preview
  // hand those cells to Fylune's own ink and page tokens instead of literal black.
  if (sys) return { value: `FF${sys[1].toUpperCase()}`, system: true };
  return null;
}

/**
 * Pulls the twelve theme colours out of a workbook's theme XML. Returns the Office
 * default palette when the workbook has no theme part or the part is unreadable.
 * The returned array carries an `automatic` set naming the system-coloured slots.
 */
export function parseThemeColors(themeXml) {
  const withAutomatic = (colors, automatic) => Object.assign(colors, { automatic });
  if (typeof themeXml !== "string" || !themeXml.includes("clrScheme")) {
    return withAutomatic([...FALLBACK_THEME], new Set());
  }
  const clrScheme = /<a:clrScheme[^>]*>([\s\S]*?)<\/a:clrScheme>/.exec(themeXml);
  if (!clrScheme) return withAutomatic([...FALLBACK_THEME], new Set());
  const automatic = new Set();
  const colors = CLR_SCHEME_ORDER.map((name, index) => {
    const slot = readSchemeSlot(clrScheme[1], name);
    if (!slot) return FALLBACK_THEME[index];
    if (slot.system) automatic.add(index);
    return slot.value;
  });
  return withAutomatic(colors, automatic);
}

export function workbookThemeColors(workbook) {
  const themes = workbook?.model?.themes;
  if (!themes) return parseThemeColors(null);
  const first = typeof themes === "object" ? Object.values(themes).find((value) => typeof value === "string") : null;
  return parseThemeColors(first);
}

function channelToLinear(value) {
  return value / 255;
}

function rgbToHsl(red, green, blue) {
  const r = channelToLinear(red);
  const g = channelToLinear(green);
  const b = channelToLinear(blue);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  if (max === min) return { hue: 0, saturation: 0, lightness };
  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue;
  if (max === r) hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
  else if (max === g) hue = ((b - r) / delta + 2) / 6;
  else hue = ((r - g) / delta + 4) / 6;
  return { hue, saturation, lightness };
}

function hueToChannel(p, q, t) {
  let temp = t;
  if (temp < 0) temp += 1;
  if (temp > 1) temp -= 1;
  if (temp < 1 / 6) return p + (q - p) * 6 * temp;
  if (temp < 1 / 2) return q;
  if (temp < 2 / 3) return p + (q - p) * (2 / 3 - temp) * 6;
  return p;
}

function hslToRgb({ hue, saturation, lightness }) {
  if (saturation === 0) {
    const value = Math.round(lightness * 255);
    return [value, value, value];
  }
  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  return [
    Math.round(hueToChannel(p, q, hue + 1 / 3) * 255),
    Math.round(hueToChannel(p, q, hue) * 255),
    Math.round(hueToChannel(p, q, hue - 1 / 3) * 255),
  ];
}

/** ECMA-376 tint: negative darkens toward black, positive lightens toward white. */
export function applyTint(argb, tint) {
  if (!tint) return argb;
  const alpha = argb.slice(0, 2);
  const red = Number.parseInt(argb.slice(2, 4), 16);
  const green = Number.parseInt(argb.slice(4, 6), 16);
  const blue = Number.parseInt(argb.slice(6, 8), 16);
  if (![red, green, blue].every(Number.isFinite)) return argb;
  const hsl = rgbToHsl(red, green, blue);
  const lightness = tint < 0
    ? hsl.lightness * (1 + tint)
    : hsl.lightness * (1 - tint) + tint;
  const channels = hslToRgb({ ...hsl, lightness: Math.min(1, Math.max(0, lightness)) });
  return alpha + channels.map((value) => value.toString(16).padStart(2, "0").toUpperCase()).join("");
}

function argbToCss(argb) {
  if (typeof argb !== "string" || argb.length !== 8) return null;
  // Spreadsheet cell colours are RGB values even though OOXML stores them in
  // an ARGB-shaped field. Excel writers commonly emit a 00 prefix that Office
  // still renders as opaque; treating it as CSS alpha hides the cell entirely.
  return `#${argb.slice(2)}`.toLowerCase();
}

// ECMA-376 §18.8.27: 64 is the automatic foreground, 65 the automatic background.
const AUTOMATIC_INDEXES = new Set([64, 65]);

/**
 * Turns any of ExcelJS's colour shapes into a CSS colour.
 *
 * Returns null for a colour the workbook left automatic — `auto`, the automatic
 * palette indexes, or a theme slot the theme itself defined as a system colour. A null
 * lets Fylune's own ink and page tokens through, which is what keeps a black-on-white
 * workbook legible in dark mode instead of turning into black text on a dark ground.
 */
export function resolveColor(color, themeColors) {
  if (!color || typeof color !== "object") return null;
  if (color.auto) return null;
  if (typeof color.argb === "string" && color.argb.length === 8) {
    return argbToCss(applyTint(color.argb.toUpperCase(), color.tint));
  }
  if (Number.isInteger(color.theme)) {
    if (themeColors?.automatic?.has(color.theme)) return null;
    const base = themeColors?.[color.theme] ?? FALLBACK_THEME[color.theme];
    if (!base) return null;
    return argbToCss(applyTint(base, color.tint));
  }
  if (Number.isInteger(color.indexed)) {
    if (AUTOMATIC_INDEXES.has(color.indexed)) return null;
    const base = INDEXED_COLORS.get(color.indexed);
    return base ? argbToCss(base) : null;
  }
  return null;
}

export const OFFICE_FALLBACK_THEME = FALLBACK_THEME;

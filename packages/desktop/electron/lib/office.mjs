import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import writeFileAtomic from "write-file-atomic";

import { editableAssetTypeForPath, readableAssetTypeForPath } from "./assets.mjs";
import { FyluneError } from "./errors.mjs";
import { sha256 } from "./hash.mjs";
import { loadWorkbookBuffer } from "./office-ooxml.mjs";
import { resolveColor, workbookThemeColors } from "./office-theme.mjs";
import { resolveProjectPath } from "./path-security.mjs";

// A preview is a reading surface, not a spreadsheet engine. These ceilings keep a
// pathological workbook from freezing the window; the renderer says plainly when a
// sheet was cut off rather than pretending the file ends there.
export const MAX_SHEET_ROWS = 5000;
export const MAX_SHEET_COLUMNS = 256;
export const MAX_SHEET_CELLS = 200000;

const DEFAULT_COLUMN_WIDTH_CHARS = 8.43;
const DEFAULT_ROW_HEIGHT_POINTS = 15;
const MAXIMUM_DIMENSION_CHARS = 255;

const BORDER_WIDTHS = new Map([
  ["hair", 1], ["thin", 1], ["dotted", 1], ["dashed", 1], ["dashDot", 1], ["dashDotDot", 1],
  ["medium", 2], ["mediumDashed", 2], ["mediumDashDot", 2], ["mediumDashDotDot", 2], ["slantDashDot", 2],
  ["thick", 3], ["double", 3],
]);
const BORDER_STYLES = new Map([
  ["hair", "solid"], ["thin", "solid"], ["medium", "solid"], ["thick", "solid"],
  ["dotted", "dotted"], ["dashed", "dashed"], ["mediumDashed", "dashed"],
  ["dashDot", "dashed"], ["dashDotDot", "dashed"], ["mediumDashDot", "dashed"],
  ["mediumDashDotDot", "dashed"], ["slantDashDot", "dashed"], ["double", "double"],
]);

/** Excel column widths are counted in `0` glyphs of the workbook font, not pixels. */
export function columnWidthToPixels(width) {
  const chars = Number.isFinite(width) && width > 0 ? Math.min(width, MAXIMUM_DIMENSION_CHARS) : DEFAULT_COLUMN_WIDTH_CHARS;
  return Math.round(chars * 7) + 5;
}

export function rowHeightToPixels(height) {
  const points = Number.isFinite(height) && height > 0 ? height : DEFAULT_ROW_HEIGHT_POINTS;
  return Math.round(points * (4 / 3));
}

export function columnLetter(columnNumber) {
  let remaining = columnNumber;
  let letters = "";
  while (remaining > 0) {
    const index = (remaining - 1) % 26;
    letters = String.fromCharCode(65 + index) + letters;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return letters;
}

export function parseCellReference(reference) {
  const match = /^([A-Z]+)(\d+)$/.exec(String(reference).toUpperCase());
  if (!match) return null;
  let column = 0;
  for (const character of match[1]) column = column * 26 + (character.charCodeAt(0) - 64);
  return { row: Number(match[2]), column };
}

export function parseMergeRange(range) {
  const [start, end] = String(range).split(":");
  const from = parseCellReference(start);
  const to = parseCellReference(end ?? start);
  if (!from || !to) return null;
  return {
    top: Math.min(from.row, to.row),
    left: Math.min(from.column, to.column),
    bottom: Math.max(from.row, to.row),
    right: Math.max(from.column, to.column),
  };
}

function borderSide(side, themeColors) {
  if (!side?.style) return null;
  const width = BORDER_WIDTHS.get(side.style) ?? 1;
  const style = BORDER_STYLES.get(side.style) ?? "solid";
  const color = resolveColor(side.color, themeColors);
  return `${width}px ${style} ${color || "#b0b0b0"}`;
}

const HORIZONTAL_ALIGNMENT = new Map([
  ["left", "left"], ["center", "center"], ["centerContinuous", "center"],
  ["right", "right"], ["justify", "justify"], ["distributed", "justify"], ["fill", "left"],
]);
const VERTICAL_ALIGNMENT = new Map([
  ["top", "flex-start"], ["middle", "center"], ["bottom", "flex-end"],
  ["justify", "flex-start"], ["distributed", "center"],
]);

function cellStyle(cell, themeColors, isNumeric) {
  const font = cell.font || {};
  const style = {};

  if (font.bold) style.bold = true;
  if (font.italic) style.italic = true;
  if (font.strike) style.strike = true;
  if (font.underline) style.underline = true;
  if (Number.isFinite(font.size) && font.size > 0) style.size = font.size;
  if (typeof font.name === "string" && font.name) style.family = font.name;

  const color = resolveColor(font.color, themeColors);
  if (color) style.color = color;

  // ExcelJS reports an unfilled cell as a `none` pattern; only a real fill is a colour.
  if (cell.fill?.type === "pattern" && cell.fill.pattern && cell.fill.pattern !== "none") {
    const background = resolveColor(cell.fill.fgColor, themeColors);
    if (background) style.background = background;
  } else if (cell.fill?.type === "gradient") {
    const stop = cell.fill.stops?.find((candidate) => candidate?.color);
    const background = resolveColor(stop?.color, themeColors);
    if (background) style.background = background;
  }

  const alignment = cell.alignment || {};
  const horizontal = HORIZONTAL_ALIGNMENT.get(alignment.horizontal);
  // Numbers right-align by default in every spreadsheet; matching that is what makes
  // a column of figures readable without the user touching anything.
  style.align = horizontal || (isNumeric ? "right" : "left");
  const vertical = VERTICAL_ALIGNMENT.get(alignment.vertical);
  if (vertical) style.valign = vertical;
  if (alignment.wrapText) style.wrap = true;
  if (Number.isFinite(alignment.indent) && alignment.indent > 0) style.indent = alignment.indent;

  const borders = {};
  for (const side of ["top", "right", "bottom", "left"]) {
    const value = borderSide(cell.border?.[side], themeColors);
    if (value) borders[side] = value;
  }
  if (Object.keys(borders).length) style.borders = borders;

  return style;
}

function createStyleTable() {
  const styles = [];
  const index = new Map();
  return {
    styles,
    intern(style) {
      const key = JSON.stringify(style);
      if (key === "{}") return null;
      const existing = index.get(key);
      if (existing !== undefined) return existing;
      const next = styles.length;
      styles.push(style);
      index.set(key, next);
      return next;
    },
  };
}

function richTextToPlain(richText) {
  return (richText || []).map((run) => run?.text ?? "").join("");
}

function readCellValue(cell, ValueType) {
  switch (cell.type) {
    case ValueType.Number:
      return { kind: "number", value: cell.value, input: String(cell.value) };
    case ValueType.Boolean:
      return { kind: "boolean", value: cell.value, input: cell.value ? "TRUE" : "FALSE" };
    case ValueType.Date: {
      const date = cell.value instanceof Date ? cell.value : new Date(cell.value);
      return Number.isNaN(date.getTime())
        ? { kind: "string", value: "", input: "" }
        : { kind: "date", value: date.toISOString(), input: date.toISOString().slice(0, 10) };
    }
    case ValueType.Formula: {
      const formula = cell.formula ?? cell.value?.formula ?? cell.value?.sharedFormula ?? "";
      const result = cell.result ?? cell.value?.result;
      return {
        kind: "formula",
        value: result && typeof result === "object" && "error" in result ? result.error : result ?? null,
        input: `=${formula}`,
        formula,
      };
    }
    case ValueType.Hyperlink:
      return {
        kind: "hyperlink",
        value: cell.value?.text ?? "",
        input: cell.value?.text ?? "",
        link: cell.value?.hyperlink ?? null,
      };
    case ValueType.RichText: {
      const text = richTextToPlain(cell.value?.richText);
      return { kind: "richText", value: text, input: text };
    }
    case ValueType.Error: {
      const error = cell.value?.error ?? "#VALUE!";
      return { kind: "error", value: error, input: error };
    }
    case ValueType.Null:
    case ValueType.Merge:
      return null;
    default: {
      const text = typeof cell.value === "string" ? cell.value : String(cell.value ?? "");
      return text ? { kind: "string", value: text, input: text } : null;
    }
  }
}

function formatCellText(reading, numFmt, formatters) {
  const { format, formatColor, dateToSerial } = formatters;
  const code = numFmt || "General";
  try {
    if (reading.kind === "date") {
      const date = new Date(reading.value);
      const serial = dateToSerial([
        date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(),
        date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(),
      ]);
      return { text: format(code === "General" ? "yyyy-mm-dd" : code, serial), color: null };
    }
    if (reading.kind === "error") return { text: String(reading.value), color: "red" };
    if (reading.kind === "formula") {
      const result = reading.value;
      if (result == null) return { text: "", color: null };
      if (typeof result === "number") {
        return { text: format(code, result), color: formatColor(code, result) };
      }
      return { text: String(result), color: null };
    }
    if (reading.kind === "number") {
      return { text: format(code, reading.value), color: formatColor(code, reading.value) };
    }
    if (reading.kind === "boolean") return { text: reading.value ? "TRUE" : "FALSE", color: null };
    return { text: String(reading.value ?? ""), color: null };
  } catch {
    return { text: String(reading.value ?? ""), color: null };
  }
}

function frozenPanes(worksheet) {
  const view = worksheet.views?.find((candidate) => candidate?.state === "frozen");
  if (!view) return null;
  const rows = Number.isFinite(view.ySplit) ? view.ySplit : 0;
  const columns = Number.isFinite(view.xSplit) ? view.xSplit : 0;
  return rows || columns ? { rows, columns } : null;
}

function readWorksheet(worksheet, { themeColors, styleTable, formatters }) {
  const merges = (worksheet.model?.merges || [])
    .map(parseMergeRange)
    .filter(Boolean);

  const rowCount = Math.min(worksheet.rowCount || 0, MAX_SHEET_ROWS);
  const columnCount = Math.min(worksheet.columnCount || 0, MAX_SHEET_COLUMNS);
  const truncated = (worksheet.rowCount || 0) > rowCount || (worksheet.columnCount || 0) > columnCount;

  const columnWidths = [];
  for (let column = 1; column <= columnCount; column += 1) {
    columnWidths.push(columnWidthToPixels(worksheet.getColumn(column)?.width));
  }

  const rowHeights = [];
  const cells = {};
  let cellBudget = MAX_SHEET_CELLS;
  let overflowed = false;

  for (let rowNumber = 1; rowNumber <= rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    rowHeights.push(rowHeightToPixels(row?.height));
    if (!row) continue;
    for (let column = 1; column <= columnCount; column += 1) {
      const cell = row.getCell(column);
      if (!cell) continue;
      if (cell.type === undefined) continue;
      const reading = readCellValue(cell, formatters.ValueType);
      const isNumeric = reading?.kind === "number"
        || reading?.kind === "date"
        || (reading?.kind === "formula" && typeof reading.value === "number");
      const style = cellStyle(cell, themeColors, isNumeric);
      const styleIndex = styleTable.intern(style);
      if (!reading && styleIndex == null) continue;
      if (cellBudget <= 0) {
        overflowed = true;
        break;
      }
      cellBudget -= 1;
      const formatted = reading ? formatCellText(reading, cell.numFmt, formatters) : { text: "", color: null };
      const entry = { text: formatted.text };
      if (styleIndex != null) entry.style = styleIndex;
      if (reading) {
        entry.input = reading.input;
        entry.kind = reading.kind;
        if (reading.formula) entry.formula = reading.formula;
        if (reading.link) entry.link = reading.link;
      }
      if (formatted.color) entry.numberColor = formatted.color;
      if (cell.numFmt) entry.numFmt = cell.numFmt;
      cells[`${rowNumber},${column}`] = entry;
    }
    if (overflowed) break;
  }

  return {
    id: worksheet.id,
    name: worksheet.name,
    hidden: worksheet.state === "hidden" || worksheet.state === "veryHidden",
    rowCount,
    columnCount,
    columnWidths,
    rowHeights,
    defaultColumnWidth: columnWidthToPixels(worksheet.properties?.defaultColWidth),
    defaultRowHeight: rowHeightToPixels(worksheet.properties?.defaultRowHeight),
    frozen: frozenPanes(worksheet),
    merges: merges.map(({ top, left, bottom, right }) => [top, left, bottom, right]),
    cells,
    truncated: truncated || overflowed,
  };
}

async function loadFormatters() {
  const [{ default: ExcelJS }, numfmt] = await Promise.all([import("exceljs"), import("numfmt")]);
  return {
    ExcelJS,
    ValueType: ExcelJS.ValueType,
    format: numfmt.format,
    formatColor: numfmt.formatColor,
    dateToSerial: numfmt.dateToSerial,
  };
}

async function resolveOfficeFile(root, relativePath, typeResolver) {
  const type = typeResolver(relativePath);
  if (!type) {
    throw new FyluneError("UNSUPPORTED_PREVIEW", "Fylune cannot open this file type.");
  }
  const resolved = await resolveProjectPath(root, relativePath);
  const info = await stat(resolved.absolutePath);
  if (!info.isFile()) {
    throw new FyluneError("UNSUPPORTED_PREVIEW", "Fylune cannot open this file type.");
  }
  if (info.size > type.maxBytes) {
    throw new FyluneError("ASSET_TOO_LARGE", "This file is too large to preview in Fylune.", {
      maxBytes: type.maxBytes,
      size: info.size,
    });
  }
  return { type, resolved, info };
}

/** Reads a previewable binary asset into memory alongside the hash edits are checked against. */
export async function readOfficeAsset({ root, relativePath }) {
  const { resolved, info } = await resolveOfficeFile(root, relativePath, readableAssetTypeForPath);
  const buffer = await readFile(resolved.absolutePath);
  return {
    bytes: new Uint8Array(buffer),
    hash: sha256(buffer),
    mtimeMs: info.mtimeMs,
    size: info.size,
  };
}

export async function readWorkbook({ root, relativePath }) {
  const { resolved, info } = await resolveOfficeFile(root, relativePath, editableAssetTypeForPath);
  const buffer = await readFile(resolved.absolutePath);
  const formatters = await loadFormatters();
  const workbook = new formatters.ExcelJS.Workbook();
  let repaired = false;
  try {
    ({ repaired } = await loadWorkbookBuffer(workbook, buffer));
  } catch (error) {
    throw new FyluneError("UNREADABLE_WORKBOOK", "Fylune could not read this workbook.", {
      reason: error?.message ?? "PARSE_FAILED",
    });
  }

  const themeColors = workbookThemeColors(workbook);
  const styleTable = createStyleTable();
  const sheets = workbook.worksheets
    .filter((worksheet) => worksheet.state !== "veryHidden")
    .map((worksheet) => readWorksheet(worksheet, { themeColors, styleTable, formatters }));

  return {
    path: resolved.relativePath,
    hash: sha256(buffer),
    mtimeMs: info.mtimeMs,
    size: info.size,
    styles: styleTable.styles,
    sheets,
    // Surfaced so the editor can warn that saving rewrites a package Fylune had to
    // repair before it could read it at all.
    repaired,
  };
}

const NUMERIC_PATTERN = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Turns what the user typed into the value Excel would have stored. Kept exported so
 * the coercion rules can be tested directly rather than through a workbook round-trip.
 */
export function coerceCellInput(input) {
  if (input == null) return null;
  const text = String(input);
  if (!text.trim()) return null;
  if (text.startsWith("=")) {
    const formula = text.slice(1).trim();
    return formula ? { formula } : null;
  }
  const trimmed = text.trim();
  if (NUMERIC_PATTERN.test(trimmed)) {
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return numeric;
  }
  if (trimmed.toUpperCase() === "TRUE") return true;
  if (trimmed.toUpperCase() === "FALSE") return false;
  return text;
}

function insertWorksheetTrack(worksheet, edit) {
  const mergeRanges = (worksheet.model?.merges || []).map((range) => ({ range, parsed: parseMergeRange(range) }));
  for (const { range } of mergeRanges) worksheet.unMergeCells(range);
  if (edit.type === "insertRow") worksheet.spliceRows(edit.index, 0, []);
  else worksheet.spliceColumns(edit.index, 0, []);
  for (const { parsed } of mergeRanges) {
    if (!parsed) continue;
    let { top, left, bottom, right } = parsed;
    if (edit.type === "insertRow") {
      if (top >= edit.index) { top += 1; bottom += 1; }
      else if (bottom >= edit.index) bottom += 1;
    } else if (left >= edit.index) { left += 1; right += 1; }
    else if (right >= edit.index) right += 1;
    worksheet.mergeCells(`${columnLetter(left)}${top}:${columnLetter(right)}${bottom}`);
  }
}

export async function writeWorkbookEdits({ root, relativePath, edits, expectedHash, onWrite }) {
  if (!Array.isArray(edits) || !edits.length) {
    throw new FyluneError("NOTHING_TO_SAVE", "There are no changes to save.");
  }
  const { resolved } = await resolveOfficeFile(root, relativePath, editableAssetTypeForPath);
  const before = await readFile(resolved.absolutePath);
  const currentHash = sha256(before);
  if (currentHash !== expectedHash) {
    const info = await stat(resolved.absolutePath);
    throw new FyluneError("CONTENT_CONFLICT", "The workbook changed on disk before Fylune could save it.", {
      currentHash,
      mtimeMs: info.mtimeMs,
    });
  }

  const formatters = await loadFormatters();
  const workbook = new formatters.ExcelJS.Workbook();
  try {
    await loadWorkbookBuffer(workbook, before);
  } catch (error) {
    throw new FyluneError("UNREADABLE_WORKBOOK", "Fylune could not read this workbook.", {
      reason: error?.message ?? "PARSE_FAILED",
    });
  }

  for (const edit of edits.filter((candidate) => candidate.type)) {
    const worksheet = workbook.getWorksheet(edit.sheet);
    if (!worksheet) {
      throw new FyluneError("SHEET_NOT_FOUND", "That sheet is no longer in the workbook.", { sheet: edit.sheet });
    }
    insertWorksheetTrack(worksheet, edit);
  }

  for (const edit of edits.filter((candidate) => !candidate.type)) {
    const worksheet = workbook.getWorksheet(edit.sheet);
    if (!worksheet) {
      throw new FyluneError("SHEET_NOT_FOUND", "That sheet is no longer in the workbook.", { sheet: edit.sheet });
    }
    const cell = worksheet.getRow(edit.row).getCell(edit.column);
    const value = coerceCellInput(edit.input);
    // Assigning `value` alone leaves number format, font, fill, and borders intact,
    // so an edited cell keeps looking exactly like its neighbours.
    cell.value = value;
  }
  // Formula edits carry no cached result, so tell Excel to recalculate on open.
  workbook.calcProperties = { ...workbook.calcProperties, fullCalcOnLoad: true };

  let buffer;
  try {
    buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  } catch (error) {
    throw new FyluneError("SAVE_FAILED", "Fylune could not rebuild the workbook. The file on disk is unchanged.", {
      reason: error?.message ?? "WRITE_FAILED",
    });
  }

  try {
    const beforeInfo = await stat(resolved.absolutePath);
    await writeFileAtomic(resolved.absolutePath, buffer, { fsync: true, mode: beforeInfo.mode });
  } catch (error) {
    throw new FyluneError("SAVE_FAILED", "Fylune could not write the workbook.", {
      reason: error?.code ?? "UNKNOWN",
    });
  }

  const savedHash = sha256(buffer);
  onWrite?.(resolved.absolutePath, savedHash);
  const afterInfo = await stat(resolved.absolutePath);
  return {
    path: resolved.relativePath,
    hash: savedHash,
    mtimeMs: afterInfo.mtimeMs,
    size: afterInfo.size,
  };
}

export function officeKindForPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return new Set([".docx", ".doc"]).has(extension)
    ? "word"
    : new Set([".xlsx", ".xls"]).has(extension)
      ? "excel"
      : new Set([".pptx", ".ppt"]).has(extension)
        ? "powerpoint"
        : null;
}

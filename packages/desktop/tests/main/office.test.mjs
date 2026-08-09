import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { beforeEach, describe, expect, it } from "vitest";

import { assetTypeForPath, editableAssetTypeForPath, readableAssetTypeForPath } from "../../electron/lib/assets.mjs";
import {
  coerceCellInput,
  columnLetter,
  columnWidthToPixels,
  parseMergeRange,
  readOfficeAsset,
  readWorkbook,
  rowHeightToPixels,
  writeWorkbookEdits,
} from "../../electron/lib/office.mjs";
import { relativizeRelationshipTargets, stripNamespacePrefix } from "../../electron/lib/office-ooxml.mjs";
import { applyTint, parseThemeColors, resolveColor } from "../../electron/lib/office-theme.mjs";

let root;

async function writeWorkbookFixture(name = "book.xlsx") {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Revenue", { views: [{ state: "frozen", xSplit: 1, ySplit: 2 }] });
  sheet.columns = [{ width: 22 }, { width: 12 }, { width: 12 }];
  sheet.getCell("A1").value = "Q4 plan";
  sheet.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF1F4E79" } };
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDEBF7" } };
  sheet.mergeCells("A1:C1");
  ["Region", "Amount", "Share"].forEach((value, index) => { sheet.getCell(2, index + 1).value = value; });
  sheet.getCell("A3").value = "EMEA";
  sheet.getCell("B3").value = 1234567.891;
  sheet.getCell("B3").numFmt = "#,##0.00";
  sheet.getCell("C3").value = 0.4213;
  sheet.getCell("C3").numFmt = "0.0%";
  sheet.getCell("C4").value = { formula: "B3*2", result: 2469135.782 };
  sheet.getCell("A5").value = new Date(Date.UTC(2026, 7, 7));
  sheet.getCell("A5").numFmt = "yyyy-mm-dd";
  sheet.getRow(3).height = 28;
  workbook.addWorksheet("Notes");
  await writeFile(path.join(root, name), Buffer.from(await workbook.xlsx.writeBuffer()));
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "fylune-office-test-"));
});

describe("office asset classification", () => {
  it("recognises modern and legacy Office documents", () => {
    expect(assetTypeForPath("plan.docx")).toMatchObject({ kind: "word", readable: true });
    expect(assetTypeForPath("plan.docx").legacy).toBeUndefined();
    expect(assetTypeForPath("plan.xlsx")).toMatchObject({ kind: "excel", editable: true });
    expect(assetTypeForPath("deck.pptx")).toMatchObject({ kind: "powerpoint" });
    expect(assetTypeForPath("plan.doc")).toMatchObject({ kind: "word", legacy: true });
    expect(assetTypeForPath("plan.XLS")).toMatchObject({ kind: "excel", legacy: true });
    expect(assetTypeForPath("notes.txt")).toBeNull();
  });

  it("refuses to hand legacy binaries to a browser parser", () => {
    expect(readableAssetTypeForPath("plan.docx")).not.toBeNull();
    expect(readableAssetTypeForPath("report.pdf")).not.toBeNull();
    expect(readableAssetTypeForPath("plan.doc")).toBeNull();
    expect(readableAssetTypeForPath("photo.png")).toBeNull();
    expect(editableAssetTypeForPath("book.xlsx")).not.toBeNull();
    expect(editableAssetTypeForPath("book.xls")).toBeNull();
    expect(editableAssetTypeForPath("plan.docx")).toBeNull();
  });
});

describe("workbook geometry helpers", () => {
  it("converts Excel character widths and point heights to pixels", () => {
    expect(columnWidthToPixels(8.43)).toBe(64);
    expect(columnWidthToPixels(undefined)).toBe(64);
    expect(columnWidthToPixels(0)).toBe(64);
    expect(rowHeightToPixels(15)).toBe(20);
    expect(rowHeightToPixels(undefined)).toBe(20);
  });

  it("addresses columns beyond Z", () => {
    expect([1, 26, 27, 52, 703].map(columnLetter)).toEqual(["A", "Z", "AA", "AZ", "AAA"]);
  });

  it("parses merge ranges in either corner order", () => {
    expect(parseMergeRange("A1:C1")).toEqual({ top: 1, left: 1, bottom: 1, right: 3 });
    expect(parseMergeRange("C3:A1")).toEqual({ top: 1, left: 1, bottom: 3, right: 3 });
    expect(parseMergeRange("B2")).toEqual({ top: 2, left: 2, bottom: 2, right: 2 });
    expect(parseMergeRange("nonsense")).toBeNull();
  });
});

describe("workbook colour resolution", () => {
  it("reads the workbook's own theme rather than assuming the Office default", () => {
    const theme = parseThemeColors(`
      <a:theme><a:themeElements><a:clrScheme name="Custom">
        <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
        <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
        <a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
        <a:dk2><a:srgbClr val="44546A"/></a:dk2>
        <a:accent1><a:srgbClr val="4472C4"/></a:accent1>
      </a:clrScheme></a:themeElements></a:theme>`);
    expect(theme[3]).toBe("FF44546A");
    expect(theme[4]).toBe("FF4472C4");
    expect(parseThemeColors("not a theme")[4]).toBe("FF4F81BD");
    // `windowText` and `window` are the OS colours, not literal black and white.
    expect([...theme.automatic].sort()).toEqual([0, 1]);
  });

  it("leaves a workbook's automatic colours to Fylune's own ink and page", () => {
    const theme = parseThemeColors(`
      <a:clrScheme><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
      <a:accent1><a:srgbClr val="4472C4"/></a:accent1></a:clrScheme>`);
    expect(resolveColor({ theme: 1 }, theme)).toBeNull();
    expect(resolveColor({ theme: 0 }, theme)).toBeNull();
    expect(resolveColor({ indexed: 64 }, theme)).toBeNull();
    expect(resolveColor({ indexed: 65 }, theme)).toBeNull();
    // A colour the file actually chose is still honoured.
    expect(resolveColor({ theme: 4 }, theme)).toBe("#4472c4");
    expect(resolveColor({ argb: "FF000000" }, theme)).toBe("#000000");
  });

  it("darkens and lightens a theme colour by its tint", () => {
    expect(applyTint("FF808080", 0)).toBe("FF808080");
    const darker = applyTint("FF808080", -0.5);
    const lighter = applyTint("FF808080", 0.5);
    expect(Number.parseInt(darker.slice(2, 4), 16)).toBeLessThan(0x80);
    expect(Number.parseInt(lighter.slice(2, 4), 16)).toBeGreaterThan(0x80);
  });

  it("maps every ExcelJS colour shape onto CSS", () => {
    const theme = parseThemeColors("");
    expect(resolveColor({ argb: "FF1F4E79" }, theme)).toBe("#1f4e79");
    expect(resolveColor({ argb: "00FFFFFF" }, theme)).toBe("#ffffff");
    expect(resolveColor({ argb: "00FF4500" }, theme)).toBe("#ff4500");
    expect(resolveColor({ theme: 4 }, theme)).toBe("#4f81bd");
    expect(resolveColor({ indexed: 2 }, theme)).toBe("#ff0000");
    expect(resolveColor({ auto: 1 }, theme)).toBeNull();
    expect(resolveColor(null, theme)).toBeNull();
  });
});

describe("reading a workbook", () => {
  it("returns formatted text, styles, merges, and frozen panes", async () => {
    await writeWorkbookFixture();
    const model = await readWorkbook({ root, relativePath: "book.xlsx" });

    expect(model.sheets.map((sheet) => sheet.name)).toEqual(["Revenue", "Notes"]);
    const sheet = model.sheets[0];
    expect(sheet.frozen).toEqual({ rows: 2, columns: 1 });
    expect(sheet.merges).toEqual([[1, 1, 1, 3]]);
    expect(sheet.columnWidths[0]).toBe(159);
    expect(sheet.rowHeights[2]).toBe(37);

    // Number formats are applied here, not left for the renderer to guess at.
    expect(sheet.cells["3,2"]).toMatchObject({ text: "1,234,567.89", input: "1234567.891", kind: "number" });
    expect(sheet.cells["3,3"]).toMatchObject({ text: "42.1%", kind: "number" });
    expect(sheet.cells["5,1"]).toMatchObject({ text: "2026-08-07", kind: "date" });
    expect(sheet.cells["4,3"]).toMatchObject({ input: "=B3*2", kind: "formula", formula: "B3*2" });

    const titleStyle = model.styles[sheet.cells["1,1"].style];
    expect(titleStyle).toMatchObject({ bold: true, size: 14, color: "#1f4e79", background: "#ddebf7" });
  });

  it("refuses a file type it cannot parse", async () => {
    await writeFile(path.join(root, "notes.txt"), "hello");
    await expect(readWorkbook({ root, relativePath: "notes.txt" }))
      .rejects.toMatchObject({ code: "UNSUPPORTED_PREVIEW" });
  });

  it("reads Word and PowerPoint bytes with the hash edits are checked against", async () => {
    // The ZIP signature every OOXML package starts with.
    await writeFile(path.join(root, "plan.docx"), Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    const asset = await readOfficeAsset({ root, relativePath: "plan.docx" });
    expect(asset.bytes).toBeInstanceOf(Uint8Array);
    expect(asset.hash).toMatch(/^[a-f0-9]{64}$/);
    await expect(readOfficeAsset({ root, relativePath: "plan.doc" }))
      .rejects.toMatchObject({ code: "UNSUPPORTED_PREVIEW" });
  });
});

describe("workbooks other tools wrote", () => {
  const SPREADSHEET_NAMESPACE = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

  /**
   * Rewrites an ordinary workbook into the shape ClosedXML and the OpenXML SDK emit:
   * every spreadsheetml element namespace-prefixed, every relationship target absolute.
   * Excel opens these; ExcelJS on its own cannot.
   */
  async function writeForeignWorkbook(name) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Plan");
    sheet.getCell("A1").value = "Content ID";
    sheet.getCell("B1").value = 42;
    sheet.getCell("B1").numFmt = "#,##0";
    await writeFile(path.join(root, name), Buffer.from(await workbook.xlsx.writeBuffer()));

    const zip = await JSZip.loadAsync(await readFile(path.join(root, name)));
    for (const entry of Object.keys(zip.files)) {
      if (zip.files[entry].dir) continue;
      const xml = await zip.file(entry).async("string");
      if (entry.endsWith(".rels")) {
        zip.file(entry, xml.replace(/Target="(?!\/|\.|[a-z]+:)([^"]+)"/g, (whole, target) => {
          const owner = path.posix.dirname(path.posix.dirname(entry));
          return `Target="/${path.posix.normalize(path.posix.join(owner === "." ? "" : owner, target))}"`;
        }));
        continue;
      }
      if (!xml.includes(SPREADSHEET_NAMESPACE)) continue;
      zip.file(entry, xml
        .replace(new RegExp(`xmlns="${SPREADSHEET_NAMESPACE}"`, "g"), `xmlns:x="${SPREADSHEET_NAMESPACE}"`)
        .replace(/<(\/?)([a-zA-Z][\w]*)/g, (whole, slash, tag) => (tag === "xml" ? whole : `<${slash}x:${tag}`))
        .replace(/^<x:\?xml/, "<?xml"));
    }
    await writeFile(path.join(root, name), await zip.generateAsync({ type: "nodebuffer" }));
  }

  it("cannot be read by ExcelJS alone, and is read anyway", async () => {
    await writeForeignWorkbook("foreign.xlsx");
    const raw = new ExcelJS.Workbook();
    await expect(raw.xlsx.load(await readFile(path.join(root, "foreign.xlsx")))).rejects.toThrow();

    const model = await readWorkbook({ root, relativePath: "foreign.xlsx" });
    expect(model.repaired).toBe(true);
    expect(model.sheets[0].name).toBe("Plan");
    expect(model.sheets[0].cells["1,1"]).toMatchObject({ text: "Content ID" });
  });

  it("does not repack a workbook that needed no repair", async () => {
    await writeWorkbookFixture();
    const model = await readWorkbook({ root, relativePath: "book.xlsx" });
    expect(model.repaired).toBe(false);
  });

  it("saves a repaired workbook as ordinary OOXML that reads back cleanly", async () => {
    await writeForeignWorkbook("foreign.xlsx");
    const before = await readWorkbook({ root, relativePath: "foreign.xlsx" });

    await writeWorkbookEdits({
      root,
      relativePath: "foreign.xlsx",
      expectedHash: before.hash,
      edits: [{ sheet: "Plan", row: 1, column: 1, input: "Renamed" }],
    });

    const after = await readWorkbook({ root, relativePath: "foreign.xlsx" });
    expect(after.repaired).toBe(false);
    expect(after.sheets[0].cells["1,1"]).toMatchObject({ text: "Renamed" });
    expect(after.sheets[0].cells["1,2"]).toMatchObject({ numFmt: "#,##0" });
  });
});

describe("OOXML compatibility repairs", () => {
  it("moves prefixed spreadsheetml markup into the default namespace", () => {
    const xml = '<?xml version="1.0"?><x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<x:sheets><x:sheet name="Plan" x:state="visible" r:id="R1"/></x:sheets></x:workbook>';
    const stripped = stripNamespacePrefix(xml);
    expect(stripped).toContain("<workbook");
    expect(stripped).toContain("<sheet ");
    expect(stripped).toContain('xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"');
    expect(stripped).toContain('state="visible"');
    // Relationship attributes stay prefixed; ExcelJS reads them by prefix.
    expect(stripped).toContain('r:id="R1"');
  });

  it("leaves an already-unprefixed part untouched", () => {
    expect(stripNamespacePrefix('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>')).toBeNull();
    expect(stripNamespacePrefix("")).toBeNull();
    expect(stripNamespacePrefix(null)).toBeNull();
  });

  it("rewrites absolute relationship targets against the part that owns them", () => {
    const rels = '<Relationships><Relationship Target="/xl/tables/table1.xml" Id="R1"/></Relationships>';
    expect(relativizeRelationshipTargets(rels, "xl/worksheets/_rels/sheet1.xml.rels"))
      .toContain('Target="../tables/table1.xml"');
    expect(relativizeRelationshipTargets('<Relationship Target="/xl/workbook.xml"/>', "_rels/.rels"))
      .toContain('Target="xl/workbook.xml"');
    expect(relativizeRelationshipTargets('<Relationship Target="styles.xml"/>', "xl/_rels/workbook.xml.rels"))
      .toBeNull();
  });
});

describe("coercing typed cell input", () => {
  it("reads a leading equals sign as a formula and blank input as an empty cell", () => {
    expect(coerceCellInput("=SUM(A1:A2)")).toEqual({ formula: "SUM(A1:A2)" });
    expect(coerceCellInput("")).toBeNull();
    expect(coerceCellInput("   ")).toBeNull();
    expect(coerceCellInput(null)).toBeNull();
    expect(coerceCellInput("=")).toBeNull();
  });

  it("keeps numbers numeric and booleans boolean", () => {
    expect(coerceCellInput("12.5")).toBe(12.5);
    expect(coerceCellInput("-3")).toBe(-3);
    expect(coerceCellInput("1e3")).toBe(1000);
    expect(coerceCellInput("TRUE")).toBe(true);
    expect(coerceCellInput("false")).toBe(false);
    expect(coerceCellInput("12.5.6")).toBe("12.5.6");
    expect(coerceCellInput("EMEA")).toBe("EMEA");
  });
});

describe("saving workbook edits", () => {
  it("writes cell values while leaving their number format alone", async () => {
    await writeWorkbookFixture();
    const before = await readWorkbook({ root, relativePath: "book.xlsx" });

    const saved = await writeWorkbookEdits({
      root,
      relativePath: "book.xlsx",
      expectedHash: before.hash,
      edits: [
        { sheet: "Revenue", row: 3, column: 2, input: "2000000" },
        { sheet: "Revenue", row: 6, column: 1, input: "=SUM(B3:B4)" },
        { sheet: "Revenue", row: 6, column: 2, input: "" },
      ],
    });
    expect(saved.hash).not.toBe(before.hash);

    const after = await readWorkbook({ root, relativePath: "book.xlsx" });
    const sheet = after.sheets[0];
    expect(sheet.cells["3,2"]).toMatchObject({ text: "2,000,000.00", numFmt: "#,##0.00" });
    expect(sheet.cells["6,1"]).toMatchObject({ kind: "formula", formula: "SUM(B3:B4)" });
    expect(sheet.cells["3,3"]?.text).toBe("42.1%");
    expect(after.sheets.map((item) => item.name)).toEqual(["Revenue", "Notes"]);
  });

  it("turns an outside change into a conflict instead of overwriting it", async () => {
    await writeWorkbookFixture();
    const before = await readWorkbook({ root, relativePath: "book.xlsx" });
    const original = await readFile(path.join(root, "book.xlsx"));

    await writeWorkbookFixture();
    await writeFile(path.join(root, "book.xlsx"), Buffer.concat([original, Buffer.from([0])]));

    await expect(writeWorkbookEdits({
      root,
      relativePath: "book.xlsx",
      expectedHash: before.hash,
      edits: [{ sheet: "Revenue", row: 3, column: 2, input: "1" }],
    })).rejects.toMatchObject({ code: "CONTENT_CONFLICT" });
  });

  it("inserts rows and columns without replacing existing cells", async () => {
    await writeWorkbookFixture();
    const before = await readWorkbook({ root, relativePath: "book.xlsx" });

    await writeWorkbookEdits({
      root,
      relativePath: "book.xlsx",
      expectedHash: before.hash,
      edits: [
        { type: "insertRow", sheet: "Revenue", index: 2 },
        { type: "insertColumn", sheet: "Revenue", index: 2 },
      ],
    });

    const after = await readWorkbook({ root, relativePath: "book.xlsx" });
    expect(after.sheets[0].rowCount).toBe(before.sheets[0].rowCount + 1);
    expect(after.sheets[0].columnCount).toBe(before.sheets[0].columnCount + 1);
    expect(after.sheets[0].cells["1,1"]?.text).toBe(before.sheets[0].cells["1,1"]?.text);
  });

  it("rejects an edit aimed at a sheet that is no longer there", async () => {
    await writeWorkbookFixture();
    const before = await readWorkbook({ root, relativePath: "book.xlsx" });
    await expect(writeWorkbookEdits({
      root,
      relativePath: "book.xlsx",
      expectedHash: before.hash,
      edits: [{ sheet: "Gone", row: 1, column: 1, input: "1" }],
    })).rejects.toMatchObject({ code: "SHEET_NOT_FOUND" });
  });

  it("refuses to write anything but a workbook", async () => {
    await writeFile(path.join(root, "plan.docx"), Buffer.from("PK"));
    await expect(writeWorkbookEdits({
      root,
      relativePath: "plan.docx",
      expectedHash: "0".repeat(64),
      edits: [{ sheet: "Sheet1", row: 1, column: 1, input: "1" }],
    })).rejects.toMatchObject({ code: "UNSUPPORTED_PREVIEW" });
  });
});

import { describe, expect, it } from "vitest";

import {
  cellAddress,
  cellStyleToCss,
  columnLabel,
  fileExtension,
  indexMerges,
  isLegacyOfficeItem,
  isOfficeKind,
  numberFormatColor,
  officeFormatForName,
} from "../../src/preview/officeFormats.js";
import {
  clampCursor,
  nextCursor,
  rangeWithMerges,
  scrollToTrack,
  trackOffsets,
  trackSpan,
  visibleTrackRange,
} from "../../src/preview/sheetGeometry.js";
import { borderToCss, elementTransform, fillToCss, sanitizeSlideHtml } from "../../src/preview/slideMarkup.js";

describe("office format classification", () => {
  it("reads the extension off a workspace path", () => {
    expect(fileExtension("Assets / Q4 plan.XLSX")).toBe("xlsx");
    expect(fileExtension("deck.pptx")).toBe("pptx");
    expect(fileExtension("notes")).toBe("");
    expect(fileExtension(".gitignore")).toBe("");
  });

  it("separates modern Office files from the binary formats that predate them", () => {
    expect(officeFormatForName("plan.docx")).toEqual({ kind: "word", legacy: false });
    expect(officeFormatForName("plan.doc")).toEqual({ kind: "word", legacy: true });
    expect(officeFormatForName("cover.png")).toBeNull();
    expect(isLegacyOfficeItem({ path: "reports/old.xls" })).toBe(true);
    expect(isLegacyOfficeItem({ path: "reports/new.xlsx" })).toBe(false);
    expect(isLegacyOfficeItem(null)).toBe(false);
    expect(isOfficeKind("excel")).toBe(true);
    expect(isOfficeKind("pdf")).toBe(false);
  });
});

describe("cell addressing", () => {
  it("labels columns the way a spreadsheet does", () => {
    expect([1, 2, 26, 27, 28, 702, 703].map(columnLabel)).toEqual(["A", "B", "Z", "AA", "AB", "ZZ", "AAA"]);
    expect(cellAddress(12, 3)).toBe("C12");
  });
});

describe("merge indexing", () => {
  it("records the span on the master and hides every cell the block covers", () => {
    const { masters, covered } = indexMerges([[1, 1, 2, 3], [5, 2, 5, 2]]);
    expect(masters.get("1,1")).toMatchObject({ rowSpan: 2, colSpan: 3 });
    expect(covered.has("1,1")).toBe(false);
    expect(covered.has("1,2")).toBe(true);
    expect(covered.has("2,3")).toBe(true);
    expect(covered.has("3,1")).toBe(false);
    expect(masters.get("5,2")).toMatchObject({ rowSpan: 1, colSpan: 1 });
  });

  it("ignores a malformed range rather than corrupting the grid", () => {
    const { masters, covered } = indexMerges([[1, 1, undefined, 3]]);
    expect(masters.size).toBe(0);
    expect(covered.size).toBe(0);
  });
});

describe("workbook style mapping", () => {
  it("emits only the declarations the file actually set", () => {
    expect(cellStyleToCss(null)).toBeUndefined();
    expect(cellStyleToCss({})).toBeUndefined();
    expect(cellStyleToCss({ bold: true, color: "#123456", align: "right" })).toEqual({
      fontWeight: 700,
      color: "#123456",
      textAlign: "right",
    });
  });

  it("carries wrapping, indent, and per-side borders through", () => {
    const css = cellStyleToCss({
      wrap: true,
      indent: 2,
      borders: { bottom: "1px solid #999999", left: "2px dashed #000000" },
    });
    expect(css).toMatchObject({
      whiteSpace: "pre-wrap",
      paddingInlineStart: "22px",
      borderBottom: "1px solid #999999",
      borderLeft: "2px dashed #000000",
    });
  });

  it("puts vertical alignment on the flex cross axis, not the inline one", () => {
    expect(cellStyleToCss({ valign: "flex-end" })).toEqual({ alignItems: "flex-end" });
    expect(cellStyleToCss({ align: "center" }).justifyContent).toBeUndefined();
  });

  it("tops out wrapped text so a short row shows its first line", () => {
    expect(cellStyleToCss({ wrap: true }).alignItems).toBe("flex-start");
    // An explicit alignment from the file still wins.
    expect(cellStyleToCss({ wrap: true, valign: "center" }).alignItems).toBe("center");
  });

  it("accepts only the colour names an Excel format code can produce", () => {
    expect(numberFormatColor("red")).toBe("red");
    expect(numberFormatColor("Blue")).toBe("blue");
    expect(numberFormatColor("chartreuse")).toBeUndefined();
    expect(numberFormatColor(null)).toBeUndefined();
  });
});

describe("sheet windowing", () => {
  const offsets = trackOffsets([20, 40, 20, 20, 60], 20, 5);

  it("accumulates track sizes and falls back to the default", () => {
    expect(offsets).toEqual([0, 20, 60, 80, 100, 160]);
    expect(trackOffsets([], 25, 3)).toEqual([0, 25, 50, 75]);
    expect(trackOffsets([0, -5], 25, 2)).toEqual([0, 25, 50]);
  });

  it("returns the tracks a scrolled viewport covers", () => {
    // Offsets are [0, 20, 60, 80, 100, 160]; a viewport of 0-60 ends exactly where
    // track 2 begins, so the window is tracks 0 and 1 only.
    expect(visibleTrackRange({ offsets, scroll: 0, viewport: 60, overscan: 0 })).toEqual({ start: 0, end: 2 });
    expect(visibleTrackRange({ offsets, scroll: 60, viewport: 40, overscan: 0 })).toEqual({ start: 2, end: 4 });
    expect(visibleTrackRange({ offsets, scroll: 0, viewport: 60, overscan: 2 })).toEqual({ start: 0, end: 4 });
    expect(visibleTrackRange({ offsets, scroll: 0, viewport: 70, overscan: 0 })).toEqual({ start: 0, end: 3 });
    expect(visibleTrackRange({ offsets: [0], scroll: 0, viewport: 100 })).toEqual({ start: 0, end: 0 });
  });

  it("clamps a scroll past the end back onto the sheet", () => {
    expect(visibleTrackRange({ offsets, scroll: 9999, viewport: 40, overscan: 0 }).end).toBe(5);
  });

  it("widens the window so a merge anchored off-screen still paints", () => {
    const merges = [[1, 1, 4, 2]];
    expect(rangeWithMerges({ range: { start: 2, end: 4 }, merges, axis: "row" })).toEqual({ start: 0, end: 4 });
    expect(rangeWithMerges({ range: { start: 0, end: 1 }, merges, axis: "column" })).toEqual({ start: 0, end: 2 });
    expect(rangeWithMerges({ range: { start: 8, end: 9 }, merges, axis: "row" })).toEqual({ start: 8, end: 9 });
    expect(rangeWithMerges({ range: { start: 0, end: 2 }, merges: [], axis: "row" })).toEqual({ start: 0, end: 2 });
  });

  it("measures a span between two tracks", () => {
    expect(trackSpan(offsets, 1, 3)).toBe(60);
    expect(trackSpan(offsets, 0, 99)).toBe(160);
  });
});

describe("keeping the cursor in view", () => {
  const offsets = trackOffsets([50, 50, 50, 50, 50, 50], 50, 6);

  it("scrolls back for a track above the viewport and forward for one below", () => {
    expect(scrollToTrack({ offsets, index: 0, scroll: 200, viewport: 100 })).toBe(0);
    expect(scrollToTrack({ offsets, index: 5, scroll: 0, viewport: 100 })).toBe(200);
    expect(scrollToTrack({ offsets, index: 1, scroll: 50, viewport: 100 })).toBe(50);
    expect(scrollToTrack({ offsets, index: 99, scroll: 42, viewport: 100 })).toBe(42);
  });

  it("leaves room for the frozen band when scrolling back", () => {
    expect(scrollToTrack({ offsets, index: 2, scroll: 200, viewport: 100, frozenSize: 50 })).toBe(50);
  });
});

describe("grid cursor movement", () => {
  const bounds = { rowCount: 5, columnCount: 4 };

  it("moves with the arrow keys and stops at the edges", () => {
    expect(nextCursor({ key: "ArrowDown", cursor: { row: 1, column: 1 }, ...bounds })).toEqual({ row: 2, column: 1 });
    expect(nextCursor({ key: "ArrowUp", cursor: { row: 1, column: 1 }, ...bounds })).toEqual({ row: 1, column: 1 });
    expect(nextCursor({ key: "ArrowRight", cursor: { row: 1, column: 4 }, ...bounds })).toEqual({ row: 1, column: 4 });
  });

  it("commits downward on Enter and sideways on Tab, reversing with Shift", () => {
    expect(nextCursor({ key: "Enter", cursor: { row: 2, column: 2 }, ...bounds })).toEqual({ row: 3, column: 2 });
    expect(nextCursor({ key: "Enter", shiftKey: true, cursor: { row: 2, column: 2 }, ...bounds })).toEqual({ row: 1, column: 2 });
    expect(nextCursor({ key: "Tab", cursor: { row: 2, column: 2 }, ...bounds })).toEqual({ row: 2, column: 3 });
    expect(nextCursor({ key: "Tab", shiftKey: true, cursor: { row: 2, column: 2 }, ...bounds })).toEqual({ row: 2, column: 1 });
  });

  it("jumps to the row edges and ignores keys it does not own", () => {
    expect(nextCursor({ key: "Home", cursor: { row: 3, column: 3 }, ...bounds })).toEqual({ row: 3, column: 1 });
    expect(nextCursor({ key: "End", cursor: { row: 3, column: 1 }, ...bounds })).toEqual({ row: 3, column: 4 });
    expect(nextCursor({ key: "a", cursor: { row: 3, column: 1 }, ...bounds })).toBeNull();
  });

  it("clamps onto a sheet with no cells at all", () => {
    expect(clampCursor({ row: 4, column: 4, rowCount: 0, columnCount: 0 })).toEqual({ row: 1, column: 1 });
  });
});

describe("slide markup safety", () => {
  it("strips scripts, event handlers, and javascript URLs from parsed slide text", () => {
    const hostile = '<p onclick="steal()" style="color: red; background: url(http://x)">'
      + '<script>fetch("http://evil")</script>'
      + '<a href="javascript:alert(1)">click</a>'
      + '<img src="x" onerror="alert(1)">'
      + "safe text</p>";
    const clean = sanitizeSlideHtml(hostile);

    expect(clean).not.toContain("script");
    expect(clean).not.toContain("onclick");
    expect(clean).not.toContain("onerror");
    expect(clean).not.toContain("javascript:");
    expect(clean).not.toContain("url(");
    expect(clean).toContain("safe text");
    expect(clean).toContain("color: red");
  });

  it("keeps the run formatting PowerPoint applied", () => {
    const clean = sanitizeSlideHtml('<p style="text-align: center;"><span style="font-size: 18pt;font-family: Calibri;"><b>TEST</b></span></p>');
    expect(clean).toContain("text-align: center");
    expect(clean).toContain("font-size: 18pt");
    expect(clean).toContain("<b>TEST</b>");
  });

  it("marks external links safe to open and drops the ones that are not links", () => {
    expect(sanitizeSlideHtml('<a href="https://fylune.com">site</a>'))
      .toContain('rel="noreferrer noopener"');
    expect(sanitizeSlideHtml('<a href="file:///etc/passwd">x</a>')).not.toContain("href");
    expect(sanitizeSlideHtml("")).toBe("");
    expect(sanitizeSlideHtml(null)).toBe("");
  });
});

describe("slide element styling", () => {
  it("turns every fill shape into a background", () => {
    expect(fillToCss({ type: "color", value: "#ff0000" })).toBe("#ff0000");
    expect(fillToCss({ type: "image", value: { base64: "data:image/png;base64,AA" } }))
      .toBe('center / cover no-repeat url("data:image/png;base64,AA")');
    expect(fillToCss({ type: "gradient", value: { rot: 45, colors: [{ pos: "0%", color: "#000" }, { pos: "100%", color: "#fff" }] } }))
      .toBe("linear-gradient(45deg, #000 0%, #fff 100%)");
    expect(fillToCss({ type: "gradient", value: { path: "circle", colors: [{ pos: "0%", color: "#000" }] } }))
      .toBe("radial-gradient(#000 0%)");
    expect(fillToCss({ type: "pattern", value: { backgroundColor: "#eee" } })).toBe("#eee");
    expect(fillToCss(null)).toBeNull();
  });

  it("composes rotation with mirroring", () => {
    expect(elementTransform({ rotate: 0, isFlipH: false, isFlipV: false })).toBeUndefined();
    expect(elementTransform({ rotate: 45 })).toBe("rotate(45deg)");
    expect(elementTransform({ rotate: 90, isFlipH: true, isFlipV: true })).toBe("rotate(90deg) scaleX(-1) scaleY(-1)");
  });

  it("only draws a border the slide actually declared", () => {
    expect(borderToCss({ borderWidth: 2, borderColor: "#333", borderType: "dashed" })).toBe("2px dashed #333");
    expect(borderToCss({ borderWidth: 1, borderColor: "#333", borderType: "wavy" })).toBe("1px solid #333");
    expect(borderToCss({ borderWidth: 0, borderColor: "#333" })).toBeUndefined();
  });
});

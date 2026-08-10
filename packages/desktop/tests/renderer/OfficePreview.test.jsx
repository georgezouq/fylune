/* eslint-disable no-unused-vars -- JSX references are not marked as usage by the base config */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AssetPreview } from "../../src/AssetPreview.jsx";

function workbookFixture() {
  return {
    path: "reports/plan.xlsx",
    hash: "a".repeat(64),
    mtimeMs: 1,
    size: 4096,
    styles: [
      { bold: true, background: "#ddebf7", align: "left" },
      { align: "right" },
    ],
    sheets: [
      {
        id: 1,
        name: "Revenue",
        hidden: false,
        rowCount: 4,
        columnCount: 3,
        columnWidths: [160, 90, 90],
        rowHeights: [22, 22, 22, 22],
        defaultColumnWidth: 64,
        defaultRowHeight: 20,
        frozen: { rows: 2, columns: 1 },
        merges: [[1, 1, 1, 3]],
        cells: {
          "1,1": { text: "Q4 plan", input: "Q4 plan", kind: "string", style: 0 },
          "2,1": { text: "Region", input: "Region", kind: "string" },
          "2,2": { text: "Amount", input: "Amount", kind: "string" },
          "3,1": { text: "EMEA", input: "EMEA", kind: "string" },
          "3,2": { text: "1,234,567.89", input: "1234567.891", kind: "number", style: 1, numFmt: "#,##0.00" },
          "4,2": { text: "0.44", input: "=B3/2", kind: "formula", formula: "B3/2" },
        },
        truncated: false,
      },
      { id: 2, name: "Notes", hidden: false, rowCount: 0, columnCount: 0, columnWidths: [], rowHeights: [], merges: [], cells: {}, truncated: false },
    ],
  };
}

const excelItem = { id: "plan", title: "plan.xlsx", path: "reports/plan.xlsx", type: "excel", size: 4096 };

function renderWorkbook(overrides = {}) {
  const readWorkbook = overrides.readWorkbook ?? vi.fn().mockResolvedValue(workbookFixture());
  const saveWorkbook = overrides.saveWorkbook ?? vi.fn().mockResolvedValue({ hash: "b".repeat(64) });
  render(
    <AssetPreview
      item={excelItem}
      src={null}
      loadData={vi.fn()}
      onBack={vi.fn()}
      onReveal={vi.fn()}
      onOpenExternally={vi.fn()}
      readWorkbook={readWorkbook}
      saveWorkbook={saveWorkbook}
    />,
  );
  return { readWorkbook, saveWorkbook };
}

describe("workbook preview", () => {
  it("lays the sheet out with its merges, frozen band, and formatted values", async () => {
    renderWorkbook();
    await screen.findByTestId("sheet-preview");

    const title = await screen.findByLabelText("A1, Q4 plan");
    // The merge master spans all three columns; the cells it covers are never mounted.
    expect(title).toHaveStyle({ width: "340px" });
    expect(screen.queryByLabelText(/^B1,/)).not.toBeInTheDocument();

    expect(screen.getByLabelText("B3, 1,234,567.89")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "B" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "3" })).toBeInTheDocument();

    const grid = screen.getByRole("grid", { name: "Sheet Revenue" });
    expect(grid).toHaveAttribute("aria-readonly", "false");
    expect(grid).toHaveAttribute("aria-rowcount", "24");
  });

  it("shows the underlying formula rather than its result in the formula bar", async () => {
    const user = userEvent.setup();
    renderWorkbook();
    await screen.findByTestId("sheet-preview");

    await user.click(screen.getByLabelText("B4, 0.44"));
    expect(screen.getByLabelText("Selected cell")).toHaveTextContent("B4");
    expect(screen.getByLabelText("Cell contents")).toHaveValue("=B3/2");
  });

  it("switches sheets from the tab bar", async () => {
    const user = userEvent.setup();
    renderWorkbook();
    await screen.findByTestId("sheet-preview");

    await user.click(screen.getByRole("tab", { name: "Notes" }));
    expect(screen.getByRole("grid", { name: "Sheet Notes" })).toBeInTheDocument();
    expect(screen.queryByLabelText("B3, 1,234,567.89")).not.toBeInTheDocument();
  });

  it("edits a cell and writes only that cell back to the file", async () => {
    const user = userEvent.setup();
    const { saveWorkbook } = renderWorkbook();
    await screen.findByTestId("sheet-preview");

    await user.click(screen.getByLabelText("A3, EMEA"));
    await user.keyboard("Nordics{Enter}");

    await screen.findByText("Unsaved changes");
    expect(screen.getByLabelText("A3, Nordics")).toHaveClass("is-edited");

    await user.click(screen.getByRole("button", { name: "Save to file" }));
    await waitFor(() => expect(saveWorkbook).toHaveBeenCalledOnce());
    expect(saveWorkbook.mock.calls[0][1]).toEqual({
      edits: [{ sheet: "Revenue", row: 3, column: 1, input: "Nordics" }],
      expectedHash: "a".repeat(64),
    });
  });

  it("discards pending edits without touching the file", async () => {
    const user = userEvent.setup();
    const { saveWorkbook } = renderWorkbook();
    await screen.findByTestId("sheet-preview");

    await user.click(screen.getByLabelText("A3, EMEA"));
    await user.keyboard("Nordics{Enter}");
    await screen.findByText("Unsaved changes");

    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(await screen.findByLabelText("A3, EMEA")).toBeInTheDocument();
    expect(saveWorkbook).not.toHaveBeenCalled();
  });

  it("names the conflict and offers a reload when the file changed underneath", async () => {
    const user = userEvent.setup();
    const saveWorkbook = vi.fn().mockRejectedValue(Object.assign(new Error("changed"), { code: "CONTENT_CONFLICT" }));
    const { readWorkbook } = renderWorkbook({ saveWorkbook });
    await screen.findByTestId("sheet-preview");

    await user.click(screen.getByLabelText("A3, EMEA"));
    await user.keyboard("Nordics{Enter}");
    await user.click(screen.getByRole("button", { name: "Save to file" }));

    await screen.findByText("Changed on disk");
    expect(screen.getByRole("alert")).toHaveTextContent(/changed outside Fylune/i);

    await user.click(screen.getByRole("button", { name: "Reload from disk" }));
    await waitFor(() => expect(readWorkbook).toHaveBeenCalledTimes(2));
  });

  it("says plainly what a rewrite can cost before the first save", async () => {
    renderWorkbook();
    await screen.findByTestId("sheet-preview");
    expect(screen.getByRole("note")).toHaveTextContent(/charts and pivot tables/i);
  });

  it("adds rows and columns to the saved workbook", async () => {
    const user = userEvent.setup();
    const { saveWorkbook } = renderWorkbook();
    await screen.findByTestId("sheet-preview");

    await user.click(screen.getByRole("button", { name: "Add row" }));
    await user.click(screen.getByRole("button", { name: "Add column" }));
    await user.click(screen.getByRole("button", { name: "Save to file" }));

    await waitFor(() => expect(saveWorkbook).toHaveBeenCalledOnce());
    expect(saveWorkbook.mock.calls[0][1]).toEqual({
      edits: [
        { type: "insertRow", sheet: "Revenue", index: 2 },
        { type: "insertColumn", sheet: "Revenue", index: 2 },
      ],
      expectedHash: "a".repeat(64),
    });
  });

  it("does not reload the workbook when the parent re-renders around it", async () => {
    const readWorkbook = vi.fn().mockResolvedValue(workbookFixture());
    // The parent passes these as inline arrows, so every render hands over new function
    // identities. A reload here would throw away whatever the user had typed.
    const props = () => ({
      item: excelItem,
      src: null,
      loadData: () => null,
      onBack: () => {},
      onReveal: () => {},
      onOpenExternally: async () => {},
      readWorkbook: (asset) => readWorkbook(asset),
      saveWorkbook: async () => ({}),
    });
    const { rerender } = render(<AssetPreview {...props()} />);
    await screen.findByTestId("sheet-preview");
    expect(readWorkbook).toHaveBeenCalledTimes(1);

    rerender(<AssetPreview {...props()} />);
    rerender(<AssetPreview {...props()} />);
    await screen.findByTestId("sheet-preview");
    expect(readWorkbook).toHaveBeenCalledTimes(1);
  });

  it("falls back to the shared failure state when the workbook cannot be parsed", async () => {
    const readWorkbook = vi.fn().mockRejectedValue(Object.assign(new Error("bad zip"), { code: "UNREADABLE_WORKBOOK" }));
    renderWorkbook({ readWorkbook });
    expect(await screen.findByRole("alert")).toHaveTextContent("plan.xlsx could not be previewed");
  });
});

describe("legacy Office documents", () => {
  const legacyItem = { id: "old", title: "plan.doc", path: "reports/plan.doc", type: "word", size: 2048 };

  it("names the format and offers the two actions that work", async () => {
    const user = userEvent.setup();
    const onOpenExternally = vi.fn().mockResolvedValue({ opened: true });
    const onReveal = vi.fn();
    render(
      <AssetPreview
        item={legacyItem}
        src={null}
        loadData={vi.fn()}
        onBack={vi.fn()}
        onReveal={onReveal}
        onOpenExternally={onOpenExternally}
      />,
    );

    const state = screen.getByTestId("legacy-office-preview");
    expect(within(state).getByRole("heading")).toHaveTextContent("DOC files open in their original app");
    expect(state).toHaveTextContent(".docx");
    expect(screen.queryByTestId("sheet-preview")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Open in default app/ }));
    expect(onOpenExternally).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: /Show in folder/ }));
    expect(onReveal).toHaveBeenCalledOnce();
  });

  it("reports a failure to hand the file off rather than failing silently", async () => {
    const user = userEvent.setup();
    render(
      <AssetPreview
        item={legacyItem}
        src={null}
        loadData={vi.fn()}
        onBack={vi.fn()}
        onReveal={vi.fn()}
        onOpenExternally={vi.fn().mockRejectedValue(new Error("no handler"))}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Open in default app/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No app on this device could open the file.");
  });

  it("never asks the main process for bytes it cannot parse", () => {
    const loadData = vi.fn();
    render(
      <AssetPreview
        item={legacyItem}
        src={null}
        loadData={loadData}
        onBack={vi.fn()}
        onReveal={vi.fn()}
        onOpenExternally={vi.fn()}
      />,
    );
    expect(loadData).not.toHaveBeenCalled();
  });
});

describe("presentation preview", () => {
  const deckItem = { id: "deck", title: "launch.pptx", path: "decks/launch.pptx", type: "powerpoint", size: 9000 };

  beforeEach(() => {
    vi.doMock("pptxtojson", () => ({
      parse: vi.fn().mockResolvedValue({
        size: { width: 960, height: 540 },
        themeColors: [],
        usedFonts: [],
        slides: [
          {
            fill: { type: "color", value: "#ffffff" },
            layoutElements: [],
            note: "Open with the customer quote.",
            elements: [{
              type: "text",
              left: 60, top: 80, width: 500, height: 90,
              content: '<p style="text-align: left;"><span style="font-size: 32pt;">Launch plan</span></p>',
              vAlign: "mid", rotate: 0, isFlipH: false, isFlipV: false,
              fill: { type: "color", value: "#ffffff" }, name: "Title", order: 1,
              borderColor: "", borderWidth: 0, borderType: "solid", borderStrokeDasharray: "",
              isVertical: false,
            }],
          },
          { fill: { type: "color", value: "#101010" }, layoutElements: [], note: "", elements: [] },
        ],
      }),
    }));
  });

  it("renders the deck, walks slides from the toolbar, and shows speaker notes", async () => {
    const user = userEvent.setup();
    render(
      <AssetPreview
        item={deckItem}
        src={null}
        loadData={vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]))}
        onBack={vi.fn()}
        onReveal={vi.fn()}
        onOpenExternally={vi.fn()}
      />,
    );

    const stage = (await screen.findByTestId("slide-preview")).querySelector(".slide-stage");
    Object.defineProperties(stage, {
      clientWidth: { configurable: true, value: 900 },
      clientHeight: { configurable: true, value: 560 },
    });
    fireEvent(window, new Event("resize"));

    // The rail renders the same slide, so the assertion has to name the main stage.
    expect(await within(stage).findByText("Launch plan")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Slide 1 of launch.pptx" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Speaker notes" }));
    expect(screen.getByText("Open with the customer quote.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next slide" }));
    expect(screen.getByRole("img", { name: "Slide 2 of launch.pptx" })).toBeInTheDocument();
    expect(screen.getByText("This slide has no speaker notes.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Go to slide 1" }));
    expect(screen.getByRole("img", { name: "Slide 1 of launch.pptx" })).toBeInTheDocument();
  });
});

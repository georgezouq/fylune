/* eslint-disable no-unused-vars -- JSX references are not marked as usage by the base config */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Columns, Plus, Rows, SpinnerGap, WarningCircle } from "@phosphor-icons/react";

import { cellAddress, cellStyleToCss, columnLabel, indexMerges, numberFormatColor } from "./officeFormats.js";
import { nextCursor, rangeWithMerges, scrollToTrack, trackOffsets, visibleTrackRange } from "./sheetGeometry.js";

const HEADER_ROW_HEIGHT = 24;
const HEADER_COLUMN_WIDTH = 54;
const MINIMUM_COLUMNS = 12;
const MINIMUM_ROWS = 24;

function editKey(row, column) {
  return `${row},${column}`;
}

/**
 * One painted cell. Merge masters carry the full span; cells a merge covers are never
 * rendered, so the block reads as a single surface exactly as it does in Excel.
 */
function SheetCell({
  row,
  column,
  cell,
  style,
  span,
  left,
  top,
  width,
  height,
  isCursor,
  isEdited,
  onSelect,
  onOpenEditor,
  ariaLabel,
}) {
  const css = {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
    ...cellStyleToCss(style),
  };
  const numberColor = numberFormatColor(cell?.numberColor);
  if (numberColor) css.color = numberColor;

  return (
    <div
      role="gridcell"
      tabIndex={-1}
      aria-colindex={column}
      aria-selected={isCursor || undefined}
      aria-label={ariaLabel}
      data-address={cellAddress(row, column)}
      className={`sheet-cell${isCursor ? " is-cursor" : ""}${isEdited ? " is-edited" : ""}${span ? " is-merged" : ""}`}
      style={css}
      onMouseDown={(event) => {
        event.preventDefault();
        onSelect(row, column);
      }}
      onDoubleClick={() => onOpenEditor(row, column)}
    >
      <span className="sheet-cell-text">{cell?.text ?? ""}</span>
    </div>
  );
}

function SheetCells({
  sheet,
  styles,
  merges,
  rowRange,
  columnRange,
  rowOffsets,
  columnOffsets,
  originLeft,
  originTop,
  cursor,
  edits,
  onSelect,
  onOpenEditor,
  t,
}) {
  const painted = [];
  for (let rowIndex = rowRange.start; rowIndex < rowRange.end; rowIndex += 1) {
    const row = rowIndex + 1;
    for (let columnIndex = columnRange.start; columnIndex < columnRange.end; columnIndex += 1) {
      const column = columnIndex + 1;
      const key = editKey(row, column);
      if (merges.covered.has(key)) continue;
      const master = merges.masters.get(key);
      const cell = sheet.cells[key];
      const pending = edits.get(key);
      const isEdited = pending !== undefined;
      if (!cell && !master && !isEdited && cursor.row !== row && cursor.column !== column) {
        painted.push(
          <div
            key={key}
            role="gridcell"
            aria-colindex={column}
            className="sheet-cell is-blank"
            data-address={cellAddress(row, column)}
            style={{
              left: `${columnOffsets[columnIndex] - originLeft}px`,
              top: `${rowOffsets[rowIndex] - originTop}px`,
              width: `${columnOffsets[columnIndex + 1] - columnOffsets[columnIndex]}px`,
              height: `${rowOffsets[rowIndex + 1] - rowOffsets[rowIndex]}px`,
            }}
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(row, column);
            }}
            onDoubleClick={() => onOpenEditor(row, column)}
          />,
        );
        continue;
      }
      const lastRow = master ? Math.min(master.bottom, rowOffsets.length - 1) : row;
      const lastColumn = master ? Math.min(master.right, columnOffsets.length - 1) : column;
      const displayed = isEdited ? { ...cell, text: pending } : cell;
      painted.push(
        <SheetCell
          key={key}
          row={row}
          column={column}
          cell={displayed}
          style={styles[cell?.style]}
          span={Boolean(master)}
          left={columnOffsets[columnIndex] - originLeft}
          top={rowOffsets[rowIndex] - originTop}
          width={columnOffsets[lastColumn] - columnOffsets[columnIndex]}
          height={rowOffsets[lastRow] - rowOffsets[rowIndex]}
          isCursor={cursor.row === row && cursor.column === column}
          isEdited={isEdited}
          onSelect={onSelect}
          onOpenEditor={onOpenEditor}
          ariaLabel={t("sheet.cellLabel", {
            address: cellAddress(row, column),
            value: displayed?.text || t("sheet.emptyCell"),
          })}
        />,
      );
    }
  }
  return painted;
}

/**
 * Workbook preview and cell editing.
 *
 * The workbook is parsed in the main process and arrives as a flat model, so this
 * surface only has to lay it out: four panes so frozen rows and columns stay put, a
 * windowed body so a five-thousand-row sheet still scrolls at speed, and an editor
 * that writes single cells back without disturbing anything around them.
 */
export function SheetPreview({
  workbook,
  activeSheet,
  edits,
  onEditCell,
  onInsertRow,
  onInsertColumn,
  status,
}) {
  const { t } = useTranslation();
  const viewportRef = useRef(null);
  const columnHeaderRef = useRef(null);
  const rowHeaderRef = useRef(null);
  const editorRef = useRef(null);
  const [scroll, setScroll] = useState({ left: 0, top: 0 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [cursor, setCursor] = useState({ row: 1, column: 1 });
  const [editorValue, setEditorValue] = useState(null);

  const sheet = workbook?.sheets?.[activeSheet] ?? null;
  const styles = workbook?.styles ?? [];

  const rowCount = Math.max(sheet?.rowCount ?? 0, MINIMUM_ROWS);
  const columnCount = Math.max(sheet?.columnCount ?? 0, MINIMUM_COLUMNS);

  const merges = useMemo(() => indexMerges(sheet?.merges), [sheet]);
  const rowOffsets = useMemo(
    () => trackOffsets(sheet?.rowHeights, sheet?.defaultRowHeight || 20, rowCount),
    [rowCount, sheet],
  );
  const columnOffsets = useMemo(
    () => trackOffsets(sheet?.columnWidths, sheet?.defaultColumnWidth || 64, columnCount),
    [columnCount, sheet],
  );

  const frozenRows = Math.min(sheet?.frozen?.rows ?? 0, rowCount);
  const frozenColumns = Math.min(sheet?.frozen?.columns ?? 0, columnCount);
  const frozenHeight = rowOffsets[frozenRows] ?? 0;
  const frozenWidth = columnOffsets[frozenColumns] ?? 0;
  const bodyWidth = (columnOffsets.at(-1) ?? 0) - frozenWidth;
  const bodyHeight = (rowOffsets.at(-1) ?? 0) - frozenHeight;

  useEffect(() => {
    setCursor({ row: 1, column: 1 });
    setEditorValue(null);
    setScroll({ left: 0, top: 0 });
    if (viewportRef.current) {
      viewportRef.current.scrollLeft = 0;
      viewportRef.current.scrollTop = 0;
    }
  }, [activeSheet, workbook]);

  // Keyed on status: the grid does not exist during the loading state, so a measurement
  // set up once on mount would observe nothing and leave the window stuck at zero.
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return undefined;
    const measure = () => setViewport((current) => (
      current.width === element.clientWidth && current.height === element.clientHeight
        ? current
        : { width: element.clientWidth, height: element.clientHeight }
    ));
    measure();
    const observer = typeof window.ResizeObserver === "function" ? new window.ResizeObserver(measure) : null;
    observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [status]);

  // Headers ride along with the body inside the same frame as the scroll event, which
  // is what keeps the column letters glued to their columns during a fast drag.
  const syncHeaders = useCallback((left, top) => {
    if (columnHeaderRef.current) columnHeaderRef.current.scrollLeft = left;
    if (rowHeaderRef.current) rowHeaderRef.current.scrollTop = top;
  }, []);

  const rowRange = useMemo(() => rangeWithMerges({
    range: visibleTrackRange({
      offsets: rowOffsets,
      scroll: scroll.top + frozenHeight,
      viewport: Math.max(0, viewport.height - frozenHeight),
    }),
    merges: sheet?.merges,
    axis: "row",
  }), [frozenHeight, rowOffsets, scroll.top, sheet, viewport.height]);

  const columnRange = useMemo(() => rangeWithMerges({
    range: visibleTrackRange({
      offsets: columnOffsets,
      scroll: scroll.left + frozenWidth,
      viewport: Math.max(0, viewport.width - frozenWidth),
    }),
    merges: sheet?.merges,
    axis: "column",
  }), [columnOffsets, frozenWidth, scroll.left, sheet, viewport.width]);

  const bodyRowRange = { start: Math.max(rowRange.start, frozenRows), end: rowRange.end };
  const bodyColumnRange = { start: Math.max(columnRange.start, frozenColumns), end: columnRange.end };

  const commitEditor = useCallback((value, moveTo) => {
    if (value != null) onEditCell?.(cursor.row, cursor.column, value);
    setEditorValue(null);
    if (moveTo) setCursor(moveTo);
    viewportRef.current?.focus();
  }, [cursor.column, cursor.row, onEditCell]);

  const openEditor = useCallback((row, column) => {
    setCursor({ row, column });
    const key = editKey(row, column);
    const pending = edits.get(key);
    setEditorValue(pending ?? sheet?.cells?.[key]?.input ?? "");
  }, [edits, sheet]);

  const revealCursor = useCallback((target) => {
    const element = viewportRef.current;
    if (!element) return;
    const left = scrollToTrack({
      offsets: columnOffsets,
      index: target.column - 1,
      scroll: element.scrollLeft + frozenWidth,
      viewport: Math.max(0, element.clientWidth - frozenWidth),
      frozenSize: frozenWidth,
    });
    const top = scrollToTrack({
      offsets: rowOffsets,
      index: target.row - 1,
      scroll: element.scrollTop + frozenHeight,
      viewport: Math.max(0, element.clientHeight - frozenHeight),
      frozenSize: frozenHeight,
    });
    element.scrollLeft = Math.max(0, left - frozenWidth);
    element.scrollTop = Math.max(0, top - frozenHeight);
  }, [columnOffsets, frozenHeight, frozenWidth, rowOffsets]);

  useLayoutEffect(() => {
    if (editorValue != null) editorRef.current?.focus();
  }, [editorValue]);

  function handleGridKeyDown(event) {
    if (editorValue != null) return;
    if (event.key === "Escape") return;
    if (event.key === "F2" || (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey)) {
      event.preventDefault();
      const key = editKey(cursor.row, cursor.column);
      setEditorValue(event.key === "F2" ? (edits.get(key) ?? sheet?.cells?.[key]?.input ?? "") : event.key);
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onEditCell?.(cursor.row, cursor.column, "");
      return;
    }
    const moved = nextCursor({
      key: event.key,
      shiftKey: event.shiftKey,
      cursor,
      rowCount,
      columnCount,
    });
    if (!moved) return;
    event.preventDefault();
    setCursor(moved);
    revealCursor(moved);
  }

  function handleEditorKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      setEditorValue(null);
      viewportRef.current?.focus();
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      const moved = nextCursor({
        key: event.key,
        shiftKey: event.shiftKey,
        cursor,
        rowCount,
        columnCount,
      });
      commitEditor(event.currentTarget.value, moved);
      if (moved) revealCursor(moved);
    }
  }

  if (status === "loading") {
    return (
      <div className="sheet-preview-state" role="status">
        <SpinnerGap className="spin" />
        <p>{t("sheet.opening")}</p>
      </div>
    );
  }

  if (!sheet) {
    return (
      <div className="sheet-preview-state" role="status">
        <WarningCircle />
        <p>{t("sheet.noSheets")}</p>
      </div>
    );
  }

  const cursorKey = editKey(cursor.row, cursor.column);
  const cursorCell = sheet.cells[cursorKey];
  const cursorInput = edits.get(cursorKey) ?? cursorCell?.input ?? "";

  const cellProps = {
    sheet,
    styles,
    merges,
    rowOffsets,
    columnOffsets,
    cursor,
    edits,
    onSelect: (row, column) => {
      setCursor({ row, column });
      // Cell mousedown is prevented so the click never starts a text selection, which
      // also means focus has to be moved deliberately — otherwise typing goes nowhere.
      viewportRef.current?.focus({ preventScroll: true });
    },
    onOpenEditor: openEditor,
    t,
  };

  return (
    <div className="sheet-preview" data-testid="sheet-preview">
      <div className="sheet-formula-bar">
        <span className="sheet-address" aria-label={t("sheet.activeCell")}>{cellAddress(cursor.row, cursor.column)}</span>
        <span className="sheet-formula-mark" aria-hidden="true">fx</span>
        <input
          className="sheet-formula-input"
          value={editorValue ?? cursorInput}
          aria-label={t("sheet.formulaBar")}
          onChange={(event) => setEditorValue(event.target.value)}
          onFocus={() => setEditorValue((current) => current ?? cursorInput)}
          onBlur={(event) => { if (editorValue != null) commitEditor(event.target.value, null); }}
          onKeyDown={handleEditorKeyDown}
        />
        <div className="sheet-structure-actions" role="group" aria-label={t("sheet.structureActions")}>
          <button type="button" onClick={() => onInsertRow?.(cursor.row + 1)}><Plus /><Rows /> {t("sheet.addRow")}</button>
          <button type="button" onClick={() => onInsertColumn?.(cursor.column + 1)}><Plus /><Columns /> {t("sheet.addColumn")}</button>
        </div>
      </div>

      <div className="sheet-frame" style={{ "--sheet-header-width": `${HEADER_COLUMN_WIDTH}px`, "--sheet-header-height": `${HEADER_ROW_HEIGHT}px` }}>
        <div className="sheet-corner" style={{ height: `${HEADER_ROW_HEIGHT + frozenHeight}px`, width: `${HEADER_COLUMN_WIDTH + frozenWidth}px` }}>
          {frozenRows || frozenColumns ? (
            <div className="sheet-pane sheet-pane-corner" style={{ insetInlineStart: `${HEADER_COLUMN_WIDTH}px`, top: `${HEADER_ROW_HEIGHT}px`, width: `${frozenWidth}px`, height: `${frozenHeight}px` }}>
              <SheetCells
                {...cellProps}
                rowRange={{ start: 0, end: frozenRows }}
                columnRange={{ start: 0, end: frozenColumns }}
                originLeft={0}
                originTop={0}
              />
            </div>
          ) : null}
        </div>

        <div ref={columnHeaderRef} className="sheet-column-headers" style={{ height: `${HEADER_ROW_HEIGHT + frozenHeight}px` }}>
          <div className="sheet-column-headers-track" style={{ width: `${bodyWidth}px`, height: `${HEADER_ROW_HEIGHT + frozenHeight}px` }}>
            {Array.from({ length: Math.max(0, bodyColumnRange.end - bodyColumnRange.start) }, (_, offset) => {
              const columnIndex = bodyColumnRange.start + offset;
              return (
                <div
                  key={columnIndex}
                  role="columnheader"
                  className={`sheet-header-cell${cursor.column === columnIndex + 1 ? " is-active" : ""}`}
                  style={{
                    left: `${columnOffsets[columnIndex] - frozenWidth}px`,
                    width: `${columnOffsets[columnIndex + 1] - columnOffsets[columnIndex]}px`,
                    height: `${HEADER_ROW_HEIGHT}px`,
                  }}
                >
                  {columnLabel(columnIndex + 1)}
                </div>
              );
            })}
            {frozenRows ? (
              <div className="sheet-pane sheet-pane-top" style={{ top: `${HEADER_ROW_HEIGHT}px`, height: `${frozenHeight}px`, width: `${bodyWidth}px` }}>
                <SheetCells
                  {...cellProps}
                  rowRange={{ start: 0, end: frozenRows }}
                  columnRange={bodyColumnRange}
                  originLeft={frozenWidth}
                  originTop={0}
                />
              </div>
            ) : null}
          </div>
        </div>

        <div ref={rowHeaderRef} className="sheet-row-headers" style={{ width: `${HEADER_COLUMN_WIDTH + frozenWidth}px` }}>
          <div className="sheet-row-headers-track" style={{ height: `${bodyHeight}px`, width: `${HEADER_COLUMN_WIDTH + frozenWidth}px` }}>
            {Array.from({ length: Math.max(0, bodyRowRange.end - bodyRowRange.start) }, (_, offset) => {
              const rowIndex = bodyRowRange.start + offset;
              return (
                <div
                  key={rowIndex}
                  role="rowheader"
                  className={`sheet-header-cell sheet-row-header${cursor.row === rowIndex + 1 ? " is-active" : ""}`}
                  style={{
                    top: `${rowOffsets[rowIndex] - frozenHeight}px`,
                    height: `${rowOffsets[rowIndex + 1] - rowOffsets[rowIndex]}px`,
                    width: `${HEADER_COLUMN_WIDTH}px`,
                  }}
                >
                  {rowIndex + 1}
                </div>
              );
            })}
            {frozenColumns ? (
              <div className="sheet-pane sheet-pane-left" style={{ insetInlineStart: `${HEADER_COLUMN_WIDTH}px`, width: `${frozenWidth}px`, height: `${bodyHeight}px` }}>
                <SheetCells
                  {...cellProps}
                  rowRange={bodyRowRange}
                  columnRange={{ start: 0, end: frozenColumns }}
                  originLeft={0}
                  originTop={frozenHeight}
                />
              </div>
            ) : null}
          </div>
        </div>

        <div
          ref={viewportRef}
          className="sheet-viewport"
          role="grid"
          tabIndex={0}
          aria-rowcount={rowCount}
          aria-colcount={columnCount}
          aria-readonly="false"
          aria-label={t("sheet.gridLabel", { name: sheet.name })}
          onKeyDown={handleGridKeyDown}
          onScroll={(event) => {
            const { scrollLeft, scrollTop } = event.currentTarget;
            syncHeaders(scrollLeft, scrollTop);
            setScroll({ left: scrollLeft, top: scrollTop });
          }}
        >
          <div className="sheet-body" style={{ width: `${bodyWidth}px`, height: `${bodyHeight}px` }}>
            <SheetCells
              {...cellProps}
              rowRange={bodyRowRange}
              columnRange={bodyColumnRange}
              originLeft={frozenWidth}
              originTop={frozenHeight}
            />
            {editorValue != null ? (
              <input
                ref={editorRef}
                className="sheet-cell-editor"
                value={editorValue}
                aria-label={t("sheet.editCell", { address: cellAddress(cursor.row, cursor.column) })}
                style={{
                  left: `${columnOffsets[cursor.column - 1] - frozenWidth}px`,
                  top: `${rowOffsets[cursor.row - 1] - frozenHeight}px`,
                  minWidth: `${columnOffsets[cursor.column] - columnOffsets[cursor.column - 1]}px`,
                  height: `${rowOffsets[cursor.row] - rowOffsets[cursor.row - 1]}px`,
                }}
                onChange={(event) => setEditorValue(event.target.value)}
                onBlur={(event) => commitEditor(event.target.value, null)}
                onKeyDown={handleEditorKeyDown}
              />
            ) : null}
          </div>
        </div>
      </div>

      {sheet.truncated ? (
        <p className="sheet-truncated-note" role="status">{t("sheet.truncated")}</p>
      ) : null}
    </div>
  );
}

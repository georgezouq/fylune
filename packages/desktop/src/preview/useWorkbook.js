import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Workbook session state for the Excel preview.
 *
 * Edits live here as pending cell inputs rather than being written through on every
 * keystroke: the file on disk stays untouched until the user saves, and the hash the
 * workbook was read at travels with the save so a change made outside Fylune becomes
 * a reviewable conflict instead of a silent overwrite.
 */
export function useWorkbook({ item, enabled, readWorkbook, saveWorkbook }) {
  const [status, setStatus] = useState("idle");
  const [workbook, setWorkbook] = useState(null);
  const [activeSheet, setActiveSheet] = useState(0);
  const [edits, setEdits] = useState(() => new Map());
  const [operations, setOperations] = useState([]);
  const [saveState, setSaveState] = useState("idle");
  const [failure, setFailure] = useState(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    if (!enabled) return;
    const request = requestRef.current + 1;
    requestRef.current = request;
    setStatus("loading");
    setFailure(null);
    try {
      const next = await readWorkbook();
      if (requestRef.current !== request) return;
      setWorkbook(next);
      setActiveSheet(0);
      setEdits(new Map());
      setOperations([]);
      setSaveState("idle");
      setStatus(next?.sheets?.length ? "ready" : "empty");
    } catch (error) {
      if (requestRef.current !== request) return;
      setStatus("error");
      setFailure({ code: error?.code || "UNREADABLE_WORKBOOK", message: error?.message || null });
    }
  }, [enabled, readWorkbook]);

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      setWorkbook(null);
      setEdits(new Map());
      setOperations([]);
      return;
    }
    void load();
  }, [enabled, item.id, load]);

  const editCell = useCallback((row, column, input) => {
    const sheet = workbook?.sheets?.[activeSheet];
    if (!sheet) return;
    setEdits((current) => {
      const next = new Map(current);
      // A sheet name can hold almost any character, so the key is encoded rather
      // than joined with a separator a name could legitimately contain.
      const key = JSON.stringify([sheet.name, row, column]);
      const original = sheet.cells[`${row},${column}`]?.input ?? "";
      // Typing a value back to what it already was is not a change worth saving.
      if (input === original) next.delete(key);
      else next.set(key, { sheet: sheet.name, row, column, input });
      return next;
    });
    setSaveState("idle");
  }, [activeSheet, workbook]);

  const sheetEdits = useMemo(() => {
    const sheet = workbook?.sheets?.[activeSheet];
    const scoped = new Map();
    if (!sheet) return scoped;
    for (const edit of edits.values()) {
      if (edit.sheet === sheet.name) scoped.set(`${edit.row},${edit.column}`, edit.input);
    }
    return scoped;
  }, [activeSheet, edits, workbook]);

  const insertRow = useCallback((row) => {
    const sheetName = workbook?.sheets?.[activeSheet]?.name;
    if (!sheetName) return;
    setWorkbook((current) => ({
      ...current,
      sheets: current.sheets.map((sheet, index) => {
        if (index !== activeSheet) return sheet;
        const cells = Object.fromEntries(Object.entries(sheet.cells).map(([key, cell]) => {
          const [cellRow, column] = key.split(",").map(Number);
          return [`${cellRow >= row ? cellRow + 1 : cellRow},${column}`, cell];
        }));
        const rowHeights = [...sheet.rowHeights];
        rowHeights.splice(row - 1, 0, sheet.defaultRowHeight || 20);
        const merges = sheet.merges.map(([top, left, bottom, right]) => (
          top >= row ? [top + 1, left, bottom + 1, right]
            : bottom >= row ? [top, left, bottom + 1, right]
              : [top, left, bottom, right]
        ));
        return { ...sheet, cells, merges, rowCount: sheet.rowCount + 1, rowHeights };
      }),
    }));
    setEdits((current) => new Map([...current].map(([, edit]) => {
      const next = edit.sheet === sheetName && edit.row >= row ? { ...edit, row: edit.row + 1 } : edit;
      return [JSON.stringify([next.sheet, next.row, next.column]), next];
    })));
    setOperations((current) => [...current, { type: "insertRow", sheet: sheetName, index: row }]);
    setSaveState("idle");
  }, [activeSheet, workbook]);

  const insertColumn = useCallback((column) => {
    const sheetName = workbook?.sheets?.[activeSheet]?.name;
    if (!sheetName) return;
    setWorkbook((current) => ({
      ...current,
      sheets: current.sheets.map((sheet, index) => {
        if (index !== activeSheet) return sheet;
        const cells = Object.fromEntries(Object.entries(sheet.cells).map(([key, cell]) => {
          const [row, cellColumn] = key.split(",").map(Number);
          return [`${row},${cellColumn >= column ? cellColumn + 1 : cellColumn}`, cell];
        }));
        const columnWidths = [...sheet.columnWidths];
        columnWidths.splice(column - 1, 0, sheet.defaultColumnWidth || 64);
        const merges = sheet.merges.map(([top, left, bottom, right]) => (
          left >= column ? [top, left + 1, bottom, right + 1]
            : right >= column ? [top, left, bottom, right + 1]
              : [top, left, bottom, right]
        ));
        return { ...sheet, cells, merges, columnCount: sheet.columnCount + 1, columnWidths };
      }),
    }));
    setEdits((current) => new Map([...current].map(([, edit]) => {
      const next = edit.sheet === sheetName && edit.column >= column ? { ...edit, column: edit.column + 1 } : edit;
      return [JSON.stringify([next.sheet, next.row, next.column]), next];
    })));
    setOperations((current) => [...current, { type: "insertColumn", sheet: sheetName, index: column }]);
    setSaveState("idle");
  }, [activeSheet, workbook]);

  const save = useCallback(async () => {
    if (!workbook || (!edits.size && !operations.length)) return;
    setSaveState("saving");
    setFailure(null);
    try {
      await saveWorkbook({
        edits: [...operations, ...edits.values()],
        expectedHash: workbook.hash,
      });
      setSaveState("saved");
      await load();
    } catch (error) {
      const code = error?.code || "SAVE_FAILED";
      setSaveState(code === "CONTENT_CONFLICT" ? "conflict" : "failed");
      setFailure({ code, message: error?.message || null });
    }
  }, [edits, load, operations, saveWorkbook, workbook]);

  const discard = useCallback(() => {
    void load();
  }, [load]);

  return {
    status,
    workbook,
    activeSheet,
    setActiveSheet,
    edits,
    operations,
    sheetEdits,
    editCell,
    insertRow,
    insertColumn,
    dirty: edits.size > 0 || operations.length > 0,
    saveState,
    failure,
    save,
    discard,
    reload: load,
  };
}

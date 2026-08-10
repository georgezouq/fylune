/**
 * Windowing maths for the workbook grid.
 *
 * A sheet can be five thousand rows deep, so the grid only ever mounts the cells the
 * viewport can see. Keeping the arithmetic here — pure, no DOM — is what makes that
 * behaviour testable instead of something you can only check by scrolling.
 */

/**
 * Running pixel offsets for a track, one entry longer than the track itself so the
 * last entry is the total size.
 */
export function trackOffsets(sizes, defaultSize, count) {
  const offsets = new Array(count + 1);
  offsets[0] = 0;
  for (let index = 0; index < count; index += 1) {
    const size = Number.isFinite(sizes?.[index]) && sizes[index] > 0 ? sizes[index] : defaultSize;
    offsets[index + 1] = offsets[index] + size;
  }
  return offsets;
}

function lowerBound(offsets, value) {
  let low = 0;
  let high = offsets.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (offsets[middle + 1] <= value) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * The half-open track range `[start, end)` covering a scrolled viewport, padded by
 * `overscan` tracks so a fast scroll does not reveal blank gutters.
 */
export function visibleTrackRange({ offsets, scroll, viewport, overscan = 3 }) {
  const count = offsets.length - 1;
  if (count <= 0) return { start: 0, end: 0 };
  const total = offsets[count];
  const clampedScroll = Math.max(0, Math.min(scroll, Math.max(0, total - viewport)));
  const first = lowerBound(offsets, clampedScroll);
  // The last visible pixel, not the first one past it: a track that begins exactly
  // where the viewport ends is off-screen and must not be mounted.
  const last = lowerBound(offsets, clampedScroll + Math.max(1, viewport) - 1);
  return {
    start: Math.max(0, first - overscan),
    end: Math.min(count, last + 1 + overscan),
  };
}

/**
 * Widens a visible range so a merged block anchored outside the window still paints.
 * Without this, scrolling past a merge master leaves a hole where its body should be.
 */
export function rangeWithMerges({ range, merges, axis }) {
  if (!merges?.length) return range;
  const [startKey, endKey] = axis === "row" ? [0, 2] : [1, 3];
  let { start, end } = range;
  // Track indices are zero-based; merge tuples are one-based sheet coordinates.
  for (const merge of merges) {
    const mergeStart = merge[startKey] - 1;
    const mergeEnd = merge[endKey] - 1;
    if (mergeEnd < start || mergeStart >= end) continue;
    if (mergeStart < start) start = mergeStart;
    if (mergeEnd + 1 > end) end = mergeEnd + 1;
  }
  return { start: Math.max(0, start), end };
}

export function trackSpan(offsets, start, end) {
  const clampedStart = Math.max(0, Math.min(start, offsets.length - 1));
  const clampedEnd = Math.max(clampedStart, Math.min(end, offsets.length - 1));
  return offsets[clampedEnd] - offsets[clampedStart];
}

/**
 * Smallest scroll adjustment that brings a track fully inside the viewport, ignoring
 * the frozen band that is always painted over the leading edge.
 */
export function scrollToTrack({ offsets, index, scroll, viewport, frozenSize = 0 }) {
  if (index < 0 || index >= offsets.length - 1) return scroll;
  const start = offsets[index];
  const end = offsets[index + 1];
  if (start - frozenSize < scroll) return Math.max(0, start - frozenSize);
  if (end > scroll + viewport) return end - viewport;
  return scroll;
}

export function clampCursor({ row, column, rowCount, columnCount }) {
  return {
    row: Math.max(1, Math.min(row, Math.max(1, rowCount))),
    column: Math.max(1, Math.min(column, Math.max(1, columnCount))),
  };
}

const CURSOR_STEPS = new Map([
  ["ArrowUp", [-1, 0]],
  ["ArrowDown", [1, 0]],
  ["ArrowLeft", [0, -1]],
  ["ArrowRight", [0, 1]],
]);

/**
 * Keyboard movement for the grid. Enter and Tab commit in the direction a spreadsheet
 * user expects, and Shift reverses both.
 */
export function nextCursor({ key, shiftKey, cursor, rowCount, columnCount }) {
  const step = CURSOR_STEPS.get(key);
  if (step) {
    return clampCursor({ row: cursor.row + step[0], column: cursor.column + step[1], rowCount, columnCount });
  }
  if (key === "Enter") {
    return clampCursor({ row: cursor.row + (shiftKey ? -1 : 1), column: cursor.column, rowCount, columnCount });
  }
  if (key === "Tab") {
    return clampCursor({ row: cursor.row, column: cursor.column + (shiftKey ? -1 : 1), rowCount, columnCount });
  }
  if (key === "Home") return clampCursor({ row: cursor.row, column: 1, rowCount, columnCount });
  if (key === "End") return clampCursor({ row: cursor.row, column: columnCount, rowCount, columnCount });
  return null;
}

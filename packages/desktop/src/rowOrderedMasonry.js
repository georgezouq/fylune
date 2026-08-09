export const DEFAULT_MASONRY_GAP = 20;
export const DEFAULT_MASONRY_MIN_COLUMN_WIDTH = 180;
export const DEFAULT_MASONRY_MAX_COLUMNS = 5;

export function masonryColumnCount(
  containerWidth,
  {
    gap = DEFAULT_MASONRY_GAP,
    minColumnWidth = DEFAULT_MASONRY_MIN_COLUMN_WIDTH,
    maxColumns = DEFAULT_MASONRY_MAX_COLUMNS,
  } = {},
) {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return 1;
  const availableColumns = Math.floor((containerWidth + gap) / (minColumnWidth + gap));
  return Math.max(1, Math.min(maxColumns, availableColumns));
}

export function rowOrderedMasonryLayout(
  itemHeights,
  containerWidth,
  options = {},
) {
  const gap = options.gap ?? DEFAULT_MASONRY_GAP;
  const columnCount = masonryColumnCount(containerWidth, options);
  const itemWidth = Math.max(
    0,
    (containerWidth - (gap * (columnCount - 1))) / columnCount,
  );
  const columnHeights = Array.from({ length: columnCount }, () => 0);
  const positions = itemHeights.map((rawHeight, index) => {
    const height = Math.max(0, Number(rawHeight) || 0);
    const column = index % columnCount;
    const position = {
      column,
      height,
      width: itemWidth,
      x: column * (itemWidth + gap),
      y: columnHeights[column],
    };
    columnHeights[column] += height + gap;
    return position;
  });
  const height = positions.length
    ? Math.max(...columnHeights.map((columnHeight) => Math.max(0, columnHeight - gap)))
    : 0;

  return { columnCount, height, itemWidth, positions };
}

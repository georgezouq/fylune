import { Children, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  DEFAULT_MASONRY_GAP,
  DEFAULT_MASONRY_MAX_COLUMNS,
  DEFAULT_MASONRY_MIN_COLUMN_WIDTH,
  rowOrderedMasonryLayout,
} from "./rowOrderedMasonry.js";

function rounded(value) {
  return Math.round(value * 2) / 2;
}

function sameLayout(left, right) {
  if (!left || !right) return left === right;
  if (
    left.columnCount !== right.columnCount
    || rounded(left.height) !== rounded(right.height)
    || rounded(left.itemWidth) !== rounded(right.itemWidth)
    || left.positions.length !== right.positions.length
  ) return false;
  return left.positions.every((position, index) => {
    const candidate = right.positions[index];
    return candidate
      && rounded(position.height) === rounded(candidate.height)
      && rounded(position.x) === rounded(candidate.x)
      && rounded(position.y) === rounded(candidate.y);
  });
}

export function RowOrderedMasonry({
  children,
  className = "",
  gap = DEFAULT_MASONRY_GAP,
  minColumnWidth = DEFAULT_MASONRY_MIN_COLUMN_WIDTH,
  maxColumns = DEFAULT_MASONRY_MAX_COLUMNS,
}) {
  const items = Children.toArray(children);
  const itemKey = useMemo(() => items.map((item) => item.key).join("|"), [items]);
  const containerRef = useRef(null);
  const itemRefs = useRef(new Map());
  const frameRef = useRef(null);
  const [layout, setLayout] = useState(null);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerWidth = container.getBoundingClientRect().width;
    if (!containerWidth) return;
    const heights = items.map((item) => (
      itemRefs.current.get(item.key)?.getBoundingClientRect().height || 0
    ));
    const nextLayout = rowOrderedMasonryLayout(heights, containerWidth, {
      gap,
      maxColumns,
      minColumnWidth,
    });
    setLayout((current) => sameLayout(current, nextLayout) ? current : nextLayout);
  }, [gap, itemKey, items, maxColumns, minColumnWidth]);

  useLayoutEffect(() => {
    measure();
    const container = containerRef.current;
    const nodes = items.map((item) => itemRefs.current.get(item.key)).filter(Boolean);
    const scheduleMeasure = () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        measure();
      });
    };
    const observer = typeof window.ResizeObserver === "function"
      ? new window.ResizeObserver(scheduleMeasure)
      : null;
    if (container) observer?.observe(container);
    nodes.forEach((node) => observer?.observe(node));
    if (!observer) window.addEventListener("resize", scheduleMeasure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [itemKey, items, measure]);

  return (
    <div
      className={["row-ordered-masonry", layout ? "is-positioned" : "is-measuring", className]
        .filter(Boolean)
        .join(" ")}
      ref={containerRef}
      style={layout ? { height: `${layout.height}px` } : undefined}
    >
      {items.map((item, index) => {
        const position = layout?.positions[index];
        return (
          <div
            className="row-ordered-masonry-item"
            data-masonry-column={position?.column ?? undefined}
            key={item.key}
            ref={(node) => {
              if (node) itemRefs.current.set(item.key, node);
              else itemRefs.current.delete(item.key);
            }}
            style={position ? {
              insetInlineStart: `${position.x}px`,
              transform: `translateY(${position.y}px)`,
              width: `${position.width}px`,
            } : undefined}
          >
            {item}
          </div>
        );
      })}
    </div>
  );
}

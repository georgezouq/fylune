import { describe, expect, it } from "vitest";

import {
  masonryColumnCount,
  rowOrderedMasonryLayout,
} from "../../src/rowOrderedMasonry.js";

describe("row-ordered masonry layout", () => {
  it("places a small collection horizontally instead of filling one column", () => {
    const layout = rowOrderedMasonryLayout([320, 180], 1000);

    expect(layout.columnCount).toBe(5);
    expect(layout.positions).toEqual([
      expect.objectContaining({ column: 0, x: 0, y: 0 }),
      expect.objectContaining({ column: 1, x: 204, y: 0 }),
    ]);
  });

  it("assigns later pages across the next visual row in source order", () => {
    const layout = rowOrderedMasonryLayout([300, 120, 240, 180, 260, 200, 160], 1000);

    expect(layout.positions.map(({ column }) => column)).toEqual([0, 1, 2, 3, 4, 0, 1]);
    expect(layout.positions[5]).toEqual(expect.objectContaining({ column: 0, y: 320 }));
    expect(layout.positions[6]).toEqual(expect.objectContaining({ column: 1, y: 140 }));
  });

  it("reduces columns responsively without changing row-first assignment", () => {
    expect(masonryColumnCount(1000)).toBe(5);
    expect(masonryColumnCount(790)).toBe(4);
    expect(masonryColumnCount(590)).toBe(3);
    expect(masonryColumnCount(180)).toBe(1);
  });
});

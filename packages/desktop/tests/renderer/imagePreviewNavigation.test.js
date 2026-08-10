import { describe, expect, it } from "vitest";

import {
  MAXIMUM_IMAGE_ZOOM,
  MINIMUM_IMAGE_ZOOM,
  anchoredScrollPosition,
  clampImageZoom,
  imageZoomFromWheel,
} from "../../src/imagePreviewNavigation.js";

describe("image preview navigation", () => {
  it("clamps image zoom while keeping trackpad changes smooth", () => {
    expect(clampImageZoom(5)).toBe(MINIMUM_IMAGE_ZOOM);
    expect(clampImageZoom(1200)).toBe(MAXIMUM_IMAGE_ZOOM);
    expect(imageZoomFromWheel(100, -100)).toBe(116.2);
    expect(imageZoomFromWheel(100, 100)).toBe(86.1);
  });

  it("keeps the pointer over the same image area when zoom creates overflow", () => {
    expect(anchoredScrollPosition({
      anchorX: 400,
      anchorY: 300,
      previousScrollLeft: 0,
      previousScrollTop: 0,
      previousScrollWidth: 800,
      previousScrollHeight: 600,
      nextScrollWidth: 880,
      nextScrollHeight: 660,
      viewportWidth: 800,
      viewportHeight: 600,
    })).toEqual({ left: 40, top: 30 });
  });

  it("clamps anchored navigation to the available scroll range", () => {
    expect(anchoredScrollPosition({
      anchorX: 760,
      anchorY: 560,
      previousScrollLeft: 800,
      previousScrollTop: 600,
      previousScrollWidth: 1600,
      previousScrollHeight: 1200,
      nextScrollWidth: 800,
      nextScrollHeight: 600,
      viewportWidth: 800,
      viewportHeight: 600,
    })).toEqual({ left: 0, top: 0 });
  });
});

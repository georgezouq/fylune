export const MINIMUM_IMAGE_ZOOM = 25;
export const MAXIMUM_IMAGE_ZOOM = 800;

export function clampImageZoom(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 100;
  return Math.min(MAXIMUM_IMAGE_ZOOM, Math.max(MINIMUM_IMAGE_ZOOM, numericValue));
}

export function imageZoomFromWheel(currentZoom, deltaY) {
  if (!Number.isFinite(deltaY) || deltaY === 0) return clampImageZoom(currentZoom);
  const nextZoom = Number(currentZoom) * Math.exp(-deltaY * 0.0015);
  return clampImageZoom(Math.round(nextZoom * 10) / 10);
}

function clampScroll(value, scrollSize, viewportSize) {
  const maximum = Math.max(0, scrollSize - viewportSize);
  return Math.min(maximum, Math.max(0, value));
}

export function anchoredScrollPosition({
  anchorX,
  anchorY,
  previousScrollLeft,
  previousScrollTop,
  previousScrollWidth,
  previousScrollHeight,
  nextScrollWidth,
  nextScrollHeight,
  viewportWidth,
  viewportHeight,
}) {
  const safePreviousWidth = Math.max(1, previousScrollWidth);
  const safePreviousHeight = Math.max(1, previousScrollHeight);
  const safeAnchorX = Number.isFinite(anchorX) ? anchorX : viewportWidth / 2;
  const safeAnchorY = Number.isFinite(anchorY) ? anchorY : viewportHeight / 2;
  const horizontalRatio = (previousScrollLeft + safeAnchorX) / safePreviousWidth;
  const verticalRatio = (previousScrollTop + safeAnchorY) / safePreviousHeight;
  return {
    left: clampScroll(
      (horizontalRatio * nextScrollWidth) - safeAnchorX,
      nextScrollWidth,
      viewportWidth,
    ),
    top: clampScroll(
      (verticalRatio * nextScrollHeight) - safeAnchorY,
      nextScrollHeight,
      viewportHeight,
    ),
  };
}

import "@testing-library/jest-dom/vitest";
import "../src/i18n/index.js";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverStub;
globalThis.matchMedia =
  globalThis.matchMedia ??
  (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));

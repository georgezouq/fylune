/* eslint-disable no-unused-vars -- the base ESLint config does not mark JSX references as usage */
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LIBRARY_PAGE_SIZE,
  nextVisibleItemCount,
  useProgressiveItems,
} from "../../src/progressiveItems.js";

const observers = [];

class IntersectionObserverMock {
  constructor(callback, options) {
    this.callback = callback;
    this.options = options;
    observers.push(this);
  }

  disconnect = vi.fn();
  observe = vi.fn();
}

function ProgressiveHarness({ items, resetKey }) {
  const { hasMore, loadMore, triggerRef, visibleItems } = useProgressiveItems(items, resetKey);
  return (
    <div className="library-content">
      {visibleItems.map((item) => <span data-testid="item" key={item}>{item}</span>)}
      {hasMore ? <button ref={triggerRef} onClick={loadMore}>Load more</button> : null}
    </div>
  );
}

describe("progressive library rendering", () => {
  beforeEach(() => {
    observers.length = 0;
    Object.defineProperty(window, "IntersectionObserver", {
      configurable: true,
      value: IntersectionObserverMock,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders one bounded page and automatically appends the next page", async () => {
    const items = Array.from({ length: 65 }, (_, index) => `item-${index}`);
    render(<ProgressiveHarness items={items} resetKey="all:grid" />);

    expect(screen.getAllByTestId("item")).toHaveLength(LIBRARY_PAGE_SIZE);
    expect(observers).toHaveLength(1);
    expect(observers[0].options).toEqual(expect.objectContaining({ rootMargin: "720px 0px" }));

    await act(async () => {
      observers[0].callback([{ isIntersecting: true }]);
    });
    await waitFor(() => expect(screen.getAllByTestId("item")).toHaveLength(60));
  });

  it("resets to the first page when search or library context changes", async () => {
    const items = Array.from({ length: 65 }, (_, index) => `item-${index}`);
    const { rerender } = render(<ProgressiveHarness items={items} resetKey="all:grid" />);
    await act(async () => {
      observers[0].callback([{ isIntersecting: true }]);
    });
    await waitFor(() => expect(screen.getAllByTestId("item")).toHaveLength(60));

    rerender(<ProgressiveHarness items={items} resetKey="all:query:grid" />);
    await waitFor(() => expect(screen.getAllByTestId("item")).toHaveLength(LIBRARY_PAGE_SIZE));
  });

  it("clamps page growth to the available result count", () => {
    expect(nextVisibleItemCount(30, 37)).toBe(37);
    expect(nextVisibleItemCount(30, 90)).toBe(60);
  });
});

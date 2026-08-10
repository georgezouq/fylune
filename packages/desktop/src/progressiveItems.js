import { useCallback, useEffect, useRef, useState } from "react";

export const LIBRARY_PAGE_SIZE = 30;

export function nextVisibleItemCount(currentCount, totalCount, pageSize = LIBRARY_PAGE_SIZE) {
  const safeTotal = Math.max(0, Number(totalCount) || 0);
  const safeCurrent = Math.max(0, Number(currentCount) || 0);
  const safePageSize = Math.max(1, Number(pageSize) || LIBRARY_PAGE_SIZE);
  return Math.min(safeTotal, safeCurrent + safePageSize);
}

export function useProgressiveItems(items, resetKey, pageSize = LIBRARY_PAGE_SIZE) {
  const [visibleCount, setVisibleCount] = useState(() => Math.min(pageSize, items.length));
  const triggerRef = useRef(null);

  useEffect(() => {
    setVisibleCount(Math.min(pageSize, items.length));
  }, [items.length, pageSize, resetKey]);

  const loadMore = useCallback(() => {
    setVisibleCount((current) => nextVisibleItemCount(current, items.length, pageSize));
  }, [items.length, pageSize]);

  const hasMore = visibleCount < items.length;
  useEffect(() => {
    if (!hasMore || typeof window.IntersectionObserver !== "function") return undefined;
    const target = triggerRef.current;
    if (!target) return undefined;
    const root = target.closest(".library-content");
    const observer = new window.IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore();
    }, { root, rootMargin: "720px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  return {
    hasMore,
    loadMore,
    triggerRef,
    visibleCount,
    visibleItems: items.slice(0, visibleCount),
  };
}

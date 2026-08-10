import { useEffect, useRef } from "react";

export function useDismissibleLayer({
  open,
  onDismiss,
  insideRefs = [],
  restoreFocusRef = null,
  isEventInside = null,
  dismissOnBlur = true,
  dismissOnResize = true,
  dismissOnScroll = false,
}) {
  const optionsRef = useRef({
    insideRefs,
    isEventInside,
    onDismiss,
    restoreFocusRef,
  });

  useEffect(() => {
    optionsRef.current = {
      insideRefs,
      isEventInside,
      onDismiss,
      restoreFocusRef,
    };
  });

  useEffect(() => {
    if (!open) return undefined;

    function dismiss(reason, event) {
      optionsRef.current.onDismiss?.(reason, event);
      if (reason !== "escape") return;
      window.requestAnimationFrame?.(() => {
        const focusTarget = optionsRef.current.restoreFocusRef?.current;
        if (focusTarget?.matches?.("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")) {
          focusTarget.focus();
        } else {
          focusTarget?.querySelector?.("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")?.focus?.();
        }
      });
    }

    function handlePointerDown(event) {
      const { insideRefs: currentRefs, isEventInside: containsEvent } = optionsRef.current;
      if (containsEvent?.(event)) return;
      const eventPath = event.composedPath?.() || [];
      const insideLayer = currentRefs.some((ref) => {
        const element = ref?.current;
        return element && (eventPath.includes(element) || element.contains?.(event.target));
      });
      if (!insideLayer) dismiss("outside", event);
    }

    function handleKeyDown(event) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      dismiss("escape", event);
    }

    function dismissWithoutEvent() {
      dismiss("environment");
    }

    window.document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    if (dismissOnBlur) window.addEventListener("blur", dismissWithoutEvent);
    if (dismissOnResize) window.addEventListener("resize", dismissWithoutEvent);
    if (dismissOnScroll) window.addEventListener("scroll", dismissWithoutEvent, true);

    return () => {
      window.document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      if (dismissOnBlur) window.removeEventListener("blur", dismissWithoutEvent);
      if (dismissOnResize) window.removeEventListener("resize", dismissWithoutEvent);
      if (dismissOnScroll) window.removeEventListener("scroll", dismissWithoutEvent, true);
    };
  }, [dismissOnBlur, dismissOnResize, dismissOnScroll, open]);
}

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Dragging the floating oat around the screen.
 *
 * Pointer events with an explicit capture, not mouse events. The main process
 * moves the window under the cursor at 60fps, so it always trails the pointer by
 * a frame and the pointer leaves the seed constantly during a drag. With plain
 * mouse events that meant the `mouseup` could land somewhere else entirely and
 * the drag would never be told to stop — the window then followed the cursor
 * around the screen with no button held. `setPointerCapture` routes every move
 * and the release back to the element that was pressed, wherever the window has
 * got to by then, so a drag always ends exactly once.
 */
export const useWindowDrag = () => {
  const [isDragging, setIsDragging] = useState(false);
  const pointerRef = useRef(null);

  const stopDrag = useCallback(() => {
    if (pointerRef.current === null) return;
    pointerRef.current = null;
    setIsDragging(false);
    window.electronAPI?.stopWindowDrag?.();
  }, []);

  const handlePointerDown = useCallback((event) => {
    if (event.button !== 0 || pointerRef.current !== null) return;
    pointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setIsDragging(true);
    window.electronAPI?.startWindowDrag?.();
    event.preventDefault();
  }, []);

  // Last resort. If the window loses focus mid-drag — a notification stealing it,
  // the compositor deciding otherwise — the pointer release may never arrive, and
  // a drag that never ends is a window that never stops moving.
  useEffect(() => {
    if (!isDragging) return undefined;
    window.addEventListener("blur", stopDrag);
    return () => window.removeEventListener("blur", stopDrag);
  }, [isDragging, stopDrag]);

  return {
    isDragging,
    handlePointerDown,
    handlePointerUp: stopDrag,
  };
};

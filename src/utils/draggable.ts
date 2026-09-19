export interface DragPoint {
  clientX: number;
  clientY: number;

  deltaX: number;
  deltaY: number;
}

export interface DraggableOptions {
  threshold?: number;
  canStart?: () => boolean;

  /** Receives the original press coordinates once movement crosses the drag threshold. */
  onStart: (point: DragPoint) => void;

  onMove: (point: DragPoint) => void;
  onEnd: (point: DragPoint) => void;
  onCancel: () => void;
}

export interface DragController {

  /** Aborts the current press or drag without committing a drop. */
  cancel(): void;

  /** Cancels any gesture and removes listeners; safe to call more than once. */
  dispose(): void;
}

/**
 * Adds threshold-based pointer dragging without owning element positioning.
 * Movement reports viewport coordinates and deltas from the initial press.
 * Completed drags suppress their generated click; ordinary clicks still pass through.
 *
 * @returns A controller the consumer must dispose when its element is unmounted.
 */
export function attachDraggable(
  element: HTMLElement,
  options: DraggableOptions,
): DragController {
  const threshold = options.threshold ?? 6;
  if (!Number.isFinite(threshold) || threshold < 0) {
    throw new RangeError("Drag threshold must be a finite, non-negative number.");
  }

  const document = element.ownerDocument;
  const window = document.defaultView;
  if (!window) {
    throw new Error("A draggable element must belong to a window.");
  }

  type Press = {
    pointerId: number;
    clientX: number;
    clientY: number;
    active: boolean;
  };

  let press: Press | undefined;

  let suppressedPointer: number | undefined;
  let suppressionTimer: number | undefined;

  let disposed = false;

  const clearSuppression = (): void => {
    if (suppressionTimer !== undefined) {
      window.clearTimeout(suppressionTimer);
      suppressionTimer = undefined;
    }
    suppressedPointer = undefined;
  };

  const expireSuppression = (): void => {
    if (suppressedPointer !== undefined && suppressionTimer === undefined) {

      // The pointer's synthesized click follows pointerup in the same task.
      suppressionTimer = window.setTimeout(clearSuppression, 0);
    }
  };

  const releaseCapture = (pointerId: number): void => {
    if (element.hasPointerCapture(pointerId)) {
      try {
        element.releasePointerCapture(pointerId);
      } catch (error) {

        // A pointer can disappear between the capture check and release.
        if (!(error instanceof window.DOMException) || error.name !== "NotFoundError") {
          throw error;
        }
      }
    }
  };

  const cancel = (): void => {
    const currentPress = press;
    if (!currentPress) return;

    // Clear the gesture before releasing capture, which can trigger lostpointercapture.
    press = undefined;
    try {
      releaseCapture(currentPress.pointerId);
    } finally {
      if (currentPress.active) options.onCancel();
    }
  };

  const pointFor = (event: PointerEvent, currentPress: Press): DragPoint => ({
    clientX: event.clientX,
    clientY: event.clientY,
    deltaX: event.clientX - currentPress.clientX,
    deltaY: event.clientY - currentPress.clientY,
  });

  const move = (event: PointerEvent, preventDefault: boolean): void => {
    const currentPress = press;
    if (!currentPress || currentPress.pointerId !== event.pointerId) return;
    const point = pointFor(event, currentPress);
    if (!currentPress.active) {

      // Leave short movements untouched so a normal press still produces a click.
      if (Math.hypot(point.deltaX, point.deltaY) < threshold) return;
      if (options.canStart && !options.canStart()) {
        cancel();
        return;
      }
      currentPress.active = true;
      suppressedPointer = currentPress.pointerId;
      if (preventDefault) event.preventDefault();

      // Start at the original press so consumers can preserve the pointer's grab offset.
      options.onStart({
        clientX: currentPress.clientX,
        clientY: currentPress.clientY,
        deltaX: 0,
        deltaY: 0,
      });
    } else if (preventDefault) {
      event.preventDefault();
    }
    if (press === currentPress) options.onMove(point);
  };

  const onFreshPointerDown = (event: PointerEvent): void => {
    if (!press && event.isPrimary && event.button === 0) clearSuppression();
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (
      disposed ||
      press ||
      !event.isPrimary ||
      event.button !== 0 ||
      (options.canStart && !options.canStart())
    ) {
      return;
    }
    press = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      active: false,
    };
    try {
      element.setPointerCapture(event.pointerId);
    } catch (error) {
      press = undefined;
      if (!(error instanceof window.DOMException) || error.name !== "NotFoundError") {
        throw error;
      }
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    move(event, true);
  };

  const onPointerUp = (event: PointerEvent): void => {
    const currentPress = press;
    try {
      if (!currentPress || currentPress.pointerId !== event.pointerId) return;

      // A fast gesture can cross the threshold on release without a preceding move event.
      move(event, false);
      if (press !== currentPress) return;
      press = undefined;
      try {
        releaseCapture(currentPress.pointerId);
      } finally {
        if (currentPress.active) options.onEnd(pointFor(event, currentPress));
      }
    } finally {
      if (suppressedPointer === event.pointerId) expireSuppression();
    }
  };

  const onPointerCancel = (event: PointerEvent): void => {
    try {
      if (press?.pointerId === event.pointerId) cancel();
    } finally {
      if (suppressedPointer === event.pointerId) expireSuppression();
    }
  };

  const onLostPointerCapture = (event: PointerEvent): void => {
    if (press?.pointerId === event.pointerId) cancel();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") cancel();
  };

  const onNativeDragOrSelection = (event: Event): void => {
    if (press) event.preventDefault();
  };

  const onClick = (event: MouseEvent): void => {

    // Keyboard and programmatic activation use detail zero and remain independent of dragging.
    if (suppressedPointer === undefined || event.detail === 0) return;
    if (
      "pointerId" in event &&
      event.pointerId !== suppressedPointer
    ) {
      return;
    }
    if (!event.composedPath().includes(element)) return;
    clearSuppression();
    event.preventDefault();

    // Document capture runs before React's delegated bubble-phase onClick.
    event.stopImmediatePropagation();
  };

  document.addEventListener("pointerdown", onFreshPointerDown, true);
  element.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("pointermove", onPointerMove, { capture: true, passive: false });
  document.addEventListener("pointerup", onPointerUp, true);
  document.addEventListener("pointercancel", onPointerCancel, true);
  element.addEventListener("lostpointercapture", onLostPointerCapture);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("selectstart", onNativeDragOrSelection, true);
  document.addEventListener("dragstart", onNativeDragOrSelection, true);
  document.addEventListener("click", onClick, true);
  window.addEventListener("blur", cancel);

  return {
    cancel,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      document.removeEventListener("pointerdown", onFreshPointerDown, true);
      element.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerCancel, true);
      element.removeEventListener("lostpointercapture", onLostPointerCapture);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("selectstart", onNativeDragOrSelection, true);
      document.removeEventListener("dragstart", onNativeDragOrSelection, true);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("blur", cancel);
      clearSuppression();
      cancel();
    },
  };
}

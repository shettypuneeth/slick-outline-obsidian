import type { OutlinerPlacement } from '../settings';

export const CONTROL_SIZE = 36;
export const PANEL_WIDTH = 280;
export const PANEL_HEIGHT = 420;
export const MARGIN = 12;
const GUTTER_SIDE_INSET = 36;
const GUTTER_CONTENT_GAP = 24;
const BOTTOM_INSET = 48;
const STATUS_BAR_GAP = 24;
const MIN_GUTTER_PANEL_WIDTH = 200;
const OVERLAY_PANEL_WIDTH = 240;

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function readingProgress(top: number, height: number, viewport: number): number {
  const distance = height - viewport;
  return distance <= 1 ? 1 : clamp(top / distance, 0, 1);
}

export function activeHeadingIndex(
  positions: readonly number[],
  threshold: number,
  atBottom: boolean,
): number {
  if (positions.length === 0) return -1;
  if (atBottom) return positions.length - 1;
  let active = 0;
  positions.forEach((position, index) => {
    if (position <= threshold) active = index;
  });
  return active;
}

export function overlayGeometry(
  width: number, height: number, contentLeft: number, contentRight: number,
  top: number, placement: OutlinerPlacement, bottomObstruction = 0,
) {
  const right = placement.endsWith('right');
  const bottom = placement.startsWith('bottom');
  const horizontalMargin = Math.min(MARGIN, Math.max(0, (width - CONTROL_SIZE) / 2));
  const verticalMargin = Math.min(MARGIN, Math.max(0, (height - CONTROL_SIZE) / 2));
  const sideInset = clamp(GUTTER_SIDE_INSET, horizontalMargin, width - CONTROL_SIZE - horizontalMargin);
  const verticalInset = bottom
    ? clamp(Math.max(BOTTOM_INSET, bottomObstruction + STATUS_BAR_GAP),
      verticalMargin, height - CONTROL_SIZE - verticalMargin)
    : clamp(top, verticalMargin, height - 96 - verticalMargin);
  const gutterWidth = (right ? width - contentRight : contentLeft) - sideInset - GUTTER_CONTENT_GAP;
  const panelWidth = gutterWidth >= MIN_GUTTER_PANEL_WIDTH
    ? Math.min(PANEL_WIDTH, gutterWidth)
    : OVERLAY_PANEL_WIDTH;
  return {
    left: right ? width - sideInset - CONTROL_SIZE : sideInset,
    top: bottom ? height - verticalInset - CONTROL_SIZE : verticalInset,
    width: Math.max(CONTROL_SIZE, Math.min(panelWidth, width - sideInset - horizontalMargin)),
    height: Math.max(CONTROL_SIZE, Math.min(PANEL_HEIGHT, height - verticalInset - verticalMargin)),
  };
}

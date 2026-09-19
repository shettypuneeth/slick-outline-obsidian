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

const SNAP_DISTANCE = 12;

/** The collapsed circle's top-left corner in pane-relative pixels. */
export interface OutlinePosition {
  left: number;
  top: number;
}

/** Position ratios within the safe travel bounds, with each axis ranging from zero to one. */
export interface RelativePosition {
  x: number;
  y: number;
}

export interface PositionBounds {
  minLeft: number;
  maxLeft: number;
  minTop: number;
  maxTop: number;
}

/** Computes safe circle travel bounds, reserving bottom clearance for the status bar. */
export function positionBounds(width: number, height: number, bottomObstruction = 0): PositionBounds {

  // Bounds describe the circle's top-left corner, leaving room for its full size.
  const horizontalMargin = Math.min(MARGIN, Math.max(0, (width - CONTROL_SIZE) / 2));
  const verticalMargin = Math.min(MARGIN, Math.max(0, (height - CONTROL_SIZE) / 2));
  const bottomInset = clamp(Math.max(BOTTOM_INSET, bottomObstruction + STATUS_BAR_GAP),
    verticalMargin, height - CONTROL_SIZE - verticalMargin);
  return {
    minLeft: horizontalMargin,
    maxLeft: Math.max(horizontalMargin, width - CONTROL_SIZE - horizontalMargin),
    minTop: verticalMargin,
    maxTop: Math.max(verticalMargin, height - CONTROL_SIZE - bottomInset),
  };
}

export function constrainPosition(position: OutlinePosition, bounds: PositionBounds): OutlinePosition {
  return {
    left: clamp(position.left, bounds.minLeft, bounds.maxLeft),
    top: clamp(position.top, bounds.minTop, bounds.maxTop),
  };
}

/** Clamps a position and snaps each axis to its nearest safe edge when within the snap distance. */
export function snapPosition(position: OutlinePosition, bounds: PositionBounds): OutlinePosition {
  const snap = (value: number, minimum: number, maximum: number) => {
    const nearest = value - minimum <= maximum - value ? minimum : maximum;
    return Math.abs(value - nearest) <= SNAP_DISTANCE ? nearest : value;
  };
  const constrained = constrainPosition(position, bounds);
  return {
    left: snap(constrained.left, bounds.minLeft, bounds.maxLeft),
    top: snap(constrained.top, bounds.minTop, bounds.maxTop),
  };
}

/** Converts pixels to saved ratios, preserving a fallback axis when the pane has no travel space. */
export function relativePosition(
  position: OutlinePosition, bounds: PositionBounds, fallback: RelativePosition = { x: 0, y: 0 },
): RelativePosition {
  const constrained = constrainPosition(position, bounds);

  // A temporarily cramped pane must not erase the saved position on a locked axis.
  return {
    x: bounds.maxLeft === bounds.minLeft ? fallback.x
      : (constrained.left - bounds.minLeft) / (bounds.maxLeft - bounds.minLeft),
    y: bounds.maxTop === bounds.minTop ? fallback.y
      : (constrained.top - bounds.minTop) / (bounds.maxTop - bounds.minTop),
  };
}

/** Resolves saved ratios against current bounds without changing the saved preference on resize. */
export function resolvePosition(position: RelativePosition, bounds: PositionBounds): OutlinePosition {
  return {
    left: bounds.minLeft + clamp(position.x, 0, 1) * (bounds.maxLeft - bounds.minLeft),
    top: bounds.minTop + clamp(position.y, 0, 1) * (bounds.maxTop - bounds.minTop),
  };
}

/**
 * Fits a panel around a freely positioned circle, preferring the direction with more space.
 * A fixed placement retains the expansion corner while an open panel animates or resizes.
 */
export function customGeometry(
  position: OutlinePosition, bounds: PositionBounds, contentLeft: number, contentRight: number,
  fixedPlacement?: OutlinerPlacement,
) {
  const point = constrainPosition(position, bounds);
  const roomLeft = point.left + CONTROL_SIZE - bounds.minLeft;
  const roomRight = bounds.maxLeft + CONTROL_SIZE - point.left;
  const roomAbove = point.top + CONTROL_SIZE - bounds.minTop;
  const roomBelow = bounds.maxTop + CONTROL_SIZE - point.top;

  // Keep the named corner anchored during animations; otherwise expand toward more room.
  const opensLeft = fixedPlacement ? fixedPlacement.endsWith('right') : roomLeft > roomRight;
  const opensUp = fixedPlacement ? fixedPlacement.startsWith('bottom') : roomAbove > roomBelow;
  const placement: OutlinerPlacement = opensUp
    ? opensLeft ? 'bottom-right' : 'bottom-left'
    : opensLeft ? 'top-right' : 'top-left';
  const gutterWidth = opensLeft
    ? point.left + CONTROL_SIZE - contentRight - GUTTER_CONTENT_GAP
    : contentLeft - point.left - GUTTER_CONTENT_GAP;
  const inGutter = opensLeft ? point.left >= contentRight : point.left + CONTROL_SIZE <= contentLeft;
  const panelWidth = inGutter
    ? gutterWidth >= MIN_GUTTER_PANEL_WIDTH ? Math.min(PANEL_WIDTH, gutterWidth) : OVERLAY_PANEL_WIDTH
    : PANEL_WIDTH;
  return {
    ...point,
    placement,
    width: Math.max(CONTROL_SIZE, Math.min(panelWidth, opensLeft ? roomLeft : roomRight)),
    height: Math.max(CONTROL_SIZE, Math.min(PANEL_HEIGHT, opensUp ? roomAbove : roomBelow)),
  };
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

/** Returns scroll progress from zero to one, treating non-scrollable documents as complete. */
export function readingProgress(top: number, height: number, viewport: number): number {
  const distance = height - viewport;
  return distance <= 1 ? 1 : clamp(top / distance, 0, 1);
}

/**
 * Selects the latest heading at or before a reading threshold, defaulting to the first heading.
 * Document end selects the last heading; an empty list returns -1.
 * Ordered positions and threshold must share units (viewport pixels or source lines).
 */
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

/** Fits a corner preset into the note gutter when possible, falling back to an overlay panel. */
export function overlayGeometry(
  width: number, height: number, contentLeft: number, contentRight: number,
  top: number, placement: OutlinerPlacement, bottomObstruction = 0,
) {
  const isRightAligned = placement.endsWith('right');
  const isBottomAligned = placement.startsWith('bottom');

  const horizontalMargin = Math.min(MARGIN, Math.max(0, (width - CONTROL_SIZE) / 2));
  const verticalMargin = Math.min(MARGIN, Math.max(0, (height - CONTROL_SIZE) / 2));
  const sideInset = clamp(GUTTER_SIDE_INSET, horizontalMargin, width - CONTROL_SIZE - horizontalMargin);
  const verticalInset = isBottomAligned
    ? clamp(Math.max(BOTTOM_INSET, bottomObstruction + STATUS_BAR_GAP),
      verticalMargin, height - CONTROL_SIZE - verticalMargin)
    : clamp(top, verticalMargin, height - 96 - verticalMargin);

  const gutterWidth = (isRightAligned ? width - contentRight : contentLeft) - sideInset - GUTTER_CONTENT_GAP;

  // Use the note gutter only when it can fit a readable panel; otherwise overlay it.
  const panelWidth = gutterWidth >= MIN_GUTTER_PANEL_WIDTH
    ? Math.min(PANEL_WIDTH, gutterWidth)
    : OVERLAY_PANEL_WIDTH;
  return {
    left: isRightAligned ? width - sideInset - CONTROL_SIZE : sideInset,
    top: isBottomAligned ? height - verticalInset - CONTROL_SIZE : verticalInset,
    width: Math.max(CONTROL_SIZE, Math.min(panelWidth, width - sideInset - horizontalMargin)),
    height: Math.max(CONTROL_SIZE, Math.min(PANEL_HEIGHT, height - verticalInset - verticalMargin)),
  };
}

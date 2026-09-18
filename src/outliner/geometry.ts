export const CONTROL_SIZE = 36;
export const PANEL_WIDTH = 280;
export const PANEL_HEIGHT = 420;
export const MARGIN = 12;

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

export function overlayGeometry(width: number, height: number, left: number, top: number) {
  const x = clamp(left, MARGIN, width - CONTROL_SIZE - MARGIN);
  const y = clamp(top, MARGIN, height - 96 - MARGIN);
  return {
    left: x,
    top: y,
    width: Math.max(CONTROL_SIZE, Math.min(PANEL_WIDTH, width - x - MARGIN)),
    height: Math.max(CONTROL_SIZE, Math.min(PANEL_HEIGHT, height - y - MARGIN)),
  };
}

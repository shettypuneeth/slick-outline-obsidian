export const DEFAULT_READING_SPEED_WPM = 200;

/** Accepts positive whole-number speeds that can be persisted without losing precision. */
export function isReadingSpeedWpm(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/** Rounds reading time upward, retaining a one-minute minimum for short or empty notes. */
export function readingMinutes(wordCount: number, readingSpeedWpm: number): number {
  if (!isReadingSpeedWpm(readingSpeedWpm)) {
    throw new RangeError('Reading speed must be a positive whole number of words per minute.');
  }
  return Math.max(1, Math.ceil(wordCount / readingSpeedWpm));
}

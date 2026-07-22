// Interval math utilities for the break-finding engine

export interface Interval {
  start: number; // minutes since midnight
  end: number;
}

export interface LabeledInterval extends Interval {
  label?: string;
}

/**
 * Merge overlapping intervals (assumes sorted by start).
 * Touching intervals (where one ends exactly as another starts) are merged.
 */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];

  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const current = sorted[i];

    if (current.start < last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push(current);
    }
  }

  return merged;
}

/**
 * Extract gaps between busy intervals within a day window.
 */
export function extractGaps(
  busyIntervals: Interval[],
  dayStart: number,
  dayEnd: number,
  minGapDuration: number,
): Interval[] {
  const merged = mergeIntervals(busyIntervals);
  const gaps: Interval[] = [];

  // Gap before first busy block
  if (merged.length === 0) {
    const gapDuration = dayEnd - dayStart;
    if (gapDuration >= minGapDuration) {
      gaps.push({ start: dayStart, end: dayEnd });
    }
    return gaps;
  }

  // Gap at start of day
  if (merged[0].start - dayStart >= minGapDuration) {
    gaps.push({ start: dayStart, end: merged[0].start });
  }

  // Gaps between busy blocks
  for (let i = 1; i < merged.length; i++) {
    const gapDuration = merged[i].start - merged[i - 1].end;
    if (gapDuration >= minGapDuration) {
      gaps.push({ start: merged[i - 1].end, end: merged[i].start });
    }
  }

  // Gap at end of day
  if (dayEnd - merged[merged.length - 1].end >= minGapDuration) {
    gaps.push({ start: merged[merged.length - 1].end, end: dayEnd });
  }

  return gaps;
}

/**
 * Convert time string "HH:MM" to minutes since midnight.
 */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Convert minutes since midnight to time string "HH:MM".
 */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Convert ISO datetime string to minutes since midnight.
 *
 * Parses the time portion directly from the string so the caller gets the
 * wall-clock time as written, not as reinterpreted in the server's own
 * timezone.  ISO strings from Google Calendar include an offset
 * (e.g. "2026-07-22T09:00:00-04:00") and the "09:00" already represents
 * the user's local time.  Strings without an offset (from the dev seeder)
 * are treated as-is.
 */
export function isoToMinutes(iso: string): number {
  // Match the time portion: HH:MM, optionally :SS, optionally .frac, then
  // an optional timezone designator (Z or ±HH:MM).
  const match = iso.match(
    /[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:[+-]\d{2}:\d{2}|Z)?$/,
  );
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    return hours * 60 + minutes;
  }

  // Fallback — shouldn't normally be reached for well-formed inputs.
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 0;
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/**
 * Format a date as YYYY-MM-DD.
 */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

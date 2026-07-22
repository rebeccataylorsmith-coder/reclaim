import type { Interval, LabeledInterval } from "../lib/intervals";
import { mergeIntervals, extractGaps, timeToMinutes, isoToMinutes } from "../lib/intervals";

/**
 * Calendar event as stored in the database.
 */
export interface CalendarEvent {
  id: string;
  external_id: string;
  title: string;
  start_time: string; // ISO-8601
  end_time: string;
  is_all_day: number; // 0 or 1
  status: string; // 'confirmed' | 'tentative' | 'cancelled'
}

/**
 * User preferences relevant to gap analysis.
 */
export interface UserPreferences {
  prepBufferMin: number;
  followUpBufferMin: number;
  defaultBreakDurationMin: number;
  deepWorkThresholdMin: number;
  maxBreaksPerDay: number;
  workingHoursStart: string; // "HH:MM"
  workingHoursEnd: string; // "HH:MM"
}

/**
 * A busy window with prep/follow-up buffers applied.
 */
export interface OccupiedWindow extends Interval {
  label: string; // event title
  isBusy: boolean; // the actual event portion
  prep: Interval;
  core: Interval;
  followUp: Interval;
}

export interface GapAnalysisResult {
  gaps: Interval[];
  deepWorkBlocks: Interval[];
  occupiedWindows: OccupiedWindow[];
  dayStart: number;
  dayEnd: number;
  stats: {
    totalGapsFound: number;
    deepWorkBlocksPreserved: number;
  };
}

/**
 * Steps 1-5 of the break-finding algorithm:
 * Filter, create effective windows, merge, extract gaps.
 */
export function analyzeGaps(
  events: CalendarEvent[],
  prefs: UserPreferences,
  targetDate: string,
): GapAnalysisResult {
  // ── Step 1: Filter & sort ──
  const confirmed = events
    .filter((e) => e.status === "confirmed" && e.is_all_day === 0)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  // ── Step 2: Create effective occupied windows ──
  const prepBuffer = prefs.prepBufferMin;
  const followUpBuffer = prefs.followUpBufferMin;

  const occupiedWindows: OccupiedWindow[] = confirmed.map((event) => {
    const coreStart = isoToMinutes(event.start_time);
    const coreEnd = isoToMinutes(event.end_time);
    const effectiveStart = Math.max(0, coreStart - prepBuffer);
    const effectiveEnd = coreEnd + followUpBuffer;

    return {
      start: effectiveStart,
      end: effectiveEnd,
      label: event.title,
      isBusy: true,
      prep: { start: effectiveStart, end: coreStart },
      core: { start: coreStart, end: coreEnd },
      followUp: { start: coreEnd, end: effectiveEnd },
    };
  });

  // ── Step 3: Define working day window ──
  const whStart = timeToMinutes(prefs.workingHoursStart);
  const whEnd = timeToMinutes(prefs.workingHoursEnd);

  let dayStart = whStart;
  let dayEnd = whEnd;

  if (occupiedWindows.length > 0) {
    const earliestStart = Math.min(...occupiedWindows.map((w) => w.start));
    const latestEnd = Math.max(...occupiedWindows.map((w) => w.end));
    dayStart = Math.max(earliestStart - 30, whStart);
    dayEnd = Math.min(latestEnd + 30, whEnd);
  }

  // ── Step 4: Merge overlapping occupied windows ──
  const mergedBusy = mergeIntervals(occupiedWindows);

  // ── Step 5: Extract gaps ──
  const minGap = prefs.defaultBreakDurationMin;
  const gaps = extractGaps(mergedBusy, dayStart, dayEnd, minGap);

  // ── Step 6: Classify gaps (deep work vs eligible) ──
  const deepWorkThreshold = prefs.deepWorkThresholdMin;
  const deepWorkBlocks: Interval[] = [];
  const eligibleGaps: Interval[] = [];

  for (const gap of gaps) {
    const duration = gap.end - gap.start;
    if (duration >= deepWorkThreshold) {
      deepWorkBlocks.push(gap);
    } else {
      eligibleGaps.push(gap);
    }
  }

  return {
    gaps: eligibleGaps,
    deepWorkBlocks,
    occupiedWindows,
    dayStart,
    dayEnd,
    stats: {
      totalGapsFound: gaps.length,
      deepWorkBlocksPreserved: deepWorkBlocks.length,
    },
  };
}

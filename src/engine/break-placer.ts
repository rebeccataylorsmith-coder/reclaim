import type { Interval } from "../lib/intervals";

export interface BreakCandidate {
  start: number; // minutes since midnight
  end: number;
  gapIndex: number;
  gapDuration: number;
  positionInGap: number; // 0-based index within gap
  totalInGap: number;
}

/**
 * Steps 6-7: Classify gaps and place candidate breaks.
 *
 * Step 6 — Classify gaps:
 * - Gap ≥ deep_work_threshold: Deep work block. At most one break at edge. ≥4hr gets one midpoint.
 * - Otherwise: eligible gap — place breaks with even spacing.
 *
 * Step 7 — Place candidate breaks:
 * For each eligible gap, evenly space up to max_breaks breaks.
 */
export function placeBreaks(
  eligibleGaps: Interval[],
  deepWorkBlocks: Interval[],
  breakDurationMin: number,
  deepWorkThresholdMin: number,
): BreakCandidate[] {
  const candidates: BreakCandidate[] = [];
  const fourHours = 240; // 4 hours in minutes

  // ── Eligible gaps: even spacing ──
  for (let gi = 0; gi < eligibleGaps.length; gi++) {
    const gap = eligibleGaps[gi];
    const gapDuration = gap.end - gap.start;

    // Max breaks: floor(gap_duration / (break_duration + 5))
    const maxBreaks = Math.floor(gapDuration / (breakDurationMin + 5));

    if (maxBreaks <= 0) continue;

    // Even spacing: spacing = (gap_duration - n * break_duration) / (n + 1)
    const n = maxBreaks;
    const spacing = (gapDuration - n * breakDurationMin) / (n + 1);

    for (let i = 0; i < n; i++) {
      const start = gap.start + spacing + i * (breakDurationMin + spacing);
      candidates.push({
        start,
        end: start + breakDurationMin,
        gapIndex: gi,
        gapDuration,
        positionInGap: i,
        totalInGap: n,
      });
    }
  }

  // ── Deep work blocks: at most one at edge, midpoint for ≥4hr ──
  for (let gi = 0; gi < deepWorkBlocks.length; gi++) {
    const block = deepWorkBlocks[gi];
    const blockDuration = block.end - block.start;

    if (blockDuration >= fourHours) {
      // ≥4 hours: one midpoint break
      const midpoint = block.start + blockDuration / 2;
      candidates.push({
        start: midpoint - breakDurationMin / 2,
        end: midpoint + breakDurationMin / 2,
        gapIndex: eligibleGaps.length + gi,
        gapDuration: blockDuration,
        positionInGap: 0,
        totalInGap: 1,
      });
    } else {
      // ≥deep_work_threshold but < 4hr: one break at either edge
      // Place at the start edge
      candidates.push({
        start: block.start,
        end: block.start + breakDurationMin,
        gapIndex: eligibleGaps.length + gi,
        gapDuration: blockDuration,
        positionInGap: 0,
        totalInGap: 1,
      });
    }
  }

  return candidates;
}

import type { BreakCandidate } from "./break-placer";
import type { Interval } from "../lib/intervals";

export interface ScoredCandidate extends BreakCandidate {
  timeOfDayScore: number;
  durationMatchScore: number;
  spacingScore: number;
  compositeScore: number;
}

/**
 * Step 8: Score each break candidate.
 *
 * score = 0.5 × timeOfDayScore + 0.3 × durationMatchScore + 0.2 × spacingScore
 *
 * Time-of-day: Gaussian peaks at 10:30 (630 min) and 15:00 (900 min), σ = 90 min.
 * Duration match: 1.0 - |slotDuration - idealDuration| / idealDuration, clamped to [0,1].
 * Spacing: min(distanceToNearestBreak / 60, 1.0).
 */
export function scoreCandidates(
  candidates: BreakCandidate[],
  idealBreakDuration: number,
): ScoredCandidate[] {
  const sigma = 90;
  const peak1 = 630; // 10:30
  const peak2 = 900; // 15:00

  const scored: ScoredCandidate[] = candidates.map((c) => {
    const midpoint = (c.start + c.end) / 2;

    // ── Time-of-day score: max of two Gaussians ──
    const gaussian1 = gaussian(midpoint, peak1, sigma);
    const gaussian2 = gaussian(midpoint, peak2, sigma);
    const timeOfDayScore = Math.max(gaussian1, gaussian2);

    // ── Duration match score ──
    const slotDuration = c.end - c.start;
    const durationMatchScore = Math.max(
      0,
      Math.min(1, 1.0 - Math.abs(slotDuration - idealBreakDuration) / idealBreakDuration),
    );

    // ── Spacing score ──
    const spacingScore = computeSpacingScore(c, candidates);

    // ── Composite ──
    const compositeScore =
      0.5 * timeOfDayScore + 0.3 * durationMatchScore + 0.2 * spacingScore;

    return {
      ...c,
      timeOfDayScore: round(timeOfDayScore, 4),
      durationMatchScore: round(durationMatchScore, 4),
      spacingScore: round(spacingScore, 4),
      compositeScore: round(compositeScore, 4),
    };
  });

  return scored;
}

function gaussian(x: number, mean: number, sigma: number): number {
  const exponent = -((x - mean) * (x - mean)) / (2 * sigma * sigma);
  return Math.exp(exponent);
}

/**
 * Spacing score: min(distanceToNearestBreak / 60, 1.0).
 * Breaks ≥60 min apart score 1.0. Measures how well this break is spaced relative
 * to all other candidates.
 */
function computeSpacingScore(
  candidate: BreakCandidate,
  allCandidates: BreakCandidate[],
): number {
  const midpoint = (candidate.start + candidate.end) / 2;

  let minDistance = Infinity;
  for (const other of allCandidates) {
    if (other === candidate) continue;
    const otherMidpoint = (other.start + other.end) / 2;
    const distance = Math.abs(midpoint - otherMidpoint);
    if (distance < minDistance) {
      minDistance = distance;
    }
  }

  if (minDistance === Infinity) {
    // Only one candidate — perfect spacing
    return 1.0;
  }

  return Math.min(minDistance / 60, 1.0);
}

function round(n: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

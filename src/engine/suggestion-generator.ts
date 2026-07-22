import type { Database } from "bun:sqlite";
import { getDb } from "../db/sqlite";
import { getRandomExercise, getRandomQuote } from "../db/schema";
import { formatDate, minutesToTime, isoToMinutes } from "../lib/intervals";
import type { CalendarEvent, UserPreferences } from "./gap-analyzer";
import { analyzeGaps } from "./gap-analyzer";
import { placeBreaks, type BreakCandidate } from "./break-placer";
import { scoreCandidates, type ScoredCandidate } from "./break-scorer";

export interface BreakSuggestion {
  id: string;
  suggestedStart: string; // ISO-8601 datetime
  suggestedEnd: string;
  durationMinutes: number;
  breakType: string;
  status: string;
  rankingScore: number;
  context: {
    gapMinutes: number;
    beforeEvent: string | null;
    afterEvent: string | null;
  };
}

export interface TimelineSegment {
  type: "busy" | "buffer" | "gap" | "break";
  start: string; // "HH:MM"
  end: string;
  label: string;
}

export interface DailySuggestions {
  date: string;
  generatedAt: string;
  stats: {
    totalGapsFound: number;
    deepWorkBlocksPreserved: number;
    suggestionsGenerated: number;
  };
  suggestions: BreakSuggestion[];
  timeline: TimelineSegment[];
}

/**
 * Full orchestrator (Steps 1-10): analyze gaps, place breaks, score, select, persist.
 */
export function generateSuggestions(
  db: Database,
  userId: string,
  targetDate: string,
): DailySuggestions {
  // Load user preferences
  const userRow = db
    .query(
      `SELECT prep_buffer_min, follow_up_buffer_min, default_break_duration_min,
              deep_work_threshold_min, max_breaks_per_day, working_hours_start,
              working_hours_end, preferred_break_types, plan
       FROM users WHERE id = ?`,
    )
    .get(userId) as {
    prep_buffer_min: number;
    follow_up_buffer_min: number;
    default_break_duration_min: number;
    deep_work_threshold_min: number;
    max_breaks_per_day: number;
    working_hours_start: string;
    working_hours_end: string;
    preferred_break_types: string;
    plan: string;
  } | null;

  if (!userRow) {
    throw new Error("User not found");
  }

  // Free tier: cap at 3 breaks per day
  const effectiveMaxBreaks = userRow.plan === "free"
    ? Math.min(userRow.max_breaks_per_day, 3)
    : userRow.max_breaks_per_day;

  const prefs: UserPreferences = {
    prepBufferMin: userRow.prep_buffer_min,
    followUpBufferMin: userRow.follow_up_buffer_min,
    defaultBreakDurationMin: userRow.default_break_duration_min,
    deepWorkThresholdMin: userRow.deep_work_threshold_min,
    maxBreaksPerDay: effectiveMaxBreaks,
    workingHoursStart: userRow.working_hours_start,
    workingHoursEnd: userRow.working_hours_end,
  };

  const breakTypes = userRow.preferred_break_types
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  // ── Load events for target date ──
  const events = loadEventsForDate(db, userId, targetDate);
  console.log(`[engine] Loaded ${events.length} events for user ${userId} on ${targetDate}`);

  // ── Edge case: no events ──
  if (events.length === 0) {
    console.log(`[engine] No events found for ${targetDate} — generating empty day suggestions`);
    return generateEmptyDaySuggestions(db, userId, targetDate, prefs, breakTypes);
  }

  // ── Steps 1-5: Gap analysis ──
  const analysis = analyzeGaps(events, prefs, targetDate);
  console.log(`[engine] Gap analysis: ${analysis.gaps.length} eligible gaps, ${analysis.deepWorkBlocks.length} deep work blocks, ${analysis.occupiedWindows.length} occupied windows`);

  // ── Steps 6-7: Place candidates ──
  const candidates = placeBreaks(
    analysis.gaps,
    analysis.deepWorkBlocks,
    prefs.defaultBreakDurationMin,
    prefs.deepWorkThresholdMin,
  );
  console.log(`[engine] Placed ${candidates.length} break candidates`);

  // ── Edge case: no candidates (back-to-back) ──
  if (candidates.length === 0) {
    return {
      date: targetDate,
      generatedAt: new Date().toISOString(),
      stats: {
        totalGapsFound: analysis.stats.totalGapsFound,
        deepWorkBlocksPreserved: analysis.stats.deepWorkBlocksPreserved,
        suggestionsGenerated: 0,
      },
      suggestions: [],
      timeline: buildTimeline(analysis.occupiedWindows, [], targetDate, analysis.dayStart, analysis.dayEnd),
    };
  }

  // ── Step 8: Score candidates ──
  const scored = scoreCandidates(candidates, prefs.defaultBreakDurationMin);

  // ── Step 9: Select top N ──
  const sorted = scored.sort((a, b) => b.compositeScore - a.compositeScore);
  const selected = sorted.slice(0, prefs.maxBreaksPerDay);
  console.log(`[engine] Selected ${selected.length} top-scored breaks (max ${prefs.maxBreaksPerDay} allowed)`);

  // ── Step 10: Persist ──
  // Delete existing pending suggestions for this user+date
  db.query(
    "DELETE FROM break_suggestions WHERE user_id = ? AND date = ? AND status = 'pending'",
  ).run(userId, targetDate);

  const suggestions: BreakSuggestion[] = [];
  const insertStmt = db.prepare(`
    INSERT INTO break_suggestions (id, user_id, date, suggested_start, suggested_end,
      break_type_id, status, gap_minutes, ranking_score)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `);

  const insertMany = db.transaction(() => {
    for (let i = 0; i < selected.length; i++) {
      const s = selected[i];
      const breakType = breakTypes[i % breakTypes.length] || "breathing";
      const id = crypto.randomUUID();
      const startISO = `${targetDate}T${minutesToTime(s.start)}:00`;
      const endISO = `${targetDate}T${minutesToTime(s.end)}:00`;

      // Determine context (before/after events)
      const context = getContext(analysis.occupiedWindows, s.start, s.end);

      insertStmt.run(
        id,
        userId,
        targetDate,
        startISO,
        endISO,
        breakType,
        s.end - s.start,
        s.compositeScore,
      );

      suggestions.push({
        id,
        suggestedStart: startISO,
        suggestedEnd: endISO,
        durationMinutes: Math.round(s.end - s.start),
        breakType,
        status: "pending",
        rankingScore: s.compositeScore,
        context: {
          gapMinutes: Math.round(s.gapDuration),
          beforeEvent: context.before,
          afterEvent: context.after,
        },
      });
    }
  });
  insertMany();

  return {
    date: targetDate,
    generatedAt: new Date().toISOString(),
    stats: {
      totalGapsFound: analysis.stats.totalGapsFound,
      deepWorkBlocksPreserved: analysis.stats.deepWorkBlocksPreserved,
      suggestionsGenerated: suggestions.length,
    },
    suggestions,
    timeline: buildTimeline(
      analysis.occupiedWindows,
      suggestions,
      targetDate,
      analysis.dayStart,
      analysis.dayEnd,
    ),
  };
}

/**
 * Load calendar events for a specific date.
 */
function loadEventsForDate(
  db: Database,
  userId: string,
  date: string,
): CalendarEvent[] {
  return db
    .query(
      `SELECT id, external_id, title, start_time, end_time, is_all_day, status
       FROM calendar_events
       WHERE user_id = ? AND date(start_time) = ?
       ORDER BY start_time`,
    )
    .all(userId, date) as CalendarEvent[];
}

/**
 * Edge case: no events — generate one mid-morning break.
 */
function generateEmptyDaySuggestions(
  db: Database,
  userId: string,
  targetDate: string,
  prefs: UserPreferences,
  breakTypes: string[],
): DailySuggestions {
  // One break at ~10:30 AM
  const midMorning = 630; // 10:30 in minutes
  const breakDur = prefs.defaultBreakDurationMin;

  const id = crypto.randomUUID();
  const startISO = `${targetDate}T10:30:00`;
  const endISO = `${targetDate}T${minutesToTime(midMorning + breakDur)}:00`;
  const breakType = breakTypes[0] || "breathing";

  db.query(
    "DELETE FROM break_suggestions WHERE user_id = ? AND date = ? AND status = 'pending'",
  ).run(userId, targetDate);

  db.query(
    `INSERT INTO break_suggestions (id, user_id, date, suggested_start, suggested_end,
      break_type_id, status, gap_minutes, ranking_score)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
  ).run(id, userId, targetDate, startISO, endISO, breakType, breakDur, 0.95);

  const whStart = prefs.workingHoursStart;
  const whEnd = prefs.workingHoursEnd;

  return {
    date: targetDate,
    generatedAt: new Date().toISOString(),
    stats: { totalGapsFound: 1, deepWorkBlocksPreserved: 0, suggestionsGenerated: 1 },
    suggestions: [
      {
        id,
        suggestedStart: startISO,
        suggestedEnd: endISO,
        durationMinutes: breakDur,
        breakType,
        status: "pending",
        rankingScore: 0.95,
        context: { gapMinutes: breakDur, beforeEvent: null, afterEvent: null },
      },
    ],
    timeline: [
      { type: "gap", start: whStart, end: "10:30", label: "Available" },
      { type: "break", start: "10:30", end: minutesToTime(midMorning + breakDur), label: "Break" },
      { type: "gap", start: minutesToTime(midMorning + breakDur), end: whEnd, label: "Available" },
    ],
  };
}

/**
 * Build timeline visualization segments.
 * Creates a non-overlapping sequence: gap → prep → busy → follow-up → gap → ...
 * Inserts break segments where they fall in gaps between occupied windows.
 */
function buildTimeline(
  occupiedWindows: Array<{
    start: number;
    end: number;
    label: string;
    prep: { start: number; end: number };
    core: { start: number; end: number };
    followUp: { start: number; end: number };
  }>,
  suggestions: BreakSuggestion[],
  targetDate: string,
  dayStart: number,
  dayEnd: number,
): TimelineSegment[] {
  const segments: TimelineSegment[] = [];

  // Build a flat list of all time regions sorted by start time:
  // gaps (between occupied windows), then for each window: prep, core busy, follow-up
  // Then overlay breaks.

  if (occupiedWindows.length === 0) {
    segments.push({
      type: "gap",
      start: minutesToTime(dayStart),
      end: minutesToTime(dayEnd),
      label: "Available",
    });
    return segments;
  }

  let cursor = dayStart;

  for (const w of occupiedWindows) {
    // Gap before this window (if any)
    if (w.start > cursor) {
      // Check for breaks in this gap
      const gapBreaks = suggestions.filter((s) => {
        const bStart = isoToMinutes(s.suggestedStart);
        return bStart >= cursor && bStart < w.start;
      });

      if (gapBreaks.length > 0) {
        let gapCursor = cursor;
        for (const b of gapBreaks.sort(
          (a, b) =>
            isoToMinutes(a.suggestedStart) - isoToMinutes(b.suggestedStart),
        )) {
          const bStart = isoToMinutes(b.suggestedStart);
          const bEnd = isoToMinutes(b.suggestedEnd);

          // Gap before break
          if (bStart > gapCursor) {
            segments.push({
              type: "gap",
              start: minutesToTime(gapCursor),
              end: minutesToTime(bStart),
              label: "Available",
            });
          }

          // The break
          segments.push({
            type: "break",
            start: minutesToTime(bStart),
            end: minutesToTime(bEnd),
            label:
              b.breakType === "breathing"
                ? "Breathe"
                : b.breakType === "quote"
                  ? "Quote"
                  : "Break",
          });

          gapCursor = bEnd;
        }

        // Remaining gap after last break
        if (w.start > gapCursor) {
          segments.push({
            type: "gap",
            start: minutesToTime(gapCursor),
            end: minutesToTime(w.start),
            label: "Available",
          });
        }
      } else {
        segments.push({
          type: "gap",
          start: minutesToTime(cursor),
          end: minutesToTime(w.start),
          label: "Available",
        });
      }
    }

    // Prep buffer (only if prep exists and is non-zero)
    if (w.prep.start < w.prep.end) {
      segments.push({
        type: "buffer",
        start: minutesToTime(w.prep.start),
        end: minutesToTime(w.prep.end),
        label: "Prep",
      });
    }

    // Core busy time
    segments.push({
      type: "busy",
      start: minutesToTime(w.core.start),
      end: minutesToTime(w.core.end),
      label: w.label,
    });

    // Follow-up buffer
    if (w.followUp.start < w.followUp.end) {
      segments.push({
        type: "buffer",
        start: minutesToTime(w.followUp.start),
        end: minutesToTime(w.followUp.end),
        label: "Follow-up",
      });
    }

    cursor = w.end;
  }

  // Final gap after last window
  if (dayEnd > cursor) {
    const gapBreaks = suggestions.filter((s) => {
      const bStart = isoToMinutes(s.suggestedStart);
      return bStart >= cursor && bStart < dayEnd;
    });

    if (gapBreaks.length > 0) {
      let gapCursor = cursor;
      for (const b of gapBreaks.sort(
        (a, b) =>
          isoToMinutes(a.suggestedStart) - isoToMinutes(b.suggestedStart),
      )) {
        const bStart = isoToMinutes(b.suggestedStart);
        const bEnd = isoToMinutes(b.suggestedEnd);

        if (bStart > gapCursor) {
          segments.push({
            type: "gap",
            start: minutesToTime(gapCursor),
            end: minutesToTime(bStart),
            label: "Available",
          });
        }

        segments.push({
          type: "break",
          start: minutesToTime(bStart),
          end: minutesToTime(bEnd),
          label:
            b.breakType === "breathing"
              ? "Breathe"
              : b.breakType === "quote"
                ? "Quote"
                : "Break",
        });

        gapCursor = bEnd;
      }

      if (dayEnd > gapCursor) {
        segments.push({
          type: "gap",
          start: minutesToTime(gapCursor),
          end: minutesToTime(dayEnd),
          label: "Available",
        });
      }
    } else {
      segments.push({
        type: "gap",
        start: minutesToTime(cursor),
        end: minutesToTime(dayEnd),
        label: "Available",
      });
    }
  }

  return segments;
}

/**
 * Find context events for a break (what's before and after it).
 */
function getContext(
  occupiedWindows: Array<{ start: number; end: number; label: string }>,
  breakStart: number,
  breakEnd: number,
): { before: string | null; after: string | null } {
  let before: string | null = null;
  let after: string | null = null;

  for (const w of occupiedWindows) {
    if (w.end <= breakStart) {
      before = w.label;
    }
    if (w.start >= breakEnd && !after) {
      after = w.label;
    }
  }

  return { before, after };
}

/**
 * Get a break suggestion by ID (for accept/start/skip).
 */
export function getSuggestionById(
  db: Database,
  suggestionId: string,
  userId: string,
) {
  return db
    .query(
      `SELECT * FROM break_suggestions WHERE id = ? AND user_id = ?`,
    )
    .get(suggestionId, userId) as {
    id: string;
    user_id: string;
    date: string;
    suggested_start: string;
    suggested_end: string;
    break_type_id: string;
    status: string;
    gap_minutes: number;
    ranking_score: number | null;
  } | null;
}

/**
 * Start a break — creates a completion record and returns content.
 */
export function startBreak(
  db: Database,
  suggestionId: string,
  userId: string,
) {
  const suggestion = getSuggestionById(db, suggestionId, userId);
  if (!suggestion) {
    throw new Error("Suggestion not found");
  }

  if (suggestion.status !== "pending" && suggestion.status !== "accepted") {
    throw new Error(`Cannot start a ${suggestion.status} break`);
  }

  const completionId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  // Get content based on break type
  let breathingExercise = null;
  let quote = null;

  if (suggestion.break_type_id === "breathing") {
    // Free tier: only beginner exercises
    const userPlan = db.query("SELECT plan FROM users WHERE id = ?").get(userId) as { plan: string } | null;
    if (userPlan?.plan === "premium") {
      breathingExercise = getRandomExercise(db, suggestion.gap_minutes * 60);
    } else {
      // Free: only beginner exercises
      const maxDur = suggestion.gap_minutes * 60;
      let query = "SELECT * FROM breathing_exercises WHERE difficulty = 'beginner'";
      const params: any[] = [];
      if (maxDur > 0) {
        query += " AND duration_seconds <= ?";
        params.push(maxDur);
      }
      query += " ORDER BY RANDOM() LIMIT 1";
      const rows = db.query(query).all(...params) as any[];
      breathingExercise = rows.length > 0 ? rows[0] : null;
    }
  } else if (suggestion.break_type_id === "quote") {
    quote = getRandomQuote(db);
  }

  db.query(
    `INSERT INTO break_completions
       (id, user_id, suggestion_id, break_type_id, breathing_exercise_id, quote_id,
        started_at, completed_at, duration_seconds, rating)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)`,
  ).run(
    completionId,
    userId,
    suggestionId,
    suggestion.break_type_id,
    breathingExercise?.id ?? null,
    quote?.id ?? null,
    startedAt,
  );

  // Update suggestion status
  db.query(
    "UPDATE break_suggestions SET status = 'accepted' WHERE id = ? AND user_id = ?",
  ).run(suggestionId, userId);

  return {
    completion: {
      id: completionId,
      suggestionId,
      breakTypeId: suggestion.break_type_id,
      startedAt,
    },
    content: breathingExercise ?? quote,
  };
}

/**
 * Complete a break — updates completion record and streak.
 */
export function completeBreak(
  db: Database,
  completionId: string,
  userId: string,
  rating?: number,
) {
  const completion = db
    .query(
      `SELECT * FROM break_completions WHERE id = ? AND user_id = ?`,
    )
    .get(completionId, userId) as {
    id: string;
    user_id: string;
    suggestion_id: string | null;
    break_type_id: string;
    started_at: string;
    completed_at: string | null;
    duration_seconds: number | null;
    rating: number | null;
  } | null;

  if (!completion) {
    throw new Error("Completion not found");
  }

  if (completion.completed_at) {
    throw new Error("Break already completed");
  }

  const completedAt = new Date().toISOString();
  const startedAt = new Date(completion.started_at);
  const durationSeconds = Math.round(
    (new Date(completedAt).getTime() - startedAt.getTime()) / 1000,
  );

  db.query(
    `UPDATE break_completions
     SET completed_at = ?, duration_seconds = ?, rating = ?
     WHERE id = ? AND user_id = ?`,
  ).run(completedAt, durationSeconds, rating ?? null, completionId, userId);

  // Update suggestion status
  if (completion.suggestion_id) {
    db.query(
      "UPDATE break_suggestions SET status = 'completed' WHERE id = ? AND user_id = ?",
    ).run(completion.suggestion_id, userId);
  }

  // Update streak
  const today = formatDate(new Date());
  const streak = updateStreak(db, userId, today);

  return {
    completion: {
      id: completionId,
      completedAt,
      durationSeconds,
      rating: rating ?? null,
    },
    streak,
  };
}

/**
 * Update the user's streak.
 */
function updateStreak(
  db: Database,
  userId: string,
  today: string,
): { current: number; best: number; lastActiveDate: string | null } {
  // Ensure streak row exists
  const existing = db
    .query("SELECT * FROM streaks WHERE user_id = ?")
    .get(userId) as {
    id: string;
    user_id: string;
    current_length: number;
    best_length: number;
    last_active_date: string | null;
  } | null;

  if (!existing) {
    const id = crypto.randomUUID();
    db.query(
      "INSERT INTO streaks (id, user_id, current_length, best_length, last_active_date) VALUES (?, ?, 1, 1, ?)",
    ).run(id, userId, today);
    return { current: 1, best: 1, lastActiveDate: today };
  }

  const lastDate = existing.last_active_date;
  let newCurrent = existing.current_length;
  let newBest = existing.best_length;

  if (lastDate === today) {
    // Already completed a break today — streak unchanged
  } else if (lastDate) {
    const yesterday = formatDate(
      new Date(new Date(today).getTime() - 86400000),
    );
    if (lastDate === yesterday) {
      newCurrent += 1;
    } else {
      newCurrent = 1; // Streak broken
    }
  } else {
    newCurrent = 1;
  }

  if (newCurrent > newBest) {
    newBest = newCurrent;
  }

  db.query(
    "UPDATE streaks SET current_length = ?, best_length = ?, last_active_date = ?, updated_at = datetime('now') WHERE user_id = ?",
  ).run(newCurrent, newBest, today, userId);

  return { current: newCurrent, best: newBest, lastActiveDate: today };
}

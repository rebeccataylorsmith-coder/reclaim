import type { Database } from "bun:sqlite";
import { getDb } from "../db/sqlite";
import {
  fetchGoogleCalendarEvents,
  ensureFreshToken,
  type GoogleCalendarEvent,
} from "./google";

/**
 * Sync all calendar connections for a user.
 * Returns count of events synced.
 */
export async function syncUserCalendars(
  db: Database,
  userId: string,
): Promise<{ syncedCount: number; errors: string[] }> {
  const connections = db
    .query(
      "SELECT id, provider, calendar_email, sync_enabled, sync_cursor FROM calendar_connections WHERE user_id = ? AND sync_enabled = 1",
    )
    .all(userId) as Array<{
    id: string;
    provider: string;
    calendar_email: string;
    sync_enabled: number;
    sync_cursor: string | null;
  }>;

  let totalSynced = 0;
  const errors: string[] = [];

  for (const conn of connections) {
    try {
      if (conn.provider === "google") {
        const count = await syncGoogleConnection(db, conn.id, userId, conn.calendar_email, conn.sync_cursor);
        totalSynced += count;
      }
      // Microsoft sync not yet implemented — skip
    } catch (err: any) {
      errors.push(`Sync error for ${conn.provider}/${conn.calendar_email}: ${err.message}`);
    }
  }

  return { syncedCount: totalSynced, errors };
}

/**
 * Sync a single Google Calendar connection.
 */
async function syncGoogleConnection(
  db: Database,
  connectionId: string,
  userId: string,
  calendarEmail: string,
  syncCursor: string | null,
): Promise<number> {
  const MIN_TIME_WINDOW_DAYS = 180; // 6 months in both directions

  let token: string;
  try {
    token = await ensureFreshToken(db, connectionId);
  } catch (err) {
    throw new Error(`Token refresh failed: ${(err as Error).message}`);
  }

  // Time range: last 90 days through next 90 days
  const now = new Date();
  const timeMin = new Date(now.getTime() - 90 * 86400000).toISOString();
  const timeMax = new Date(now.getTime() + 90 * 86400000).toISOString();

  let allEvents: GoogleCalendarEvent[] = [];
  let nextSyncToken: string | undefined;
  let pageToken: string | undefined;
  let currentSyncCursor = syncCursor ?? undefined;

  // Fetch events (paginated)
  do {
    const result = await fetchGoogleCalendarEvents(token, calendarEmail, {
      timeMin,
      timeMax,
      syncToken: currentSyncCursor,
      pageToken,
    });

    allEvents.push(...result.events);
    nextSyncToken = result.nextSyncToken;
    pageToken = result.nextPageToken;

    // After first page with sync token, don't keep passing it
    currentSyncCursor = undefined;
  } while (pageToken);

  // Upsert events into DB
  const upsertStmt = db.prepare(`
    INSERT INTO calendar_events (id, user_id, connection_id, external_id, title,
      start_time, end_time, is_all_day, status, recurrence_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, external_id) DO UPDATE SET
      title = excluded.title,
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      is_all_day = excluded.is_all_day,
      status = excluded.status,
      recurrence_id = excluded.recurrence_id,
      updated_at = datetime('now')
  `);

  let count = 0;
  const upsertMany = db.transaction(() => {
    for (const event of allEvents) {
      const externalId = event.id;
      const title = event.summary || "(no title)";
      const startRaw = event.start?.dateTime || event.start?.date;
      const endRaw = event.end?.dateTime || event.end?.date;
      const isAllDay = !event.start?.dateTime ? 1 : 0;
      const status = event.status === "cancelled" ? "cancelled" : "confirmed";
      const recurrenceId = event.recurringEventId || null;

      if (!startRaw || !endRaw) continue;

      const id = crypto.randomUUID();
      upsertStmt.run(
        id,
        userId,
        connectionId,
        externalId,
        title,
        startRaw,
        endRaw,
        isAllDay,
        status,
        recurrenceId,
      );
      count++;
    }
  });
  upsertMany();

  // Handle cancellations: if an event was cancelled, mark it as such
  // Google's incremental sync returns cancelled events with status='cancelled' -
  // they're already handled by the upsert above

  // Update sync cursor and last_synced_at
  db.query(
    "UPDATE calendar_connections SET sync_cursor = ?, last_synced_at = datetime('now') WHERE id = ?",
  ).run(nextSyncToken || null, connectionId);

  return count;
}

/**
 * Sync a specific calendar connection by ID (triggered from API).
 */
export async function syncConnection(
  connectionId: string,
  userId: string,
): Promise<{ syncedCount: number }> {
  const db = getDb();

  const conn = db
    .query(
      "SELECT id, provider, calendar_email, sync_cursor FROM calendar_connections WHERE id = ? AND user_id = ?",
    )
    .get(connectionId, userId) as {
    id: string;
    provider: string;
    calendar_email: string;
    sync_cursor: string | null;
  } | null;

  if (!conn) {
    throw new Error("Connection not found");
  }

  let count = 0;
  if (conn.provider === "google") {
    count = await syncGoogleConnection(db, conn.id, userId, conn.calendar_email, conn.sync_cursor);
  }

  return { syncedCount: count };
}

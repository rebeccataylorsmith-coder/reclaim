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
  console.log(`[sync] Starting calendar sync for user ${userId}`);

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

  console.log(`[sync] Found ${connections.length} enabled connection(s) for user ${userId}`);

  let totalSynced = 0;
  const errors: string[] = [];

  for (const conn of connections) {
    try {
      console.log(`[sync] Syncing connection ${conn.id} (${conn.provider}/${conn.calendar_email})`);
      if (conn.provider === "google") {
        const count = await syncGoogleConnection(db, conn.id, userId, conn.calendar_email, conn.sync_cursor);
        console.log(`[sync] Connection ${conn.id} synced ${count} events`);
        totalSynced += count;
      }
      // Microsoft sync not yet implemented — skip
    } catch (err: any) {
      console.error(`[sync] Error syncing connection ${conn.id}: ${err.message}`);
      errors.push(`Sync error for ${conn.provider}/${conn.calendar_email}: ${err.message}`);
    }
  }

  console.log(`[sync] Sync complete for user ${userId}: ${totalSynced} events across ${connections.length} connection(s), ${errors.length} error(s)`);
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
  let token: string;
  try {
    token = await ensureFreshToken(db, connectionId);
  } catch (err) {
    console.error(`[sync] Token refresh failed for connection ${connectionId}: ${(err as Error).message}`);
    throw new Error(`Token refresh failed: ${(err as Error).message}`);
  }

  // Time range: ±7 days from today (narrow window for performance & relevance)
  const now = new Date();
  const timeMin = new Date(now.getTime() - 7 * 86400000).toISOString();
  const timeMax = new Date(now.getTime() + 7 * 86400000).toISOString();

  console.log(`[sync] Fetching events for ${calendarEmail} from ${timeMin.slice(0, 10)} to ${timeMax.slice(0, 10)}${syncCursor ? " (incremental)" : ""}`);

  let allEvents: GoogleCalendarEvent[] = [];
  let nextSyncToken: string | undefined;
  let pageToken: string | undefined;
  let currentSyncCursor = syncCursor ?? undefined;
  let pageCount = 0;

  // Fetch events (paginated)
  do {
    pageCount++;
    const result = await fetchGoogleCalendarEvents(token, "primary", {
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

  console.log(`[sync] Fetched ${allEvents.length} events across ${pageCount} page(s) for ${calendarEmail}`);

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

      if (!startRaw || !endRaw) {
        console.warn(`[sync] Skipping event ${externalId}: missing start/end time`);
        continue;
      }

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

  console.log(`[sync] Upserted ${count} events into DB for connection ${connectionId}`);

  // Handle cancellations: if an event was cancelled, mark it as such
  // Google's incremental sync returns cancelled events with status='cancelled' -
  // they're already handled by the upsert above

  // Update sync cursor and last_synced_at
  db.query(
    "UPDATE calendar_connections SET sync_cursor = ?, last_synced_at = datetime('now') WHERE id = ?",
  ).run(nextSyncToken || null, connectionId);

  console.log(`[sync] Updated sync_cursor for connection ${connectionId}${nextSyncToken ? "" : " (no new sync token)"}`);
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

/**
 * Google Calendar API client.
 * Uses Bun's built-in fetch for HTTP requests.
 * Handles token refresh and incremental sync via nextSyncToken.
 */

const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  status?: string;
  recurringEventId?: string;
  transparency?: string;
}

export interface SyncResult {
  events: GoogleCalendarEvent[];
  nextSyncToken?: string;
  nextPageToken?: string;
}

/**
 * Refresh an expired Google access token.
 */
export async function refreshGoogleToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("[google] Token refresh failed: Google OAuth credentials not configured");
    throw new Error("Google OAuth credentials not configured");
  }

  console.log("[google] Refreshing access token...");

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[google] Token refresh failed: HTTP ${res.status} — ${text}`);
    throw new Error(`Google token refresh failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  console.log(`[google] Token refreshed successfully, expires in ${data.expires_in}s`);
  return {
    access_token: data.access_token,
    expires_in: data.expires_in,
  };
}

/**
 * Fetch events from Google Calendar for a given time range.
 * Supports incremental sync via syncToken.
 */
export async function fetchGoogleCalendarEvents(
  accessToken: string,
  calendarId: string,
  params: {
    timeMin: string; // ISO-8601
    timeMax: string; // ISO-8601
    syncToken?: string;
    pageToken?: string;
  },
): Promise<SyncResult> {
  const query = new URLSearchParams();

  if (params.syncToken) {
    query.set("syncToken", params.syncToken);
  } else {
    query.set("timeMin", params.timeMin);
    query.set("timeMax", params.timeMax);
    query.set("singleEvents", "true");
    query.set("maxResults", "250");
    query.set("orderBy", "startTime");
  }

  if (params.pageToken) {
    query.set("pageToken", params.pageToken);
  }

  const url = `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${query.toString()}`;

  console.log(`[google] Fetching events for calendar ${calendarId}${params.syncToken ? " (incremental)" : " (full)"}${params.pageToken ? " [page]" : ""}`);

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[google] Calendar API error: HTTP ${res.status} — ${text.slice(0, 500)}`);
    throw new Error(
      `Google Calendar API error: ${res.status} ${text}`,
    );
  }

  const data = (await res.json()) as {
    items?: GoogleCalendarEvent[];
    nextSyncToken?: string;
    nextPageToken?: string;
  };

  const eventCount = data.items?.length ?? 0;
  console.log(`[google] Received ${eventCount} events${data.nextPageToken ? " (more pages)" : ""}${data.nextSyncToken ? " (sync token available)" : ""}`);

  return {
    events: data.items ?? [],
    nextSyncToken: data.nextSyncToken,
    nextPageToken: data.nextPageToken,
  };
}

/**
 * Ensure the access token is fresh. If expired (or expires soon — within 60s),
 * refresh using the refresh token and update the connection record.
 */
export async function ensureFreshToken(
  db: import("bun:sqlite").Database,
  connectionId: string,
): Promise<string> {
  const conn = db
    .query(
      "SELECT access_token, refresh_token, token_expires_at FROM calendar_connections WHERE id = ?",
    )
    .get(connectionId) as {
    access_token: string;
    refresh_token: string | null;
    token_expires_at: string | null;
  } | null;

  if (!conn) {
    console.error(`[google] Connection ${connectionId} not found in DB`);
    throw new Error(`Calendar connection ${connectionId} not found`);
  }

  // Check if token is still valid (with 60s buffer)
  if (conn.token_expires_at) {
    const expiresAt = new Date(conn.token_expires_at).getTime();
    const now = Date.now();
    if (expiresAt > now + 60000) {
      console.log(`[google] Token still valid for connection ${connectionId} (expires ${conn.token_expires_at})`);
      return conn.access_token;
    }
    console.log(`[google] Token expired or expiring soon for connection ${connectionId} (expires ${conn.token_expires_at})`);
  } else {
    console.log(`[google] No token_expires_at for connection ${connectionId}, will attempt refresh if refresh_token available`);
  }

  // Token expired or will expire soon — refresh it
  if (!conn.refresh_token) {
    // No refresh token — can't refresh
    // For now, return current token and hope it still works
    console.warn(`[google] No refresh_token for connection ${connectionId}, returning current (possibly expired) token`);
    return conn.access_token;
  }

  console.log(`[google] Refreshing token for connection ${connectionId}`);
  const tokens = await refreshGoogleToken(conn.refresh_token);

  const expiresAt = new Date(
    Date.now() + tokens.expires_in * 1000,
  ).toISOString();

  db.query(
    "UPDATE calendar_connections SET access_token = ?, token_expires_at = ? WHERE id = ?",
  ).run(tokens.access_token, expiresAt, connectionId);

  console.log(`[google] Token updated in DB for connection ${connectionId}, new expiry: ${expiresAt}`);
  return tokens.access_token;
}

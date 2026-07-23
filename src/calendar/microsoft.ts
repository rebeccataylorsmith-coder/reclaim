/**
 * Microsoft Graph calendar API client.
 * Uses Bun's built-in fetch for HTTP requests.
 * Handles token refresh and incremental sync via @odata.deltaLink.
 */

const MS_GRAPH_API = "https://graph.microsoft.com/v1.0";
const MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

export interface MicrosoftCalendarEvent {
  id: string;
  subject?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  isAllDay?: boolean;
  showAs?: string;
  seriesMasterId?: string;
}

export interface SyncResult {
  events: MicrosoftCalendarEvent[];
  nextDeltaLink?: string;
  nextPageLink?: string;
}

/**
 * Refresh an expired Microsoft access token.
 */
export async function refreshMicrosoftToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
  scope?: string;
}> {
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("[ms] Token refresh failed: Microsoft OAuth credentials not configured");
    throw new Error("Microsoft OAuth credentials not configured");
  }

  console.log("[ms] Refreshing access token...");

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    // Request the calendar scope again to ensure refreshed token has it
    scope: "Calendars.Read offline_access",
  });

  const res = await fetch(MS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[ms] Token refresh failed: HTTP ${res.status} — ${text}`);
    throw new Error(`Microsoft token refresh failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
    scope?: string;
  };

  console.log(`[ms] Token refreshed successfully, expires in ${data.expires_in}s, scope: ${data.scope || "not returned"}`);
  return {
    access_token: data.access_token,
    expires_in: data.expires_in,
    scope: data.scope,
  };
}

/**
 * Fetch events from Microsoft Graph calendar endpoint.
 * Uses /me/calendar/events with $top, $skip, and supports
 * pagination via @odata.nextLink and delta sync via @odata.deltaLink.
 */
export async function fetchMicrosoftCalendarEvents(
  accessToken: string,
  params: {
    deltaLink?: string;
    pageLink?: string;
    startDateTime?: string;
    endDateTime?: string;
  },
): Promise<SyncResult> {
  let url: string;

  if (params.deltaLink) {
    // Delta sync: use the deltaLink as-is
    url = params.deltaLink;
    console.log("[ms] Fetching events via delta sync...");
  } else if (params.pageLink) {
    // Pagination: use the nextLink as-is
    url = params.pageLink;
    console.log("[ms] Fetching next page of events...");
  } else {
    // Fresh fetch: build the URL with filters
    const baseUrl = `${MS_GRAPH_API}/me/events`;
    const query = new URLSearchParams();

    query.set("$top", "250");
    query.set("$orderby", "start/dateTime");
    query.set("$select", "id,subject,start,end,isAllDay,showAs,seriesMasterId");

    // Filter by time range if provided
    if (params.startDateTime && params.endDateTime) {
      query.set(
        "$filter",
        `start/dateTime ge '${params.startDateTime}' and start/dateTime le '${params.endDateTime}'`,
      );
    }

    url = `${baseUrl}?${query.toString()}`;
    console.log(`[ms] Fetching events (full sync)${params.startDateTime ? ` from ${params.startDateTime.slice(0, 10)} to ${params.endDateTime?.slice(0, 10)}` : ""}`);
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      Prefer: 'outlook.timezone="UTC"',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch {}
    console.error(`[ms] Graph API error: HTTP ${res.status}`);
    console.error(`[ms] Full response body:`, text);
    const reason = parsed?.error?.message || parsed?.error?.code || text;
    throw new Error(
      `Microsoft Graph API error: ${res.status} — ${reason}. ` +
      `This usually means the token lacks the Calendars.Read scope. ` +
      `Try re-connecting your calendar from Settings.`,
    );
  }

  const data = (await res.json()) as {
    value?: MicrosoftCalendarEvent[];
    "@odata.nextLink"?: string;
    "@odata.deltaLink"?: string;
  };

  const eventCount = data.value?.length ?? 0;
  console.log(
    `[ms] Received ${eventCount} events` +
    `${data["@odata.nextLink"] ? " (more pages)" : ""}` +
    `${data["@odata.deltaLink"] ? " (delta link available)" : ""}`,
  );

  return {
    events: data.value ?? [],
    nextPageLink: data["@odata.nextLink"],
    nextDeltaLink: data["@odata.deltaLink"],
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
      "SELECT access_token, refresh_token, token_expires_at, token_scope FROM calendar_connections WHERE id = ?",
    )
    .get(connectionId) as {
    access_token: string;
    refresh_token: string | null;
    token_expires_at: string | null;
    token_scope: string | null;
  } | null;

  if (!conn) {
    console.error(`[ms] Connection ${connectionId} not found in DB`);
    throw new Error(`Calendar connection ${connectionId} not found`);
  }

  // Check if token is still valid (with 60s buffer)
  if (conn.token_expires_at) {
    const expiresAt = new Date(conn.token_expires_at).getTime();
    const now = Date.now();
    if (expiresAt > now + 60000) {
      // Warn if stored scope doesn't include calendar access
      if (conn.token_scope && !conn.token_scope.includes("Calendars.Read")) {
        console.warn(
          `[ms] Token for connection ${connectionId} is valid but missing calendar scope! ` +
          `Stored scope: "${conn.token_scope}". The user should re-connect their calendar from Settings.`
        );
      }
      console.log(`[ms] Token still valid for connection ${connectionId} (expires ${conn.token_expires_at})`);
      return conn.access_token;
    }
    console.log(`[ms] Token expired or expiring soon for connection ${connectionId} (expires ${conn.token_expires_at})`);
  } else {
    console.log(`[ms] No token_expires_at for connection ${connectionId}, will attempt refresh if refresh_token available`);
  }

  // Token expired or will expire soon — refresh it
  if (!conn.refresh_token) {
    console.warn(`[ms] No refresh_token for connection ${connectionId}, returning current (possibly expired) token`);
    return conn.access_token;
  }

  console.log(`[ms] Refreshing token for connection ${connectionId}`);
  const tokens = await refreshMicrosoftToken(conn.refresh_token);

  const expiresAt = new Date(
    Date.now() + tokens.expires_in * 1000,
  ).toISOString();

  db.query(
    "UPDATE calendar_connections SET access_token = ?, token_expires_at = ?, token_scope = COALESCE(?, token_scope) WHERE id = ?",
  ).run(tokens.access_token, expiresAt, tokens.scope || null, connectionId);

  console.log(`[ms] Token updated in DB for connection ${connectionId}, new expiry: ${expiresAt}`);
  return tokens.access_token;
}

/**
 * Fetch calendar metadata from Microsoft Graph API.
 * The /me/calendar endpoint returns the calendar's timezone setting
 * via the owner's mailbox settings in the canEdit/canView properties,
 * or we can use /me/mailboxSettings to get the timeZone.
 */
export async function fetchMicrosoftCalendarMetadata(
  accessToken: string,
): Promise<{ timeZone: string | null }> {
  console.log("[ms] Fetching calendar metadata (mailbox settings)...");

  try {
    const res = await fetch(`${MS_GRAPH_API}/me/mailboxSettings`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.warn(`[ms] Mailbox settings fetch failed: HTTP ${res.status} — ${text}`);
      return { timeZone: null };
    }

    const data = (await res.json()) as { timeZone?: string };
    console.log(`[ms] Mailbox timeZone: ${data.timeZone || "not set"}`);
    return { timeZone: data.timeZone ?? null };
  } catch (err) {
    console.warn(`[ms] Could not fetch calendar metadata: ${(err as Error).message}`);
    return { timeZone: null };
  }
}

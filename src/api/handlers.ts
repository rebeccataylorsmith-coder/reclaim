import { getDb } from "../db/sqlite";
import {
  getAllExercises,
  getRandomExercise,
  getAllQuotes,
  getRandomQuote,
} from "../db/schema";
import {
  createSession,
  validateSession,
  destroySession,
  getSessionCookie,
  getClearCookie,
  getSessionTokenFromRequest,
  getUserFromRequest,
} from "../auth/session";
import {
  getGoogleAuthURL,
  getMicrosoftAuthURL,
  decodeState,
  exchangeGoogleCode,
  getGoogleUserInfo,
  exchangeMicrosoftCode,
  getMicrosoftUserInfo,
} from "../auth/oauth";
import { syncUserCalendars } from "../calendar/sync";
import {
  generateSuggestions,
  getSuggestionById,
  startBreak,
  completeBreak,
} from "../engine/suggestion-generator";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function redirect(url: string, status = 302): Response {
  return new Response(null, { status, headers: { Location: url } });
}

// ─── Auth helpers ───

function requireUser(req: Request): { user: ReturnType<typeof getUserFromRequest>; error?: Response } {
  const user = getUserFromRequest(req);
  if (!user) {
    return { user: null, error: json({ error: "Unauthorized" }, 401) };
  }
  return { user };
}

function getUserPlan(db: ReturnType<typeof getDb>, userId: string): string {
  const row = db.query("SELECT plan FROM users WHERE id = ?").get(userId) as { plan: string } | null;
  return row?.plan ?? "free";
}

// ─── Main handler ───

export async function handleApiRequest(req: Request): Promise<Response | null> {
  const url = new URL(req.url);

  // ═══════════════════════════════════════════
  // AUTH ENDPOINTS
  // ═══════════════════════════════════════════

  // POST /api/auth/register
  if (url.pathname === "/api/auth/register" && req.method === "POST") {
    try {
      const body = await req.json() as { email?: string; password?: string; displayName?: string };
      if (!body.email || !body.password) {
        return json({ error: "Email and password are required" }, 400);
      }
      if (body.password.length < 8) {
        return json({ error: "Password must be at least 8 characters" }, 400);
      }

      const db = getDb();

      const existing = db.query("SELECT id FROM users WHERE email = ?").get(body.email.toLowerCase());
      if (existing) {
        return json({ error: "Email already registered" }, 409);
      }

      const userId = crypto.randomUUID();
      const passwordHash = await Bun.password.hash(body.password);

      db.query(
        `INSERT INTO users (id, email, display_name, password_hash)
         VALUES (?, ?, ?, ?)`
      ).run(userId, body.email.toLowerCase(), body.displayName || null, passwordHash);

      const session = createSession(db, userId);

      const response = json({
        user: {
          id: userId,
          email: body.email.toLowerCase(),
          displayName: body.displayName || null,
        },
      });
      response.headers.set("Set-Cookie", getSessionCookie(session.token));
      return response;
    } catch (err) {
      return json({ error: "Registration failed" }, 500);
    }
  }

  // POST /api/auth/login
  if (url.pathname === "/api/auth/login" && req.method === "POST") {
    try {
      const body = await req.json() as { email?: string; password?: string };
      if (!body.email || !body.password) {
        return json({ error: "Email and password are required" }, 400);
      }

      const db = getDb();
      const user = db.query(
        "SELECT id, email, display_name, password_hash FROM users WHERE email = ?"
      ).get(body.email.toLowerCase()) as {
        id: string; email: string; display_name: string | null; password_hash: string | null;
      } | null;

      if (!user || !user.password_hash) {
        return json({ error: "Invalid email or password" }, 401);
      }

      const valid = await Bun.password.verify(body.password, user.password_hash);
      if (!valid) {
        return json({ error: "Invalid email or password" }, 401);
      }

      const session = createSession(db, user.id);

      const response = json({
        user: {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
        },
      });
      response.headers.set("Set-Cookie", getSessionCookie(session.token));
      return response;
    } catch (err) {
      return json({ error: "Login failed" }, 500);
    }
  }

  // POST /api/auth/logout
  if (url.pathname === "/api/auth/logout" && req.method === "POST") {
    const token = getSessionTokenFromRequest(req);
    if (token) destroySession(token);
    const response = json({ ok: true });
    response.headers.set("Set-Cookie", getClearCookie());
    return response;
  }

  // GET /api/auth/me
  if (url.pathname === "/api/auth/me" && req.method === "GET") {
    const { user, error } = requireUser(req);
    if (error) return error;

    const db = getDb();
    const connections = db.query(
      "SELECT id, provider, calendar_email, sync_enabled, last_synced_at, timezone FROM calendar_connections WHERE user_id = ?"
    ).all(user.id) as Array<{
      id: string; provider: string; calendar_email: string;
      sync_enabled: number; last_synced_at: string | null; timezone: string | null;
    }>;

    const fullUser = db.query(
      "SELECT * FROM users WHERE id = ?"
    ).get(user.id) as any;

    return json({
      user: {
        id: fullUser.id,
        email: fullUser.email,
        displayName: fullUser.display_name,
        oauthProvider: fullUser.oauth_provider,
        avatarUrl: fullUser.avatar_url,
        plan: fullUser.plan || "free",
        preferences: {
          prepBufferMin: fullUser.prep_buffer_min,
          followUpBufferMin: fullUser.follow_up_buffer_min,
          defaultBreakDurationMin: fullUser.default_break_duration_min,
          deepWorkThresholdMin: fullUser.deep_work_threshold_min,
          maxBreaksPerDay: fullUser.max_breaks_per_day,
          workingHoursStart: fullUser.working_hours_start,
          workingHoursEnd: fullUser.working_hours_end,
          preferredBreakTypes: fullUser.preferred_break_types,
        },
        connectedCalendars: connections.map((c) => ({
          id: c.id,
          provider: c.provider,
          calendarEmail: c.calendar_email,
          syncEnabled: c.sync_enabled === 1,
          lastSyncedAt: c.last_synced_at,
          timezone: c.timezone,
        })),
      },
    });
  }

  // GET /api/auth/oauth/google — login-only OAuth (no calendar scope)
  if (url.pathname === "/api/auth/oauth/google" && req.method === "GET") {
    try {
      const authURL = getGoogleAuthURL({ purpose: "login", provider: "google" });
      return redirect(authURL);
    } catch (err) {
      return json({ error: "OAuth configuration error" }, 500);
    }
  }

  // GET /api/auth/oauth/microsoft — login-only Microsoft OAuth
  if (url.pathname === "/api/auth/oauth/microsoft" && req.method === "GET") {
    try {
      const authURL = getMicrosoftAuthURL({ purpose: "login", provider: "microsoft" });
      return redirect(authURL);
    } catch (err) {
      return json({ error: "OAuth configuration error" }, 500);
    }
  }

  // GET /api/auth/oauth/callback — handle OAuth callback for BOTH providers and BOTH purposes
  if (url.pathname === "/api/auth/oauth/callback" && req.method === "GET") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state") || "";
    const error = url.searchParams.get("error");

    if (error) {
      return redirect("/auth/login?error=oauth_denied");
    }

    if (!code) {
      return redirect("/auth/login?error=missing_code");
    }

    const decoded = state ? decodeState(state) : { purpose: "login" as const, provider: "google" as const };
    const { purpose, provider } = decoded;

    try {
      let userEmail: string;
      let userName: string;
      let userAvatar: string | null = null;
      let oauthSubject: string;
      let accessToken: string;
      let refreshToken: string | null;
      let expiresIn: number;
      let grantedScope: string;

      if (provider === "microsoft") {
        const tokens = await exchangeMicrosoftCode(code);
        const msUser = await getMicrosoftUserInfo(tokens.access_token);
        userEmail = msUser.mail || msUser.userPrincipalName;
        userName = msUser.displayName;
        oauthSubject = msUser.id;
        accessToken = tokens.access_token;
        refreshToken = tokens.refresh_token;
        expiresIn = tokens.expires_in;
        grantedScope = tokens.scope || "";
      } else {
        const tokens = await exchangeGoogleCode(code);
        const googleUser = await getGoogleUserInfo(tokens.access_token);
        userEmail = googleUser.email;
        userName = googleUser.name;
        oauthSubject = googleUser.id;
        userAvatar = googleUser.picture;
        accessToken = tokens.access_token;
        refreshToken = tokens.refresh_token;
        expiresIn = tokens.expires_in;
        grantedScope = tokens.scope || "";
      }

      const db = getDb();

      // ── CALENDAR CONNECTION FLOW ──
      if (purpose === "connect_calendar") {
        // Must be authenticated
        const sessionUser = getUserFromRequest(req);
        if (!sessionUser) {
          return redirect("/auth/login?error=not_authenticated");
        }

        // Verify the token actually has calendar scope
        const scopeCheck = provider === "microsoft"
          ? "Calendars.Read"
          : "calendar.readonly";
        const hasCalendarScope = grantedScope.includes(scopeCheck);
        if (!hasCalendarScope) {
          console.error(`[oauth] Calendar connection missing ${provider} calendar scope. Granted: "${grantedScope}"`);
          return redirect("/settings?error=missing_calendar_scope");
        }

        const expiresAt = expiresIn
          ? new Date(Date.now() + expiresIn * 1000).toISOString()
          : null;

        // Check if connection already exists for this user + provider + email
        const existingConn = db.query(
          "SELECT id FROM calendar_connections WHERE user_id = ? AND provider = ? AND calendar_email = ?"
        ).get(sessionUser.id, provider, userEmail);

        if (existingConn) {
          db.query(
            `UPDATE calendar_connections
             SET access_token = ?, refresh_token = COALESCE(?, refresh_token),
                 token_expires_at = ?, token_scope = ?, last_synced_at = NULL
             WHERE id = ?`
          ).run(accessToken, refreshToken, expiresAt, grantedScope, (existingConn as any).id);
        } else {
          // Free tier: 1 calendar connection max
          const plan = getUserPlan(db, sessionUser.id);
          if (plan === "free") {
            const connCount = db.query(
              "SELECT COUNT(*) as c FROM calendar_connections WHERE user_id = ?"
            ).get(sessionUser.id) as { c: number };
            if (connCount.c >= 1) {
              return redirect("/settings?error=free_calendar_limit");
            }
          }

          db.query(
            `INSERT INTO calendar_connections (id, user_id, provider, calendar_email, access_token, refresh_token, token_expires_at, token_scope)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(crypto.randomUUID(), sessionUser.id, provider, userEmail, accessToken, refreshToken, expiresAt, grantedScope);
        }

        return redirect(`/settings?connected=${provider}`);
      }

      // ── LOGIN FLOW ──
      if (purpose === "login") {
        // Find or create user — NO auto calendar connection
        let user = db.query(
          "SELECT id, email, display_name, oauth_provider, oauth_subject, avatar_url FROM users WHERE oauth_subject = ? AND oauth_provider = ?"
        ).get(oauthSubject, provider) as any;

        if (!user) {
          const emailUser = db.query(
            "SELECT id FROM users WHERE email = ?"
          ).get(userEmail);

          if (emailUser) {
            db.query(
              "UPDATE users SET oauth_provider = ?, oauth_subject = ?, avatar_url = COALESCE(avatar_url, ?), updated_at = datetime('now') WHERE id = ?"
            ).run(provider, oauthSubject, userAvatar, (emailUser as any).id);
            user = { id: (emailUser as any).id, email: userEmail, display_name: userName, oauth_provider: provider, oauth_subject: oauthSubject, avatar_url: userAvatar };
          } else {
            const userId = crypto.randomUUID();
            db.query(
              `INSERT INTO users (id, email, display_name, oauth_provider, oauth_subject, avatar_url)
               VALUES (?, ?, ?, ?, ?, ?)`
            ).run(userId, userEmail, userName, provider, oauthSubject, userAvatar);
            user = { id: userId, email: userEmail, display_name: userName, oauth_provider: provider, oauth_subject: oauthSubject, avatar_url: userAvatar };
          }
        } else {
          // Update avatar on each login
          if (userAvatar) {
            db.query(
              "UPDATE users SET avatar_url = ?, updated_at = datetime('now') WHERE id = ?"
            ).run(userAvatar, user.id);
          }
        }

        // Create session (login)
        const session = createSession(db, user.id);

        const response = redirect("/dashboard");
        response.headers.set("Set-Cookie", getSessionCookie(session.token));
        return response;
      }

    } catch (err: any) {
      console.error("OAuth callback error:", err);
      return redirect("/auth/login?error=oauth_failed");
    }
  }

  // ═══════════════════════════════════════════
  // SETTINGS ENDPOINTS (require auth)
  // ═══════════════════════════════════════════

  // GET /api/settings
  if (url.pathname === "/api/settings" && req.method === "GET") {
    const { user, error } = requireUser(req);
    if (error) return error;

    const db = getDb();
    const fullUser = db.query(
      "SELECT * FROM users WHERE id = ?"
    ).get(user.id) as any;

    return json({
      prepBufferMin: fullUser.prep_buffer_min,
      followUpBufferMin: fullUser.follow_up_buffer_min,
      defaultBreakDurationMin: fullUser.default_break_duration_min,
      deepWorkThresholdMin: fullUser.deep_work_threshold_min,
      maxBreaksPerDay: fullUser.max_breaks_per_day,
      workingHoursStart: fullUser.working_hours_start,
      workingHoursEnd: fullUser.working_hours_end,
      preferredBreakTypes: fullUser.preferred_break_types,
    });
  }

  // PUT /api/settings
  if (url.pathname === "/api/settings" && req.method === "PUT") {
    const { user, error } = requireUser(req);
    if (error) return error;

    const body = await req.json() as Record<string, unknown>;
    const db = getDb();

    const allowedFields: Record<string, string> = {
      prepBufferMin: "prep_buffer_min",
      followUpBufferMin: "follow_up_buffer_min",
      defaultBreakDurationMin: "default_break_duration_min",
      deepWorkThresholdMin: "deep_work_threshold_min",
      maxBreaksPerDay: "max_breaks_per_day",
      workingHoursStart: "working_hours_start",
      workingHoursEnd: "working_hours_end",
      preferredBreakTypes: "preferred_break_types",
    };

    const updates: string[] = [];
    const values: unknown[] = [];

    for (const [key, col] of Object.entries(allowedFields)) {
      if (key in body && body[key] !== undefined) {
        updates.push(`${col} = ?`);
        values.push(body[key]);
      }
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      values.push(user.id);
      db.query(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    }

    return json({ ok: true });
  }

  // ═══════════════════════════════════════════
  // CALENDAR CONNECTIONS (require auth)
  // ═══════════════════════════════════════════

  // GET /api/calendar/oauth/google — start calendar-only OAuth flow (requires auth)
  if (url.pathname === "/api/calendar/oauth/google" && req.method === "GET") {
    const { user, error } = requireUser(req);
    if (error) return error;

    try {
      const authURL = getGoogleAuthURL({ purpose: "connect_calendar", provider: "google" });
      return redirect(authURL);
    } catch (err) {
      return json({ error: "OAuth configuration error" }, 500);
    }
  }

  // GET /api/calendar/oauth/microsoft — start Microsoft calendar-only OAuth flow (requires auth)
  if (url.pathname === "/api/calendar/oauth/microsoft" && req.method === "GET") {
    const { user, error } = requireUser(req);
    if (error) return error;

    try {
      const authURL = getMicrosoftAuthURL({ purpose: "connect_calendar", provider: "microsoft" });
      return redirect(authURL);
    } catch (err) {
      return json({ error: "OAuth configuration error" }, 500);
    }
  }

  // GET /api/calendar/connections
  if (url.pathname === "/api/calendar/connections" && req.method === "GET") {
    const { user, error } = requireUser(req);
    if (error) return error;

    const db = getDb();
    const connections = db.query(
      "SELECT id, provider, calendar_email, sync_enabled, last_synced_at, timezone FROM calendar_connections WHERE user_id = ?"
    ).all(user.id) as Array<{
      id: string; provider: string; calendar_email: string;
      sync_enabled: number; last_synced_at: string | null; timezone: string | null;
    }>;

    return json(connections.map((c) => ({
      id: c.id,
      provider: c.provider,
      calendarEmail: c.calendar_email,
      syncEnabled: c.sync_enabled === 1,
      lastSyncedAt: c.last_synced_at,
      timezone: c.timezone,
    })));
  }

  // DELETE /api/calendar/connections/:id
  if (url.pathname.startsWith("/api/calendar/connections/") && req.method === "DELETE") {
    const { user, error } = requireUser(req);
    if (error) return error;

    const connectionId = url.pathname.split("/").pop()!;
    const db = getDb();
    db.query(
      "DELETE FROM calendar_connections WHERE id = ? AND user_id = ?"
    ).run(connectionId, user.id);

    return json({ ok: true });
  }

  // PUT /api/calendar/connections/:id/toggle-sync
  if (url.pathname.match(/^\/api\/calendar\/connections\/[^/]+\/toggle-sync$/) && req.method === "PUT") {
    const { user, error } = requireUser(req);
    if (error) return error;

    const parts = url.pathname.split("/");
    const connectionId = parts[parts.length - 2];

    const db = getDb();
    const conn = db.query(
      "SELECT sync_enabled FROM calendar_connections WHERE id = ? AND user_id = ?"
    ).get(connectionId, user.id) as { sync_enabled: number } | null;

    if (!conn) {
      return json({ error: "Connection not found" }, 404);
    }

    const newState = conn.sync_enabled === 1 ? 0 : 1;
    db.query(
      "UPDATE calendar_connections SET sync_enabled = ? WHERE id = ? AND user_id = ?"
    ).run(newState, connectionId, user.id);

    return json({ syncEnabled: newState === 1 });
  }

  // POST /api/calendar/connections/:id/sync
  if (url.pathname.match(/^\/api\/calendar\/connections\/[^/]+\/sync$/) && req.method === "POST") {
    const { user, error } = requireUser(req);
    if (error) return error;

    try {
      console.log(`[api] Manual sync requested for user ${user.id}`);
      const db = getDb();
      const result = await syncUserCalendars(db, user.id);
      console.log(`[api] Manual sync result: ${result.syncedCount} events, ${result.errors.length} errors`);
      return json({
        syncedCount: result.syncedCount,
        lastSyncedAt: new Date().toISOString(),
        errors: result.errors.length > 0 ? result.errors : undefined,
      });
    } catch (err: any) {
      console.error(`[api] Manual sync failed: ${err.message}`);
      return json({ error: err.message || "Sync failed" }, 500);
    }
  }

  // GET /api/calendar/events
  if (url.pathname === "/api/calendar/events" && req.method === "GET") {
    const { user, error } = requireUser(req);
    if (error) return error;

    const date = url.searchParams.get("date");
    const days = parseInt(url.searchParams.get("days") || "1", 10);

    const db = getDb();
    let events: Array<any>;

    if (date) {
      events = db.query(
        "SELECT id, title, start_time, end_time, status, is_all_day FROM calendar_events WHERE user_id = ? AND date(start_time) = ? ORDER BY start_time"
      ).all(user.id, date) as Array<any>;
    } else {
      events = db.query(
        "SELECT id, title, start_time, end_time, status, is_all_day FROM calendar_events WHERE user_id = ? ORDER BY start_time"
      ).all(user.id) as Array<any>;
    }

    return json(events.map((e: any) => ({
      id: e.id,
      title: e.title,
      startTime: e.start_time,
      endTime: e.end_time,
      status: e.status,
      isAllDay: e.is_all_day === 1,
    })));
  }

  // ═══════════════════════════════════════════
  // BREAK ENGINE ENDPOINTS (require auth)
  // ═══════════════════════════════════════════

  // GET /api/breaks/suggestions?date=YYYY-MM-DD
  if (url.pathname === "/api/breaks/suggestions" && req.method === "GET") {
    const { user, error } = requireUser(req);
    if (error) return error;

    const date = url.searchParams.get("date");
    if (!date) {
      return json({ error: "date parameter required (YYYY-MM-DD)" }, 400);
    }

    try {
      console.log(`[api] Suggestions requested for user ${user.id} on ${date}`);
      const db = getDb();
      const syncResult = await syncUserCalendars(db, user.id);
      console.log(`[api] Sync before suggestions: ${syncResult.syncedCount} events synced`);
      const result = generateSuggestions(db, user.id, date);
      console.log(`[api] Generated ${result.suggestions.length} suggestions, ${result.stats.totalGapsFound} gaps found`);
      return json(result);
    } catch (err: any) {
      console.error(`[api] Suggestions failed: ${err.message}`);
      return json({ error: err.message || "Failed to generate suggestions" }, 500);
    }
  }

  // GET /api/breaks/suggestions/week?start=YYYY-MM-DD
  if (url.pathname === "/api/breaks/suggestions/week" && req.method === "GET") {
    const { user, error } = requireUser(req);
    if (error) return error;

    const startDate = url.searchParams.get("start");
    if (!startDate) {
      return json({ error: "start parameter required (YYYY-MM-DD)" }, 400);
    }

    try {
      const db = getDb();
      await syncUserCalendars(db, user.id);

      const results: Array<ReturnType<typeof generateSuggestions>> = [];
      const start = new Date(startDate + "T00:00:00");

      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().slice(0, 10);
        const dayResult = generateSuggestions(db, user.id, dateStr);
        results.push(dayResult);
      }

      return json({ weekStart: startDate, days: results });
    } catch (err: any) {
      return json({ error: err.message || "Failed to generate week suggestions" }, 500);
    }
  }

  // POST /api/breaks/suggestions/:id/accept
  if (url.pathname.match(/^\/api\/breaks\/suggestions\/[^/]+\/accept$/) && req.method === "POST") {
    const { user, error } = requireUser(req);
    if (error) return error;

    const parts = url.pathname.split("/");
    const suggestionId = parts[parts.length - 2];

    try {
      const db = getDb();
      const suggestion = getSuggestionById(db, suggestionId, user.id);
      if (!suggestion) {
        return json({ error: "Suggestion not found" }, 404);
      }

      db.query(
        "UPDATE break_suggestions SET status = 'accepted' WHERE id = ? AND user_id = ?",
      ).run(suggestionId, user.id);

      return json({
        suggestion: {
          id: suggestion.id,
          status: "accepted",
        },
      });
    } catch (err: any) {
      return json({ error: err.message }, 500);
    }
  }

  // POST /api/breaks/suggestions/:id/start
  if (url.pathname.match(/^\/api\/breaks\/suggestions\/[^/]+\/start$/) && req.method === "POST") {
    const { user, error } = requireUser(req);
    if (error) return error;

    const parts = url.pathname.split("/");
    const suggestionId = parts[parts.length - 2];

    try {
      const db = getDb();
      const result = startBreak(db, suggestionId, user.id);
      return json(result);
    } catch (err: any) {
      return json({ error: err.message }, 500);
    }
  }

  // POST /api/breaks/suggestions/:id/skip
  if (url.pathname.match(/^\/api\/breaks\/suggestions\/[^/]+\/skip$/) && req.method === "POST") {
    const { user, error } = requireUser(req);
    if (error) return error;

    const parts = url.pathname.split("/");
    const suggestionId = parts[parts.length - 2];

    try {
      const db = getDb();
      const suggestion = getSuggestionById(db, suggestionId, user.id);
      if (!suggestion) {
        return json({ error: "Suggestion not found" }, 404);
      }

      db.query(
        "UPDATE break_suggestions SET status = 'skipped' WHERE id = ? AND user_id = ?",
      ).run(suggestionId, user.id);

      return json({
        suggestion: {
          id: suggestion.id,
          status: "skipped",
        },
      });
    } catch (err: any) {
      return json({ error: err.message }, 500);
    }
  }

  // POST /api/breaks/completions/:id/complete
  if (url.pathname.match(/^\/api\/breaks\/completions\/[^/]+\/complete$/) && req.method === "POST") {
    const { user, error } = requireUser(req);
    if (error) return error;

    const parts = url.pathname.split("/");
    const completionId = parts[parts.length - 2];

    try {
      let rating: number | undefined;
      if (req.headers.get("content-type")?.includes("application/json")) {
        const body = await req.json() as { rating?: number };
        rating = body.rating;
      }

      const db = getDb();
      const result = completeBreak(db, completionId, user.id, rating);
      return json(result);
    } catch (err: any) {
      return json({ error: err.message }, 500);
    }
  }

  // ═══════════════════════════════════════════
  // ANALYTICS ENDPOINTS (require auth)
  // ═══════════════════════════════════════════

  // GET /api/analytics/streak
  if (url.pathname === "/api/analytics/streak" && req.method === "GET") {
    const { user, error } = requireUser(req);
    if (error) return error;

    const db = getDb();
    const streak = db.query(
      "SELECT current_length, best_length, last_active_date FROM streaks WHERE user_id = ?",
    ).get(user.id) as {
      current_length: number;
      best_length: number;
      last_active_date: string | null;
    } | null;

    return json({
      current: streak?.current_length ?? 0,
      best: streak?.best_length ?? 0,
      lastActiveDate: streak?.last_active_date ?? null,
    });
  }

  // GET /api/analytics/summary?start=YYYY-MM-DD&end=YYYY-MM-DD
  if (url.pathname === "/api/analytics/summary" && req.method === "GET") {
    const { user, error } = requireUser(req);
    if (error) return error;

    const startDate = url.searchParams.get("start") || new Date().toISOString().slice(0, 10);
    const endDate = url.searchParams.get("end") || new Date().toISOString().slice(0, 10);

    const db = getDb();

    const totalRow = db.query(
      `SELECT COUNT(*) as c FROM break_completions
       WHERE user_id = ? AND completed_at IS NOT NULL
       AND date(created_at) >= ? AND date(created_at) <= ?`,
    ).get(user.id, startDate, endDate) as { c: number };

    const days = Math.max(1, Math.ceil(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000
    ) + 1);
    const avgPerDay = Math.round((totalRow.c / days) * 10) / 10;

    const favExercise = db.query(
      `SELECT be.title, COUNT(*) as c FROM break_completions bc
       JOIN breathing_exercises be ON bc.breathing_exercise_id = be.id
       WHERE bc.user_id = ? AND bc.completed_at IS NOT NULL
       AND date(bc.created_at) >= ? AND date(bc.created_at) <= ?
       GROUP BY be.title ORDER BY c DESC LIMIT 1`,
    ).get(user.id, startDate, endDate) as { title: string; c: number } | null;

    const dailyBreakdown = db.query(
      `SELECT date(created_at) as day, COUNT(*) as count FROM break_completions
       WHERE user_id = ? AND completed_at IS NOT NULL
       AND date(created_at) >= ? AND date(created_at) <= ?
       GROUP BY day ORDER BY day`,
    ).all(user.id, startDate, endDate) as Array<{ day: string; count: number }>;

    const streak = db.query(
      "SELECT current_length, best_length FROM streaks WHERE user_id = ?",
    ).get(user.id) as { current_length: number; best_length: number } | null;

    const suggestionsRow = db.query(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN status = 'accepted' OR status = 'completed' THEN 1 ELSE 0 END) as acted
       FROM break_suggestions
       WHERE user_id = ? AND date >= ? AND date <= ?`,
    ).get(user.id, startDate, endDate) as { total: number; acted: number };

    return json({
      period: { start: startDate, end: endDate },
      totalBreaks: totalRow.c,
      avgPerDay,
      favoriteExercise: favExercise?.title ?? null,
      streak: {
        current: streak?.current_length ?? 0,
        best: streak?.best_length ?? 0,
      },
      acceptanceRate: suggestionsRow.total > 0
        ? Math.round((suggestionsRow.acted / suggestionsRow.total) * 100)
        : 0,
      dailyBreakdown,
    });
  }

  // ═══════════════════════════════════════════
  // DEV ENDPOINTS (for testing without real OAuth)
  // ═══════════════════════════════════════════

  // POST /api/dev/seed-calendar
  if (url.pathname === "/api/dev/seed-calendar" && req.method === "POST") {
    const { user, error } = requireUser(req);
    if (error) return error;

    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);

    let connection = db.query(
      "SELECT id FROM calendar_connections WHERE user_id = ? AND provider = 'google' LIMIT 1",
    ).get(user.id) as { id: string } | null;

    if (!connection) {
      const connId = crypto.randomUUID();
      db.query(
        `INSERT INTO calendar_connections (id, user_id, provider, calendar_email, access_token)
         VALUES (?, ?, 'google', 'dev@local', 'dev-token')`,
      ).run(connId, user.id);
      connection = { id: connId };
    }

    const events: Array<{
      id: string;
      title: string;
      start: string;
      end: string;
      isAllDay: boolean;
      status: string;
    }> = [
      { id: "dev-1", title: "Daily Standup", start: "09:00", end: "09:15", isAllDay: false, status: "confirmed" },
      { id: "dev-2", title: "Sprint Planning", start: "09:30", end: "10:30", isAllDay: false, status: "confirmed" },
      { id: "dev-3", title: "Deep Work: Feature Build", start: "11:00", end: "13:00", isAllDay: false, status: "confirmed" },
      { id: "dev-4", title: "Lunch", start: "13:00", end: "13:45", isAllDay: false, status: "confirmed" },
      { id: "dev-5", title: "Design Review", start: "14:00", end: "15:00", isAllDay: false, status: "confirmed" },
      { id: "dev-6", title: "1:1 with Manager", start: "15:30", end: "16:00", isAllDay: false, status: "confirmed" },
      { id: "dev-7", title: "Wrap-up & Planning", start: "16:30", end: "17:00", isAllDay: false, status: "confirmed" },
      { id: "dev-8", title: "Company All-Hands (All Day)", start: "00:00", end: "23:59", isAllDay: true, status: "confirmed" },
      { id: "dev-9", title: "Optional Workshop", start: "11:00", end: "12:00", isAllDay: false, status: "tentative" },
    ];

    db.query(
      "DELETE FROM calendar_events WHERE user_id = ? AND external_id LIKE 'dev-%' AND date(start_time) = ?",
    ).run(user.id, today);

    const insertStmt = db.prepare(`
      INSERT INTO calendar_events (id, user_id, connection_id, external_id, title,
        start_time, end_time, is_all_day, status, recurrence_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(user_id, external_id) DO UPDATE SET
        title = excluded.title,
        start_time = excluded.start_time,
        end_time = excluded.end_time,
        is_all_day = excluded.is_all_day,
        status = excluded.status,
        updated_at = datetime('now')
    `);

    let count = 0;
    const insertMany = db.transaction(() => {
      for (const ev of events) {
        insertStmt.run(
          crypto.randomUUID(),
          user.id,
          connection.id,
          ev.id,
          ev.title,
          `${today}T${ev.start}:00`,
          `${today}T${ev.end}:00`,
          ev.isAllDay ? 1 : 0,
          ev.status,
        );
        count++;
      }
    });
    insertMany();

    return json({
      ok: true,
      message: `Seeded ${count} events for ${today}`,
      date: today,
      events: events.map((e) => ({
        title: e.title,
        start: e.start,
        end: e.end,
        isAllDay: e.isAllDay,
        status: e.status,
      })),
    });
  }

  // ═══════════════════════════════════════════
  // SUBSCRIPTION ENDPOINTS (require auth)
  // ═══════════════════════════════════════════

  // GET /api/subscription
  if (url.pathname === "/api/subscription" && req.method === "GET") {
    const { user, error } = requireUser(req);
    if (error) return error;

    const db = getDb();
    const plan = getUserPlan(db, user.id);
    return json({ plan });
  }

  // PUT /api/subscription/upgrade
  if (url.pathname === "/api/subscription/upgrade" && req.method === "PUT") {
    const { user, error } = requireUser(req);
    if (error) return error;

    const db = getDb();
    db.query("UPDATE users SET plan = 'premium', updated_at = datetime('now') WHERE id = ?").run(user.id);
    return json({ plan: "premium" });
  }

  // ═══════════════════════════════════════════
  // CONTENT ENDPOINTS (public)
  // ═══════════════════════════════════════════

  // GET /api/content/breathing-exercises
  if (url.pathname === "/api/content/breathing-exercises" && req.method === "GET") {
    const db = getDb();
    const exercises = getAllExercises(db);
    // Filter based on user plan
    const planUser = getUserFromRequest(req);
    const plan = planUser ? getUserPlan(db, planUser.id) : "free";
    const filtered = plan === "premium" ? exercises : exercises.filter((e: any) => e.difficulty === "beginner");
    return json(filtered);
  }

  // GET /api/content/breathing-exercises/random
  if (url.pathname === "/api/content/breathing-exercises/random" && req.method === "GET") {
    const maxDuration = url.searchParams.get("maxDuration");
    const parsed = maxDuration ? parseInt(maxDuration, 10) : undefined;
    const db = getDb();
    // For free users, only beginner exercises
    const planUser = getUserFromRequest(req);
    const plan = planUser ? getUserPlan(db, planUser.id) : "free";
    let exercise: any;
    if (plan === "premium") {
      exercise = getRandomExercise(db, parsed && !isNaN(parsed) ? parsed : undefined);
    } else {
      // Free: only beginner exercises
      const durationFilter = parsed && !isNaN(parsed) ? parsed : undefined;
      let query = "SELECT * FROM breathing_exercises WHERE difficulty = 'beginner'";
      const params: any[] = [];
      if (durationFilter) {
        query += " AND duration_seconds <= ?";
        params.push(durationFilter);
      }
      query += " ORDER BY RANDOM() LIMIT 1";
      const rows = db.query(query).all(...params) as any[];
      exercise = rows.length > 0 ? rows[0] : null;
    }
    if (!exercise) {
      return json({ error: "No exercises found" }, 404);
    }
    return json(exercise);
  }

  // GET /api/content/quotes/random
  if (url.pathname === "/api/content/quotes/random" && req.method === "GET") {
    const category = url.searchParams.get("category") ?? undefined;
    const db = getDb();
    const quote = getRandomQuote(db, category);
    if (!quote) {
      return json({ error: "No quotes found" }, 404);
    }
    return json(quote);
  }

  // GET /api/content/quotes
  if (url.pathname === "/api/content/quotes" && req.method === "GET") {
    const category = url.searchParams.get("category") ?? undefined;
    const limitRaw = url.searchParams.get("limit");
    const offsetRaw = url.searchParams.get("offset");
    const limit = limitRaw ? parseInt(limitRaw, 10) : undefined;
    const offset = offsetRaw ? parseInt(offsetRaw, 10) : undefined;
    const db = getDb();
    const quotes = getAllQuotes(db, {
      category,
      limit: limit && !isNaN(limit) ? limit : undefined,
      offset: offset && !isNaN(offset) ? offset : undefined,
    });
    return json(quotes);
  }

  return null; // Not an API route
}

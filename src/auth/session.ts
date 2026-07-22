import { getDb } from "../db/sqlite";
import type { Database } from "bun:sqlite";

export interface SessionUser {
  id: string;
  email: string;
  display_name: string | null;
  oauth_provider: string | null;
  oauth_subject: string | null;
  avatar_url: string | null;
}

export interface Session {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  created_at: string;
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function createSession(db: Database, userId: string): Session {
  const id = crypto.randomUUID();
  const token = generateToken();
  // Sessions valid for 30 days
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  db.query(
    "INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)"
  ).run(id, userId, token, expiresAt);

  return { id, user_id: userId, token, expires_at: expiresAt, created_at: new Date().toISOString() };
}

export function validateSession(token: string): SessionUser | null {
  const db = getDb();
  const row = db.query(
    "SELECT s.*, u.email, u.display_name, u.oauth_provider, u.oauth_subject, u.avatar_url FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > datetime('now')"
  ).get(token) as (Session & SessionUser) | null;

  if (!row) return null;

  return {
    id: row.user_id,
    email: row.email,
    display_name: row.display_name,
    oauth_provider: row.oauth_provider,
    oauth_subject: row.oauth_subject,
    avatar_url: row.avatar_url,
  };
}

export function destroySession(token: string): void {
  const db = getDb();
  db.query("DELETE FROM sessions WHERE token = ?").run(token);
}

export function getSessionCookie(token: string): string {
  return `session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 60 * 60}`;
}

export function getClearCookie(): string {
  return "session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";
}

export function getSessionTokenFromRequest(req: Request): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  const match = cookie.match(/session=([^;]+)/);
  return match ? match[1] : null;
}

export function getUserFromRequest(req: Request): SessionUser | null {
  const token = getSessionTokenFromRequest(req);
  if (!token) return null;
  return validateSession(token);
}

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

const MICROSOFT_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MICROSOFT_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const MICROSOFT_USERINFO_URL = "https://graph.microsoft.com/v1.0/me";

const BASE_URL = process.env.BASE_URL || "https://getreclaim.co";
const REDIRECT_URI = `${BASE_URL}/api/auth/oauth/callback`;

const GOOGLE_LOGIN_SCOPES = ["email", "profile"].join(" ");
const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "email",
  "profile",
].join(" ");

const MICROSOFT_LOGIN_SCOPES = ["User.Read"].join(" ");
const MICROSOFT_CALENDAR_SCOPES = [
  "Calendars.Read",
  "offline_access",
  "User.Read",
].join(" ");

export type OAuthProvider = "google" | "microsoft";
export type OAuthPurpose = "login" | "connect_calendar";

export interface OAuthOptions {
  purpose: OAuthPurpose;
  provider: OAuthProvider;
}

export interface DecodedState {
  purpose: OAuthPurpose;
  provider: OAuthProvider;
}

function encodeState(purpose: OAuthPurpose, provider: OAuthProvider): string {
  return `provider=${provider}&purpose=${purpose}&nonce=${crypto.randomUUID().slice(0, 8)}`;
}

export function decodeState(state: string): DecodedState {
  const params = new URLSearchParams(state);
  const purpose = params.get("purpose") === "connect_calendar" ? "connect_calendar" : "login";
  const provider = params.get("provider") === "microsoft" ? "microsoft" : "google";
  return { purpose, provider };
}

export function getGoogleAuthURL(options: OAuthOptions = { purpose: "login", provider: "google" }): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID not set");

  const scope = options.purpose === "connect_calendar" ? GOOGLE_CALENDAR_SCOPES : GOOGLE_LOGIN_SCOPES;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope,
    access_type: "offline",
    prompt: "consent",
    state: encodeState(options.purpose, "google"),
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export function getMicrosoftAuthURL(options: OAuthOptions = { purpose: "login", provider: "microsoft" }): string {
  const clientId = process.env.MS_CLIENT_ID;
  if (!clientId) throw new Error("MS_CLIENT_ID not set");

  const scope = options.purpose === "connect_calendar" ? MICROSOFT_CALENDAR_SCOPES : MICROSOFT_LOGIN_SCOPES;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope,
    state: encodeState(options.purpose, "microsoft"),
  });

  // Microsoft uses response_mode=query by default (good for us — code comes in query params)
  return `${MICROSOFT_AUTH_URL}?${params.toString()}`;
}

export interface GoogleTokens {
  access_token: string;
  refresh_token: string | null;
  expires_in: number;
  scope: string;
  token_type: string;
}

export async function exchangeGoogleCode(code: string): Promise<GoogleTokens> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth credentials not set");

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI,
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${text}`);
  }

  return res.json() as Promise<GoogleTokens>;
}

export interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture: string;
  verified_email: boolean;
}

export async function getGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Google userinfo failed: ${res.status}`);
  }

  return res.json() as Promise<GoogleUserInfo>;
}

// ── Microsoft OAuth ──

export interface MicrosoftTokens {
  access_token: string;
  refresh_token: string | null;
  expires_in: number;
  scope: string;
  token_type: string;
}

export async function exchangeMicrosoftCode(code: string): Promise<MicrosoftTokens> {
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Microsoft OAuth credentials not set");

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI,
  });

  const res = await fetch(MICROSOFT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Microsoft token exchange failed: ${res.status} ${text}`);
  }

  return res.json() as Promise<MicrosoftTokens>;
}

export interface MicrosoftUserInfo {
  id: string;
  mail: string;
  userPrincipalName: string;
  displayName: string;
}

export async function getMicrosoftUserInfo(accessToken: string): Promise<MicrosoftUserInfo> {
  const res = await fetch(MICROSOFT_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Microsoft userinfo failed: ${res.status}`);
  }

  return res.json() as Promise<MicrosoftUserInfo>;
}

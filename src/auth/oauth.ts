const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

const REDIRECT_URI =
  "https://e0746cfaa6a73d124ecfa16b31664acd.ctonew.app/api/auth/oauth/callback";

const LOGIN_SCOPES = ["email", "profile"].join(" ");
const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "email",
  "profile",
].join(" ");

export type OAuthPurpose = "login" | "connect_calendar";

export interface GoogleAuthOptions {
  purpose: OAuthPurpose;
}

function encodeState(purpose: OAuthPurpose): string {
  return `purpose=${purpose}&nonce=${crypto.randomUUID().slice(0, 8)}`;
}

export function decodeState(state: string): OAuthPurpose {
  const params = new URLSearchParams(state);
  const purpose = params.get("purpose");
  if (purpose === "connect_calendar") return "connect_calendar";
  return "login";
}

export function getGoogleAuthURL(options: GoogleAuthOptions = { purpose: "login" }): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID not set");

  const scope = options.purpose === "connect_calendar" ? CALENDAR_SCOPES : LOGIN_SCOPES;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope,
    access_type: "offline",
    prompt: "consent",
    state: encodeState(options.purpose),
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
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

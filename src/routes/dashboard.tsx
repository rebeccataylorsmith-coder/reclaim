import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => {
        if (res.status === 401) {
          window.location.href = "/auth/login";
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        setUser(data.user);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.href = "/";
  }

  if (loading) {
    return (
      <div className="min-h-dvh bg-stone-50 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const hasCalendar = user?.connectedCalendars?.length > 0;

  return (
    <div className="min-h-dvh bg-gradient-to-b from-stone-50 via-white to-stone-50">
      <div className="mx-auto max-w-5xl px-6 py-12">
        {/* Header */}
        <header className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <a href="/" className="text-2xl font-bold text-gray-900">
              🧘 Reclaim
            </a>
            <span className="text-sm text-gray-400">Dashboard</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/settings" className="text-sm font-medium text-gray-500 hover:text-gray-700">
              Settings
            </a>
            <button
              onClick={handleLogout}
              className="text-sm font-medium text-gray-400 hover:text-gray-600"
            >
              Sign out
            </button>
          </div>
        </header>

        {/* Welcome */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-gray-900">
            Welcome{user?.displayName ? `, ${user.displayName}` : ""} 👋
          </h1>
          <p className="mt-2 text-gray-500">{user?.email}</p>
        </div>

        {/* Status cards */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 mb-10">
          <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200/60 p-6">
            <div className="text-3xl mb-3">📅</div>
            <h3 className="font-semibold text-gray-900">Calendars</h3>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {user?.connectedCalendars?.length || 0}
            </p>
            <p className="text-sm text-gray-500">connected</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200/60 p-6">
            <div className="text-3xl mb-3">🔥</div>
            <h3 className="font-semibold text-gray-900">Streak</h3>
            <p className="mt-1 text-2xl font-bold text-gray-900">0</p>
            <p className="text-sm text-gray-500">days</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200/60 p-6">
            <div className="text-3xl mb-3">🧘</div>
            <h3 className="font-semibold text-gray-900">Breaks Today</h3>
            <p className="mt-1 text-2xl font-bold text-gray-900">0</p>
            <p className="text-sm text-gray-500">completed</p>
          </div>
        </div>

        {/* CTA if no calendar */}
        {!hasCalendar && (
          <div className="bg-gradient-to-br from-emerald-50 via-amber-50 to-sky-50 rounded-2xl shadow-sm ring-1 ring-gray-200/40 p-8 text-center">
            <span className="text-5xl">📅</span>
            <h2 className="mt-4 text-xl font-bold text-gray-900">Connect your calendar to get started</h2>
            <p className="mt-2 text-gray-600 max-w-md mx-auto">
              Reclaim will scan your schedule, find the real gaps, and suggest restorative breaks
              perfectly placed in your day.
            </p>
            <div className="mt-6 flex items-center justify-center gap-4">
              <a
                href="/api/auth/oauth/google"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700 active:scale-[0.98]"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Connect Google Calendar
              </a>
            </div>
          </div>
        )}

        {hasCalendar && (
          <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200/60 p-8 text-center">
            <p className="text-gray-500">Your break suggestions will appear here once your calendar is synced.</p>
          </div>
        )}
      </div>
    </div>
  );
}

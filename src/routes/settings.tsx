import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

interface CalendarConnection {
  id: string;
  provider: string;
  calendarEmail: string;
  syncEnabled: boolean;
  lastSyncedAt: string | null;
}

interface UserPreferences {
  prepBufferMin: number;
  followUpBufferMin: number;
  defaultBreakDurationMin: number;
  deepWorkThresholdMin: number;
  maxBreaksPerDay: number;
  workingHoursStart: string;
  workingHoursEnd: string;
  preferredBreakTypes: string;
}

function SettingsPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [prefs, setPrefs] = useState<UserPreferences>({
    prepBufferMin: 5,
    followUpBufferMin: 10,
    defaultBreakDurationMin: 5,
    deepWorkThresholdMin: 120,
    maxBreaksPerDay: 6,
    workingHoursStart: "08:00",
    workingHoursEnd: "18:00",
    preferredBreakTypes: "breathing,quote",
  });

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
        if (data.user.preferences) {
          setPrefs(data.user.preferences);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);

    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
      credentials: "include",
    });

    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  }

  async function handleDisconnect(id: string) {
    if (!confirm("Disconnect this calendar? Cached events will be removed.")) return;

    await fetch(`/api/calendar/connections/${id}`, {
      method: "DELETE",
      credentials: "include",
    });

    // Refresh
    const res = await fetch("/api/auth/me", { credentials: "include" });
    const data = await res.json();
    setUser(data.user);
  }

  if (loading) {
    return (
      <div className="min-h-dvh bg-stone-50 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-stone-50 via-white to-stone-50">
      <div className="mx-auto max-w-3xl px-6 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <a href="/" className="inline-flex items-center gap-2 text-xl font-bold text-gray-900">
              🧘 Reclaim
            </a>
            <h1 className="mt-2 text-2xl font-bold text-gray-900">Settings</h1>
          </div>
          <a
            href="/dashboard"
            className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
          >
            ← Dashboard
          </a>
        </div>

        {/* Calendar Connections */}
        <section className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200/60 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Connected Calendars</h2>

          {user?.connectedCalendars?.length > 0 ? (
            <div className="space-y-3 mb-6">
              {user.connectedCalendars.map((conn: CalendarConnection) => (
                <div
                  key={conn.id}
                  className="flex items-center justify-between rounded-xl border border-gray-200 p-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">
                      {conn.provider === "google" ? "📅" : "📧"}
                    </span>
                    <div>
                      <p className="font-medium text-gray-900">{conn.calendarEmail}</p>
                      <p className="text-xs text-gray-500">
                        {conn.provider === "google" ? "Google Calendar" : "Microsoft Outlook"}
                        {" · "}
                        {conn.syncEnabled ? (
                          <span className="text-emerald-600">Syncing</span>
                        ) : (
                          <span className="text-gray-400">Paused</span>
                        )}
                        {conn.lastSyncedAt && (
                          <> · Last synced: {new Date(conn.lastSyncedAt).toLocaleDateString()}</>
                        )}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDisconnect(conn.id)}
                    className="text-sm text-red-500 hover:text-red-700 font-medium"
                  >
                    Disconnect
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 mb-4">
              <p className="text-4xl mb-3">📅</p>
              <p className="font-medium">No calendars connected</p>
              <p className="text-sm mt-1">Connect a calendar to get personalized break suggestions</p>
            </div>
          )}

          <a
            href="/api/auth/oauth/google"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 active:scale-[0.98]"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Connect Google Calendar
          </a>
        </section>

        {/* Buffer Preferences */}
        <section className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200/60 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Break Preferences</h2>

          <form onSubmit={handleSave} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Prep buffer (min)
                </label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={prefs.prepBufferMin}
                  onChange={(e) => setPrefs({ ...prefs, prepBufferMin: parseInt(e.target.value) || 0 })}
                  className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition"
                />
                <p className="mt-1 text-xs text-gray-400">Time needed before meetings</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Follow-up buffer (min)
                </label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={prefs.followUpBufferMin}
                  onChange={(e) => setPrefs({ ...prefs, followUpBufferMin: parseInt(e.target.value) || 0 })}
                  className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition"
                />
                <p className="mt-1 text-xs text-gray-400">Wind-down time after meetings</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Default break duration (min)
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={prefs.defaultBreakDurationMin}
                  onChange={(e) => setPrefs({ ...prefs, defaultBreakDurationMin: parseInt(e.target.value) || 5 })}
                  className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Max breaks per day
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={prefs.maxBreaksPerDay}
                  onChange={(e) => setPrefs({ ...prefs, maxBreaksPerDay: parseInt(e.target.value) || 6 })}
                  className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Working hours start
                </label>
                <input
                  type="time"
                  value={prefs.workingHoursStart}
                  onChange={(e) => setPrefs({ ...prefs, workingHoursStart: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Working hours end
                </label>
                <input
                  type="time"
                  value={prefs.workingHoursEnd}
                  onChange={(e) => setPrefs({ ...prefs, workingHoursEnd: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Deep work threshold (min)
                </label>
                <input
                  type="number"
                  min={30}
                  max={480}
                  value={prefs.deepWorkThresholdMin}
                  onChange={(e) => setPrefs({ ...prefs, deepWorkThresholdMin: parseInt(e.target.value) || 120 })}
                  className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition"
                />
                <p className="mt-1 text-xs text-gray-400">Gaps ≥ this are "deep work" — not fragmented</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Preferred break types
                </label>
                <input
                  type="text"
                  value={prefs.preferredBreakTypes}
                  onChange={(e) => setPrefs({ ...prefs, preferredBreakTypes: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition"
                />
                <p className="mt-1 text-xs text-gray-400">Comma-separated: breathing,quote</p>
              </div>
            </div>

            <div className="flex items-center gap-4 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-emerald-600 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save preferences"}
              </button>
              {saved && (
                <span className="text-sm font-medium text-emerald-600">✓ Saved!</span>
              )}
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

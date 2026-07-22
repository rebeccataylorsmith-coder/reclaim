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
  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<Record<string, { count: number; error?: string; timestamp: number }>>({});
  const [showAddMenu, setShowAddMenu] = useState(false);
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

  // Check URL for "connected" param
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("connected") === "google") {
        // Clean the URL
        const url = new URL(window.location.href);
        url.searchParams.delete("connected");
        window.history.replaceState({}, "", url.toString());
      }
    }
  }, []);

  async function loadData() {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.status === 401) {
        window.location.href = "/auth/login";
        return;
      }
      const data = await res.json();
      setUser(data.user);
      if (data.user.preferences) {
        setPrefs(data.user.preferences);
      }
      setConnections(data.user.connectedCalendars || []);
    } catch (err) {
      console.error("Failed to load user data:", err);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
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

    // Refresh connections
    await loadData();
  }

  async function handleToggleSync(id: string) {
    const res = await fetch(`/api/calendar/connections/${id}/toggle-sync`, {
      method: "PUT",
      credentials: "include",
    });
    if (res.ok) {
      await loadData();
    }
  }

  async function handleSyncNow(id: string) {
    setSyncingId(id);
    // Clear old result for this connection
    setSyncResult((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      const res = await fetch(`/api/calendar/connections/${id}/sync`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        setSyncResult((prev) => ({
          ...prev,
          [id]: { count: data.syncedCount || 0, timestamp: Date.now() },
        }));
      } else {
        setSyncResult((prev) => ({
          ...prev,
          [id]: { count: 0, error: data.error || "Sync failed", timestamp: Date.now() },
        }));
      }
      await loadData();
    } catch (err: any) {
      console.error("Sync failed:", err);
      setSyncResult((prev) => ({
        ...prev,
        [id]: { count: 0, error: err.message || "Network error", timestamp: Date.now() },
      }));
    }
    setSyncingId(null);
  }

  function handleConnectGoogle() {
    setShowAddMenu(false);
    window.location.href = "/api/calendar/oauth/google";
  }

  if (loading) {
    return (
      <div className="min-h-dvh bg-stone-50 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const googleConns = connections.filter((c) => c.provider === "google");
  const outlookConns = connections.filter((c) => c.provider === "microsoft");

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
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-gray-900">Connected Calendars</h2>
            <div className="relative">
              <button
                onClick={() => setShowAddMenu(!showAddMenu)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-emerald-200 transition hover:bg-emerald-700 active:scale-[0.98]"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Calendar
              </button>

              {showAddMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowAddMenu(false)}
                  />
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg ring-1 ring-gray-200 z-20 overflow-hidden">
                    <button
                      onClick={handleConnectGoogle}
                      className="flex w-full items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition"
                    >
                      <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                      Google Calendar
                    </button>
                    <button
                      disabled
                      className="flex w-full items-center gap-3 px-4 py-3 text-sm text-gray-400 bg-gray-50 cursor-not-allowed"
                      title="Microsoft Outlook coming soon"
                    >
                      <svg className="h-5 w-5 shrink-0 opacity-40" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M21.43 4.69L12 9.38v5.24l9.43 4.69V4.69zM10.71 9.47L2.57 5.89v12.22l8.14-3.57V9.47z"/>
                      </svg>
                      Outlook Calendar
                      <span className="ml-auto text-[10px] text-gray-300">Soon</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {connections.length > 0 ? (
            <div className="space-y-3">
              {/* Google connections */}
              {googleConns.map((conn) => (
                <CalendarCard
                  key={conn.id}
                  conn={conn}
                  syncResult={syncResult[conn.id]}
                  onDisconnect={handleDisconnect}
                  onToggleSync={handleToggleSync}
                  onSyncNow={handleSyncNow}
                  syncingId={syncingId}
                />
              ))}

              {/* Outlook connections */}
              {outlookConns.map((conn) => (
                <CalendarCard
                  key={conn.id}
                  conn={conn}
                  syncResult={syncResult[conn.id]}
                  onDisconnect={handleDisconnect}
                  onToggleSync={handleToggleSync}
                  onSyncNow={handleSyncNow}
                  syncingId={syncingId}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-gray-500">
              <p className="text-5xl mb-4">📅</p>
              <p className="text-lg font-medium text-gray-700">No calendars connected</p>
              <p className="text-sm mt-1 max-w-sm mx-auto">
                Connect a calendar to get personalized break suggestions based on your actual schedule
              </p>
            </div>
          )}
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

// ── Calendar Connection Card ──

function CalendarCard({
  conn,
  syncResult,
  onDisconnect,
  onToggleSync,
  onSyncNow,
  syncingId,
}: {
  conn: CalendarConnection;
  syncResult?: { count: number; error?: string; timestamp: number };
  onDisconnect: (id: string) => void;
  onToggleSync: (id: string) => void;
  onSyncNow: (id: string) => void;
  syncingId: string | null;
}) {
  const isGoogle = conn.provider === "google";
  const isSyncing = syncingId === conn.id;

  return (
    <div className="rounded-xl border border-gray-200 p-4 hover:border-gray-300 transition">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {/* Provider icon */}
          <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
            isGoogle ? "bg-blue-50" : "bg-sky-50"
          }`}>
            {isGoogle ? (
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21.43 4.69L12 9.38v5.24l9.43 4.69V4.69zM10.71 9.47L2.57 5.89v12.22l8.14-3.57V9.47z"/>
              </svg>
            )}
          </div>

          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">{conn.calendarEmail}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {isGoogle ? "Google Calendar" : "Microsoft Outlook"}
            </p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {/* Sync status badge */}
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium cursor-pointer transition ${
                  conn.syncEnabled
                    ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
                onClick={() => onToggleSync(conn.id)}
                title="Click to toggle sync"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${conn.syncEnabled ? "bg-emerald-500" : "bg-gray-400"}`} />
                {conn.syncEnabled ? "Syncing" : "Paused"}
              </span>

              {/* Last synced */}
              {conn.lastSyncedAt && (
                <span className="text-[11px] text-gray-400">
                  Last: {new Date(conn.lastSyncedAt).toLocaleDateString()}
                </span>
              )}
            </div>

            {/* Sync result feedback */}
            {syncResult && (
              <div
                className={`mt-2 text-xs font-medium px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition-all ${
                  syncResult.error
                    ? "bg-red-50 text-red-700"
                    : "bg-emerald-50 text-emerald-700"
                }`}
              >
                {syncResult.error ? (
                  <>
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {syncResult.error}
                  </>
                ) : (
                  <>
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Synced {syncResult.count} event{syncResult.count !== 1 ? "s" : ""}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onSyncNow(conn.id)}
            disabled={isSyncing || !conn.syncEnabled}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition disabled:opacity-30 disabled:cursor-not-allowed"
            title="Sync now"
          >
            <svg className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
          <button
            onClick={() => onDisconnect(conn.id)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
            title="Disconnect"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

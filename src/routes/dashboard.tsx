import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import BreathingPlayer from "~/components/BreathingPlayer";
import QuoteCard from "~/components/QuoteCard";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

// ── Types ──

interface UserData {
  id: string;
  email: string;
  displayName: string | null;
  oauthProvider: string | null;
  avatarUrl: string | null;
  preferences: {
    prepBufferMin: number;
    followUpBufferMin: number;
    defaultBreakDurationMin: number;
    deepWorkThresholdMin: number;
    maxBreaksPerDay: number;
    workingHoursStart: string;
    workingHoursEnd: string;
    preferredBreakTypes: string;
  };
  connectedCalendars: Array<{
    id: string;
    provider: string;
    calendarEmail: string;
    syncEnabled: boolean;
    lastSyncedAt: string | null;
    timezone: string | null;
  }>;
}

interface Suggestion {
  id: string;
  suggestedStart: string;
  suggestedEnd: string;
  durationMinutes: number;
  breakType: string;
  status: string;
  rankingScore: number;
  context: {
    gapMinutes: number;
    beforeEvent: string | null;
    afterEvent: string | null;
  };
}

interface TimelineSegment {
  type: "busy" | "buffer" | "gap" | "break";
  start: string;
  end: string;
  label: string;
}

interface DailySuggestions {
  date: string;
  stats: {
    totalGapsFound: number;
    deepWorkBlocksPreserved: number;
    suggestionsGenerated: number;
  };
  suggestions: Suggestion[];
  timeline: TimelineSegment[];
}

interface StreakData {
  current: number;
  best: number;
  lastActiveDate: string | null;
}

interface WeekDay {
  date: string;
  stats: { totalGapsFound: number; deepWorkBlocksPreserved: number; suggestionsGenerated: number };
  suggestions: Suggestion[];
}

interface WeekData {
  weekStart: string;
  days: WeekDay[];
}

// ── Helpers ──

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDateLabel(isoStr: string): string {
  const d = new Date(isoStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function dayName(isoStr: string): string {
  const d = new Date(isoStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

function dayNumber(isoStr: string): string {
  const d = new Date(isoStr + "T12:00:00");
  return String(d.getDate());
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function formatTime(isoStr: string): string {
  // Parse time from the ISO string directly (like isoToMinutes) so the
  // wall-clock time is shown as stored, not reinterpreted by the browser.
  const match = isoStr.match(/[T ](\d{2}):(\d{2})/);
  if (!match) {
    const d = new Date(isoStr);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function isToday(dateStr: string): boolean {
  return dateStr === todayStr();
}

function nowMinutes(): number {
  // Runs in the browser — new Date() returns the user's local time, which is
  // what the timeline should be aligned to.
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Convert an IANA timezone name (e.g. "America/New_York") to a short display
 * label (e.g. "Eastern Time").  Falls back to a best-effort abbreviation or the
 * raw IANA name.
 */
function timezoneLabel(tz: string | null | undefined): string {
  if (!tz) {
    // Fall back to browser's timezone
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "";
    }
  }
  // Common North American mappings
  const map: Record<string, string> = {
    "America/New_York": "Eastern Time",
    "America/Chicago": "Central Time",
    "America/Denver": "Mountain Time",
    "America/Los_Angeles": "Pacific Time",
    "America/Anchorage": "Alaska Time",
    "Pacific/Honolulu": "Hawaii Time",
    "America/Phoenix": "Mountain Time (no DST)",
    "America/Toronto": "Eastern Time",
    "America/Vancouver": "Pacific Time",
    "Europe/London": "UK Time",
    "Europe/Paris": "Central European Time",
    "Europe/Berlin": "Central European Time",
    "Asia/Tokyo": "Japan Time",
    "Asia/Shanghai": "China Time",
    "Asia/Kolkata": "India Time",
    "Asia/Singapore": "Singapore Time",
    "Australia/Sydney": "Eastern Australia Time",
    "UTC": "UTC",
  };
  if (map[tz]) return map[tz];

  // Best-effort: extract city from IANA name
  const parts = tz.split("/");
  const city = parts[parts.length - 1].replace(/_/g, " ");
  return city;
}

/**
 * Format an HH:MM time string to a friendly AM/PM label.
 */
function formatHHMM(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function minutesToPct(minutes: number, dayStart: number, dayEnd: number): number {
  const span = dayEnd - dayStart;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(100, ((minutes - dayStart) / span) * 100));
}

function contextLabel(s: Suggestion): string {
  const parts: string[] = [];
  if (s.context.beforeEvent) parts.push(s.context.beforeEvent);
  if (s.context.afterEvent) parts.push(s.context.afterEvent);
  if (parts.length === 2) return `Between ${parts[0]} and ${parts[1]}`;
  if (parts.length === 1) return `After ${parts[0]}`;
  return `Open time`;
}

// ── Main Dashboard Page ──

function DashboardPage() {
  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const viewParam = searchParams?.get("view") || "day";

  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [dailyData, setDailyData] = useState<DailySuggestions | null>(null);
  const [streak, setStreak] = useState<StreakData>({ current: 0, best: 0, lastActiveDate: null });
  const [dataLoading, setDataLoading] = useState(false);
  const [view, setView] = useState(viewParam);

  // Per-suggestion state
  const [suggestionStates, setSuggestionStates] = useState<Record<string, {
    status: string;
    content?: any;
    completionId?: string;
    completed?: boolean;
    rating?: number;
    fading?: boolean;
  }>>({});

  // Week view data
  const [weekData, setWeekData] = useState<WeekData | null>(null);
  const [weekLoading, setWeekLoading] = useState(false);

  // ── Auth check ──
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
        setAuthChecked(true);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        setAuthChecked(true);
      });
  }, []);

  // ── Load daily suggestions ──
  const loadDailyData = useCallback(async (date: string) => {
    if (!user?.connectedCalendars?.length) return;
    setDataLoading(true);
    try {
      const [suggRes, streakRes] = await Promise.all([
        fetch(`/api/breaks/suggestions?date=${date}`, { credentials: "include" }),
        fetch("/api/analytics/streak", { credentials: "include" }),
      ]);

      if (suggRes.ok) {
        const data = await suggRes.json();
        setDailyData(data);
        // Initialize suggestion states
        const states: Record<string, any> = {};
        for (const s of data.suggestions || []) {
          states[s.id] = { status: s.status };
        }
        setSuggestionStates((prev) => ({ ...prev, ...states }));
      }

      if (streakRes.ok) {
        const sData = await streakRes.json();
        setStreak(sData);
      }
    } catch (err) {
      console.error("Failed to load daily data:", err);
    }
    setDataLoading(false);
  }, [user]);

  // ── Load week data ──
  const loadWeekData = useCallback(async (date: string) => {
    if (!user?.connectedCalendars?.length) return;
    setWeekLoading(true);
    try {
      // Calculate Monday of the week
      const d = new Date(date + "T12:00:00");
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
      const monday = new Date(d);
      monday.setDate(diff);
      const mondayStr = monday.toISOString().slice(0, 10);

      const [weekRes, streakRes] = await Promise.all([
        fetch(`/api/breaks/suggestions/week?start=${mondayStr}`, { credentials: "include" }),
        fetch("/api/analytics/streak", { credentials: "include" }),
      ]);

      if (weekRes.ok) {
        setWeekData(await weekRes.json());
      }
      if (streakRes.ok) {
        setStreak(await streakRes.json());
      }
    } catch (err) {
      console.error("Failed to load week data:", err);
    }
    setWeekLoading(false);
  }, [user]);

  useEffect(() => {
    if (authChecked && user) {
      if (view === "week") {
        loadWeekData(selectedDate);
      } else {
        loadDailyData(selectedDate);
      }
    }
  }, [authChecked, user, selectedDate, view, loadDailyData, loadWeekData]);

  // ── Date navigation ──
  const changeDate = (delta: number) => {
    const d = new Date(selectedDate + "T12:00:00");
    d.setDate(d.getDate() + delta);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const goToToday = () => setSelectedDate(todayStr());

  // ── Break actions ──
  const handleAccept = async (suggestionId: string) => {
    setSuggestionStates((prev) => ({
      ...prev,
      [suggestionId]: { ...prev[suggestionId], status: "accepting" },
    }));
    try {
      const res = await fetch(`/api/breaks/suggestions/${suggestionId}/accept`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        setSuggestionStates((prev) => ({
          ...prev,
          [suggestionId]: { ...prev[suggestionId], status: "accepted" },
        }));
      }
    } catch (err) {
      console.error("Accept failed:", err);
    }
  };

  const handleStart = async (suggestionId: string) => {
    setSuggestionStates((prev) => ({
      ...prev,
      [suggestionId]: { ...prev[suggestionId], status: "starting" },
    }));
    try {
      const res = await fetch(`/api/breaks/suggestions/${suggestionId}/start`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestionStates((prev) => ({
          ...prev,
          [suggestionId]: {
            ...prev[suggestionId],
            status: "started",
            content: data.content,
            completionId: data.completion.id,
          },
        }));
      }
    } catch (err) {
      console.error("Start failed:", err);
    }
  };

  const handleSkip = async (suggestionId: string) => {
    setSuggestionStates((prev) => ({
      ...prev,
      [suggestionId]: { ...prev[suggestionId], fading: true },
    }));
    try {
      await fetch(`/api/breaks/suggestions/${suggestionId}/skip`, {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error("Skip failed:", err);
    }
    // Remove after animation
    setTimeout(() => {
      setSuggestionStates((prev) => ({
        ...prev,
        [suggestionId]: { ...prev[suggestionId], status: "skipped" },
      }));
    }, 300);
  };

  const handleComplete = async (suggestionId: string, completionId: string, rating?: number) => {
    try {
      const body = rating !== undefined ? JSON.stringify({ rating }) : undefined;
      const res = await fetch(`/api/breaks/completions/${completionId}/complete`, {
        method: "POST",
        credentials: "include",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body,
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestionStates((prev) => ({
          ...prev,
          [suggestionId]: {
            ...prev[suggestionId],
            status: "completed",
            completed: true,
            rating,
          },
        }));
        // Refresh streak
        setStreak(data.streak);
      }
    } catch (err) {
      console.error("Complete failed:", err);
    }
  };

  // ── Toggle week/day view ──
  const toggleView = (newView: string) => {
    setView(newView);
    const url = new URL(window.location.href);
    if (newView === "week") {
      url.searchParams.set("view", "week");
    } else {
      url.searchParams.delete("view");
    }
    window.history.replaceState({}, "", url.toString());
    if (newView === "week") {
      loadWeekData(selectedDate);
    }
  };

  // ── Seeding dev calendar for testing ──
  const handleSeedCalendar = async () => {
    try {
      const res = await fetch("/api/dev/seed-calendar", { method: "POST", credentials: "include" });
      if (res.ok) {
        // Refresh user to get calendar connections
        const meRes = await fetch("/api/auth/me", { credentials: "include" });
        if (meRes.ok) {
          const meData = await meRes.json();
          setUser(meData.user);
        }
        loadDailyData(selectedDate);
      }
    } catch (err) {
      console.error("Seed failed:", err);
    }
  };

  // ── Loading state ──
  if (loading) {
    return (
      <div className="min-h-dvh bg-stone-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  const hasCalendar = user?.connectedCalendars?.length > 0;

  return (
    <div className="min-h-dvh bg-gradient-to-b from-stone-50 via-white to-stone-50">
      {/* ── Top Bar ── */}
      <TopBar
        user={user}
        selectedDate={selectedDate}
        streak={streak}
        view={view}
        onChangeDate={changeDate}
        onToday={goToToday}
        onToggleView={toggleView}
        timezone={user?.connectedCalendars?.[0]?.timezone ?? null}
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-12">
        {/* ── No calendar CTA ── */}
        {!hasCalendar && (
          <div className="mt-8 bg-gradient-to-br from-emerald-50 via-amber-50 to-sky-50 rounded-2xl shadow-sm ring-1 ring-gray-200/40 p-8 text-center">
            <span className="text-5xl">📅</span>
            <h2 className="mt-4 text-xl font-bold text-gray-900">Connect a calendar to see your day</h2>
            <p className="mt-2 text-gray-600 max-w-md mx-auto">
              Reclaim will scan your schedule, find the real gaps, and suggest restorative breaks
              perfectly placed in your day. Head to Settings to connect your calendars.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="/settings"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700 active:scale-[0.98]"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Go to Settings
              </a>
              <button
                onClick={handleSeedCalendar}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-200 transition hover:bg-amber-600 active:scale-[0.98]"
              >
                🔬 Demo: Seed test calendar
              </button>
            </div>
          </div>
        )}

        {/* ── Main content ── */}
        {hasCalendar && (
          <>
            {view === "week" ? (
              <WeekView
                weekData={weekData}
                loading={weekLoading}
                selectedDate={selectedDate}
                onSelectDate={(d) => { setSelectedDate(d); toggleView("day"); }}
                streak={streak}
              />
            ) : (
              <>
                {/* Quick Stats Bar */}
                <QuickStats dailyData={dailyData} streak={streak} />

                {/* Day Timeline + Suggestions */}
                <div className="mt-6 lg:flex lg:gap-6">
                  {/* Timeline */}
                  <div className="lg:flex-[3] mb-6 lg:mb-0">
                    <DayTimeline
                      timeline={dailyData?.timeline || []}
                      loading={dataLoading}
                      selectedDate={selectedDate}
                      workingHoursStart={user?.preferences?.workingHoursStart || "08:00"}
                      workingHoursEnd={user?.preferences?.workingHoursEnd || "18:00"}
                    />
                  </div>

                  {/* Suggestions Panel */}
                  <div className="lg:flex-[2]">
                    <SuggestionsPanel
                      suggestions={dailyData?.suggestions || []}
                      suggestionStates={suggestionStates}
                      loading={dataLoading}
                      onAccept={handleAccept}
                      onStart={handleStart}
                      onSkip={handleSkip}
                      onComplete={handleComplete}
                    />
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// TOP BAR
// ═══════════════════════════════════════════════

function TopBar({
  user,
  selectedDate,
  streak,
  view,
  onChangeDate,
  onToday,
  onToggleView,
  timezone,
}: {
  user: UserData | null;
  selectedDate: string;
  streak: StreakData;
  view: string;
  onChangeDate: (delta: number) => void;
  onToday: () => void;
  onToggleView: (v: string) => void;
  timezone: string | null;
}) {
  const tzLabel = timezoneLabel(timezone);

  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-200/60 shadow-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Left: branding + date */}
          <div className="flex items-center gap-3 min-w-0">
            <a href="/dashboard" className="flex items-center gap-2 shrink-0">
              <span className="text-xl">🧘</span>
              <span className="text-lg font-bold text-gray-900 hidden sm:inline">Reclaim</span>
            </a>

            <div className="hidden sm:flex items-center gap-1 ml-2">
              <button
                onClick={() => onChangeDate(-1)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition"
                aria-label="Previous day"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={onToday}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition"
              >
                {formatDateLabel(selectedDate)}
                {tzLabel && (
                  <span className="ml-1.5 text-xs text-gray-400 font-normal">· {tzLabel}</span>
                )}
              </button>
              <button
                onClick={() => onChangeDate(1)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition"
                aria-label="Next day"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Mobile date */}
            <div className="flex sm:hidden items-center gap-1">
              <button onClick={() => onChangeDate(-1)} className="p-1 text-gray-500">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-sm font-medium text-gray-700">{dayName(selectedDate)} {dayNumber(selectedDate)}</span>
              <button onClick={() => onChangeDate(1)} className="p-1 text-gray-500">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Right: streak, view toggle, settings */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* View toggle */}
            <div className="hidden sm:flex items-center bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => onToggleView("day")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                  view === "day" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Day
              </button>
              <button
                onClick={() => onToggleView("week")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                  view === "week" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Week
              </button>
            </div>

            {/* Streak badge */}
            <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-semibold ${
              streak.current > 0
                ? "bg-amber-100 text-amber-800"
                : "bg-gray-100 text-gray-500"
            }`}>
              <span>🔥</span>
              <span>{streak.current}d</span>
            </div>

            {/* Settings */}
            <a
              href="/settings"
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition"
              title="Settings"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}

// ═══════════════════════════════════════════════
// QUICK STATS BAR
// ═══════════════════════════════════════════════

function QuickStats({
  dailyData,
  streak,
}: {
  dailyData: DailySuggestions | null;
  streak: StreakData;
}) {
  if (!dailyData) {
    return (
      <div className="mt-6 flex gap-4 overflow-x-auto pb-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex-1 min-w-[120px] h-20 bg-white rounded-xl shadow-sm ring-1 ring-gray-200/60 animate-pulse" />
        ))}
      </div>
    );
  }

  const completedCount = dailyData.suggestions.filter((s) => s.status === "completed").length;
  const totalCount = dailyData.suggestions.length;

  return (
    <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <StatCard
        icon="🧘"
        label="Breaks Today"
        value={`${completedCount}/${totalCount}`}
        sub="completed"
        color="emerald"
      />
      <StatCard
        icon="🔥"
        label="Streak"
        value={`${streak.current} days`}
        sub={`Best: ${streak.best}`}
        color="amber"
      />
      <StatCard
        icon="🔒"
        label="Deep Work"
        value={`${dailyData.stats.deepWorkBlocksPreserved}`}
        sub="blocks protected"
        color="sky"
      />
      <StatCard
        icon="📊"
        label="Gaps Found"
        value={`${dailyData.stats.totalGapsFound}`}
        sub="total gaps"
        color="violet"
      />
      <StatCard
        icon="💡"
        label="Suggested"
        value={`${dailyData.stats.suggestionsGenerated}`}
        sub="breaks"
        color="rose"
      />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: string;
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200/60",
    amber: "bg-amber-50 text-amber-700 ring-amber-200/60",
    sky: "bg-sky-50 text-sky-700 ring-sky-200/60",
    violet: "bg-violet-50 text-violet-700 ring-violet-200/60",
    rose: "bg-rose-50 text-rose-700 ring-rose-200/60",
  };

  return (
    <div className={`rounded-xl shadow-sm ring-1 p-4 ${colorMap[color] || colorMap.emerald}`}>
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <span className="text-xs font-medium opacity-70">{label}</span>
      </div>
      <p className="mt-1.5 text-xl font-bold">{value}</p>
      <p className="text-xs opacity-60">{sub}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════
// DAY TIMELINE — vertical hourly calendar view
// ═══════════════════════════════════════════════

const PX_PER_HOUR = 80; // pixels per hour in the calendar grid

function DayTimeline({
  timeline,
  loading,
  selectedDate,
  workingHoursStart,
  workingHoursEnd,
}: {
  timeline: TimelineSegment[];
  loading: boolean;
  selectedDate: string;
  workingHoursStart: string;
  workingHoursEnd: string;
}) {
  const dayStart = timeToMinutes(workingHoursStart);
  const dayEnd = timeToMinutes(workingHoursEnd);
  const daySpan = dayEnd - dayStart;
  const totalHeight = (daySpan / 60) * PX_PER_HOUR;

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200/60 p-6">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Timeline</h3>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-8 bg-gray-100 rounded-lg animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }} />
          ))}
        </div>
      </div>
    );
  }

  if (timeline.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200/60 p-6">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Timeline</h3>
        <div className="flex items-center justify-center h-64 text-gray-400">
          <div className="text-center">
            <span className="text-4xl">📭</span>
            <p className="mt-2 text-sm">No events scheduled</p>
          </div>
        </div>
      </div>
    );
  }

  const isCurrentDay = isToday(selectedDate);
  const currentMin = nowMinutes();
  const showNowLine = isCurrentDay && currentMin >= dayStart && currentMin <= dayEnd;

  // Position helper: converts minutes-since-midnight to pixels from grid top
  const posY = (minutes: number): number => ((minutes - dayStart) / 60) * PX_PER_HOUR;

  // Generate time slots (every 30 minutes) for labels and grid lines
  const timeSlots: { label: string; isHour: boolean; minutes: number }[] = [];
  for (let m = dayStart; m <= dayEnd; m += 30) {
    const h = Math.floor(m / 60);
    const mn = m % 60;
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    timeSlots.push({
      label: mn === 0 ? `${h12} ${ampm}` : `${h12}:${String(mn).padStart(2, "0")} ${ampm}`,
      isHour: mn === 0,
      minutes: m,
    });
  }

  // Filter to only non-gap segments for block rendering (gaps are the background)
  const blocks = timeline.filter((seg) => seg.type !== "gap");

  return (
    <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200/60 p-4 sm:p-6">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Timeline</h3>

      {/* Scrollable calendar container */}
      <div
        className="overflow-y-auto rounded-xl border border-gray-200 shadow-inner"
        style={{ maxHeight: "min(75vh, 800px)" }}
      >
        <div className="flex" style={{ height: totalHeight, minHeight: 400 }}>
          {/* ── Time labels column (fixed ~60px) ── */}
          <div className="w-[60px] shrink-0 relative bg-gray-50/60 select-none">
            {timeSlots.map((slot, i) => {
              const top = posY(slot.minutes) - 7;
              // Skip labels that would render above the top
              if (top < -2 && i > 0) return null;
              return (
                <div
                  key={i}
                  className={`absolute right-2 text-xs whitespace-nowrap leading-none ${
                    slot.isHour
                      ? "text-gray-500 font-medium"
                      : "text-gray-400/70"
                  }`}
                  style={{ top }}
                >
                  {slot.label}
                </div>
              );
            })}
          </div>

          {/* ── Grid area ── */}
          <div
            className="flex-1 relative bg-gradient-to-b from-emerald-50/30 via-white to-white overflow-x-hidden"
            style={{ minWidth: 0 }}
          >
            {/* Hour grid lines (solid, faint) */}
            {timeSlots
              .filter((s) => s.isHour)
              .map((slot, i) => (
                <div
                  key={`hl-${i}`}
                  className="absolute left-0 right-0 border-t border-gray-200/70"
                  style={{ top: posY(slot.minutes) }}
                />
              ))}

            {/* Half-hour grid lines (dashed, very faint) */}
            {timeSlots
              .filter((s) => !s.isHour)
              .map((slot, i) => (
                <div
                  key={`hh-${i}`}
                  className="absolute left-0 right-0 border-t border-dashed border-gray-100/60"
                  style={{ top: posY(slot.minutes) }}
                />
              ))}

            {/* ── Event / buffer / break blocks ── */}
            {blocks.map((seg, idx) => {
              const segStart = timeToMinutes(seg.start);
              const segEnd = timeToMinutes(seg.end);
              const top = posY(segStart);
              const height = posY(segEnd) - top;
              const effectiveHeight = Math.max(height, 22); // min visible height

              return (
                <div
                  key={idx}
                  className="absolute left-1 right-1 z-10"
                  style={{ top, height: effectiveHeight }}
                >
                  {/* Busy (meeting) — solid block with coloured left accent */}
                  {seg.type === "busy" && (
                    <div className="h-full bg-blue-100/90 border-l-[3px] border-blue-500 rounded-r-lg flex items-center px-2.5 shadow-sm overflow-hidden">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-blue-900 truncate leading-tight">
                          {seg.label}
                        </p>
                        <p className="text-[10px] text-blue-500/80 leading-tight">
                          {formatHHMM(seg.start)} – {formatHHMM(seg.end)}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Buffer (prep/follow-up) — muted, subtle */}
                  {seg.type === "buffer" && (
                    <div className="h-full relative bg-gray-50/70 border border-dashed border-gray-200 rounded-lg flex items-center px-2.5 overflow-hidden">
                      <div className="relative min-w-0">
                        <p className="text-[11px] font-medium text-gray-400 truncate leading-tight">
                          {seg.label}
                        </p>
                        <p className="text-[10px] text-gray-300/80 leading-tight">
                          {formatHHMM(seg.start)} – {formatHHMM(seg.end)}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Break — emerald/sky gradient, stands out */}
                  {seg.type === "break" && (
                    <div className="h-full bg-gradient-to-r from-emerald-100 via-emerald-50 to-sky-100 border-l-[3px] border-emerald-400 rounded-r-lg flex items-center px-2.5 shadow-sm overflow-hidden">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-emerald-800 truncate leading-tight">
                          {seg.label === "Breathe"
                            ? "🫁 "
                            : seg.label === "Quote"
                              ? "💬 "
                              : "🧘 "}
                          {seg.label}
                        </p>
                        <p className="text-[10px] text-emerald-600/80 leading-tight">
                          {formatHHMM(seg.start)} – {formatHHMM(seg.end)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* ── Current time indicator (today only) ── */}
            {showNowLine && (
              <div
                className="absolute left-0 right-0 z-30 flex items-center pointer-events-none"
                style={{ top: posY(currentMin) }}
              >
                <div className="h-3 w-3 rounded-full bg-red-500 shadow-md -ml-1.5 shrink-0" />
                <div className="flex-1 border-t-[1.5px] border-red-500" />
                <span className="text-[10px] font-bold text-red-600 bg-white/90 px-1.5 py-0.5 rounded shadow-sm mr-1 shrink-0">
                  Now
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-4 text-xs">
        <LegendItem color="bg-blue-100 border-l-[3px] border-blue-500" label="Busy" />
        <LegendItem color="bg-gray-100 border border-dashed border-gray-300" label="Buffer" />
        <LegendItem color="bg-gradient-to-r from-emerald-100 to-sky-100 border-l-[3px] border-emerald-400" label="Break" />
        <LegendItem color="bg-gradient-to-b from-emerald-50/30 to-white border border-gray-200" label="Gap (available)" />
      </div>
    </div>
  );
}

function LegendItem({ color, label, hasStripes }: { color: string; label: string; hasStripes?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`relative w-4 h-3 rounded-sm ${color} ${hasStripes ? "border border-gray-300" : ""}`}>
        {hasStripes && (
          <div
            className="absolute inset-0 rounded-sm opacity-40"
            style={{
              backgroundImage: "repeating-linear-gradient(-45deg, transparent, transparent 2px, #999 2px, #999 3px)",
            }}
          />
        )}
      </div>
      <span className="text-gray-500">{label}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════
// SUGGESTIONS PANEL
// ═══════════════════════════════════════════════

function SuggestionsPanel({
  suggestions,
  suggestionStates,
  loading,
  onAccept,
  onStart,
  onSkip,
  onComplete,
}: {
  suggestions: Suggestion[];
  suggestionStates: Record<string, any>;
  loading: boolean;
  onAccept: (id: string) => void;
  onStart: (id: string) => void;
  onSkip: (id: string) => void;
  onComplete: (suggestionId: string, completionId: string, rating?: number) => void;
}) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200/60 p-6">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Suggestions</h3>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-28 bg-gray-50 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Filter out skipped suggestions
  const visibleSuggestions = suggestions.filter(
    (s) => suggestionStates[s.id]?.status !== "skipped"
  );

  return (
    <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200/60 p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Suggestions</h3>
        <span className="text-xs text-gray-400">
          {visibleSuggestions.filter((s) => suggestionStates[s.id]?.completed).length}/{visibleSuggestions.length} done
        </span>
      </div>

      {visibleSuggestions.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <div className="text-center">
            <span className="text-4xl">🎉</span>
            <p className="mt-2 text-sm">All caught up!</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          {visibleSuggestions.map((s) => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              state={suggestionStates[s.id] || { status: s.status }}
              onAccept={() => onAccept(s.id)}
              onStart={() => onStart(s.id)}
              onSkip={() => onSkip(s.id)}
              onComplete={(completionId, rating) => onComplete(s.id, completionId, rating)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SuggestionCard({
  suggestion,
  state,
  onAccept,
  onStart,
  onSkip,
  onComplete,
}: {
  suggestion: Suggestion;
  state: any;
  onAccept: () => void;
  onStart: () => void;
  onSkip: () => void;
  onComplete: (completionId: string, rating?: number) => void;
}) {
  const isBreathing = suggestion.breakType === "breathing";
  const isQuoteBreak = suggestion.breakType === "quote";
  const isAccepted = state.status === "accepted" || state.status === "accepting";
  const isStarted = state.status === "started" || state.status === "starting";
  const isCompleted = state.completed || state.status === "completed";
  const isFading = state.fading;

  const scorePct = Math.round(suggestion.rankingScore * 100);
  const scoreColor = scorePct >= 80 ? "bg-emerald-500" : scorePct >= 60 ? "bg-amber-500" : "bg-gray-400";

  const [showRating, setShowRating] = useState(false);

  // When the BreathingPlayer completes, show the rating UI
  const handlePlayerComplete = () => {
    if (state.completionId && !isCompleted) {
      setShowRating(true);
    }
  };

  const handleRate = (rating: number) => {
    onComplete(state.completionId, rating);
    setShowRating(false);
  };

  const handleSkipRating = () => {
    onComplete(state.completionId);
    setShowRating(false);
  };

  return (
    <div
      className={`rounded-xl border transition-all duration-300 ${
        isFading ? "opacity-0 scale-95" : "opacity-100"
      } ${
        isCompleted
          ? "bg-emerald-50/50 border-emerald-200"
          : isStarted
            ? "bg-white border-emerald-300 shadow-md"
            : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm"
      }`}
    >
      {/* Card header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Time + type */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-900">
                {formatTime(suggestion.suggestedStart)}
              </span>
              <span className="text-xs text-gray-400">— {suggestion.durationMinutes} min</span>
              <span className="text-lg">{isBreathing ? "🫁" : "💬"}</span>
            </div>

            {/* Context */}
            <p className="mt-1 text-xs text-gray-500 truncate">{contextLabel(suggestion)}</p>

            {/* Score */}
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-[100px]">
                <div
                  className={`h-full rounded-full ${scoreColor} transition-all`}
                  style={{ width: `${scorePct}%` }}
                />
              </div>
              <span className="text-[10px] text-gray-400">{scorePct}%</span>
            </div>
          </div>

          {/* Status indicator */}
          <div className="shrink-0">
            {isCompleted ? (
              <span className="text-xl">✅</span>
            ) : isStarted ? (
              <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Active
              </span>
            ) : isAccepted ? (
              <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                Accepted
              </span>
            ) : null}
          </div>
        </div>

        {/* Action buttons — not started yet */}
        {!isStarted && !isCompleted && (
          <div className="flex items-center gap-2 mt-3">
            {!isAccepted ? (
              <button
                onClick={onAccept}
                disabled={state.status === "accepting"}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm shadow-emerald-200 transition hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50"
              >
                ✓ Accept
              </button>
            ) : (
              <button
                onClick={onStart}
                disabled={state.status === "starting"}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white shadow-sm shadow-sky-200 transition hover:bg-sky-700 active:scale-[0.98] disabled:opacity-50"
              >
                ▶ Start
              </button>
            )}
            <button
              onClick={onSkip}
              disabled={state.status === "fading"}
              className="inline-flex items-center justify-center gap-1 rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-gray-500 transition hover:bg-gray-200 active:scale-[0.98] disabled:opacity-50"
            >
              ✕ Skip
            </button>
          </div>
        )}
      </div>

      {/* Embedded content when started */}
      {isStarted && state.content && !isCompleted && (
        <div className="border-t border-gray-100 p-4">
          {!showRating ? (
            <>
              {isBreathing && state.content?.title ? (
                <div className="scale-[0.85] origin-top-left">
                  <BreathingPlayer exercise={state.content} />
                </div>
              ) : isQuoteBreak && state.content?.text ? (
                <div>
                  <QuoteCard quote={state.content} />
                  <div className="mt-4 flex items-center justify-center gap-2">
                    <button
                      onClick={handlePlayerComplete}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700 active:scale-[0.98]"
                    >
                      ✅ I&rsquo;m done
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            /* Post-break rating */
            <div className="text-center py-4">
              <p className="text-lg font-semibold text-gray-900 mb-3">How was that?</p>
              <div className="flex items-center justify-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => handleRate(star)}
                    className="text-3xl transition hover:scale-125 active:scale-95"
                  >
                    ⭐
                  </button>
                ))}
              </div>
              <button
                onClick={handleSkipRating}
                className="mt-3 text-xs text-gray-400 hover:text-gray-600"
              >
                Skip rating
              </button>
            </div>
          )}
        </div>
      )}

      {/* Completed state */}
      {isCompleted && (
        <div className="border-t border-emerald-100 p-3 bg-emerald-50/30 rounded-b-xl">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-emerald-700">
              ✅ Completed
              {state.rating ? ` — ${"⭐".repeat(state.rating)}` : ""}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// WEEK VIEW
// ═══════════════════════════════════════════════

function WeekView({
  weekData,
  loading,
  selectedDate,
  onSelectDate,
  streak,
}: {
  weekData: WeekData | null;
  loading: boolean;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  streak: StreakData;
}) {
  if (loading) {
    return (
      <div className="mt-6">
        <div className="grid grid-cols-7 gap-2 sm:gap-3">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="h-32 bg-white rounded-xl shadow-sm ring-1 ring-gray-200/60 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const days = weekData?.days || [];

  return (
    <div className="mt-6">
      {/* Week header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900">
          {weekData?.weekStart ? `Week of ${formatDateLabel(weekData.weekStart)}` : "This Week"}
        </h2>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">🔥</span>
          <span className="font-semibold text-amber-700">{streak.current} day streak</span>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 sm:gap-3 mb-2">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="text-center text-xs font-semibold text-gray-400 uppercase py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day cards */}
      <div className="grid grid-cols-7 gap-1 sm:gap-3">
        {[...Array(7)].map((_, idx) => {
          const day = days[idx];
          if (!day) {
            return (
              <div key={idx} className="aspect-square rounded-xl bg-gray-50 ring-1 ring-gray-100 flex items-center justify-center">
                <span className="text-xs text-gray-300">—</span>
              </div>
            );
          }

          const isSelected = day.date === selectedDate;
          const completedCount = day.suggestions.filter((s) => s.status === "completed").length;
          const totalCount = day.suggestions.length;
          const hasActivity = completedCount > 0;
          const isFuture = day.date > todayStr();

          return (
            <button
              key={day.date}
              onClick={() => onSelectDate(day.date)}
              className={`aspect-square rounded-xl p-2 text-left transition-all active:scale-95 ${
                isSelected
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200 ring-2 ring-emerald-500"
                  : hasActivity
                    ? "bg-white ring-1 ring-gray-200 hover:ring-emerald-300 hover:shadow-md"
                    : isFuture
                      ? "bg-white ring-1 ring-gray-200/60 hover:ring-gray-300"
                      : "bg-gray-50 ring-1 ring-gray-100 hover:ring-gray-300"
              }`}
            >
              <div className={`text-xs font-medium ${isSelected ? "text-emerald-100" : "text-gray-400"}`}>
                {dayName(day.date)}
              </div>
              <div className={`text-lg font-bold mt-0.5 ${isSelected ? "text-white" : "text-gray-900"}`}>
                {dayNumber(day.date)}
              </div>

              {totalCount > 0 ? (
                <div className="mt-1.5">
                  <div className="flex items-baseline gap-0.5">
                    <span className={`text-xs font-bold ${isSelected ? "text-white" : hasActivity ? "text-emerald-600" : "text-gray-400"}`}>
                      {completedCount}
                    </span>
                    <span className={`text-[10px] ${isSelected ? "text-emerald-200" : "text-gray-400"}`}>
                      /{totalCount}
                    </span>
                  </div>
                  {/* Mini progress bar */}
                  <div className={`mt-1 h-1 rounded-full ${isSelected ? "bg-emerald-500/30" : "bg-gray-100"}`}>
                    <div
                      className={`h-full rounded-full transition-all ${
                        isSelected ? "bg-white" : hasActivity ? "bg-emerald-400" : "bg-gray-200"
                      }`}
                      style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="mt-1.5">
                  <span className={`text-[10px] ${isSelected ? "text-emerald-200" : "text-gray-400"}`}>
                    {isFuture ? "—" : "No breaks"}
                  </span>
                </div>
              )}

              {/* Deep work indicator */}
              {day.stats.deepWorkBlocksPreserved > 0 && (
                <div className="mt-1 flex items-center gap-1">
                  <span className="text-[10px]">🔒</span>
                  <span className={`text-[10px] ${isSelected ? "text-emerald-100" : "text-gray-400"}`}>
                    {day.stats.deepWorkBlocksPreserved}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-4 text-xs text-gray-400">
        <span>Click a day to view details</span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-400" /> Completed
        </span>
      </div>
    </div>
  );
}

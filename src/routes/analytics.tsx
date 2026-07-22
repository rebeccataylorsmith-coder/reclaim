import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/analytics")({
  component: AnalyticsPage,
});

interface AnalyticsSummary {
  period: { start: string; end: string };
  totalBreaks: number;
  avgPerDay: number;
  favoriteExercise: string | null;
  streak: { current: number; best: number };
  acceptanceRate: number;
  dailyBreakdown: Array<{ day: string; count: number }>;
}

function AnalyticsPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [dateRange, setDateRange] = useState({ start: "", end: "" });

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
        // Default date range: last 30 days
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 30);
        setDateRange({
          start: start.toISOString().slice(0, 10),
          end: end.toISOString().slice(0, 10),
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user || !dateRange.start) return;
    loadSummary();
  }, [user, dateRange]);

  async function loadSummary() {
    if (!dateRange.start) return;
    setSummaryLoading(true);
    try {
      const res = await fetch(
        `/api/analytics/summary?start=${dateRange.start}&end=${dateRange.end}`,
        { credentials: "include" }
      );
      if (res.ok) {
        setSummary(await res.json());
      }
    } catch (err) {
      console.error("Failed to load analytics:", err);
    }
    setSummaryLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-dvh bg-stone-50 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const isPremium = user?.plan === "premium";

  // Free users see upgrade prompt
  if (!isPremium) {
    return (
      <div className="min-h-dvh bg-gradient-to-b from-stone-50 via-white to-stone-50">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center mb-8">
            <a href="/dashboard" className="inline-flex items-center gap-2 text-sm text-emerald-600 hover:text-emerald-700">
              ← Dashboard
            </a>
          </div>
          <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200/60 p-10 text-center max-w-lg mx-auto">
            <span className="text-5xl">📊</span>
            <h1 className="mt-4 text-2xl font-bold text-gray-900">Analytics is Premium</h1>
            <p className="mt-2 text-gray-600">
              Upgrade to Premium to unlock full analytics — see your break patterns, favorite exercises, acceptance rates, and more.
            </p>
            <div className="mt-6">
              <a
                href="/upgrade"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700 active:scale-[0.98]"
              >
                Upgrade to Premium
                <span className="text-lg">→</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-stone-50 via-white to-stone-50">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <a href="/dashboard" className="inline-flex items-center gap-2 text-sm text-emerald-600 hover:text-emerald-700 mb-2">
              ← Dashboard
            </a>
            <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
            <p className="text-gray-500 mt-1">Your break patterns and insights</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none"
            />
            <span className="text-gray-400">to</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none"
            />
          </div>
        </div>

        {/* Summary cards */}
        {summaryLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 bg-white rounded-xl shadow-sm ring-1 ring-gray-200/60 animate-pulse" />
            ))}
          </div>
        ) : summary ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <SummaryCard
                icon="🧘"
                label="Total Breaks"
                value={`${summary.totalBreaks}`}
                sub={`${summary.avgPerDay} avg/day`}
                color="emerald"
              />
              <SummaryCard
                icon="🔥"
                label="Streak"
                value={`${summary.streak.current}d`}
                sub={`Best: ${summary.streak.best}d`}
                color="amber"
              />
              <SummaryCard
                icon="✅"
                label="Acceptance Rate"
                value={`${summary.acceptanceRate}%`}
                sub="suggestions accepted"
                color="sky"
              />
              <SummaryCard
                icon="⭐"
                label="Favorite Exercise"
                value={summary.favoriteExercise || "—"}
                sub="most completed"
                color="violet"
              />
            </div>

            {/* Daily breakdown */}
            <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200/60 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Daily Breakdown</h2>
              {summary.dailyBreakdown.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No data for this period</p>
              ) : (
                <div className="space-y-2">
                  {summary.dailyBreakdown.map((day) => {
                    const maxCount = Math.max(...summary.dailyBreakdown.map((d) => d.count), 1);
                    const pct = (day.count / maxCount) * 100;
                    return (
                      <div key={day.day} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-20 shrink-0">
                          {new Date(day.day + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                        <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-gray-700 w-8 text-right">{day.count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200/60 p-10 text-center">
            <p className="text-gray-500">No data available. Complete some breaks to see analytics!</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
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
  };

  return (
    <div className={`rounded-xl shadow-sm ring-1 p-5 ${colorMap[color] || colorMap.emerald}`}>
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <span className="text-xs font-medium opacity-70">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      <p className="text-xs opacity-60">{sub}</p>
    </div>
  );
}

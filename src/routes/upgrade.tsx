import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/upgrade")({
  component: UpgradePage,
});

function UpgradePage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [upgraded, setUpgraded] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function handleUpgrade() {
    setUpgrading(true);
    setError(null);
    try {
      const res = await fetch("/api/subscription/upgrade", {
        method: "PUT",
        credentials: "include",
      });
      if (res.ok) {
        setUpgraded(true);
        // Refresh user data
        const meRes = await fetch("/api/auth/me", { credentials: "include" });
        if (meRes.ok) {
          const meData = await meRes.json();
          setUser(meData.user);
        }
      } else {
        setError("Upgrade failed. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setUpgrading(false);
  }

  if (loading) {
    return (
      <div className="min-h-dvh bg-stone-50 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const isPremium = user?.plan === "premium";

  return (
    <div className="min-h-dvh bg-gradient-to-b from-stone-50 via-white to-stone-50">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <a href="/dashboard" className="inline-flex items-center gap-2 text-sm text-emerald-600 hover:text-emerald-700 mb-4">
            ← Dashboard
          </a>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">
            {isPremium ? "You're on Premium 🎉" : "Choose your plan"}
          </h1>
          <p className="mt-3 text-lg text-gray-600 max-w-xl mx-auto">
            {isPremium
              ? "Enjoy unlimited calendars, advanced exercises, and full analytics."
              : "Start free. Upgrade when you're ready for more."}
          </p>
        </div>

        {/* Pricing cards */}
        <div className="grid gap-8 lg:grid-cols-2 max-w-3xl mx-auto">
          {/* Free Tier */}
          <div className={`rounded-2xl bg-white shadow-sm ring-1 p-8 ${isPremium ? "ring-gray-200 opacity-70" : "ring-gray-200"}`}>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Free</h2>
              {!isPremium && user && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Current plan
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-500">For getting started</p>
            <div className="mt-4">
              <span className="text-4xl font-bold text-gray-900">$0</span>
              <span className="text-gray-500">/month</span>
            </div>

            <ul className="mt-6 space-y-3">
              <li className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                1 calendar connection
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                Up to 1 break per day
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                Beginner breathing exercises
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                Motivational quotes
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                Streak tracking
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-400 line-through">
                <span className="text-gray-300 mt-0.5 shrink-0">✗</span>
                Analytics dashboard
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-400 line-through">
                <span className="text-gray-300 mt-0.5 shrink-0">✗</span>
                Intermediate exercises
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-400 line-through">
                <span className="text-gray-300 mt-0.5 shrink-0">✗</span>
                Unlimited calendars
              </li>
            </ul>

            {!isPremium && (
              <div className="mt-8">
                <p className="text-center text-sm text-gray-500">You're on this plan</p>
              </div>
            )}
          </div>

          {/* Premium Tier */}
          <div className={`rounded-2xl shadow-sm ring-1 p-8 relative overflow-hidden ${isPremium ? "bg-gradient-to-br from-emerald-50 via-amber-50 to-sky-50 ring-emerald-300 shadow-lg" : "bg-white ring-emerald-500 shadow-lg shadow-emerald-100"}`}>
            {!isPremium && (
              <div className="absolute top-0 right-0">
                <div className="bg-emerald-600 text-white text-xs font-bold px-4 py-1 rounded-bl-xl">
                  Recommended
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Premium</h2>
              {isPremium && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
                  Current plan
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-500">For power users</p>
            <div className="mt-4">
              <span className="text-4xl font-bold text-gray-900">$6</span>
              <span className="text-gray-500">/month</span>
            </div>

            <ul className="mt-6 space-y-3">
              <li className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                <strong>Unlimited</strong> calendar connections
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                <strong>Up to 6</strong> breaks per day (configurable)
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                <strong>All breathing exercises</strong> — beginner + intermediate
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                Motivational quotes
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                Streak tracking
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                <strong>Full analytics dashboard</strong>
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                Custom break durations & types
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                Priority support
              </li>
            </ul>

            {!isPremium ? (
              <div className="mt-8 space-y-3">
                {/* Monthly */}
                <a
                  href="https://buy.stripe.com/bJedR8bIs5S0g2j7yg5ZC00"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full rounded-xl bg-emerald-600 px-6 py-3.5 text-center text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700 active:scale-[0.98]"
                >
                  Subscribe Monthly — $6/mo
                </a>
                {/* Annual */}
                <div className="relative">
                  <a
                    href="https://buy.stripe.com/bJe9AS3bWa8g5nF05O5ZC01"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full rounded-xl bg-white px-6 py-3.5 text-center text-sm font-semibold text-emerald-700 ring-1 ring-emerald-300 shadow-sm transition hover:bg-emerald-50 active:scale-[0.98]"
                  >
                    Subscribe Annually — $50/yr
                  </a>
                  <span className="absolute -top-2 -right-1 inline-flex items-center rounded-full bg-amber-400 px-2.5 py-0.5 text-[10px] font-bold text-amber-900 shadow-sm">
                    Save $22/year
                  </span>
                </div>
                {/* Activate after payment */}
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-500 text-center mb-2">
                    Already paid? Click below to activate Premium
                  </p>
                  <button
                    onClick={handleUpgrade}
                    disabled={upgrading || upgraded}
                    className="block w-full rounded-xl bg-gray-900 px-6 py-3 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800 active:scale-[0.98] disabled:opacity-60"
                  >
                    {upgrading ? "Activating..." : upgraded ? "✓ Activated!" : "Activate Premium"}
                  </button>
                  {error && (
                    <p className="mt-2 text-xs text-red-600 text-center">{error}</p>
                  )}
                  {upgraded && (
                    <p className="mt-2 text-xs text-emerald-600 text-center font-medium">
                      Premium activated! Enjoy unlimited access.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-8 text-center">
                <p className="text-sm text-emerald-700 font-medium">
                  🎉 You're all set — thanks for being a Premium member!
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

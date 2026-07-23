import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <div className="min-h-dvh bg-gradient-to-b from-stone-50 via-white to-stone-50">
      {/* Hero */}
      <header className="relative overflow-hidden px-6 pt-6 pb-16 sm:px-8 sm:pt-8 sm:pb-24">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/60 via-amber-50/30 to-sky-50/40 pointer-events-none" />
        {/* Top nav */}
        <div className="relative mx-auto max-w-5xl flex items-center justify-between">
          <a href="/" className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            🧘 Reclaim
          </a>
          <a
            href="/auth/login"
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white/70 px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm backdrop-blur transition hover:bg-white hover:border-gray-400 hover:text-gray-900 active:scale-[0.98]"
          >
            Sign In
          </a>
        </div>
        <div className="relative mx-auto max-w-4xl text-center mt-14 sm:mt-20">
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100/80 px-4 py-1.5 text-sm font-medium text-emerald-800 backdrop-blur">
            🧘 Your calendar companion
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl md:text-6xl">
            Reclaim your day,{` `}
            <span className="bg-gradient-to-r from-emerald-600 to-sky-600 bg-clip-text text-transparent">
              one breath at a time
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-600 sm:text-xl">
            Reclaim scans your calendar, finds the real gaps, and fills them with
            short, restorative breaks — breathing exercises, mindfulness prompts, and
            motivational quotes. So you can stay focused, avoid burnout, and be proud
            of your daily routine.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <a
              href="/auth/register"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-8 py-3.5 text-lg font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-300 active:scale-[0.98]"
            >
              Get Started
              <span className="text-xl">→</span>
            </a>
            <a
              href="#how-it-works"
              className="text-gray-500 underline-offset-4 transition hover:text-gray-700 hover:underline"
            >
              See how it works ↓
            </a>
          </div>
        </div>
        {/* Decorative floating emoji */}
        <span className="pointer-events-none absolute top-12 left-[8%] animate-bounce text-3xl opacity-40 select-none hidden sm:block" style={{ animationDuration: "3s" }}>
          🌿
        </span>
        <span className="pointer-events-none absolute top-24 right-[10%] animate-bounce text-2xl opacity-30 select-none hidden sm:block" style={{ animationDuration: "4s", animationDelay: "0.5s" }}>
          ☀️
        </span>
        <span className="pointer-events-none absolute bottom-12 left-[15%] animate-bounce text-2xl opacity-25 select-none hidden sm:block" style={{ animationDuration: "3.5s", animationDelay: "1s" }}>
          💧
        </span>
      </header>

      {/* How it works */}
      <section id="how-it-works" className="px-6 py-20 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <p className="text-center text-sm font-semibold uppercase tracking-widest text-emerald-600">
            How it works
          </p>
          <h2 className="mt-3 text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Three steps to a calmer calendar
          </h2>
          <div className="mt-14 grid gap-10 sm:grid-cols-3">
            {/* Step 1 */}
            <div className="group relative rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200/60 transition hover:shadow-md hover:ring-emerald-200">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-100 text-3xl shadow-inner">
                📅
              </div>
              <h3 className="mt-5 text-xl font-semibold text-gray-900">
                Connect your calendar
              </h3>
              <p className="mt-2 leading-relaxed text-gray-600">
                Securely link Google Calendar and Outlook in one click. Your data
                stays private — we only read what we need to find your gaps.
              </p>
              <div className="mt-6 flex items-center gap-2 text-sm text-gray-400">
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                  Google Calendar
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                  Outlook
                </span>
              </div>
            </div>

            {/* Step 2 */}
            <div className="group relative rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200/60 transition hover:shadow-md hover:ring-amber-200">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-amber-100 text-3xl shadow-inner">
                🔍
              </div>
              <h3 className="mt-5 text-xl font-semibold text-gray-900">
                We find the gaps
              </h3>
              <p className="mt-2 leading-relaxed text-gray-600">
                Our engine accounts for meeting prep and follow-up time, then
                identifies the real free moments in your day — not just the empty
                slots on paper.
              </p>
              <div className="mt-6 flex items-center gap-2 text-sm text-gray-400">
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                  Smart buffer detection
                </span>
              </div>
            </div>

            {/* Step 3 */}
            <div className="group relative rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200/60 transition hover:shadow-md hover:ring-sky-200">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-sky-100 text-3xl shadow-inner">
                🧘
              </div>
              <h3 className="mt-5 text-xl font-semibold text-gray-900">
                Take a breather
              </h3>
              <p className="mt-2 leading-relaxed text-gray-600">
                Short guided breaks (≤15 min) — breathing exercises, quotes, or
                quiet time — perfectly placed so you stay in flow without losing
                momentum.
              </p>
              <div className="mt-6 flex items-center gap-2 text-sm text-gray-400">
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                  ≤ 15 min breaks
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <p className="text-center text-sm font-semibold uppercase tracking-widest text-emerald-600">
            Features
          </p>
          <h2 className="mt-3 text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Built for how you actually work
          </h2>
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                emoji: "🧠",
                title: "Deep work protection",
                desc: "Reclaim respects your deep work blocks and won't fragment them. If you've got a 2-hour focus window, it stays intact.",
                color: "emerald",
              },
              {
                emoji: "🌊",
                title: "Guided breathing",
                desc: "4-7-8, Box Breathing, and more. Simple on-screen guidance so you can follow along without leaving the app.",
                color: "sky",
              },
              {
                emoji: "💬",
                title: "Curated quotes",
                desc: "Motivational quotes hand-picked for focus and resilience. A small dose of inspiration exactly when you need it.",
                color: "violet",
              },
              {
                emoji: "⏱️",
                title: "Buffer awareness",
                desc: "We account for the prep time before meetings and the follow-up after, so your breaks fit into actual free windows.",
                color: "amber",
              },
              {
                emoji: "🔥",
                title: "Streak tracking",
                desc: "Build the habit. Track your daily break streaks and see how consistent restoration improves your focus over time.",
                color: "rose",
              },
              {
                emoji: "📊",
                title: "Focus analytics",
                desc: "Understand your patterns. See when you're most productive and how breaks impact your deep work output.",
                color: "teal",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="group flex gap-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200/60 transition hover:shadow-md"
              >
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-stone-100 text-2xl">
                  {feature.emoji}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{feature.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-gray-600">
                    {feature.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social proof / Philosophy */}
      <section className="px-6 py-20 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="relative rounded-3xl bg-gradient-to-br from-emerald-50 via-amber-50 to-sky-50 p-10 shadow-sm ring-1 ring-gray-200/40 sm:p-14">
            <span className="absolute -top-4 left-8 text-5xl select-none">❝</span>
            <blockquote className="relative text-center">
              <p className="text-2xl font-medium italic leading-relaxed text-gray-800 sm:text-3xl">
                "If a stranger saw your routine today, what would they think of it?"
              </p>
            </blockquote>
            <div className="mt-10 space-y-4 text-center text-gray-600">
              <p className="leading-relaxed">
                Most knowledge workers have a{" "}
                <strong className="font-semibold text-gray-900">4-hour window</strong>{" "}
                of genuine deep work each day. The rest is meetings, context
                switching, and recovery. Reclaim helps you protect and expand that
                window — not by cramming more in, but by building restorative pauses
                that keep you sharp.
              </p>
              <p className="text-sm leading-relaxed text-gray-500">
                Small breaks aren't a luxury. They're the difference between a day
                that drains you and a day you're proud of.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="px-6 py-20 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Ready to reclaim your focus?
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Start with free daily breaks. Upgrade anytime for unlimited calendars,
            custom exercises, and advanced analytics.
          </p>
          <div className="mt-8">
            <a
              href="/auth/register"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-8 py-3.5 text-lg font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-300 active:scale-[0.98]"
            >
              Get Started Free
              <span className="text-xl">→</span>
            </a>
          </div>
          <p className="mt-4 text-sm text-gray-400">
            Free plan available. Premium from $6/month.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 px-6 py-8 text-center sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            🧘 Reclaim
          </div>
          <p className="text-sm text-gray-500">
            &copy; {new Date().getFullYear()} Reclaim. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

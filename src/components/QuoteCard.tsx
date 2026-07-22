interface Quote {
  id: string;
  text: string;
  author: string | null;
  category: string | null;
}

const categoryConfig: Record<string, { gradient: string; tag: string; ring: string }> = {
  focus: {
    gradient: "from-emerald-50 via-amber-50/30 to-sky-50/20",
    tag: "bg-emerald-100 text-emerald-700",
    ring: "ring-emerald-200/60",
  },
  resilience: {
    gradient: "from-amber-50 via-rose-50/30 to-emerald-50/20",
    tag: "bg-amber-100 text-amber-700",
    ring: "ring-amber-200/60",
  },
  creativity: {
    gradient: "from-violet-50 via-sky-50/30 to-amber-50/20",
    tag: "bg-violet-100 text-violet-700",
    ring: "ring-violet-200/60",
  },
  wellness: {
    gradient: "from-sky-50 via-emerald-50/30 to-amber-50/20",
    tag: "bg-sky-100 text-sky-700",
    ring: "ring-sky-200/60",
  },
};

const defaultConfig = {
  gradient: "from-emerald-50 via-amber-50/30 to-sky-50/40",
  tag: "bg-stone-100 text-stone-600",
  ring: "ring-gray-200/40",
};

export default function QuoteCard({ quote }: { quote: Quote }) {
  const config = quote.category && categoryConfig[quote.category]
    ? categoryConfig[quote.category]
    : defaultConfig;

  return (
    <div
      className={`group relative rounded-2xl bg-gradient-to-br ${config.gradient} p-8 shadow-sm ring-1 ${config.ring} transition hover:shadow-md`}
    >
      {/* Category tag */}
      {quote.category && (
        <div className="mb-4">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.tag}`}
          >
            {quote.category}
          </span>
        </div>
      )}

      {/* Quote text */}
      <blockquote className="text-center">
        <p className="text-xl font-medium italic leading-relaxed text-gray-800 sm:text-2xl">
          &ldquo;{quote.text}&rdquo;
        </p>
      </blockquote>

      {/* Author */}
      {quote.author && (
        <p className="mt-5 text-center text-sm font-medium text-gray-500">
          &mdash; {quote.author}
        </p>
      )}

      {/* Subtle decorative element */}
      <span
        className="pointer-events-none absolute top-3 right-4 select-none text-4xl opacity-10"
        aria-hidden="true"
      >
        ❝
      </span>
    </div>
  );
}

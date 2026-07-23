import { useState, useEffect, useRef, useCallback } from "react";

interface BreathingExercise {
  id: string;
  title: string;
  description: string;
  pattern_name: string;
  inhale_seconds: number;
  hold_seconds: number | null;
  exhale_seconds: number;
  hold_after_exhale_seconds: number | null;
  cycles: number;
  duration_seconds: number;
  difficulty: string;
}

type Phase = "inhale" | "hold" | "exhale" | "rest";
type Mode = "guided" | "timer";

interface PhaseStep {
  phase: Phase;
  duration: number;
  label: string;
}

function buildPhaseSteps(exercise: BreathingExercise): PhaseStep[] {
  const steps: PhaseStep[] = [];
  for (let i = 0; i < exercise.cycles; i++) {
    steps.push({
      phase: "inhale",
      duration: exercise.inhale_seconds,
      label: "Breathe in...",
    });
    if (exercise.hold_seconds && exercise.hold_seconds > 0) {
      steps.push({
        phase: "hold",
        duration: exercise.hold_seconds,
        label: "Hold...",
      });
    }
    steps.push({
      phase: "exhale",
      duration: exercise.exhale_seconds,
      label: "Breathe out...",
    });
    if (
      exercise.hold_after_exhale_seconds &&
      exercise.hold_after_exhale_seconds > 0
    ) {
      steps.push({
        phase: "rest",
        duration: exercise.hold_after_exhale_seconds,
        label: "Rest...",
      });
    }
  }
  return steps;
}

// ─── Audio helpers ───────────────────────────────────────────────────────────

function speakText(text: string, rate?: number): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate ?? 0.9;
  utterance.pitch = 1.0;
  utterance.volume = 0.9;
  const voices = window.speechSynthesis.getVoices();

  // Priority tiers for voice quality
  const premiumKeywords = ["Premium", "Enhanced", "Neural", "Wavenet"];
  const brandKeywords = ["Google", "Microsoft", "Apple", "Samantha", "Daniel", "Karen", "Alex"];

  // Tier 1: premium/neural voices
  let selected = voices.find(
    (v) =>
      premiumKeywords.some((kw) => v.name.includes(kw)) ||
      premiumKeywords.some((kw) => (v.voiceURI || "").includes(kw)),
  );

  // Tier 2: well-known brand voices
  if (!selected) {
    selected = voices.find((v) =>
      brandKeywords.some((kw) => v.name.includes(kw)),
    );
  }

  // Tier 3: current fallback strategy
  if (!selected) {
    selected = voices.find(
      (v) =>
        v.name.includes("Samantha") ||
        v.name.includes("Karen") ||
        v.name.includes("Female") ||
        v.name.includes("Google UK English Female"),
    );
  }

  if (selected) {
    utterance.voice = selected;
  } else {
    console.log("[Reclaim speakText] No high-quality voice found; using browser default. Available voices:", voices.map(v => v.name));
  }

  window.speechSynthesis.speak(utterance);
}

function playChime(): void {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.7);
  } catch {
    // Silently fail if audio context is unavailable
  }
}

// ─── Timer presets ───────────────────────────────────────────────────────────

const TIMER_PRESETS = [
  { label: "1 min", seconds: 60 },
  { label: "3 min", seconds: 180 },
  { label: "5 min", seconds: 300 },
  { label: "10 min", seconds: 600 },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function BreathingPlayer({
  exercise,
}: {
  exercise: BreathingExercise;
}) {
  // ── Shared state ────────────────────────────────────────────────────────
  const [mode, setMode] = useState<Mode>("guided");
  const [audioEnabled, setAudioEnabled] = useState(true);

  // ── Guided mode state ───────────────────────────────────────────────────
  const steps = useRef(buildPhaseSteps(exercise));
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState(
    steps.current[0]?.duration ?? 0,
  );
  const [cycleNumber, setCycleNumber] = useState(1);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spokenPhaseRef = useRef<string>("");
  const spokenSecondRef = useRef<number>(-1);

  // ── Timer mode state ────────────────────────────────────────────────────
  const [timerDuration, setTimerDuration] = useState(300);
  const [timerRemaining, setTimerRemaining] = useState(300);
  const [timerStarted, setTimerStarted] = useState(false);
  const [timerPaused, setTimerPaused] = useState(false);
  const [timerCompleted, setTimerCompleted] = useState(false);
  const [customMinutes, setCustomMinutes] = useState("");
  const timerRef2 = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastChimeMinute = useRef<number>(-1);

  // ── Helpers: reset all state ────────────────────────────────────────────

  const resetAll = useCallback(() => {
    // Clear guided timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    // Clear timer-mode timer
    if (timerRef2.current) {
      clearInterval(timerRef2.current);
      timerRef2.current = null;
    }
    // Stop speech
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    // Reset guided state
    setStarted(false);
    setPaused(false);
    setCompleted(false);
    setStepIndex(0);
    setCycleNumber(1);
    setSecondsRemaining(steps.current[0]?.duration ?? 0);
    spokenPhaseRef.current = "";
    spokenSecondRef.current = -1;
    // Reset timer state
    setTimerStarted(false);
    setTimerPaused(false);
    setTimerCompleted(false);
    setTimerRemaining(timerDuration);
    lastChimeMinute.current = -1;
  }, [timerDuration]);

  const switchMode = useCallback(
    (newMode: Mode) => {
      if (newMode === mode) return;
      setMode(newMode);
      resetAll();
    },
    [mode, resetAll],
  );

  // ── Guided mode: next step ──────────────────────────────────────────────

  const nextStep = useCallback(() => {
    setStepIndex((prev) => {
      const next = prev + 1;
      if (next >= steps.current.length) {
        setCompleted(true);
        setStarted(false);
        if (audioEnabled) {
          setTimeout(() => speakText("Exercise complete. Great job."), 300);
        }
        return prev;
      }
      // Determine cycle number
      let c = 1;
      for (let i = 0; i <= next; i++) {
        if (steps.current[i].phase === "inhale" && i > 0) c++;
      }
      setCycleNumber(c);
      setSecondsRemaining(steps.current[next].duration);
      return next;
    });
  }, [audioEnabled]);

  // ── Guided mode: timer effect ───────────────────────────────────────────

  useEffect(() => {
    if (!started || paused || completed) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          nextStep();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [started, paused, completed, nextStep]);

  // ── Guided mode: speech guidance ────────────────────────────────────────

  useEffect(() => {
    if (
      mode !== "guided" ||
      !audioEnabled ||
      !started ||
      paused ||
      completed
    )
      return;

    const step = steps.current[stepIndex];
    if (!step) return;

    const phaseKey = `${stepIndex}-${step.phase}`;

    // Speak phase name when the phase first appears
    if (spokenPhaseRef.current !== phaseKey) {
      spokenPhaseRef.current = phaseKey;
      spokenSecondRef.current = -1;
      const phaseName = step.label.replace("...", "").trim();
      speakText(phaseName);
    }

    // Speak countdown numbers (last 10 seconds)
    if (secondsRemaining <= 10 && secondsRemaining >= 1) {
      if (spokenSecondRef.current !== secondsRemaining) {
        spokenSecondRef.current = secondsRemaining;
        // Slight delay so the phase name can finish if just started
        // plus a small 80ms pause between numbers for a calm, unhurried pace
        const delay = spokenPhaseRef.current === phaseKey ? 600 : 150;
        const timer = setTimeout(
          () => {
            // Small pause between numbers so counting doesn't feel rushed
            setTimeout(() => speakText(String(secondsRemaining), 0.8), 80);
          },
          delay,
        );
        return () => clearTimeout(timer);
      }
    }
  }, [
    mode,
    audioEnabled,
    started,
    paused,
    completed,
    stepIndex,
    secondsRemaining,
  ]);

  // ── Timer mode: countdown effect ────────────────────────────────────────

  useEffect(() => {
    if (mode !== "timer" || !timerStarted || timerPaused || timerCompleted) {
      if (timerRef2.current) {
        clearInterval(timerRef2.current);
        timerRef2.current = null;
      }
      return;
    }

    timerRef2.current = setInterval(() => {
      setTimerRemaining((prev) => {
        if (prev <= 1) {
          setTimerCompleted(true);
          setTimerStarted(false);
          if (audioEnabled) {
            setTimeout(() => speakText("Time's up. Great job.", 0.85), 200);
          }
          return 0;
        }
        const next = prev - 1;
        // Chime every minute (when crossing a minute boundary downward)
        const currentMinute = Math.floor(next / 60);
        const prevMinute = Math.floor(prev / 60);
        if (
          audioEnabled &&
          currentMinute !== prevMinute &&
          currentMinute > 0 &&
          lastChimeMinute.current !== currentMinute
        ) {
          lastChimeMinute.current = currentMinute;
          playChime();
        }
        return next;
      });
    }, 1000);

    return () => {
      if (timerRef2.current) {
        clearInterval(timerRef2.current);
      }
    };
  }, [mode, timerStarted, timerPaused, timerCompleted, audioEnabled]);

  // ── Guided mode: handlers ───────────────────────────────────────────────

  const handleStart = () => {
    if (completed) {
      setCompleted(false);
      setStepIndex(0);
      setCycleNumber(1);
      setSecondsRemaining(steps.current[0].duration);
      spokenPhaseRef.current = "";
      spokenSecondRef.current = -1;
    }
    setStarted(true);
    setPaused(false);
  };

  const handlePause = () => setPaused(true);
  const handleResume = () => setPaused(false);

  const handleReset = () => {
    setStarted(false);
    setPaused(false);
    setCompleted(false);
    setStepIndex(0);
    setCycleNumber(1);
    setSecondsRemaining(steps.current[0].duration);
    spokenPhaseRef.current = "";
    spokenSecondRef.current = -1;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  };

  // ── Timer mode: handlers ────────────────────────────────────────────────

  const handleTimerStart = () => {
    setTimerCompleted(false);
    setTimerRemaining(timerDuration);
    setTimerStarted(true);
    setTimerPaused(false);
    lastChimeMinute.current = -1;
    if (audioEnabled) {
      setTimeout(() => speakText("Begin", 0.85), 200);
    }
  };

  const handleTimerPause = () => setTimerPaused(true);
  const handleTimerResume = () => setTimerPaused(false);

  const handleTimerReset = () => {
    setTimerStarted(false);
    setTimerPaused(false);
    setTimerCompleted(false);
    setTimerRemaining(timerDuration);
    lastChimeMinute.current = -1;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  };

  const selectPreset = (seconds: number) => {
    setTimerDuration(seconds);
    setTimerRemaining(seconds);
    setTimerStarted(false);
    setTimerPaused(false);
    setTimerCompleted(false);
    setCustomMinutes("");
    lastChimeMinute.current = -1;
  };

  const applyCustomMinutes = () => {
    const mins = parseInt(customMinutes, 10);
    if (isNaN(mins) || mins < 1 || mins > 120) return;
    const secs = mins * 60;
    setTimerDuration(secs);
    setTimerRemaining(secs);
    setTimerStarted(false);
    setTimerPaused(false);
    setTimerCompleted(false);
    lastChimeMinute.current = -1;
  };

  // ── Visual helpers ──────────────────────────────────────────────────────

  const currentStep = mode === "guided" ? steps.current[stepIndex] : null;

  const getCircleScale = () => {
    if (mode === "timer") return 1;
    if (!currentStep) return 1;
    switch (currentStep.phase) {
      case "inhale":
        return 1.4;
      case "hold":
        return 1.4;
      case "exhale":
        return 1.0;
      case "rest":
        return 1.0;
      default:
        return 1;
    }
  };

  const getCircleColor = () => {
    if (mode === "timer") return "from-emerald-400 to-sky-400";
    if (!currentStep) return "from-emerald-400 to-sky-400";
    switch (currentStep.phase) {
      case "inhale":
        return "from-emerald-400 to-emerald-300";
      case "hold":
        return "from-amber-400 to-amber-300";
      case "exhale":
        return "from-sky-400 to-sky-300";
      case "rest":
        return "from-violet-400 to-violet-300";
      default:
        return "from-emerald-400 to-sky-400";
    }
  };

  const getPhaseColor = () => {
    if (mode === "timer") return "text-emerald-600";
    if (!currentStep) return "text-emerald-600";
    switch (currentStep.phase) {
      case "inhale":
        return "text-emerald-600";
      case "hold":
        return "text-amber-600";
      case "exhale":
        return "text-sky-600";
      case "rest":
        return "text-violet-600";
      default:
        return "text-emerald-600";
    }
  };

  const getPhaseLabel = () => {
    if (mode === "timer") return "Breathe gently...";
    if (!currentStep) return "";
    return currentStep.label;
  };

  // ── Format timer display ────────────────────────────────────────────────

  const formatTimerDisplay = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  // ── Completion screen ───────────────────────────────────────────────────

  if ((mode === "guided" && completed) || (mode === "timer" && timerCompleted)) {
    const isGuided = mode === "guided";
    return (
      <div className="flex flex-col items-center justify-center gap-6 rounded-3xl bg-gradient-to-br from-emerald-50 via-amber-50 to-sky-50 p-10 shadow-sm ring-1 ring-gray-200/40">
        {/* Mode toggle */}
        <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-1">
          <button
            onClick={() => switchMode("guided")}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              mode === "guided"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Guided
          </button>
          <button
            onClick={() => switchMode("timer")}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              mode === "timer"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Timer
          </button>
        </div>

        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-4xl shadow-inner">
          ✅
        </div>
        <div className="text-center">
          <h3 className="text-2xl font-bold text-gray-900">
            {isGuided ? exercise.title : "Time's up!"}
          </h3>
          <p className="mt-1 text-gray-500">
            Great job! Take a moment to notice how you feel.
          </p>
        </div>
        <button
          onClick={isGuided ? handleStart : handleTimerStart}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700 active:scale-[0.98]"
        >
          ↻ Do it again
        </button>
      </div>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col items-center gap-6 rounded-3xl bg-white p-8 shadow-sm ring-1 ring-gray-200/60">
      {/* Inject pulse keyframes for timer mode */}
      <style>{`
        @keyframes timerPulse {
          0%, 100% { transform: scale(1.0); }
          50% { transform: scale(1.1); }
        }
      `}</style>

      {/* ── Top bar: mode toggle + audio toggle ── */}
      <div className="flex w-full items-center justify-between">
        {/* Mode tabs */}
        <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-1">
          <button
            onClick={() => switchMode("guided")}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              mode === "guided"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Guided
          </button>
          <button
            onClick={() => switchMode("timer")}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              mode === "timer"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Timer
          </button>
        </div>

        {/* Audio toggle */}
        <button
          onClick={() => setAudioEnabled((prev) => !prev)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-lg transition hover:bg-gray-100"
          title={audioEnabled ? "Mute audio guidance" : "Unmute audio guidance"}
        >
          {audioEnabled ? "🔈" : "🔇"}
        </button>
      </div>

      {/* ── Guided mode: exercise info ── */}
      {mode === "guided" && (
        <div className="text-center">
          <h3 className="text-xl font-bold text-gray-900">{exercise.title}</h3>
          <p className="mt-1 text-sm text-gray-500">
            {exercise.pattern_name} · {exercise.difficulty}
          </p>
        </div>
      )}

      {/* ── Guided mode: cycle counter ── */}
      {mode === "guided" && started && !completed && (
        <div className="text-center">
          <span className={`text-sm font-medium ${getPhaseColor()}`}>
            Cycle {cycleNumber} of {exercise.cycles}
          </span>
        </div>
      )}

      {/* ── Timer mode: duration presets ── */}
      {mode === "timer" && !timerStarted && !timerCompleted && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm font-medium text-gray-500">
            Choose duration
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {TIMER_PRESETS.map((preset) => (
              <button
                key={preset.seconds}
                onClick={() => selectPreset(preset.seconds)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  timerDuration === preset.seconds
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          {/* Custom duration */}
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="120"
              value={customMinutes}
              onChange={(e) => setCustomMinutes(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyCustomMinutes();
              }}
              placeholder="Custom min"
              className="w-28 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 placeholder-gray-400 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
            />
            <button
              onClick={applyCustomMinutes}
              className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-200"
            >
              Set
            </button>
          </div>
        </div>
      )}

      {/* ── Animated breathing circle ── */}
      <div className="relative flex items-center justify-center">
        {/* Timer pulse ring (ambient outer ring) */}
        {mode === "timer" && timerStarted && !timerPaused && (
          <div
            className="absolute h-52 w-52 rounded-full border-2 border-emerald-200/40"
            style={{
              animation: "timerPulse 4s ease-in-out infinite",
            }}
          />
        )}

        <div
          className={`h-44 w-44 rounded-full bg-gradient-to-br ${getCircleColor()} shadow-lg ${
            mode === "timer" && timerStarted && !timerPaused
              ? ""
              : "transition-all duration-1000 ease-in-out"
          }`}
          style={
            mode === "timer"
              ? timerStarted && !timerPaused
                ? { animation: "timerPulse 4s ease-in-out infinite" }
                : {}
              : {
                  transform: `scale(${getCircleScale()})`,
                  transition: `transform ${currentStep?.duration ?? 4}s ease-in-out`,
                }
          }
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {mode === "guided" && currentStep && (
            <>
              <span className={`text-lg font-semibold ${getPhaseColor()}`}>
                {getPhaseLabel()}
              </span>
              <span className="mt-1 text-4xl font-bold text-gray-800 tabular-nums">
                {secondsRemaining}
              </span>
              <span className="text-xs text-gray-400">seconds</span>
            </>
          )}
          {mode === "timer" && (
            <>
              <span className={`text-lg font-semibold ${getPhaseColor()}`}>
                {timerStarted && !timerPaused
                  ? "Breathe gently..."
                  : timerPaused
                    ? "Paused"
                    : "Ready"}
              </span>
              <span className="mt-1 text-4xl font-bold text-gray-800 tabular-nums">
                {formatTimerDisplay(
                  timerStarted ? timerRemaining : timerDuration,
                )}
              </span>
              <span className="text-xs text-gray-400">remaining</span>
            </>
          )}
        </div>
      </div>

      {/* ── Controls ── */}
      {mode === "guided" && (
        <div className="flex items-center gap-3">
          {!started ? (
            <button
              onClick={handleStart}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-8 py-3 text-base font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700 active:scale-[0.98]"
            >
              ▶ Start
            </button>
          ) : paused ? (
            <button
              onClick={handleResume}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-8 py-3 text-base font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700 active:scale-[0.98]"
            >
              ▶ Resume
            </button>
          ) : (
            <button
              onClick={handlePause}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-8 py-3 text-base font-semibold text-white shadow-lg shadow-amber-200 transition hover:bg-amber-600 active:scale-[0.98]"
            >
              ⏸ Pause
            </button>
          )}
          {started && (
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-4 py-3 text-sm font-medium text-gray-600 transition hover:bg-gray-200 active:scale-[0.98]"
            >
              ↺ Reset
            </button>
          )}
        </div>
      )}

      {mode === "timer" && (
        <div className="flex items-center gap-3">
          {!timerStarted ? (
            <button
              onClick={handleTimerStart}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-8 py-3 text-base font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700 active:scale-[0.98]"
            >
              ▶ Start
            </button>
          ) : timerPaused ? (
            <button
              onClick={handleTimerResume}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-8 py-3 text-base font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700 active:scale-[0.98]"
            >
              ▶ Resume
            </button>
          ) : (
            <button
              onClick={handleTimerPause}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-8 py-3 text-base font-semibold text-white shadow-lg shadow-amber-200 transition hover:bg-amber-600 active:scale-[0.98]"
            >
              ⏸ Pause
            </button>
          )}
          {timerStarted && (
            <button
              onClick={handleTimerReset}
              className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-4 py-3 text-sm font-medium text-gray-600 transition hover:bg-gray-200 active:scale-[0.98]"
            >
              ↺ Reset
            </button>
          )}
        </div>
      )}

      {/* ── Guided mode: description (when not started) ── */}
      {mode === "guided" && !started && (
        <p className="max-w-sm text-center text-sm leading-relaxed text-gray-500">
          {exercise.description}
        </p>
      )}

      {/* ── Paused overlay ── */}
      {((mode === "guided" && paused) || (mode === "timer" && timerPaused)) && (
        <p className="text-sm font-medium text-amber-600">
          ⏸ Paused — take your time
        </p>
      )}
    </div>
  );
}

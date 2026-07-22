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

interface PhaseStep {
  phase: Phase;
  duration: number;
  label: string;
}

function buildPhaseSteps(exercise: BreathingExercise): PhaseStep[] {
  const steps: PhaseStep[] = [];
  for (let i = 0; i < exercise.cycles; i++) {
    steps.push({ phase: "inhale", duration: exercise.inhale_seconds, label: "Breathe in..." });
    if (exercise.hold_seconds && exercise.hold_seconds > 0) {
      steps.push({ phase: "hold", duration: exercise.hold_seconds, label: "Hold..." });
    }
    steps.push({ phase: "exhale", duration: exercise.exhale_seconds, label: "Breathe out..." });
    if (exercise.hold_after_exhale_seconds && exercise.hold_after_exhale_seconds > 0) {
      steps.push({ phase: "rest", duration: exercise.hold_after_exhale_seconds, label: "Rest..." });
    }
  }
  return steps;
}

export default function BreathingPlayer({ exercise }: { exercise: BreathingExercise }) {
  const steps = useRef(buildPhaseSteps(exercise));
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState(steps.current[0]?.duration ?? 0);
  const [cycleNumber, setCycleNumber] = useState(1);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentStep = steps.current[stepIndex];
  const totalCycles = exercise.cycles;

  const nextStep = useCallback(() => {
    setStepIndex((prev) => {
      const next = prev + 1;
      if (next >= steps.current.length) {
        // Completed all steps
        setCompleted(true);
        setStarted(false);
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
  }, []);

  // Run the timer
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

  const handleStart = () => {
    if (completed) {
      // Reset
      setCompleted(false);
      setStepIndex(0);
      setCycleNumber(1);
      setSecondsRemaining(steps.current[0].duration);
    }
    setStarted(true);
    setPaused(false);
  };

  const handlePause = () => {
    setPaused(true);
  };

  const handleResume = () => {
    setPaused(false);
  };

  const handleReset = () => {
    setStarted(false);
    setPaused(false);
    setCompleted(false);
    setStepIndex(0);
    setCycleNumber(1);
    setSecondsRemaining(steps.current[0].duration);
  };

  const getCircleScale = () => {
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

  // Completion screen
  if (completed) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 rounded-3xl bg-gradient-to-br from-emerald-50 via-amber-50 to-sky-50 p-10 shadow-sm ring-1 ring-gray-200/40">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-4xl shadow-inner">
          ✅
        </div>
        <div className="text-center">
          <h3 className="text-2xl font-bold text-gray-900">{exercise.title}</h3>
          <p className="mt-1 text-gray-500">Great job! Take a moment to notice how you feel.</p>
        </div>
        <button
          onClick={handleStart}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700 active:scale-[0.98]"
        >
          ↻ Do it again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 rounded-3xl bg-white p-8 shadow-sm ring-1 ring-gray-200/60">
      {/* Exercise info */}
      <div className="text-center">
        <h3 className="text-xl font-bold text-gray-900">{exercise.title}</h3>
        <p className="mt-1 text-sm text-gray-500">{exercise.pattern_name} · {exercise.difficulty}</p>
      </div>

      {/* Progress: Cycle counter */}
      <div className="text-center">
        <span className={`text-sm font-medium ${getPhaseColor()}`}>
          Cycle {cycleNumber} of {totalCycles}
        </span>
      </div>

      {/* Animated breathing circle */}
      <div className="relative flex items-center justify-center">
        <div
          className={`h-44 w-44 rounded-full bg-gradient-to-br ${getCircleColor()} shadow-lg transition-all duration-1000 ease-in-out`}
          style={{
            transform: `scale(${getCircleScale()})`,
            transition: `transform ${currentStep?.duration ?? 4}s ease-in-out`,
          }}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {currentStep && (
            <>
              <span className={`text-lg font-semibold ${getPhaseColor()}`}>
                {currentStep.label}
              </span>
              <span className="mt-1 text-4xl font-bold text-gray-800 tabular-nums">
                {secondsRemaining}
              </span>
              <span className="text-xs text-gray-400">seconds</span>
            </>
          )}
        </div>
      </div>

      {/* Controls */}
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

      {/* Description */}
      {!started && (
        <p className="max-w-sm text-center text-sm leading-relaxed text-gray-500">
          {exercise.description}
        </p>
      )}

      {/* Paused overlay */}
      {paused && (
        <p className="text-sm font-medium text-amber-600">⏸ Paused — take your time</p>
      )}
    </div>
  );
}

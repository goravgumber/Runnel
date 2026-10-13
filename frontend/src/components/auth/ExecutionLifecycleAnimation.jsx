import { useState, useEffect } from "react";
import { CheckCircle2, ArrowRight, Play, Pause } from "lucide-react";

const STAGES = [
  {
    id: "submitted",
    label: "Submitted",
    badgeClass: "bg-[#2D6A4F]/50 text-[#D8F3DC] border-[#40916C]/60",
    headline: "Task queued for execution",
    detail: "Payload accepted with idempotency key",
  },
  {
    id: "running",
    label: "Running",
    badgeClass: "bg-[#1D4E89]/50 text-[#D0E2FF] border-[#3B82F6]/60",
    headline: "Worker processing task (Attempt 1)",
    detail: "Executing background handler function",
  },
  {
    id: "failed",
    label: "Failed",
    badgeClass: "bg-[#802019]/50 text-[#FFD0CC] border-[#E05345]/60",
    headline: "Transient error encountered",
    detail: "Downstream service returned 504 Gateway Timeout",
  },
  {
    id: "retrying",
    label: "Retrying",
    badgeClass: "bg-[#7A4E08]/50 text-[#FFE5B4] border-[#F59E0B]/60",
    headline: "Safe retry with exponential backoff",
    detail: "Scheduling Attempt 2 while preserving attempt history",
  },
  {
    id: "completed",
    label: "Completed",
    badgeClass: "bg-[#1E5C38]/50 text-[#D1FAE5] border-[#10B981]/60",
    headline: "Execution finished successfully",
    detail: "Attempt 2 succeeded (200 OK) • State recorded",
  },
];

export default function ExecutionLifecycleAnimation() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion || isPaused) return;

    // Longer pause on Completed (index 4) before cycling back to Submitted
    const delay = currentIndex === STAGES.length - 1 ? 3600 : 2600;

    const timer = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % STAGES.length);
    }, delay);

    return () => clearTimeout(timer);
  }, [currentIndex, prefersReducedMotion, isPaused]);

  const activeStage = STAGES[currentIndex];

  // Accessible Static Alternative for prefers-reduced-motion
  if (prefersReducedMotion) {
    return (
      <div
        className="w-full bg-[#0F281C] border border-[#23583E] rounded-xl p-4 sm:p-5 text-white"
        aria-label="Execution lifecycle sequence: Submitted, Running, Failed, Retrying, Completed"
      >
        <div className="border-b border-[#23583E] pb-2.5 mb-3.5">
          <span className="text-xs font-mono text-[#A7C8B5] uppercase tracking-wider">
            Execution Lifecycle Overview
          </span>
        </div>
        <div className="space-y-2">
          {STAGES.map((stage, idx) => (
            <div
              key={stage.id}
              className="flex items-start gap-3 p-2 rounded-lg bg-[#183B2B]/70 border border-[#23583E]/70"
            >
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#204E39] text-2xs font-mono text-[#A7C8B5]">
                {idx + 1}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-semibold text-[#E9F5EE]">{stage.label}</span>
                <p className="text-2xs text-[#B2D0BF] mt-0.5">{stage.headline}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full bg-[#0F281C] border border-[#23583E] rounded-2xl p-4 sm:p-5 text-white shadow-xl relative overflow-hidden"
      aria-label="Illustrative execution lifecycle sequence"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-[#23583E] pb-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-[#34D399] animate-pulse" />
          <span className="text-xs font-mono text-[#A7C8B5] uppercase tracking-wider">
            Execution Lifecycle
          </span>
        </div>
        <button
          type="button"
          onClick={() => setIsPaused((prev) => !prev)}
          className="flex items-center gap-1 text-2xs font-mono text-[#A7C8B5] hover:text-white bg-[#1A422F] px-2 py-1 rounded border border-[#2A6145] transition-colors cursor-pointer"
          title={isPaused ? "Resume animation" : "Pause animation"}
          aria-label={isPaused ? "Resume animation" : "Pause animation"}
        >
          {isPaused ? <Play className="w-2.5 h-2.5" /> : <Pause className="w-2.5 h-2.5" />}
          <span>{isPaused ? "Play" : "Pause"}</span>
        </button>
      </div>

      {/* Pipeline Step Progress Bar */}
      <div className="mb-4 px-1">
        <div className="relative flex items-center justify-between">
          {/* Background rail */}
          <div className="absolute top-1/2 left-3 right-3 -translate-y-1/2 h-0.5 bg-[#204D37] -z-0" />
          {/* Filled active track */}
          <div
            className="absolute top-1/2 left-3 -translate-y-1/2 h-0.5 bg-[#52B788] transition-all duration-500 ease-out -z-0"
            style={{ width: `${(currentIndex / (STAGES.length - 1)) * 92}%` }}
          />

          {STAGES.map((stage, idx) => {
            const isPassed = idx < currentIndex;
            const isCurrent = idx === currentIndex;

            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => {
                  setCurrentIndex(idx);
                  setIsPaused(true);
                }}
                className="relative z-10 flex flex-col items-center group cursor-pointer focus:outline-none"
                aria-label={`Step ${idx + 1}: ${stage.label}`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-2xs font-mono transition-all duration-300 ${
                    isCurrent
                      ? "ring-4 ring-[#52B788]/20 bg-[#52B788] text-[#0B1E15] font-bold scale-110"
                      : isPassed
                      ? "bg-[#2D6A4F] text-[#D8F3DC]"
                      : "bg-[#183C2C] text-[#699D80] border border-[#285E43]"
                  }`}
                >
                  {isPassed ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
                </div>
                <span
                  className={`text-2xs font-mono mt-1.5 transition-colors ${
                    isCurrent
                      ? "text-[#E9F5EE] font-semibold"
                      : isPassed
                      ? "text-[#A7C8B5]"
                      : "text-[#699D80]"
                  }`}
                >
                  {stage.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Illustrative Stage Details Card */}
      <div className="bg-[#0A1D14] border border-[#23583E] rounded-xl p-3.5 sm:p-4 transition-all duration-300">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-2xs text-[#8DB89F] uppercase tracking-wider">
            Current Stage
          </span>
          <span
            className={`text-2xs font-mono font-medium px-2 py-0.5 rounded-full border ${activeStage.badgeClass}`}
          >
            {activeStage.label.toUpperCase()}
          </span>
        </div>

        <div className="space-y-1 font-mono text-xs">
          <div className="flex items-start gap-2 text-[#E8F5EE]">
            <ArrowRight className="w-3.5 h-3.5 text-[#52B788] shrink-0 mt-0.5" />
            <span className="font-medium">{activeStage.headline}</span>
          </div>
          <p className="text-2xs text-[#95C0A9] pl-5.5">{activeStage.detail}</p>
        </div>
      </div>
    </div>
  );
}

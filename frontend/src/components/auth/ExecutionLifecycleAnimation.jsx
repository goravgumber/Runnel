import { useState, useEffect } from "react";
import { CheckCircle2, AlertTriangle, RefreshCw, Play, ArrowRight, Pause } from "lucide-react";

const STAGES = [
  {
    id: "submitted",
    label: "Submitted",
    badgeClass: "bg-[#2D6A4F]/40 text-[#D8F3DC] border-[#40916C]/50",
    dotClass: "bg-[#74C69D]",
    headline: "Enqueued into recovery buffer",
    detail: "Idempotency key locked • Payload schema validated",
    duration: "+12ms",
  },
  {
    id: "running",
    label: "Running",
    badgeClass: "bg-[#1D4E89]/40 text-[#D0E2FF] border-[#3B82F6]/50",
    dotClass: "bg-[#60A5FA]",
    headline: "Worker dispatched (Attempt 1)",
    detail: "Consuming job payload • Telemetry channel streaming",
    duration: "+84ms",
  },
  {
    id: "failed",
    label: "Failed",
    badgeClass: "bg-[#802019]/40 text-[#FFD0CC] border-[#E05345]/50",
    dotClass: "bg-[#F87171]",
    headline: "Transient 504 Gateway Timeout",
    detail: "Downstream service unavailable • Error payload captured",
    duration: "+1250ms",
  },
  {
    id: "retrying",
    label: "Retrying",
    badgeClass: "bg-[#7A4E08]/40 text-[#FFE5B4] border-[#F59E0B]/50",
    dotClass: "bg-[#FBBF24]",
    headline: "Exponential backoff scheduled",
    detail: "Attempt 2 scheduled in 2.0s • Context preserved",
    duration: "+2000ms",
  },
  {
    id: "completed",
    label: "Completed",
    badgeClass: "bg-[#1E5C38]/40 text-[#D1FAE5] border-[#10B981]/50",
    dotClass: "bg-[#34D399]",
    headline: "Attempt 2 succeeded (200 OK)",
    detail: "Worker exited 0 • Operational audit log sealed",
    duration: "+342ms",
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

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % STAGES.length);
    }, 2800);

    return () => clearInterval(interval);
  }, [prefersReducedMotion, isPaused]);

  const activeStage = STAGES[currentIndex];

  if (prefersReducedMotion) {
    return (
      <div
        className="w-full bg-[#122E21] border border-[#23583E] rounded-xl p-5 text-white shadow-xl"
        aria-label="Execution lifecycle steps: Submitted, Running, Failed, Retrying, Completed"
      >
        <div className="flex items-center justify-between border-b border-[#23583E] pb-3 mb-4">
          <span className="text-xs font-mono text-[#A7C8B5] uppercase tracking-wider">
            Execution Lifecycle Overview
          </span>
          <span className="text-2xs font-mono text-[#74A889] bg-[#1B4332] px-2 py-0.5 rounded border border-[#2E684C]">
            Static View
          </span>
        </div>
        <div className="space-y-2.5">
          {STAGES.map((stage, idx) => (
            <div
              key={stage.id}
              className="flex items-start gap-3 p-2 rounded-lg bg-[#183B2B]/60 border border-[#23583E]/70"
            >
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#204E39] text-xs font-mono text-[#A7C8B5]">
                {idx + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#E9F5EE]">{stage.label}</span>
                  <span className="text-2xs font-mono text-[#74A889]">{stage.duration}</span>
                </div>
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
      className="w-full bg-[#122E21] border border-[#23583E] rounded-2xl p-5 text-white shadow-2xl relative overflow-hidden"
      aria-label="Interactive execution lifecycle illustration"
    >
      {/* Visual background ambient glow */}
      <div className="absolute -top-12 -right-12 w-44 h-44 bg-[#2D6A4F]/25 rounded-full blur-3xl pointer-events-none" />

      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-[#23583E] pb-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-[#34D399] animate-pulse" />
          <span className="text-xs font-mono text-[#A7C8B5] uppercase tracking-wider">
            Lifecycle Stream Preview
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPaused((prev) => !prev)}
            className="flex items-center gap-1 text-2xs font-mono text-[#A7C8B5] hover:text-white bg-[#1A422F] px-2 py-1 rounded border border-[#2A6145] transition-colors cursor-pointer"
            title={isPaused ? "Resume animation" : "Pause animation"}
            aria-label={isPaused ? "Resume animation" : "Pause animation"}
          >
            {isPaused ? <Play className="w-2.5 h-2.5" /> : <Pause className="w-2.5 h-2.5" />}
            <span>{isPaused ? "Resume" : "Pause"}</span>
          </button>
        </div>
      </div>

      {/* Pipeline Step Progress Bar */}
      <div className="mb-5 px-1">
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
                onClick={() => setCurrentIndex(idx)}
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

      {/* Simulated Active Attempt Inspector */}
      <div className="bg-[#0B1F16] border border-[#23583E] rounded-xl p-4 transition-all duration-300">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-[#E9F5EE] font-semibold">
              exec_webhook_8492
            </span>
            <span
              className={`text-2xs font-mono font-medium px-2 py-0.5 rounded-full border ${activeStage.badgeClass}`}
            >
              {activeStage.label.toUpperCase()}
            </span>
          </div>
          <span className="font-mono text-2xs text-[#74A889]">{activeStage.duration}</span>
        </div>

        <div className="space-y-1.5 font-mono text-xs">
          <div className="flex items-start gap-2 text-[#D8F3DC]">
            <ArrowRight className="w-3.5 h-3.5 text-[#52B788] shrink-0 mt-0.5" />
            <span className="font-medium">{activeStage.headline}</span>
          </div>
          <p className="text-2xs text-[#8DB89F] pl-5.5">{activeStage.detail}</p>
        </div>

        {/* Micro-diagnostic footer inside card */}
        <div className="mt-3.5 pt-2.5 border-t border-[#1C4732] flex items-center justify-between text-2xs font-mono text-[#6E9E82]">
          <span>Handler: webhook.stripe.events</span>
          <span>Max Attempts: 3</span>
        </div>
      </div>
    </div>
  );
}

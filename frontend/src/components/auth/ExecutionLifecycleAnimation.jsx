import { useState, useEffect } from "react";
import {
  Check,
  RotateCw,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  GitBranch,
  ArrowLeftRight,
  Play,
  Pause,
  AlertOctagon,
  Clock,
  Sparkles,
} from "lucide-react";

// Narrative stages for Login (Horizontal Stepper)
const LOGIN_LIFECYCLE_STAGES = [
  {
    id: "submitted",
    label: "Submitted",
    step: 1,
    title: "Enqueued into recovery buffer",
    detail: "Task payload accepted • Idempotency key locked",
    attemptBadge: "Attempt 1",
    badgeColor: "text-[#8DB89F] bg-[#133023] border-[#24543C]",
    icon: Check,
    iconColor: "text-[#52B788]",
    statusText: "Queued",
  },
  {
    id: "running",
    label: "Running",
    step: 2,
    title: "Executing payment dispatch",
    detail: "Worker active • Contacting external webhook receiver",
    attemptBadge: "Attempt 1 • Running",
    badgeColor: "text-[#60A5FA] bg-[#102A43] border-[#1D4ED8]/60",
    icon: RotateCw,
    iconColor: "text-[#60A5FA]",
    statusText: "Processing",
  },
  {
    id: "failed",
    label: "Failed",
    step: 3,
    title: "Downstream timeout intercepted",
    detail: "504 Gateway Timeout caught • Stack trace preserved for replay",
    attemptBadge: "Attempt 1 • Failed",
    badgeColor: "text-[#F87171] bg-[#3B1214] border-[#DC2626]/60",
    icon: AlertTriangle,
    iconColor: "text-[#F87171]",
    statusText: "Intercepted",
  },
  {
    id: "retrying",
    label: "Retrying",
    step: 4,
    title: "Safe retry with exponential backoff",
    detail: "Scheduling Attempt 2 • Deduplicated token avoids double-charge",
    attemptBadge: "Attempt 2 • Retrying",
    badgeColor: "text-[#FBBF24] bg-[#38260B] border-[#D97706]/60",
    icon: RotateCcw,
    iconColor: "text-[#FBBF24]",
    statusText: "Backoff",
  },
  {
    id: "completed",
    label: "Completed",
    step: 5,
    title: "Delivered successfully",
    detail: "Task completed and verified on Attempt 2 • State recorded",
    attemptBadge: "Attempt 2 • Verified",
    badgeColor: "text-[#34D399] bg-[#0E3322] border-[#059669]/60",
    icon: CheckCircle2,
    iconColor: "text-[#34D399]",
    statusText: "Resolved",
  },
];

// Narrative stages for Signup (Vertical Simulation)
const SIGNUP_LIFECYCLE_STAGES = [
  {
    id: "submitted",
    step: 1,
    title: "Submitted",
    desc: "Payload captured and validated with idempotency fingerprint.",
    tag: "Webhook enqueued",
    tagColor: "text-[#8DB89F]",
  },
  {
    id: "running",
    step: 2,
    title: "Running",
    desc: "Handler dispatched with isolated context and resource limits.",
    tag: "Worker active",
    tagColor: "text-[#52B788]",
  },
  {
    id: "failed",
    step: 3,
    title: "Failed",
    desc: "Upstream drop caught; stack snapshot preserved for replay.",
    tag: "Timeout intercepted",
    tagColor: "text-[#F87171]",
  },
  {
    id: "retrying",
    step: 4,
    title: "Retrying",
    desc: "Re-executed safely with deduplicated transaction token.",
    tag: "Backoff replay",
    tagColor: "text-[#FBBF24]",
  },
  {
    id: "completed",
    step: 5,
    title: "Completed",
    desc: "Downstream listeners notified; audit log committed.",
    tag: "State finalized",
    tagColor: "text-[#52B788]",
  },
];

export default function ExecutionLifecycleAnimation({ mode = "login" }) {
  const [currentIndex, setCurrentIndex] = useState(mode === "signup" ? 1 : 1);
  const [isPaused, setIsPaused] = useState(false);

  const stages = mode === "signup" ? SIGNUP_LIFECYCLE_STAGES : LOGIN_LIFECYCLE_STAGES;

  // Auto-advance through the narrative lifecycle
  useEffect(() => {
    if (isPaused) return;

    // Longer pause on Completed (3.5s) to let user read the resolution
    const delay = currentIndex === stages.length - 1 ? 3500 : 2500;

    const timer = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % stages.length);
    }, delay);

    return () => clearTimeout(timer);
  }, [currentIndex, isPaused, stages.length]);

  // =============================================================
  // SIGNUP MODE: Vertical 5-Step Execution Lifecycle Simulation
  // Matches Stitch Create Account screen
  // =============================================================
  if (mode === "signup") {
    return (
      <div
        className="w-full bg-[#0D241A]/95 border border-[#1D4A36] rounded-xl p-4 sm:p-5 text-white shadow-xl relative overflow-hidden"
        aria-label="Execution Lifecycle Live simulation"
      >
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-[#1D4A36] pb-3 mb-3">
          <div className="flex items-center gap-2">
            <GitBranch className="w-3.5 h-3.5 text-[#52B788]" />
            <span className="text-xs font-mono text-[#E8F5EE] tracking-wide">
              Execution Lifecycle
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-2xs font-mono text-[#74A889]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#34D399] animate-pulse" />
              <span>Live simulation</span>
            </div>
            <button
              type="button"
              onClick={() => setIsPaused((prev) => !prev)}
              className="p-1 text-[#8DB89F] hover:text-white rounded hover:bg-[#163828] transition-colors cursor-pointer"
              title={isPaused ? "Resume simulation" : "Pause simulation"}
              aria-label={isPaused ? "Resume simulation" : "Pause simulation"}
            >
              {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* 5 Vertical Step Rows */}
        <div className="space-y-1.5">
          {SIGNUP_LIFECYCLE_STAGES.map((stage, idx) => {
            const isActive = idx === currentIndex;
            const isPassed = idx < currentIndex;

            return (
              <div
                key={stage.id}
                onClick={() => {
                  setCurrentIndex(idx);
                  setIsPaused(true);
                }}
                className={`flex items-center justify-between p-2.5 rounded-lg transition-all duration-300 cursor-pointer ${
                  isActive
                    ? "bg-[#163B2B] border border-[#2D6A4F] shadow-sm ring-1 ring-[#52B788]/30 scale-[1.01]"
                    : "bg-[#091B13]/60 border border-transparent hover:border-[#1E4B37] hover:bg-[#102B1F]"
                }`}
              >
                <div className="flex items-start gap-3 min-w-0 pr-2">
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-2xs font-mono transition-all ${
                      isActive
                        ? "bg-[#2D6A4F] text-[#D8F3DC] font-bold ring-2 ring-[#52B788]/50"
                        : isPassed
                        ? "bg-[#1B4332] text-[#A7C8B5]"
                        : "bg-[#143224] text-[#6E9E82]"
                    }`}
                  >
                    {isPassed ? <Check className="w-3 h-3" /> : stage.step}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#E9F5EE] flex items-center gap-1.5">
                      <span>{stage.title}</span>
                      {isActive && (
                        <span className="h-1.5 w-1.5 rounded-full bg-[#52B788] animate-ping" />
                      )}
                    </div>
                    <p className="text-2xs text-[#95C0A9] mt-0.5 leading-snug line-clamp-1">
                      {stage.desc}
                    </p>
                  </div>
                </div>

                <div
                  className={`text-2xs font-mono shrink-0 pl-2 font-medium ${
                    isActive ? stage.tagColor : "text-[#6E9E82]"
                  }`}
                >
                  {stage.tag}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // =============================================================
  // LOGIN MODE: Horizontal Task Lifecycle Stepper & Live Subcard
  // Matches Stitch Sign In screen
  // =============================================================
  const currentStage = LOGIN_LIFECYCLE_STAGES[currentIndex];

  return (
    <div
      className="w-full bg-[#0D241A]/95 border border-[#1D4A36] rounded-xl p-4 sm:p-5 text-white shadow-xl relative overflow-hidden"
      aria-label="Task Lifecycle In Progress illustration"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-[#1D4A36] pb-3 mb-4">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="w-3.5 h-3.5 text-[#52B788]" />
          <span className="text-xs font-medium text-[#E8F5EE]">Task Lifecycle</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-2xs font-mono bg-[#163828] text-[#52B788] border border-[#2B664B]">
            {currentIndex === 4 ? "Resolved" : "In Progress"}
          </span>
          <button
            type="button"
            onClick={() => setIsPaused((prev) => !prev)}
            className="p-1 text-[#8DB89F] hover:text-white rounded hover:bg-[#163828] transition-colors cursor-pointer"
            title={isPaused ? "Resume animation" : "Pause animation"}
            aria-label={isPaused ? "Resume animation" : "Pause animation"}
          >
            {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* 5 Horizontal Stepper Nodes with connecting rail */}
      <div className="mb-5 px-1">
        <div className="relative flex items-center justify-between">
          {/* Background rail */}
          <div className="absolute top-3 left-4 right-4 -translate-y-1/2 h-0.5 bg-[#1B4332] -z-0" />
          {/* Active progress track */}
          <div
            className="absolute top-3 left-4 -translate-y-1/2 h-0.5 bg-[#52B788] transition-all duration-500 ease-out -z-0"
            style={{ width: `${(currentIndex / (LOGIN_LIFECYCLE_STAGES.length - 1)) * 88}%` }}
          />

          {LOGIN_LIFECYCLE_STAGES.map((stage, idx) => {
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
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-2xs transition-all duration-300 ${
                    isCurrent
                      ? "ring-4 ring-[#52B788]/30 bg-[#52B788] text-[#0D241A] font-bold scale-110 shadow-md"
                      : isPassed
                      ? "bg-[#2D6A4F] text-[#D8F3DC]"
                      : "bg-[#102B1F] text-[#5A8E71] border border-[#204E38]"
                  }`}
                >
                  {isPassed ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : isCurrent ? (
                    idx === 1 ? (
                      <RotateCw className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: "3s" }} />
                    ) : idx === 2 ? (
                      <AlertOctagon className="w-3.5 h-3.5" />
                    ) : idx === 3 ? (
                      <RotateCcw className="w-3.5 h-3.5" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )
                  ) : idx === 2 ? (
                    <AlertTriangle className="w-3 h-3" />
                  ) : idx === 3 ? (
                    <RotateCcw className="w-3 h-3" />
                  ) : (
                    <CheckCircle2 className="w-3 h-3" />
                  )}
                </div>
                <span
                  className={`text-2xs font-mono mt-1.5 transition-colors ${
                    isCurrent
                      ? "text-[#E9F5EE] font-semibold"
                      : isPassed
                      ? "text-[#A7C8B5]"
                      : "text-[#5A8E71]"
                  }`}
                >
                  {stage.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Attempt Dispatch Subcard */}
      <div className="bg-[#081811] border border-[#1B4332] rounded-lg p-3 sm:p-3.5 flex items-center justify-between transition-all duration-300">
        <div className="flex items-start gap-3 min-w-0 pr-2">
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#143527] border border-[#23583E] transition-colors mt-0.5 ${currentStage.iconColor}`}
          >
            {currentIndex === 1 ? (
              <RotateCw className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: "3s" }} />
            ) : currentIndex === 2 ? (
              <AlertTriangle className="w-3.5 h-3.5" />
            ) : currentIndex === 3 ? (
              <RotateCcw className="w-3.5 h-3.5" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-white leading-tight flex items-center gap-1.5">
              <span>{currentStage.title}</span>
            </div>
            <p className="text-2xs text-[#8DB89F] mt-0.5 leading-normal truncate">
              {currentStage.detail}
            </p>
          </div>
        </div>

        <span
          className={`shrink-0 text-2xs font-mono px-2 py-0.5 rounded border transition-colors ${currentStage.badgeColor}`}
        >
          {currentStage.attemptBadge}
        </span>
      </div>
    </div>
  );
}

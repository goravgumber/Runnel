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
} from "lucide-react";

const STAGES_LOGIN = [
  {
    id: "submitted",
    label: "Submitted",
    step: 1,
    title: "Enqueued into recovery buffer",
    detail: "Idempotency key locked • Payload schema validated",
    attempt: "Attempt 1",
  },
  {
    id: "running",
    label: "Running",
    step: 2,
    title: "Executing payment dispatch",
    detail: "Contacting external webhook receiver",
    attempt: "Attempt 1",
  },
  {
    id: "failed",
    label: "Failed",
    step: 3,
    title: "Transient error intercepted",
    detail: "Upstream service timeout (504) • Preserving trace",
    attempt: "Attempt 1",
  },
  {
    id: "retrying",
    label: "Retrying",
    step: 4,
    title: "Safe retry in progress",
    detail: "Exponential backoff active • Attempt 2 scheduled",
    attempt: "Attempt 2",
  },
  {
    id: "completed",
    label: "Completed",
    step: 5,
    title: "Execution finished successfully",
    detail: "Attempt 2 succeeded (200 OK) • State recorded",
    attempt: "Attempt 2",
  },
];

const STAGES_SIGNUP = [
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
    tagColor: "text-[#E05345]",
  },
  {
    id: "retrying",
    step: 4,
    title: "Retrying",
    desc: "Re-executed safely with deduplicated transaction token.",
    tag: "Backoff replay",
    tagColor: "text-[#F59E0B]",
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
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const stages = mode === "signup" ? STAGES_SIGNUP : STAGES_LOGIN;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion || isPaused) return;

    // 3.6s pause on Completed (index 4) before cycling back
    const delay = currentIndex === stages.length - 1 ? 3600 : 2600;

    const timer = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % stages.length);
    }, delay);

    return () => clearTimeout(timer);
  }, [currentIndex, prefersReducedMotion, isPaused, stages.length]);

  // Accessible Static Alternative for prefers-reduced-motion
  if (prefersReducedMotion) {
    return (
      <div
        className="w-full bg-[#0D241A] border border-[#1D4A36] rounded-xl p-4 sm:p-5 text-white"
        aria-label="Execution lifecycle sequence: Submitted, Running, Failed, Retrying, Completed"
      >
        <div className="border-b border-[#1D4A36] pb-2.5 mb-3.5 flex items-center justify-between">
          <span className="text-xs font-mono text-[#A7C8B5] uppercase tracking-wider">
            Execution Lifecycle Overview
          </span>
          <span className="text-2xs font-mono text-[#74A889]">Accessible Mode</span>
        </div>
        <div className="space-y-2">
          {stages.map((stage, idx) => (
            <div
              key={stage.id}
              className="flex items-start gap-3 p-2 rounded-lg bg-[#143527]/70 border border-[#1E4C38]"
            >
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1F4E38] text-2xs font-mono text-[#A7C8B5]">
                {idx + 1}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-semibold text-[#E9F5EE]">
                  {stage.title || stage.label}
                </span>
                <p className="text-2xs text-[#B2D0BF] mt-0.5">
                  {stage.desc || stage.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // SIGNUP MODE: Vertical 5-Step Execution Lifecycle Simulation
  // -------------------------------------------------------------
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
              className="p-1 text-[#8DB89F] hover:text-white rounded hover:bg-[#163828] transition-colors"
              title={isPaused ? "Resume animation" : "Pause animation"}
              aria-label={isPaused ? "Resume animation" : "Pause animation"}
            >
              {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* 5 Vertical Step Rows */}
        <div className="space-y-1.5">
          {STAGES_SIGNUP.map((stage, idx) => {
            const isActive = idx === currentIndex;
            return (
              <div
                key={stage.id}
                onClick={() => {
                  setCurrentIndex(idx);
                  setIsPaused(true);
                }}
                className={`flex items-center justify-between p-2.5 rounded-lg transition-all duration-300 cursor-pointer ${
                  isActive
                    ? "bg-[#163B2B] border border-[#2D6A4F] shadow-sm"
                    : "bg-[#091B13]/60 border border-transparent hover:border-[#1E4B37] hover:bg-[#102B1F]"
                }`}
              >
                <div className="flex items-start gap-3 min-w-0 pr-2">
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-2xs font-mono transition-colors ${
                      isActive
                        ? "bg-[#2D6A4F] text-[#D8F3DC] font-bold ring-2 ring-[#52B788]/40"
                        : "bg-[#183E2D] text-[#74A889]"
                    }`}
                  >
                    {stage.step}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#E9F5EE]">
                      {stage.title}
                    </div>
                    <p className="text-2xs text-[#95C0A9] mt-0.5 leading-snug line-clamp-1">
                      {stage.desc}
                    </p>
                  </div>
                </div>

                <div
                  className={`text-2xs font-mono shrink-0 pl-2 ${
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

  // -------------------------------------------------------------
  // LOGIN MODE: Horizontal Task Lifecycle Stepper & Dispatch Subcard
  // -------------------------------------------------------------
  const activeLoginStage = STAGES_LOGIN[currentIndex];

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
            In Progress
          </span>
          <button
            type="button"
            onClick={() => setIsPaused((prev) => !prev)}
            className="p-1 text-[#8DB89F] hover:text-white rounded hover:bg-[#163828] transition-colors"
            title={isPaused ? "Resume animation" : "Pause animation"}
            aria-label={isPaused ? "Resume animation" : "Pause animation"}
          >
            {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* 5 Horizontal Stepper Nodes */}
      <div className="mb-5 px-1">
        <div className="relative flex items-center justify-between">
          {/* Background rail */}
          <div className="absolute top-3 left-4 right-4 -translate-y-1/2 h-0.5 bg-[#1B4332] -z-0" />
          {/* Active track progress */}
          <div
            className="absolute top-3 left-4 -translate-y-1/2 h-0.5 bg-[#52B788] transition-all duration-500 ease-out -z-0"
            style={{ width: `${(currentIndex / (STAGES_LOGIN.length - 1)) * 88}%` }}
          />

          {STAGES_LOGIN.map((stage, idx) => {
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
                      ? "ring-4 ring-[#52B788]/25 bg-[#52B788] text-[#0D241A] font-bold scale-110"
                      : isPassed
                      ? "bg-[#2D6A4F] text-[#D8F3DC]"
                      : "bg-[#102B1F] text-[#5A8E71] border border-[#204E38]"
                  }`}
                >
                  {isPassed ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : isCurrent ? (
                    <RotateCw className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: "3s" }} />
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
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#143527] border border-[#23583E] text-[#52B788] mt-0.5">
            <RotateCw className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: "4s" }} />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-white leading-tight">
              {activeLoginStage.title}
            </div>
            <p className="text-2xs text-[#8DB89F] mt-0.5 leading-normal truncate">
              {activeLoginStage.detail}
            </p>
          </div>
        </div>

        <span className="shrink-0 text-2xs font-mono text-[#74A889] bg-[#133023] px-2 py-0.5 rounded border border-[#24543C]">
          {activeLoginStage.attempt}
        </span>
      </div>
    </div>
  );
}

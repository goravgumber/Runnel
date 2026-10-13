import { Link } from "react-router-dom";
import {
  Eye,
  AlertCircle,
  RotateCcw,
  Search,
} from "lucide-react";
import ExecutionLifecycleAnimation from "./ExecutionLifecycleAnimation";

export default function AuthLayout({
  children,
  mode = "login", // "login" | "signup"
  title,
  subtitle,
  alternateLink,
  alternateText,
  alternateActionText,
}) {
  const isLogin = mode === "login";

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#FBF9F3] overflow-x-hidden font-sans">
      {/* ========================================================
          LEFT PANEL: Forest-Green Product Showcase (Desktop 52–56%)
         ======================================================== */}
      <aside
        className="hidden lg:flex lg:w-[54%] xl:w-[55%] bg-[#122E21] text-white flex-col justify-between p-8 xl:p-12 relative overflow-hidden border-r border-[#1C4632]"
        aria-label="Runnel product overview and execution lifecycle"
      >
        {/* Subtle geometric dot matrix backdrop */}
        <div
          className="absolute inset-0 opacity-[0.035] pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(#FFFFFF 1px, transparent 1px), radial-gradient(#FFFFFF 1px, #122E21 1px)",
            backgroundSize: "24px 24px",
            backgroundPosition: "0 0, 12px 12px",
          }}
        />

        {/* Top Header Bar */}
        <div className="relative z-10 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-3 group focus:outline-none focus:ring-2 focus:ring-[#52B788]/40 rounded-lg p-1 -m-1 transition-colors"
          >
            {/* Runnel Rounded Node Icon */}
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1D4A36] border border-[#2B664B] text-[#D8F3DC] group-hover:bg-[#23583E] transition-colors">
              <svg
                className="w-4.5 h-4.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </div>
            <span className="font-bold text-lg tracking-tight text-white">Runnel</span>

            {/* If Signup: v2.14 Open Source Tag */}
            {!isLogin && (
              <span className="ml-2 px-2 py-0.5 rounded text-2xs font-mono text-[#A7C8B5] bg-[#1D4A36] border border-[#285E43]">
                v2.14 Open Source
              </span>
            )}
          </Link>

          {/* If Login: Task Recovery Status Tag */}
          {isLogin && (
            <div className="flex items-center gap-1.5 text-xs text-[#8DB89F] font-medium">
              <span className="h-2 w-2 rounded-full bg-[#34D399]" />
              <span>Task Recovery</span>
            </div>
          )}
        </div>

        {/* Product Hero Headline & Lifecycle Animation */}
        <div className="relative z-10 my-auto py-5 max-w-[540px]">
          {isLogin ? (
            <h1 className="text-3xl xl:text-4xl font-bold tracking-tight text-white leading-tight">
              When background work fails,
              <br />
              <span className="text-white">recover with confidence.</span>
            </h1>
          ) : (
            <h1 className="text-3xl xl:text-4xl font-bold tracking-tight text-white leading-tight">
              When background work fails, recover
              <br />
              <span className="text-white">with confidence.</span>
            </h1>
          )}

          <p className="mt-3 text-sm text-[#A7C8B5] leading-relaxed max-w-lg">
            Track background tasks, understand what went wrong, and retry failed work
            without losing track of what happened.
          </p>

          {/* Lifecycle Animation according to Mode */}
          <div className="mt-6">
            <ExecutionLifecycleAnimation mode={mode} />
          </div>
        </div>

        {/* Bottom Feature Elements */}
        {isLogin ? (
          /* LOGIN: 3 Distinct Feature Cards with Descriptions */
          <div className="relative z-10 grid grid-cols-3 gap-3.5 pt-4 max-w-[540px]">
            <div className="bg-[#0C2117]/80 border border-[#1C4632] rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#E8F5EE]">
                <Eye className="w-3.5 h-3.5 text-[#52B788] shrink-0" />
                <span className="truncate">Track background tasks</span>
              </div>
              <p className="text-2xs text-[#95C0A9] mt-1.5 leading-snug">
                Know exactly where any asynchronous job is in its lifecycle.
              </p>
            </div>

            <div className="bg-[#0C2117]/80 border border-[#1C4632] rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#E8F5EE]">
                <Search className="w-3.5 h-3.5 text-[#52B788] shrink-0" />
                <span className="truncate">See what went wrong</span>
              </div>
              <p className="text-2xs text-[#95C0A9] mt-1.5 leading-snug">
                Pinpoint timeout causes and error details with clear context.
              </p>
            </div>

            <div className="bg-[#0C2117]/80 border border-[#1C4632] rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#E8F5EE]">
                <RotateCcw className="w-3.5 h-3.5 text-[#52B788] shrink-0" />
                <span className="truncate">Retry safely</span>
              </div>
              <p className="text-2xs text-[#95C0A9] mt-1.5 leading-snug">
                Replay failed work safely with deterministic safeguards.
              </p>
            </div>
          </div>
        ) : (
          /* SIGNUP: 3 Compact Horizontal Feature Chips */
          <div className="relative z-10 flex items-center gap-2.5 pt-4 max-w-[540px]">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#163828] border border-[#2B664B] text-2xs text-[#D8F3DC] font-medium">
              <Eye className="w-3.5 h-3.5 text-[#52B788]" />
              <span>Track background tasks</span>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#163828] border border-[#2B664B] text-2xs text-[#D8F3DC] font-medium">
              <AlertCircle className="w-3.5 h-3.5 text-[#52B788]" />
              <span>See what went wrong</span>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#163828] border border-[#2B664B] text-2xs text-[#D8F3DC] font-medium">
              <RotateCcw className="w-3.5 h-3.5 text-[#52B788]" />
              <span>Retry safely</span>
            </div>
          </div>
        )}

        {/* Bottom Footer */}
        <div className="relative z-10 pt-4 border-t border-[#1C4632] flex items-center justify-between text-2xs font-mono text-[#6E9E82] max-w-[540px]">
          {isLogin ? (
            <>
              <span>Runnel · Task recovery made simple</span>
              <span>Reliable by design</span>
            </>
          ) : (
            <>
              <span>Understand failures. Recover with confidence.</span>
              <span>Auditable & idempotent background executions</span>
            </>
          )}
        </div>
      </aside>

      {/* ========================================================
          RIGHT PANEL: Warm Ivory Form Surface (Desktop 44–48% & Mobile 100%)
         ======================================================== */}
      <div className="w-full lg:w-[46%] xl:w-[45%] flex flex-col justify-between p-5 sm:p-8 md:p-10 lg:p-10 xl:p-14 min-h-screen overflow-y-auto">
        {/* ========================================================
            MOBILE HEADER & INTRO (Visible only on mobile < lg)
           ======================================================== */}
        <div className="block lg:hidden mb-6">
          {/* Top Bar with [R] RUNNEL logo and optional status badge */}
          <div className="flex items-center justify-between mb-4">
            <Link to="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2D5A43] text-white font-bold text-sm tracking-wider">
                R
              </div>
              <span className="font-bold text-base tracking-wider text-[#1B1C18]">
                RUNNEL
              </span>
            </Link>

            {!isLogin && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#EFECE3] border border-[#E0DDD2] text-2xs font-mono text-[#1B4332] font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-[#1B4332]" />
                RECOVERY: ACTIVE
              </span>
            )}
          </div>

          {/* Mobile Headline */}
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1B1C18] leading-tight">
            When background work fails, recover with confidence.
          </h1>

          {isLogin && (
            <p className="mt-1.5 text-xs text-[#5F5E5E] leading-relaxed">
              Track background tasks, understand what went wrong, and retry failed work.
            </p>
          )}

          {/* Micro-Lifecycle Banner Pill */}
          <div
            className="mt-4 flex items-center justify-between bg-[#EFECE3] border border-[#E0DDD2] rounded-lg px-2.5 py-1.5 text-2xs font-mono text-[#374151]"
            aria-label="Lifecycle progress sequence"
          >
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
              <span className="text-[#1F2937]">Submitted</span>
            </div>
            <span className="text-[#9CA3AF]">→</span>
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
              <span className="text-[#1F2937]">Running</span>
            </div>
            <span className="text-[#9CA3AF]">→</span>
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#E05345]" />
              <span className="text-[#E05345] font-semibold">Failed</span>
            </div>
            <span className="text-[#9CA3AF]">→</span>
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />
              <span className="text-[#B45309]">Retrying</span>
            </div>
            <span className="text-[#9CA3AF]">→</span>
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
              <span className="text-[#1F2937]">Completed</span>
            </div>
          </div>
        </div>

        {/* Center Form Card Container */}
        <main className="w-full max-w-[440px] mx-auto my-auto py-2 sm:py-4">
          {/* Card Header */}
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 sm:p-8 shadow-sm">
            <div className="mb-6">
              <h2 className="text-2xl font-bold tracking-tight text-[#1B1C18]">
                {title}
              </h2>
              {subtitle && (
                <p className="mt-1.5 text-sm text-[#5F5E5E] leading-relaxed">
                  {subtitle}
                </p>
              )}
            </div>

            {/* Form Children Content */}
            {children}

            {/* Navigation link underneath form card inside the container */}
            {alternateLink && (
              <div className="mt-5 text-center text-xs text-[#5F5E5E]">
                <span>{alternateText} </span>
                <Link
                  to={alternateLink}
                  className="font-semibold text-[#1B4332] hover:underline transition-colors ml-1"
                >
                  {alternateActionText}
                </Link>
              </div>
            )}
          </div>

          {/* Login Bottom Protection Note */}
          {isLogin && (
            <div className="mt-6 text-center text-2xs text-[#85857E] font-medium">
              Protected by end-to-end task encryption
            </div>
          )}
        </main>

        {/* Desktop Bottom Spacer / Footnote */}
        <div className="hidden lg:block pt-4 text-center text-2xs font-mono text-[#85857E]">
          Runnel • Recovery Inbox for Asynchronous Work
        </div>
      </div>
    </div>
  );
}

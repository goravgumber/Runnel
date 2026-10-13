import { Link } from "react-router-dom";
import ExecutionLifecycleAnimation from "./ExecutionLifecycleAnimation";

export default function AuthLayout({
  children,
  title,
  subtitle,
  alternateLink,
  alternateText,
  alternateActionText,
}) {
  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-canvas overflow-x-hidden">
      {/* ========================================================
          LEFT PANEL: Forest-Green Product Showcase (Desktop 52–56%)
         ======================================================== */}
      <aside
        className="hidden lg:flex lg:w-[54%] xl:w-[55%] bg-[#122E21] text-white flex-col justify-between p-10 xl:p-14 relative overflow-hidden border-r border-[#1C4632]"
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

        {/* Brand Logo & Wordmark (Top of Left Panel) */}
        <div className="relative z-10 flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-3 group focus:outline-none focus:ring-2 focus:ring-[#52B788]/40 rounded-lg p-1 -m-1 transition-colors"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1D4A36] border border-[#2B664B] text-[#D8F3DC] group-hover:bg-[#23583E] transition-colors">
              <svg
                className="w-5 h-5"
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
            <div>
              <span className="font-bold text-lg tracking-tight text-white">Runnel</span>
              <span className="ml-2 text-2xs font-mono text-[#8DB89F] uppercase tracking-wider">
                Recovery Inbox
              </span>
            </div>
          </Link>
        </div>

        {/* Product Hero Headline & Natural Copy */}
        <div className="relative z-10 my-auto py-6 max-w-[540px]">
          <h1 className="text-3xl xl:text-4xl font-bold tracking-tight text-white leading-tight">
            When background work fails,
            <br />
            <span className="text-[#52B788]">recover with confidence.</span>
          </h1>

          <p className="mt-3.5 text-sm text-[#A7C8B5] leading-relaxed max-w-lg">
            Track background tasks, understand what went wrong, and retry failed work
            without losing execution history.
          </p>

          {/* Animated Execution-Lifecycle Illustration */}
          <div className="mt-7">
            <ExecutionLifecycleAnimation />
          </div>
        </div>

        {/* Three Concise Benefits (Bottom of Left Panel) */}
        <div className="relative z-10 grid grid-cols-3 gap-4 pt-6 border-t border-[#1C4632] max-w-[540px]">
          <div>
            <div className="text-xs font-semibold text-[#E8F5EE]">Idempotent Retries</div>
            <p className="text-2xs text-[#95C0A9] mt-1 leading-normal">
              Safe re-execution that prevents duplicate side-effects.
            </p>
          </div>
          <div>
            <div className="text-xs font-semibold text-[#E8F5EE]">Root-Cause Diagnostics</div>
            <p className="text-2xs text-[#95C0A9] mt-1 leading-normal">
              Clear attempt logs, error details, and timelines.
            </p>
          </div>
          <div>
            <div className="text-xs font-semibold text-[#E8F5EE]">Central Recovery Inbox</div>
            <p className="text-2xs text-[#95C0A9] mt-1 leading-normal">
              A single, reliable queue for asynchronous tasks.
            </p>
          </div>
        </div>
      </aside>

      {/* ========================================================
          RIGHT PANEL: Warm Ivory Form Surface (Desktop 44–48% & Mobile 100%)
         ======================================================== */}
      <div className="w-full lg:w-[46%] xl:w-[45%] flex flex-col justify-between p-6 sm:p-10 md:p-12 lg:p-12 xl:p-16 min-h-screen overflow-y-auto">
        {/* Mobile Header (Brand & Quick Switch) / Desktop Top Nav */}
        <header className="flex items-center justify-between mb-6 sm:mb-8">
          {/* Mobile Logo (Visible only on mobile screens) */}
          <Link
            to="/"
            className="flex lg:hidden items-center gap-2.5 group focus:outline-none focus:ring-2 focus:ring-forest/30 rounded-lg p-1 -m-1 transition-colors"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-forest-ghost border border-forest-border text-forest">
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
            <span className="font-bold text-base tracking-tight text-charcoal">Runnel</span>
          </Link>

          {/* Spacer on desktop to push alternate link to the right */}
          <div className="hidden lg:block" />

          {/* Quick toggle link */}
          {alternateLink && (
            <div className="text-xs text-charcoal-secondary ml-auto">
              <span className="hidden sm:inline">{alternateText} </span>
              <Link
                to={alternateLink}
                className="font-semibold text-forest hover:text-forest-hover underline underline-offset-2 transition-colors ml-1"
              >
                {alternateActionText}
              </Link>
            </div>
          )}
        </header>

        {/* Center Form Card Container */}
        <main className="w-full max-w-[440px] mx-auto my-auto py-4 sm:py-6">
          <div className="mb-6">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-charcoal">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-2 text-sm text-charcoal-secondary leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>

          {/* Form Surface Card */}
          <div className="bg-surface border border-stone-border rounded-2xl p-6 sm:p-8 shadow-card">
            {children}
          </div>

          {/* Alternate Link Underneath Card */}
          {alternateLink && (
            <div className="mt-6 text-center text-sm text-charcoal-secondary">
              <span>{alternateText} </span>
              <Link
                to={alternateLink}
                className="font-semibold text-forest hover:text-forest-hover hover:underline transition-colors ml-1"
              >
                {alternateActionText}
              </Link>
            </div>
          )}
        </main>

        {/* Form Canvas Footer */}
        <footer className="mt-8 pt-4 border-t border-stone-border/60 flex flex-col sm:flex-row items-center justify-between text-2xs font-mono text-charcoal-muted gap-2">
          <span>Runnel • Recovery Inbox for Asynchronous Work</span>
          <span className="text-charcoal-dim">v1.0.0</span>
        </footer>
      </div>
    </div>
  );
}

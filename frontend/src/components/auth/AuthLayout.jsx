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
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-canvas">
      {/* ========================================================
          LEFT PANEL: Warm Ivory Form Canvas (Mobile & Desktop)
         ======================================================== */}
      <div className="w-full lg:w-1/2 xl:w-[50%] flex flex-col justify-between p-6 sm:p-10 md:p-12 lg:p-14 xl:p-16 min-h-screen overflow-y-auto">
        {/* Brand Header */}
        <header className="flex items-center justify-between mb-8">
          <Link
            to="/"
            className="flex items-center gap-3 group focus:outline-none focus:ring-2 focus:ring-forest/30 rounded-lg p-1 -m-1 transition-colors"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest-ghost border border-forest-border text-forest group-hover:bg-forest/15 transition-colors">
              {/* Runnel Inbox / Recovery Monogram */}
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
              <span className="font-bold text-lg tracking-tight text-charcoal">Runnel</span>
              <span className="hidden sm:inline-block ml-2 text-2xs font-mono text-charcoal-muted uppercase tracking-wider">
                Recovery Inbox
              </span>
            </div>
          </Link>

          {/* Quick toggle link in header for convenience */}
          {alternateLink && (
            <div className="text-xs text-charcoal-secondary">
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

        {/* Main Center Form Surface */}
        <main className="w-full max-w-[460px] mx-auto my-auto py-6 sm:py-8">
          <div className="mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-charcoal">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-2 text-sm text-charcoal-secondary leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>

          {/* Render the Form Content */}
          <div className="bg-surface border border-stone-border rounded-2xl p-6 sm:p-8 shadow-card">
            {children}
          </div>

          {/* Navigation link underneath form card */}
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

      {/* ========================================================
          RIGHT PANEL: Forest-Green Product Showcase (Desktop)
         ======================================================== */}
      <aside
        className="hidden lg:flex lg:w-1/2 xl:w-[50%] bg-[#133023] text-white flex-col justify-between p-10 xl:p-14 relative overflow-hidden border-l border-[#1D4A36]"
        aria-label="Runnel product capabilities and execution recovery overview"
      >
        {/* Subtle geometric pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(#FFFFFF 1px, transparent 1px), radial-gradient(#FFFFFF 1px, #133023 1px)",
            backgroundSize: "24px 24px",
            backgroundPosition: "0 0, 12px 12px",
          }}
        />

        {/* Top Product Hero Content */}
        <div className="relative z-10 max-w-[520px]">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-[#1D4835] border border-[#2B664B] text-[#A7C8B5] text-2xs font-mono uppercase tracking-wider mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />
            Operational Reliability
          </div>

          <h2 className="text-2xl xl:text-3xl font-bold tracking-tight text-[#F7FBF9] leading-snug">
            Track background tasks.
            <br />
            Understand failures.
            <br />
            <span className="text-[#74C69D]">Retry work safely.</span>
          </h2>

          <p className="mt-3.5 text-sm text-[#B4D2C3] leading-relaxed">
            Runnel monitors execution lifecycles, aggregates attempt histories, isolates root
            causes, and gives engineering teams an audit-ready recovery inbox for asynchronous jobs.
          </p>
        </div>

        {/* Middle: Execution Lifecycle Stepper Illustration */}
        <div className="relative z-10 my-8 max-w-[540px]">
          <ExecutionLifecycleAnimation />
        </div>

        {/* Bottom: Triad of Product Guarantees */}
        <div className="relative z-10 grid grid-cols-3 gap-4 pt-6 border-t border-[#1F4A37] max-w-[540px]">
          <div>
            <div className="text-xs font-semibold text-[#E8F5EE]">Idempotent Recovery</div>
            <p className="text-2xs text-[#95C0A9] mt-1 leading-normal">
              Safe retries that never re-execute succeeded steps.
            </p>
          </div>
          <div>
            <div className="text-xs font-semibold text-[#E8F5EE]">Structured Diagnostics</div>
            <p className="text-2xs text-[#95C0A9] mt-1 leading-normal">
              Full attempt traces, duration logs & error diffs.
            </p>
          </div>
          <div>
            <div className="text-xs font-semibold text-[#E8F5EE]">Centralized Inbox</div>
            <p className="text-2xs text-[#95C0A9] mt-1 leading-normal">
              Unified operational queue across your services.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

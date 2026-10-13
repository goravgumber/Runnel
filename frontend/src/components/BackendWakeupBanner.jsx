import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { backendWakeup } from "../services/backendWakeup";

export default function BackendWakeupBanner() {
  const [state, setState] = useState({ status: "idle", elapsedSeconds: 0 });

  useEffect(() => {
    const unsubscribe = backendWakeup.subscribe((newState) => {
      setState(newState);
    });
    return unsubscribe;
  }, []);

  if (state.status === "idle") return null;

  return (
    <AnimatePresence>
      <motion.aside
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="relative z-50 overflow-hidden font-sans border-b"
        aria-live="polite"
      >
        {state.status === "waking" && (
          <div className="bg-[#FEF3C7] border-b border-[#F59E0B]/30 px-4 py-2.5 text-xs text-[#92400E] flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2.5">
              <Loader2 className="h-4 w-4 animate-spin text-[#D97706] shrink-0" />
              <span>
                <strong className="font-semibold">Waking up the demo backend</strong> — this may take up to a minute on the free hosting tier.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0 font-mono text-2xs text-[#B45309]">
              <span className="inline-block h-2 w-2 rounded-full bg-[#D97706] animate-pulse" />
              <span>{state.elapsedSeconds}s elapsed</span>
            </div>
          </div>
        )}

        {state.status === "awake" && (
          <div className="bg-[#D1FAE5] border-b border-[#10B981]/30 px-4 py-2 text-xs text-[#065F46] flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[#059669] shrink-0" />
              <span className="font-medium">Backend service is online and ready.</span>
            </div>
          </div>
        )}

        {state.status === "timeout" && (
          <div className="bg-terracotta-ghost border-b border-terracotta-border px-4 py-2.5 text-xs text-charcoal flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-terracotta shrink-0" />
              <span>Backend wake-up is taking longer than expected. It may still be booting.</span>
            </div>
            <button
              onClick={() => backendWakeup.startWakeupTracking()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface hover:bg-canvas-well border border-stone-border text-charcoal font-medium text-2xs transition-colors shrink-0"
            >
              <RefreshCw className="h-3 w-3" />
              Check Again
            </button>
          </div>
        )}
      </motion.aside>
    </AnimatePresence>
  );
}

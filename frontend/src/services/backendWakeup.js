/**
 * backendWakeup.js - Cold-start detection and wakeup coordinator for Render Free Tier.
 *
 * Render Free Web Services spin down after 15 minutes of inactivity. When a request
 * arrives, spin-up can take 40-60 seconds, during which requests may hang or fail with
 * 502/503/504 or network errors.
 *
 * This coordinator:
 * 1. Probes the real /health/live endpoint to verify backend availability.
 * 2. Provides bounded retries with an overall timeout (default 65s).
 * 3. Notifies UI listeners so users see accurate cold-start feedback.
 * 4. NEVER automatically retries state-changing mutations (POST/PUT/DELETE)
 *    to prevent duplicate execution submissions, retries, cancellations, or registrations.
 */

import { toApiPath } from "./api.js";

const WAKEUP_MAX_WAIT_MS = 65000;
const WAKEUP_POLL_INTERVAL_MS = 3000;

class BackendWakeupCoordinator {
  constructor() {
    this.status = "idle"; // "idle" | "waking" | "awake" | "timeout"
    this.listeners = new Set();
    this.wakeupListeners = new Set();
    this.activePollPromise = null;
    this.startTime = null;
    this.elapsedSeconds = 0;
    this.timerId = null;
    this.elapsedIntervalId = null;
  }

  /**
   * Subscribe to status changes.
   * Listener receives { status, elapsedSeconds }
   */
  subscribe(listener) {
    this.listeners.add(listener);
    listener({ status: this.status, elapsedSeconds: this.elapsedSeconds });
    return () => this.listeners.delete(listener);
  }

  /**
   * Register a callback to run once when the backend wakes up (read-only refresh only).
   */
  onWakeup(callback) {
    this.wakeupListeners.add(callback);
    return () => this.wakeupListeners.delete(callback);
  }

  _notify() {
    for (const listener of this.listeners) {
      try {
        listener({ status: this.status, elapsedSeconds: this.elapsedSeconds });
      } catch (err) {
        console.error("Error in wakeup status listener:", err);
      }
    }
  }

  /**
   * Probes /health/live with a short timeout.
   * Returns true if backend is responsive, false otherwise.
   */
  async probeHealth(timeoutMs = 4000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const url = toApiPath("/health/live");
      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res.status === 200;
    } catch {
      clearTimeout(timer);
      return false;
    }
  }

  /**
   * Determines if an HTTP status or error indicates a waking backend.
   */
  isWakeupCandidate(status, error) {
    if (status === 502 || status === 503 || status === 504) return true;
    if (!status || status === 0) {
      if (!error) return true;
      const msg = typeof error === "string" ? error : error?.message || "";
      return /network|failed to fetch|econnrefused|load failed|timeout/i.test(msg);
    }
    return false;
  }

  /**
   * Triggers the wakeup polling process if not already waking.
   * Returns a promise that resolves when the backend is awake or times out.
   */
  startWakeupTracking(options = {}) {
    if (this.activePollPromise) {
      return this.activePollPromise;
    }

    const maxWaitMs = options.maxWaitMs || WAKEUP_MAX_WAIT_MS;
    const pollIntervalMs = options.pollIntervalMs || WAKEUP_POLL_INTERVAL_MS;

    this.status = "waking";
    this.startTime = Date.now();
    this.elapsedSeconds = 0;
    this._notify();

    // Elapsed counter ticker
    this.elapsedIntervalId = setInterval(() => {
      if (this.status === "waking" && this.startTime) {
        this.elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
        this._notify();
      }
    }, 1000);

    this.activePollPromise = (async () => {
      while (Date.now() - this.startTime < maxWaitMs) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

        const isLive = await this.probeHealth();
        if (isLive) {
          this._cleanupPolling();
          this.status = "awake";
          this._notify();

          // Notify onWakeup listeners (for safe read-only queries)
          const callbacks = Array.from(this.wakeupListeners);
          for (const cb of callbacks) {
            try {
              cb();
            } catch (err) {
              console.error("Error in onWakeup callback:", err);
            }
          }

          // Reset to idle after 4 seconds
          setTimeout(() => {
            if (this.status === "awake") {
              this.status = "idle";
              this.elapsedSeconds = 0;
              this._notify();
            }
          }, 4000);

          return { awake: true, elapsedSeconds: this.elapsedSeconds };
        }
      }

      // Timed out
      this._cleanupPolling();
      this.status = "timeout";
      this._notify();
      return { awake: false, elapsedSeconds: this.elapsedSeconds, timeout: true };
    })();

    return this.activePollPromise;
  }

  _cleanupPolling() {
    if (this.elapsedIntervalId) {
      clearInterval(this.elapsedIntervalId);
      this.elapsedIntervalId = null;
    }
    this.activePollPromise = null;
  }

  /**
   * Manually resets status back to idle.
   */
  reset() {
    this._cleanupPolling();
    this.status = "idle";
    this.elapsedSeconds = 0;
    this._notify();
  }
}

export const backendWakeup = new BackendWakeupCoordinator();

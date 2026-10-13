import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { backendWakeup } from "../src/services/backendWakeup.js";

describe("Backend Wakeup Coordinator", () => {
  describe("isWakeupCandidate", () => {
    it("identifies 502, 503, and 504 gateway responses as wakeup candidates", () => {
      assert.equal(backendWakeup.isWakeupCandidate(502), true);
      assert.equal(backendWakeup.isWakeupCandidate(503), true);
      assert.equal(backendWakeup.isWakeupCandidate(504), true);
    });

    it("identifies network failures (status 0) as wakeup candidates", () => {
      assert.equal(backendWakeup.isWakeupCandidate(0, new TypeError("Failed to fetch")), true);
      assert.equal(backendWakeup.isWakeupCandidate(0, "NetworkError when attempting to fetch resource"), true);
      assert.equal(backendWakeup.isWakeupCandidate(0, "connect ECONNREFUSED 127.0.0.1"), true);
      assert.equal(backendWakeup.isWakeupCandidate(0, null), true);
    });

    it("does NOT classify application error codes as wakeup candidates", () => {
      assert.equal(backendWakeup.isWakeupCandidate(200), false);
      assert.equal(backendWakeup.isWakeupCandidate(400), false);
      assert.equal(backendWakeup.isWakeupCandidate(401), false);
      assert.equal(backendWakeup.isWakeupCandidate(403), false);
      assert.equal(backendWakeup.isWakeupCandidate(404), false);
      assert.equal(backendWakeup.isWakeupCandidate(409), false);
      assert.equal(backendWakeup.isWakeupCandidate(422), false);
      assert.equal(backendWakeup.isWakeupCandidate(429), false);
    });
  });

  describe("Lifecycle & Subscriptions", () => {
    it("notifies subscribers when status transitions", () => {
      backendWakeup.reset();
      const events = [];
      const unsub = backendWakeup.subscribe((state) => events.push(state.status));

      assert.equal(backendWakeup.status, "idle");
      assert.ok(events.includes("idle"));

      unsub();
    });

    it("triggers onWakeup callbacks when service becomes responsive", async () => {
      backendWakeup.reset();

      let callbackTriggered = false;
      const unsub = backendWakeup.onWakeup(() => {
        callbackTriggered = true;
      });

      // Stub probeHealth to return true immediately
      const originalProbe = backendWakeup.probeHealth;
      backendWakeup.probeHealth = async () => true;

      try {
        const result = await backendWakeup.startWakeupTracking({
          maxWaitMs: 1000,
          pollIntervalMs: 50,
        });

        assert.equal(result.awake, true);
        assert.equal(backendWakeup.status, "awake");
        assert.equal(callbackTriggered, true);
      } finally {
        backendWakeup.probeHealth = originalProbe;
        backendWakeup.reset();
        unsub();
      }
    });

    it("handles timeout after maxWaitMs is exceeded", async () => {
      backendWakeup.reset();

      // Stub probeHealth to always return false (sleeping backend)
      const originalProbe = backendWakeup.probeHealth;
      backendWakeup.probeHealth = async () => false;

      try {
        const result = await backendWakeup.startWakeupTracking({
          maxWaitMs: 150,
          pollIntervalMs: 40,
        });

        assert.equal(result.awake, false);
        assert.equal(result.timeout, true);
        assert.equal(backendWakeup.status, "timeout");
      } finally {
        backendWakeup.probeHealth = originalProbe;
        backendWakeup.reset();
      }
    });
  });
});

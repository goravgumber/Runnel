import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { performBoundedAuthRequest } from "../src/services/api.js";

describe("Frontend Login & Auth Request Boundedness", () => {
  it("prevents indefinite hanging by timing out via AbortController when server hangs", async () => {
    const originalFetch = globalThis.fetch;

    // Simulate an unresponsive server connection that never resolves
    globalThis.fetch = (_url, options) => {
      return new Promise((_resolve, reject) => {
        if (options?.signal) {
          options.signal.addEventListener("abort", () => {
            const abortErr = new Error("This operation was aborted");
            abortErr.name = "AbortError";
            reject(abortErr);
          });
        }
      });
    };

    try {
      const startTime = Date.now();
      // Test with a tight timeout for unit test speed (100ms)
      const res = await performBoundedAuthRequest(
        "/auth/login",
        { username: "test_user", password: "some_password" },
        { timeoutMs: 100 }
      );
      const elapsed = Date.now() - startTime;

      assert.equal(res.ok, false);
      assert.equal(res.timedOut, true);
      assert.equal(res.status, 408);
      assert.equal(res.error, "Request timed out");
      // Must have resolved quickly near 100ms, not hung indefinitely
      assert.ok(elapsed >= 90 && elapsed < 1000, `Expected ~100ms elapsed, got ${elapsed}ms`);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles immediate network errors without hanging", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () => {
      throw new TypeError("Failed to fetch");
    };

    try {
      const res = await performBoundedAuthRequest("/auth/login", {
        username: "test_user",
        password: "some_password",
      });

      assert.equal(res.ok, false);
      assert.equal(res.networkError, true);
      assert.equal(res.status, 0);
      assert.equal(res.error, "Failed to fetch");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles 401 unauthorized response cleanly and bounds execution", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({
        success: false,
        error: { message: "Invalid username or password. Please try again." },
      }),
    });

    try {
      const res = await performBoundedAuthRequest("/auth/login", {
        username: "test_user",
        password: "wrong_password",
      });

      assert.equal(res.ok, false);
      assert.equal(res.status, 401);
      assert.equal(res.payload.error.message, "Invalid username or password. Please try again.");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("bounds registration/signup request timeout consistently", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (_url, options) => {
      return new Promise((_resolve, reject) => {
        if (options?.signal) {
          options.signal.addEventListener("abort", () => {
            const abortErr = new Error("This operation was aborted");
            abortErr.name = "AbortError";
            reject(abortErr);
          });
        }
      });
    };

    try {
      const res = await performBoundedAuthRequest(
        "/auth/signup",
        { username: "new_user", password: "some_password" },
        { timeoutMs: 100 }
      );

      assert.equal(res.ok, false);
      assert.equal(res.timedOut, true);
      assert.equal(res.status, 408);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("completes normal successful login response without delay", async () => {
    const originalFetch = globalThis.fetch;

    const mockPayload = {
      success: true,
      data: {
        token: "mock-access-token",
        refreshToken: "mock-refresh-token",
        user: { id: "user-123", username: "test_user", role: "user" },
      },
    };

    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => mockPayload,
    });

    try {
      const res = await performBoundedAuthRequest("/auth/login", {
        username: "test_user",
        password: "correct_password",
      });

      assert.equal(res.ok, true);
      assert.equal(res.status, 200);
      assert.equal(res.payload.data.token, "mock-access-token");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

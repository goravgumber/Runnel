import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getSocketUrl, getApiBaseUrl, extractOrigin } from "../src/utils/url.js";

describe("URL Resolution Utilities", () => {
  describe("extractOrigin", () => {
    it("extracts origin from full URL with path", () => {
      assert.equal(
        extractOrigin("https://runnel-backend.onrender.com/api/v1"),
        "https://runnel-backend.onrender.com"
      );
    });

    it("extracts origin from URL with port", () => {
      assert.equal(
        extractOrigin("http://localhost:5000/api/v1"),
        "http://localhost:5000"
      );
    });

    it("returns null for relative or malformed strings", () => {
      assert.equal(extractOrigin("/api/v1"), null);
      assert.equal(extractOrigin("not-a-url"), null);
      assert.equal(extractOrigin(""), null);
      assert.equal(extractOrigin(null), null);
    });
  });

  describe("getSocketUrl", () => {
    it("prefers explicit VITE_SOCKET_URL when provided", () => {
      const env = {
        VITE_SOCKET_URL: "https://custom-socket.example.com",
        VITE_API_URL: "https://ignored-api.example.com",
        DEV: false,
      };
      const loc = { origin: "https://ignored-loc.example.com" };

      assert.equal(getSocketUrl(env, loc), "https://custom-socket.example.com");
    });

    it("derives origin from VITE_API_URL when VITE_SOCKET_URL is omitted", () => {
      const env = {
        VITE_API_URL: "https://runnel-backend-1234.onrender.com/api/v1",
        DEV: false,
      };
      const loc = { origin: "https://runnel-frontend-5678.onrender.com" };

      assert.equal(
        getSocketUrl(env, loc),
        "https://runnel-backend-1234.onrender.com"
      );
    });

    it("falls back to localhost:5000 ONLY in development mode", () => {
      const env = { DEV: true };
      const loc = { origin: "http://localhost:5173" };

      assert.equal(getSocketUrl(env, loc), "http://localhost:5000");
    });

    it("uses window.location.origin in production single-origin deployments", () => {
      const env = { DEV: false };
      const loc = { origin: "https://runnel.myvps.com" };

      assert.equal(getSocketUrl(env, loc), "https://runnel.myvps.com");
    });

    it("never returns localhost in production when environment variables are omitted", () => {
      const env = { DEV: false };
      const loc = null;

      const result = getSocketUrl(env, loc);
      assert.notEqual(result, "http://localhost:5000");
      assert.equal(result, "");
    });
  });

  describe("getApiBaseUrl", () => {
    it("derives origin from VITE_API_URL when provided", () => {
      const env = {
        VITE_API_URL: "https://runnel-backend-1234.onrender.com/api/v1",
        DEV: false,
      };
      const loc = { origin: "https://runnel-frontend-5678.onrender.com" };

      assert.equal(
        getApiBaseUrl(env, loc),
        "https://runnel-backend-1234.onrender.com"
      );
    });

    it("falls back to location.origin in production when VITE_API_URL is omitted", () => {
      const env = { DEV: false };
      const loc = { origin: "https://runnel.myvps.com" };

      assert.equal(getApiBaseUrl(env, loc), "https://runnel.myvps.com");
    });

    it("falls back to localhost:5000 in DEV mode when no remote URL is set", () => {
      const env = { DEV: true };
      const loc = null;

      assert.equal(getApiBaseUrl(env, loc), "http://localhost:5000");
    });
  });
});

/**
 * url.js - Environment-aware URL resolution for Runnel Frontend.
 *
 * Designed to prevent production builds from ever falling back to localhost:5000,
 * while safely supporting:
 * 1. Render Free Deployment (separate static site frontend + web service backend)
 * 2. VPS Docker Compose Deployment (single-origin with Nginx reverse proxy)
 * 3. Local Development (Vite dev server with proxy to localhost:5000)
 */

/**
 * Extracts origin (protocol + host + port) from a URL string.
 * Returns null if the URL is not a valid absolute URL.
 *
 * @param {string} urlStr
 * @returns {string|null}
 */
export function extractOrigin(urlStr) {
  if (!urlStr || typeof urlStr !== "string") return null;
  const trimmed = urlStr.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Resolves the Socket.IO gateway URL based on environment and hosting topology.
 *
 * Priority:
 * 1. Explicit VITE_SOCKET_URL (if provided)
 * 2. Origin extracted from VITE_API_URL (if provided)
 * 3. Local development fallback to http://localhost:5000 (DEV mode only)
 * 4. Production browser origin (window.location.origin) for single-origin Docker/VPS
 * 5. Empty string fallback (never localhost in production)
 *
 * @param {object} [env=import.meta.env]
 * @param {Location|null} [location=typeof window !== "undefined" ? window.location : null]
 * @returns {string}
 */
export function getSocketUrl(
  env = import.meta.env,
  location = typeof window !== "undefined" ? window.location : null
) {
  const explicitSocket = env?.VITE_SOCKET_URL;
  if (explicitSocket && typeof explicitSocket === "string" && explicitSocket.trim()) {
    return explicitSocket.trim().replace(/\/+$/, "");
  }

  const apiUrl = env?.VITE_API_URL;
  if (apiUrl && typeof apiUrl === "string" && apiUrl.trim()) {
    const origin = extractOrigin(apiUrl);
    if (origin) return origin;
    return apiUrl.trim().replace(/\/+$/, "");
  }

  // Development mode fallback ONLY
  if (env?.DEV) {
    return "http://localhost:5000";
  }

  // Production same-origin fallback (e.g. Docker Compose + Nginx)
  if (location?.origin) {
    return location.origin;
  }

  return "";
}

/**
 * Resolves the API Base URL used for display snippets (e.g. cURL commands).
 *
 * Priority:
 * 1. Origin extracted from VITE_API_URL (if provided)
 * 2. Production browser origin (window.location.origin) for single-origin deployments
 * 3. Development fallback to http://localhost:5000 (DEV mode only)
 * 4. Empty string fallback
 *
 * @param {object} [env=import.meta.env]
 * @param {Location|null} [location=typeof window !== "undefined" ? window.location : null]
 * @returns {string}
 */
export function getApiBaseUrl(
  env = import.meta.env,
  location = typeof window !== "undefined" ? window.location : null
) {
  const apiUrl = env?.VITE_API_URL;
  if (apiUrl && typeof apiUrl === "string" && apiUrl.trim()) {
    const origin = extractOrigin(apiUrl);
    if (origin) return origin;
    return apiUrl.trim().replace(/\/+$/, "");
  }

  if (location?.origin) {
    return location.origin;
  }

  if (env?.DEV) {
    return "http://localhost:5000";
  }

  return "";
}

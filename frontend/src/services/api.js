import { backendWakeup } from "./backendWakeup.js";

const BACKEND = (import.meta?.env?.VITE_API_URL || "").trim().replace(/\/+$/, "");

export const toApiPath = (path) => {
  if (!path) return BACKEND || "";
  if (/^https?:\/\//i.test(path)) return path;
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (clean.startsWith("/api/v1") || clean.startsWith("/api/") || clean.startsWith("/health")) {
    return `${BACKEND}${clean}`;
  }
  return `${BACKEND}/api/v1${clean}`;
};

export const unwrapApiResponse = (payload) => {
  if (payload && payload.success === true && Object.hasOwn(payload, "data")) return payload.data;
  return payload;
};

export async function performBoundedAuthRequest(endpoint, body, options = {}) {
  const timeoutMs = options.timeoutMs || 60000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(toApiPath(endpoint), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, payload };
  } catch (err) {
    if (err.name === "AbortError") {
      return { ok: false, status: 408, timedOut: true, error: "Request timed out" };
    }
    return { ok: false, status: 0, networkError: true, error: err.message };
  } finally {
    clearTimeout(timeoutId);
  }
}

// Singleton in-flight refresh promise to prevent duplicate concurrent refresh requests
let refreshPromise = null;

export async function getFreshToken() {
  if (refreshPromise) return refreshPromise;

  const refreshToken = localStorage.getItem("refreshToken");
  if (!refreshToken) return null;

  refreshPromise = (async () => {
    try {
      const res = await fetch(toApiPath("/auth/refresh"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("refreshToken");
          localStorage.removeItem("user");
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("runnel:auth-expired"));
          }
        }
        return null;
      }
      const data = unwrapApiResponse(payload);
      if (data?.token) {
        localStorage.setItem("token", data.token);
        if (data.refreshToken) localStorage.setItem("refreshToken", data.refreshToken);
        if (data.user) localStorage.setItem("user", JSON.stringify(data.user));
        return data.token;
      }
      return null;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function request(url, options = {}) {
  const targetUrl = toApiPath(url);
  const token = localStorage.getItem("token");
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(targetUrl, { ...options, headers });
    const data = await res.json().catch(() => ({}));

    // If 502/503/504 gateway error from cold-start edge proxy, trigger wakeup tracking
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      backendWakeup.startWakeupTracking();
    }

    // If access token expired (401) and not already retried, refresh and retry once
    if (
      res.status === 401 &&
      !options._isRetry &&
      !targetUrl.includes("/auth/login") &&
      !targetUrl.includes("/auth/refresh") &&
      !targetUrl.includes("/auth/register") &&
      !targetUrl.includes("/auth/signup")
    ) {
      const freshToken = await getFreshToken();
      if (freshToken) {
        return request(url, {
          ...options,
          _isRetry: true,
          headers: { ...options.headers, Authorization: `Bearer ${freshToken}` },
        });
      }
    }

    if (!res.ok) {
      const errorMsg =
        data?.error?.details?.validationErrors?.[0]?.message ||
        (Array.isArray(data?.error?.details) ? data.error.details[0]?.message : null) ||
        (Array.isArray(data?.errors) ? (data.errors[0]?.message || data.errors[0]?.msg) : null) ||
        data?.error?.message ||
        data?.message ||
        "Request failed";
      return { data: null, error: errorMsg, status: res.status };
    }
    return { data, error: null, status: res.status };
  } catch (e) {
    if (backendWakeup.isWakeupCandidate(0, e)) {
      backendWakeup.startWakeupTracking();
    }
    return { data: null, error: e.message, status: 0, isNetworkError: true };
  }
}

export const api = (base) => ({
  get: (p) => request(`${base}${p}`),
  post: (p, b) => request(`${base}${p}`, { method: "POST", body: JSON.stringify(b) }),
  del: (p) => request(`${base}${p}`, { method: "DELETE" }),
});

const bk = () => BACKEND ? `${BACKEND}/api/v1` : "/api/v1";

export const authAPI = {
  login: (body) => request(`${bk()}/auth/login`, { method: "POST", body: JSON.stringify(body) }),
  register: (body) => request(`${bk()}/auth/register`, { method: "POST", body: JSON.stringify(body) }),
  signup: (body) => request(`${bk()}/auth/signup`, { method: "POST", body: JSON.stringify(body) }),
  logout: () => request(`${bk()}/auth/logout`, { method: "POST" }),
  logoutAll: () => request(`${bk()}/auth/logout-all`, { method: "POST" }),
  me: () => request(`${bk()}/auth/me`),
};

export const healthAPI = {
  all: () => request("/health"),
  live: () => request("/health/live"),
  ready: () => request("/health/ready"),
};

export const userAPI = {
  getSettings: () => request(`${bk()}/users/settings`),
  saveSettings: (settings) => request(`${bk()}/users/settings`, {
    method: "PATCH",
    body: JSON.stringify(settings),
  }),
};

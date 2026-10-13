const BACKEND = import.meta.env.VITE_API_URL || "";

export const toApiPath = (path) => {
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/api/v1")) return `${BACKEND}${path}`;
  if (path.startsWith("/api/")) return `${BACKEND}${path}`;
  if (path.startsWith("/")) return `${BACKEND}/api/v1${path}`;
  return `${BACKEND}/api/v1/${path}`;
};

export const unwrapApiResponse = (payload) => {
  if (payload && payload.success === true && Object.hasOwn(payload, "data")) return payload.data;
  return payload;
};

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
  const token = localStorage.getItem("token");
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(url, { ...options, headers });
    const data = await res.json().catch(() => ({}));

    // If access token expired (401) and not already retried, refresh and retry once
    if (
      res.status === 401 &&
      !options._isRetry &&
      !url.includes("/auth/login") &&
      !url.includes("/auth/refresh") &&
      !url.includes("/auth/register") &&
      !url.includes("/auth/signup")
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
      return { data: null, error: errorMsg };
    }
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e.message };
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
  all: () => request(toApiPath("/health")),
  live: () => request(toApiPath("/health/live")),
  ready: () => request(toApiPath("/health/ready")),
};

export const userAPI = {
  getSettings: () => request(`${bk()}/users/settings`),
  saveSettings: (settings) => request(`${bk()}/users/settings`, {
    method: "PATCH",
    body: JSON.stringify(settings),
  }),
};

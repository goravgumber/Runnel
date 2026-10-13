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

async function request(url, options = {}) {
  const token = localStorage.getItem("token");
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(url, { ...options, headers });
    const data = await res.json();
    if (!res.ok) return { data: null, error: data.message || data.error?.message || "Request failed" };
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e.message };
  }
}

const api = (base) => ({
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
  all: () => request(`${BACKEND}/health`),
  live: () => request(`${BACKEND}/health/live`),
  ready: () => request(`${BACKEND}/health/ready`),
};

export const userAPI = {
  getSettings: () => request(`${bk()}/users/settings`),
  saveSettings: (settings) => request(`${bk()}/users/settings`, {
    method: "PATCH",
    body: JSON.stringify(settings),
  }),
};

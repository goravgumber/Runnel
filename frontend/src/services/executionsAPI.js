/**
 * executionsAPI.js
 *
 * Thin HTTP client for the /api/v1/executions endpoints.
 * Reuses the same `request` helper pattern from api.js.
 */

const token = () => localStorage.getItem("token");

async function request(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;

  try {
    const res = await fetch(url, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        data: null,
        error: data?.error?.message || data?.message || `HTTP ${res.status}`,
      };
    }
    return { data: data?.data ?? data, error: null };
  } catch (e) {
    return { data: null, error: e.message };
  }
}

const base = () => "/api/v1/executions";

export const executionsAPI = {
  /** Submit a new execution */
  submit: (body) =>
    request(base(), { method: "POST", body: JSON.stringify(body) }),

  /** List executions with optional filters */
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))
    ).toString();
    return request(`${base()}${qs ? `?${qs}` : ""}`);
  },

  /** Per-user status counts */
  stats: () => request(`${base()}/stats`),

  /** Get single execution + attempt history */
  get: (id) => request(`${base()}/${id}`),

  /** Manually retry a failed/cancelled execution */
  retry: (id) => request(`${base()}/${id}/retry`, { method: "POST" }),

  /** Cancel a pending/retrying/running execution */
  cancel: (id) => request(`${base()}/${id}/cancel`, { method: "POST" }),
};

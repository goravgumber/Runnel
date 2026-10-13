import { request } from "./api";

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

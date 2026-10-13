import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Inbox,
  Play,
  XCircle,
  RefreshCw,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Ban,
  RotateCcw,
  X,
  Send,
  Tag,
  Hash,
  Calendar,
  Zap,
  Copy,
  Check,
  Search,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { executionsAPI } from "../services/executionsAPI";
import StatusBadge from "../components/ui/StatusBadge";
import JsonViewer from "../components/ui/JsonViewer";
import EmptyState from "../components/ui/EmptyState";
import Button from "../components/ui/Button";
import io from "socket.io-client";

// ── Constants ─────────────────────────────────────────────────────────

const STATUSES = [
  { key: "all",       label: "All",        icon: Inbox },
  { key: "pending",   label: "Pending",    icon: Clock },
  { key: "running",   label: "Running",    icon: Loader2 },
  { key: "completed", label: "Completed",  icon: CheckCircle2 },
  { key: "failed",    label: "Failed",     icon: AlertTriangle },
  { key: "retrying",  label: "Retrying",   icon: RotateCcw },
  { key: "cancelled", label: "Cancelled",  icon: Ban },
];

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

// ── Utility helpers ───────────────────────────────────────────────────

function timeAgo(date) {
  if (!date) return "—";
  const d = new Date(date);
  const secs = Math.floor((Date.now() - d) / 1000);
  if (secs < 60)  return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return d.toLocaleDateString();
}

function fmtDuration(ms) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// ── Stat Pill ─────────────────────────────────────────────────────────

function StatPill({ label, value, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start px-3.5 py-2 rounded-xl border transition-all text-left ${
        active
          ? "bg-forest-ghost border-forest-border shadow-xs"
          : "bg-surface border-stone-border hover:bg-canvas-subtle"
      }`}
    >
      <span className="text-base font-bold font-mono tabular-nums text-charcoal">{value ?? 0}</span>
      <span className="text-2xs font-mono uppercase tracking-wider text-charcoal-secondary">{label}</span>
    </button>
  );
}

// ── Attempt Timeline ──────────────────────────────────────────────────

function AttemptTimeline({ attempts }) {
  if (!attempts?.length) {
    return <p className="text-sm text-charcoal-muted italic">No execution attempts recorded yet.</p>;
  }
  return (
    <div className="space-y-3">
      {attempts.map((a) => (
        <div key={a._id || a.attemptNumber} className="rounded-xl border border-stone-border bg-canvas-subtle p-3.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono font-semibold text-charcoal">Attempt #{a.attemptNumber}</span>
            <StatusBadge status={a.status} size="sm" />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-2xs font-mono text-charcoal-secondary">
            <span>Started: {a.startedAt ? new Date(a.startedAt).toLocaleTimeString() : "—"}</span>
            <span>Duration: {fmtDuration(a.durationMs)}</span>
          </div>
          {a.error && (
            <div className="mt-2.5 rounded-lg border border-terracotta-border bg-terracotta-ghost p-3 text-xs text-terracotta font-mono leading-relaxed">
              <div className="font-bold flex items-center gap-1.5 mb-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{a.error.code || "EXECUTION_FAILURE"}</span>
              </div>
              <div className="text-charcoal break-words">{a.error.message}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Submit Modal ──────────────────────────────────────────────────────

function SubmitModal({ onClose, onSubmitted }) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    type: "echo",
    maxAttempts: 3,
    idempotencyKey: "",
    tags: "",
    input: '{\n  "source": "manual_inbox",\n  "priority": "normal"\n}',
  });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const applyPreset = (type) => {
    if (type === "echo") {
      setForm({
        name: "Process invoice payment notification",
        description: "Echo task demonstrating successful lifecycle delivery",
        type: "echo",
        maxAttempts: 3,
        idempotencyKey: `invoice_${Date.now()}`,
        tags: "billing, stripe, webhook",
        input: JSON.stringify({ orderId: "ord_9872", customer: "cus_corp", amount: 4900 }, null, 2),
      });
    } else if (type === "fail") {
      setForm({
        name: "Sync third-party inventory API",
        description: "Simulated failing task demonstrating error capture and recovery",
        type: "fail",
        maxAttempts: 3,
        idempotencyKey: `sync_${Date.now()}`,
        tags: "inventory, partner_api, recovery_demo",
        input: JSON.stringify({ upstream: "partner_warehouse", failReason: "GATEWAY_TIMEOUT" }, null, 2),
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    let parsedInput;
    try {
      parsedInput = JSON.parse(form.input || "null");
    } catch {
      setError("Input must be valid JSON syntax");
      setLoading(false);
      return;
    }

    const body = {
      name: form.name.trim(),
      description: form.description?.trim() || undefined,
      type: form.type?.trim() || "echo",
      input: parsedInput,
      maxAttempts: Number(form.maxAttempts) || 3,
      idempotencyKey: form.idempotencyKey?.trim() || undefined,
      tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    };

    const { data, error: err } = await executionsAPI.submit(body);
    setLoading(false);
    if (err) { setError(err); return; }
    onSubmitted(data);
    onClose();
  };

  const inputCls =
    "w-full rounded-lg border border-stone-border bg-canvas-subtle px-3 py-2 text-sm text-charcoal font-sans placeholder-charcoal-dim focus:border-forest focus:ring-1 focus:ring-forest/20 focus:outline-none transition-colors";
  const labelCls = "block text-xs font-mono uppercase tracking-wider text-charcoal-secondary mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-charcoal/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        className="relative z-10 w-full max-w-lg rounded-2xl border border-stone-strong bg-surface p-6 shadow-modal overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between pb-4 border-b border-stone-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-forest-ghost border border-forest-border flex items-center justify-center text-forest">
              <Play className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-charcoal">Submit Execution</h2>
              <p className="text-xs text-charcoal-muted">Dispatch a new background job into the processing queue</p>
            </div>
          </div>
          <button onClick={onClose} className="text-charcoal-muted hover:text-charcoal transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Quick Presets */}
        <div className="py-3 border-b border-stone-border bg-canvas-subtle/50 -mx-6 px-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xs font-mono uppercase tracking-wider text-charcoal-secondary flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-forest" /> Quick Demo Presets
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => applyPreset("echo")}
              className="text-xs font-mono px-2.5 py-1 rounded border border-stone-border bg-surface hover:bg-canvas-well text-charcoal transition-colors"
            >
              + Echo (Succeeds)
            </button>
            <button
              type="button"
              onClick={() => applyPreset("fail")}
              className="text-xs font-mono px-2.5 py-1 rounded border border-terracotta-border bg-terracotta-ghost hover:bg-terracotta-ghost/80 text-terracotta transition-colors"
            >
              + Fail (Recovery Demo)
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4 overflow-y-auto flex-1 pr-1">
          <div>
            <label className={labelCls}>Name *</label>
            <input
              id="exec-name"
              className={inputCls}
              placeholder="e.g. Sync webhook notification"
              value={form.name}
              onChange={set("name")}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Job Type</label>
              <input
                id="exec-type"
                className={inputCls}
                placeholder="echo or fail"
                value={form.type}
                onChange={set("type")}
              />
            </div>
            <div>
              <label className={labelCls}>Max Attempts (1–10)</label>
              <input
                id="exec-max-attempts"
                type="number"
                min={1}
                max={10}
                className={inputCls}
                value={form.maxAttempts}
                onChange={set("maxAttempts")}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Input Payload (JSON)</label>
            <textarea
              id="exec-input"
              rows={4}
              className={`${inputCls} font-mono text-xs resize-none`}
              value={form.input}
              onChange={set("input")}
              placeholder='{"key": "value"}'
            />
          </div>

          <div>
            <label className={labelCls}>Idempotency Key (optional)</label>
            <input
              id="exec-idempotency-key"
              className={inputCls}
              placeholder="e.g. billing_evt_9981"
              value={form.idempotencyKey}
              onChange={set("idempotencyKey")}
            />
          </div>

          <div>
            <label className={labelCls}>Tags (comma-separated)</label>
            <input
              id="exec-tags"
              className={inputCls}
              placeholder="billing, webhook, production"
              value={form.tags}
              onChange={set("tags")}
            />
          </div>

          <div>
            <label className={labelCls}>Description</label>
            <input
              id="exec-description"
              className={inputCls}
              placeholder="Optional notes or context"
              value={form.description}
              onChange={set("description")}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-terracotta-border bg-terracotta-ghost p-3 text-xs text-terracotta font-mono">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-3 border-t border-stone-border">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <button
              id="exec-submit-btn"
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-forest hover:bg-forest-hover px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50 shadow-sm cursor-pointer"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span>{loading ? "Submitting..." : "Submit Task"}</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────

function DetailPanel({ execution, onClose, onRetry, onCancel }) {
  const [copied, setCopied] = useState(false);
  if (!execution) return null;
  const { attempts = [], ...exec } = execution;

  const canRetry  = ["failed", "cancelled"].includes(exec.status);
  const canCancel = ["pending", "retrying", "running"].includes(exec.status);

  const handleCopyId = () => {
    navigator.clipboard.writeText(exec._id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <motion.div
      key={exec._id}
      initial={{ x: "100%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "100%", opacity: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
      className="fixed right-0 top-0 h-full w-full max-w-lg border-l border-stone-border bg-surface shadow-modal z-40 flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-start justify-between border-b border-stone-border px-6 py-5 bg-canvas-subtle/50">
        <div className="min-w-0 mr-4">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="truncate text-base font-bold text-charcoal">{exec.name}</h3>
            <StatusBadge status={exec.status} size="sm" />
          </div>
          <div className="flex items-center gap-2 font-mono text-2xs text-charcoal-secondary">
            <span>ID: {exec._id}</span>
            <button
              onClick={handleCopyId}
              className="hover:text-charcoal transition-colors"
              title="Copy Execution ID"
            >
              {copied ? <Check className="w-3 h-3 text-[#2F7D5A]" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-charcoal-muted hover:text-charcoal p-1 rounded-lg hover:bg-canvas-well transition-colors shrink-0"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* Meta grid */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Zap,      label: "Job Type",  value: exec.type },
            { icon: Hash,     label: "Attempts",  value: `${exec.attemptsMade} / ${exec.maxAttempts}` },
            { icon: Calendar, label: "Created",   value: exec.createdAt ? new Date(exec.createdAt).toLocaleString() : "—" },
            { icon: Clock,    label: "Duration",
              value: exec.startedAt && exec.completedAt
                ? fmtDuration(new Date(exec.completedAt) - new Date(exec.startedAt))
                : "—" },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="rounded-xl border border-stone-border bg-canvas-subtle p-3">
              <div className="flex items-center gap-1.5 text-2xs font-mono uppercase tracking-wider text-charcoal-secondary mb-1">
                <Icon className="h-3 w-3 text-forest" /> {label}
              </div>
              <p className="text-sm font-semibold font-mono text-charcoal truncate">{value || "—"}</p>
            </div>
          ))}
        </div>

        {/* Idempotency Key */}
        {exec.idempotencyKey && (
          <div className="rounded-xl border border-stone-border bg-canvas-subtle p-3">
            <span className="text-2xs font-mono uppercase tracking-wider text-charcoal-secondary block mb-0.5">
              Idempotency Key
            </span>
            <span className="text-xs font-mono text-charcoal select-all">{exec.idempotencyKey}</span>
          </div>
        )}

        {/* Tags */}
        {exec.tags?.length > 0 && (
          <div>
            <span className="text-2xs font-mono uppercase tracking-wider text-charcoal-secondary block mb-1.5">
              Tags
            </span>
            <div className="flex flex-wrap gap-1.5">
              {exec.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-md border border-stone-border bg-canvas-subtle px-2 py-0.5 text-2xs font-mono text-charcoal-secondary"
                >
                  <Tag className="h-2.5 w-2.5" />{t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        {exec.description && (
          <div className="text-sm text-charcoal-secondary leading-relaxed bg-canvas-subtle/50 p-3 rounded-xl border border-stone-border">
            {exec.description}
          </div>
        )}

        {/* Primary Error Alert if failed */}
        {exec.error?.message && (
          <div className="rounded-xl border border-terracotta-border bg-terracotta-ghost p-4">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-terracotta mb-1.5">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{exec.error.code || "FAILURE_TERMINATED"}</span>
            </div>
            <p className="text-sm text-charcoal font-mono leading-relaxed">{exec.error.message}</p>
          </div>
        )}

        {/* Input / Output Payloads */}
        <JsonViewer data={exec.input}  label="Input Payload" />
        <JsonViewer data={exec.output} label="Output Result" initialOpen={Boolean(exec.output)} />

        {/* Attempt History */}
        <div>
          <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-charcoal mb-3">
            Execution Attempt History ({attempts.length})
          </h4>
          <AttemptTimeline attempts={attempts} />
        </div>
      </div>

      {/* Actions */}
      {(canRetry || canCancel) && (
        <div className="border-t border-stone-border px-6 py-4 bg-canvas-subtle/50 flex gap-3">
          {canRetry && (
            <button
              id="detail-retry-btn"
              onClick={() => onRetry(exec._id)}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-terracotta hover:bg-terracotta-hover px-4 py-2.5 text-sm font-semibold text-white transition-colors shadow-sm cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Retry Execution</span>
            </button>
          )}
          {canCancel && (
            <Button
              id="detail-cancel-btn"
              variant="secondary"
              onClick={() => onCancel(exec._id)}
              className="flex-1 flex items-center justify-center gap-2"
            >
              <Ban className="h-4 w-4" />
              <span>Cancel Execution</span>
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────

export default function ExecutionInbox() {
  const { id: selectedId } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();

  // ── State ──────────────────────────────────────────────────────────
  const [activeStatus, setActiveStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage]     = useState(1);
  const [executions, setExecutions] = useState([]);
  const [total, setTotal]   = useState(0);
  const [pages, setPages]   = useState(1);
  const [stats, setStats]   = useState({});
  const [selected, setSelected] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [toast, setToast]   = useState(null);
  const socketRef = useRef(null);

  const LIMIT = 20;

  // ── Toast helper ───────────────────────────────────────────────────
  const showToast = useCallback((msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Load list ──────────────────────────────────────────────────────
  const loadList = useCallback(async (opts = {}) => {
    setLoading(true);
    const params = {
      page:   opts.page  ?? page,
      limit:  LIMIT,
      search: (opts.search ?? search) || undefined,
    };
    if (activeStatus !== "all") params.status = activeStatus;
    const { data, error } = await executionsAPI.list(params);
    setLoading(false);
    if (error) { showToast(error, "danger"); return; }
    setExecutions(data?.executions ?? []);
    setTotal(data?.total ?? 0);
    setPages(data?.pages ?? 1);
  }, [activeStatus, page, search, showToast]);

  // ── Load stats ─────────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    const { data } = await executionsAPI.stats();
    if (data) setStats(data);
  }, []);

  // ── Load detail ────────────────────────────────────────────────────
  const loadDetail = useCallback(async (id) => {
    const { data, error } = await executionsAPI.get(id);
    if (error) { showToast(error, "danger"); return; }
    setSelected(data);
  }, [showToast]);

  // ── Initial load ───────────────────────────────────────────────────
  useEffect(() => {
    loadList();
    loadStats();
  }, [activeStatus, page]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load detail when URL contains an ID ───────────────────────────
  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setSelected(null);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Socket.IO — live updates ───────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    const sock = io(SOCKET_URL, { auth: { token } });
    socketRef.current = sock;

    sock.on("execution:update", ({ executionId, status }) => {
      loadStats();
      setExecutions((prev) =>
        prev.map((e) => (e._id === executionId ? { ...e, status } : e))
      );
      setSelected((prev) => {
        if (prev?._id === executionId) {
          loadDetail(executionId);
        }
        return prev;
      });
    });

    return () => sock.disconnect();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ────────────────────────────────────────────────────────
  const handleRetry = async (id) => {
    const { error } = await executionsAPI.retry(id);
    if (error) { showToast(error, "danger"); return; }
    showToast("Execution queued for recovery retry", "ok");
    loadList(); loadStats();
    if (selected?._id === id) loadDetail(id);
  };

  const handleCancel = async (id) => {
    const { error } = await executionsAPI.cancel(id);
    if (error) { showToast(error, "danger"); return; }
    showToast("Execution cancelled", "ok");
    loadList(); loadStats();
    if (selected?._id === id) loadDetail(id);
  };

  const handleSelectRow = (exec) => {
    navigate(`/executions/${exec._id}`);
  };

  const handleCloseDetail = () => {
    navigate("/executions");
    setSelected(null);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    loadList({ page: 1, search });
  };

  const handleSubmitted = () => {
    loadList({ page: 1 });
    loadStats();
    showToast("Execution submitted successfully!", "ok");
  };

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col bg-canvas min-h-screen">
      {/* ── Top Bar ─────────────────────────────────────────── */}
      <div className="border-b border-stone-border bg-surface px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest-ghost border border-forest-border text-forest">
              <Inbox className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-charcoal">Execution Inbox</h1>
              <p className="text-xs font-mono text-charcoal-muted">
                {total} execution{total !== 1 ? "s" : ""} registered in recovery log
              </p>
            </div>
          </div>
          <button
            id="open-submit-modal-btn"
            onClick={() => setShowSubmit(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-forest hover:bg-forest-hover px-4 py-2 text-sm font-semibold text-white transition-colors shadow-sm cursor-pointer"
          >
            <Play className="h-4 w-4" />
            <span>Submit Execution</span>
          </button>
        </div>

        {/* Stats bar */}
        <div className="flex gap-2.5 overflow-x-auto pb-1 flex-wrap">
          <StatPill
            label="Total"
            value={stats.total}
            active={activeStatus === "all"}
            onClick={() => { setActiveStatus("all"); setPage(1); }}
          />
          <StatPill
            label="Pending"
            value={stats.pending}
            active={activeStatus === "pending"}
            onClick={() => { setActiveStatus("pending"); setPage(1); }}
          />
          <StatPill
            label="Running"
            value={stats.running}
            active={activeStatus === "running"}
            onClick={() => { setActiveStatus("running"); setPage(1); }}
          />
          <StatPill
            label="Completed"
            value={stats.completed}
            active={activeStatus === "completed"}
            onClick={() => { setActiveStatus("completed"); setPage(1); }}
          />
          <StatPill
            label="Failed"
            value={stats.failed}
            active={activeStatus === "failed"}
            onClick={() => { setActiveStatus("failed"); setPage(1); }}
          />
          <StatPill
            label="Retrying"
            value={stats.retrying}
            active={activeStatus === "retrying"}
            onClick={() => { setActiveStatus("retrying"); setPage(1); }}
          />
          <StatPill
            label="Cancelled"
            value={stats.cancelled}
            active={activeStatus === "cancelled"}
            onClick={() => { setActiveStatus("cancelled"); setPage(1); }}
          />
        </div>
      </div>

      {/* ── Filter + Search Controls ─────────────────────────── */}
      <div className="border-b border-stone-border bg-canvas-subtle/60 px-6 py-3 flex items-center gap-4 flex-wrap">
        {/* Status tabs */}
        <div className="flex gap-1">
          {STATUSES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              id={`filter-${key}`}
              onClick={() => { setActiveStatus(key); setPage(1); }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-mono font-medium transition-colors cursor-pointer ${
                activeStatus === key
                  ? "bg-surface text-charcoal border border-stone-strong shadow-xs font-bold"
                  : "text-charcoal-secondary hover:text-charcoal hover:bg-canvas-well"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex items-center gap-2 ml-auto">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-charcoal-muted" />
            <input
              id="exec-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by job name…"
              className="rounded-lg border border-stone-border bg-surface pl-8 pr-3 py-1.5 text-xs text-charcoal placeholder-charcoal-dim focus:border-forest focus:ring-1 focus:ring-forest/20 focus:outline-none w-52 transition-colors font-sans"
            />
          </div>
          <Button type="submit" variant="secondary" size="sm">
            Search
          </Button>
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(""); loadList({ search: "" }); }}
              className="text-charcoal-muted hover:text-charcoal"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </form>

        <button
          id="refresh-btn"
          onClick={() => { loadList(); loadStats(); }}
          className="text-charcoal-muted hover:text-charcoal p-1.5 rounded-lg hover:bg-canvas-well transition-colors cursor-pointer"
          title="Refresh Inbox"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-forest" : ""}`} />
        </button>
      </div>

      {/* ── Table & Content ─────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-6">
        {loading && executions.length === 0 ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-forest" />
          </div>
        ) : executions.length === 0 ? (
          <EmptyState
            title="No executions found"
            description={
              activeStatus !== "all"
                ? `There are currently no tasks with status "${activeStatus}".`
                : "Your recovery inbox is empty. Submit a background task to begin tracking lifecycles."
            }
            actionText="Submit Execution"
            onAction={() => setShowSubmit(true)}
          />
        ) : (
          <div className="rounded-xl border border-stone-border bg-surface overflow-hidden shadow-card">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-stone-border bg-canvas-subtle text-2xs font-mono uppercase tracking-wider text-charcoal-secondary">
                  <th className="px-6 py-3 font-semibold">Execution Name</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Attempts</th>
                  <th className="px-4 py-3 font-semibold">Activity</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-border/60">
                <AnimatePresence initial={false}>
                  {executions.map((exec) => {
                    const isActive = selected?._id === exec._id;
                    const canRetry  = ["failed", "cancelled"].includes(exec.status);
                    const canCancel = ["pending", "retrying", "running"].includes(exec.status);
                    return (
                      <motion.tr
                        key={exec._id}
                        layout
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        onClick={() => handleSelectRow(exec)}
                        className={`cursor-pointer transition-colors hover:bg-canvas-subtle/80 ${
                          isActive ? "bg-canvas-subtle border-l-4 border-l-forest" : ""
                        }`}
                      >
                        <td className="px-6 py-3.5">
                          <div className="font-semibold text-charcoal truncate max-w-xs">{exec.name}</div>
                          {exec.tags?.length > 0 && (
                            <div className="flex gap-1.5 mt-1 flex-wrap">
                              {exec.tags.slice(0, 3).map((t) => (
                                <span
                                  key={t}
                                  className="text-2xs font-mono text-charcoal-muted border border-stone-border rounded-md px-1.5 py-0.5 bg-canvas-well"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-charcoal-secondary font-mono text-xs">{exec.type}</td>
                        <td className="px-4 py-3.5"><StatusBadge status={exec.status} size="sm" /></td>
                        <td className="px-4 py-3.5 text-charcoal font-mono tabular-nums text-xs">
                          {exec.attemptsMade} / {exec.maxAttempts}
                        </td>
                        <td className="px-4 py-3.5 text-charcoal-muted font-mono text-xs">
                          {timeAgo(exec.updatedAt || exec.createdAt)}
                        </td>
                        <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {canRetry && (
                              <button
                                title="Retry Execution"
                                onClick={() => handleRetry(exec._id)}
                                className="rounded p-1.5 text-terracotta hover:bg-terracotta-ghost transition-colors"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </button>
                            )}
                            {canCancel && (
                              <button
                                title="Cancel Execution"
                                onClick={() => handleCancel(exec._id)}
                                className="rounded p-1.5 text-charcoal-secondary hover:text-charcoal hover:bg-canvas-well transition-colors"
                              >
                                <XCircle className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              title="View details"
                              onClick={() => handleSelectRow(exec)}
                              className="rounded p-1.5 text-charcoal-muted hover:text-forest transition-colors"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pagination ───────────────────────────────────────── */}
      {pages > 1 && (
        <div className="border-t border-stone-border bg-surface px-6 py-3 flex items-center justify-between">
          <span className="text-xs font-mono text-charcoal-secondary">Page {page} of {pages}</span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page === pages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* ── Modals & Panels ──────────────────────────────────── */}
      <AnimatePresence>
        {showSubmit && (
          <SubmitModal onClose={() => setShowSubmit(false)} onSubmitted={handleSubmitted} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selected && (
          <>
            <div
              className="fixed inset-0 z-30 bg-charcoal/30 backdrop-blur-xs"
              onClick={handleCloseDetail}
            />
            <DetailPanel
              execution={selected}
              onClose={handleCloseDetail}
              onRetry={handleRetry}
              onCancel={handleCancel}
            />
          </>
        )}
      </AnimatePresence>

      {/* ── Toast notification ───────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className={`fixed bottom-6 right-6 z-50 rounded-xl border px-4 py-3 text-sm font-semibold shadow-modal flex items-center gap-2 ${
              toast.type === "danger"
                ? "border-terracotta-border bg-terracotta-ghost text-terracotta"
                : "border-[#2F7D5A]/30 bg-[rgba(47,125,90,0.1)] text-[#2F7D5A]"
            }`}
          >
            {toast.type === "danger" ? (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>{toast.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

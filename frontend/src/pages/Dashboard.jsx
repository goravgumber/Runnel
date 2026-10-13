import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Inbox,
  Play,
  RotateCcw,
  Ban,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Loader2,
  Plus,
  RefreshCw,
  Terminal,
  Activity,
  ArrowRight,
  ShieldAlert,
  Zap,
} from "lucide-react";
import { io } from "socket.io-client";
import { useAuth } from "../context/AuthContext";
import { executionsAPI } from "../services/executionsAPI";
import { healthAPI } from "../services/api";
import StatCard from "../components/ui/StatCard";
import StatusBadge from "../components/ui/StatusBadge";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import { getSocketUrl, getApiBaseUrl } from "../utils/url";
import { backendWakeup } from "../services/backendWakeup";

const SOCKET_URL = getSocketUrl();
const showDemoDispatcher =
  import.meta.env.DEV ||
  import.meta.env.VITE_ENABLE_DEMO_DISPATCHER === "true";
const apiBaseUrl = getApiBaseUrl();

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, token } = useAuth();

  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    retrying: 0,
    cancelled: 0,
  });
  const [recentExecutions, setRecentExecutions] = useState([]);
  const [healthData, setHealthData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [lastEvent, setLastEvent] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [quickSubmitting, setQuickSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const socketRef = useRef(null);

  // Load dashboard data with real executions and measured telemetry
  const loadDashboardData = useCallback(async () => {
    try {
      const [statsRes, listRes, healthRes] = await Promise.all([
        executionsAPI.stats(),
        executionsAPI.list({ limit: 10, page: 1 }),
        healthAPI.all().catch(() => ({ data: null })),
      ]);

      if (statsRes?.data) setStats(statsRes.data);
      if (listRes?.data) setRecentExecutions(listRes.data.executions || []);
      if (healthRes?.data) setHealthData(healthRes.data);
    } catch (_err) {
      setErrorMsg("Failed to synchronize dashboard metrics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Auto-refresh dashboard metrics when backend wakes up from sleep
  useEffect(() => {
    const unsubscribe = backendWakeup.onWakeup(() => {
      loadDashboardData();
    });
    return unsubscribe;
  }, [loadDashboardData]);

  // Socket.IO for real-time updates
  useEffect(() => {
    if (!token) return;
    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("execution:update", (evt) => {
      setLastEvent({ ...evt, timestamp: new Date().toLocaleTimeString() });
      loadDashboardData();
    });

    return () => socket.disconnect();
  }, [token, loadDashboardData]);

  // Quick submission of presets
  const handleQuickSubmit = async (type = "echo") => {
    setQuickSubmitting(true);
    try {
      const payload = {
        name: type === "fail" ? "Sample Failure Task" : "Quick Telemetry Check",
        type,
        description: `Automated test execution dispatched from Overview Dashboard.`,
        input: {
          timestamp: new Date().toISOString(),
          dispatchedBy: user?.username || "developer",
          environment: "production-preview",
        },
        maxAttempts: 3,
      };
      await executionsAPI.submit(payload);
      await loadDashboardData();
    } catch (err) {
      setErrorMsg(err.message || "Failed to submit execution");
    } finally {
      setQuickSubmitting(false);
    }
  };

  const handleRetry = async (id, e) => {
    e.stopPropagation();
    setActionLoading(id);
    try {
      await executionsAPI.retry(id);
      await loadDashboardData();
    } catch (err) {
      setErrorMsg(err.message || "Failed to retry execution");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (id, e) => {
    e.stopPropagation();
    setActionLoading(id);
    try {
      await executionsAPI.cancel(id);
      await loadDashboardData();
    } catch (err) {
      setErrorMsg(err.message || "Failed to cancel execution");
    } finally {
      setActionLoading(null);
    }
  };

  // Derived metrics from authenticated database records
  const activeCount = (stats.running || 0) + (stats.pending || 0);
  const recoveryCount = (stats.failed || 0) + (stats.retrying || 0);
  const eligibleCompleted = stats.completed || 0;
  const eligibleFailed = stats.failed || 0;
  const finalizedDenominator = eligibleCompleted + eligibleFailed;
  const successRate =
    finalizedDenominator > 0
      ? Math.round((eligibleCompleted / finalizedDenominator) * 100)
      : null;

  const filteredExecutions = recentExecutions.filter((item) => {
    if (filter === "recovery") return item.status === "failed" || item.status === "retrying";
    if (filter === "active") return item.status === "running" || item.status === "pending";
    if (filter === "completed") return item.status === "completed";
    return true;
  });

  return (
    <div className="min-h-full bg-canvas p-6 lg:p-8 space-y-6">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold font-sans tracking-tight text-charcoal">
              Execution Overview
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-2xs font-mono font-semibold bg-canvas-well text-charcoal-secondary border border-stone-border">
              <span className="w-1.5 h-1.5 rounded-full bg-forest animate-pulse" />
              LIVE TELEMETRY
            </span>
          </div>
          <p className="text-sm text-charcoal-secondary mt-1">
            Real-time lifecycle monitoring, failure diagnosis, and recovery dispatch.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={loadDashboardData}
            loading={loading}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Sync
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate("/executions?new=true")}
            icon={<Plus className="w-4 h-4" />}
          >
            Submit Task
          </Button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-terracotta-ghost border border-terracotta-edge text-terracotta text-sm flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg("")} className="font-bold ml-4">✕</button>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Submissions"
          value={stats.total}
          icon={Inbox}
          badge="Lifetime"
          badgeVariant="neutral"
          subtext="Total tasks ingested across all queues"
        />

        <StatCard
          title="In Progress"
          value={activeCount}
          icon={Activity}
          badge={activeCount > 0 ? "Processing" : "Idle"}
          badgeVariant={activeCount > 0 ? "info" : "neutral"}
          subtext={`${stats.running || 0} active, ${stats.pending || 0} queued`}
        />

        <StatCard
          title="Needs Recovery"
          value={recoveryCount}
          icon={ShieldAlert}
          badge={recoveryCount > 0 ? "Action Required" : "Clean"}
          badgeVariant={recoveryCount > 0 ? "danger" : "success"}
          subtext={`${stats.failed || 0} failed, ${stats.retrying || 0} retrying`}
          onClick={() => setFilter("recovery")}
        />

        <StatCard
          title="Completed Safely"
          value={stats.completed}
          icon={CheckCircle2}
          badge={successRate !== null ? `${successRate}% Success` : "Unavailable"}
          badgeVariant={
            successRate !== null
              ? successRate >= 80
                ? "success"
                : "warning"
              : "neutral"
          }
          subtext={
            finalizedDenominator > 0
              ? `${stats.completed || 0} of ${finalizedDenominator} finalized executions completed`
              : "No completed or failed records to evaluate"
          }
        />
      </div>

      {/* Welcome / Onboarding Card when 0 executions */}
      {stats.total === 0 && !loading && (
        <div className="bg-surface border border-stone-border rounded-2xl p-6 lg:p-8 shadow-card">
          <div className="max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-medium bg-forest-ghost text-forest border border-forest-border">
              <Zap className="w-3.5 h-3.5" /> Getting Started with Runnel
            </div>
            <h2 className="text-xl font-bold text-charcoal">
              Welcome to your Async Work Recovery Inbox
            </h2>
            <p className="text-sm text-charcoal-secondary leading-relaxed">
              Runnel tracks the complete execution lifecycle of your background jobs, microservice webhooks, and distributed tasks. Inspect attempt timelines, catch structured errors, and safely retry transient failures without data loss.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button
                variant="primary"
                onClick={() => navigate("/executions?new=true")}
                icon={<Plus className="w-3.5 h-3.5" />}
              >
                Submit First Execution
              </Button>

              {showDemoDispatcher && (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => handleQuickSubmit("echo")}
                    loading={quickSubmitting}
                    icon={<Play className="w-3.5 h-3.5" />}
                  >
                    Dispatch Demo Task (Echo)
                  </Button>

                  <Button
                    variant="secondary"
                    onClick={() => handleQuickSubmit("fail")}
                    loading={quickSubmitting}
                    icon={<AlertTriangle className="w-3.5 h-3.5 text-terracotta" />}
                  >
                    Test Recovery Flow (Fail &amp; Retry)
                  </Button>
                </>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-stone-border text-xs font-mono text-charcoal-secondary">
              <p className="mb-2 font-semibold uppercase tracking-wider text-charcoal-muted">
                HTTP API Dispatch Snippet:
              </p>
              <div className="bg-canvas-well border border-stone-border rounded-lg p-3 overflow-x-auto text-charcoal">
                <code>
                  curl -X POST {apiBaseUrl}/api/v1/executions \<br />
                  &nbsp;&nbsp;-H &quot;Authorization: Bearer &lt;YOUR_API_TOKEN&gt;&quot; \<br />
                  &nbsp;&nbsp;-H &quot;Content-Type: application/json&quot; \<br />
                  &nbsp;&nbsp;-d &apos;{JSON.stringify({ name: "Daily Invoice Batch", type: "echo", input: { count: 120 } })}&apos;
                </code>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid: Recent Activity & Side Intelligence */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Recent Activity (2 Cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-surface border border-stone-border rounded-2xl shadow-card overflow-hidden">
            {/* Table Header & Filter Tabs */}
            <div className="p-5 border-b border-stone-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-charcoal">
                  Recent Executions
                </h3>
                <p className="text-xs text-charcoal-secondary">
                  Showing latest active and recoverable background tasks
                </p>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1 bg-canvas-well p-1 rounded-lg border border-stone-border text-xs font-mono">
                {[
                  { key: "all", label: "All" },
                  { key: "recovery", label: `Recovery (${recoveryCount})` },
                  { key: "active", label: `Active (${activeCount})` },
                  { key: "completed", label: "Completed" },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setFilter(tab.key)}
                    className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                      filter === tab.key
                        ? "bg-surface text-charcoal shadow-sm border border-stone-border"
                        : "text-charcoal-secondary hover:text-charcoal"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* List / Table Content */}
            {filteredExecutions.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  title="No executions matching this filter"
                  description="Submit a new background job or change your active filter tab."
                  actionText="Submit Execution"
                  onAction={() => navigate("/executions?new=true")}
                />
              </div>
            ) : (
              <div className="divide-y divide-stone-border">
                {filteredExecutions.map((item) => {
                  const canRetry = ["failed", "cancelled"].includes(item.status);
                  const canCancel = ["pending", "retrying"].includes(item.status);

                  return (
                    <div
                      key={item._id}
                      onClick={() => navigate(`/executions/${item._id}`)}
                      className="p-4 sm:px-5 flex items-center justify-between gap-4 hover:bg-surface-hover cursor-pointer transition-colors group"
                    >
                      {/* Left: Status & Identity */}
                      <div className="min-w-0 flex items-center gap-3">
                        <StatusBadge status={item.status} size="xs" />

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-charcoal group-hover:text-forest truncate">
                              {item.name}
                            </span>
                            <span className="text-2xs font-mono px-1.5 py-0.5 rounded bg-canvas-well border border-stone-border text-charcoal-muted uppercase">
                              {item.type}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-xs text-charcoal-muted font-mono mt-0.5">
                            <span className="truncate max-w-[120px] sm:max-w-none">
                              ID: {item._id}
                            </span>
                            <span>•</span>
                            <span>
                              Attempts: {item.attemptsMade || 0}/{item.maxAttempts || 3}
                            </span>
                            {item.error?.message && (
                              <>
                                <span>•</span>
                                <span className="text-terracotta truncate max-w-[180px]">
                                  {item.error.message}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {canRetry && (
                          <Button
                            variant="secondary"
                            size="xs"
                            onClick={(e) => handleRetry(item._id, e)}
                            loading={actionLoading === item._id}
                            icon={<RotateCcw className="w-3 h-3 text-forest" />}
                          >
                            Retry
                          </Button>
                        )}

                        {canCancel && (
                          <Button
                            variant="secondary"
                            size="xs"
                            onClick={(e) => handleCancel(item._id, e)}
                            loading={actionLoading === item._id}
                            icon={<Ban className="w-3 h-3 text-charcoal-muted" />}
                          >
                            Cancel
                          </Button>
                        )}

                        <ArrowRight className="w-4 h-4 text-charcoal-muted group-hover:text-charcoal group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* View All Footer */}
            <div className="p-3 bg-canvas-well/40 border-t border-stone-border text-center">
              <Link
                to="/executions"
                className="text-xs font-mono font-semibold text-forest hover:underline inline-flex items-center gap-1.5"
              >
                Open Full Execution Inbox ({stats.total} records) <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Right Column: Failure Intelligence & Worker Telemetry */}
        <div className="space-y-6">
          {/* Quick Dispatch Card (Development & Demo only) */}
          {showDemoDispatcher && (
            <div className="bg-surface border border-stone-border rounded-2xl p-5 shadow-card space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-charcoal-muted">
                  <Terminal className="w-4 h-4 text-forest" /> Test &amp; Demo Dispatcher
                </div>
                <span className="text-2xs font-mono font-semibold px-2 py-0.5 rounded-full bg-forest-ghost text-forest border border-forest-border">
                  Demo Utility
                </span>
              </div>
              <p className="text-xs text-charcoal-secondary leading-relaxed">
                Dispatches actual background tasks to the local BullMQ worker to test queue ingestion, lifecycle tracking, and error recovery.
              </p>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleQuickSubmit("echo")}
                  loading={quickSubmitting}
                  className="w-full text-xs"
                >
                  + Echo Task (Demo)
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleQuickSubmit("fail")}
                  loading={quickSubmitting}
                  className="w-full text-xs text-terracotta border-terracotta/30"
                >
                  + Fail Task (Demo)
                </Button>
              </div>

              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate("/executions?new=true")}
                className="w-full text-xs"
                icon={<Plus className="w-3.5 h-3.5" />}
              >
                Configure Custom Execution
              </Button>
            </div>
          )}

          {/* Operational Health & Worker Telemetry sourced from /health */}
          {(() => {
            const queueInfo = healthData?.services?.queue || healthData?.data?.services?.queue;
            const redisInfo = healthData?.services?.redis || healthData?.data?.services?.redis;
            const mongoInfo = healthData?.services?.mongodb || healthData?.data?.services?.mongodb;
            const isOperational = queueInfo?.status === "operational" && redisInfo?.status === "connected";

            return (
              <div className="bg-surface border border-stone-border rounded-2xl p-5 shadow-card space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-charcoal-muted">
                    Worker Infrastructure
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-2xs font-mono font-semibold ${
                      isOperational
                        ? "bg-forest-ghost text-forest border border-forest-border"
                        : queueInfo?.status
                        ? "bg-amber-50 text-amber-700 border border-amber-200"
                        : "bg-canvas-well text-charcoal-muted border border-stone-border"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isOperational ? "bg-forest animate-pulse" : "bg-charcoal-muted"
                      }`}
                    />
                    {queueInfo?.status ? queueInfo.status.toUpperCase() : "CHECKING TELEMETRY"}
                  </span>
                </div>

                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between py-1.5 border-b border-stone-border/60">
                    <span className="text-charcoal-secondary">Queue Engine</span>
                    <span className="text-charcoal font-semibold">BullMQ (Redis Broker)</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-stone-border/60">
                    <span className="text-charcoal-secondary">Queue Name</span>
                    <span className="text-charcoal font-semibold">
                      {queueInfo?.name || "runnel-executions"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-stone-border/60">
                    <span className="text-charcoal-secondary">Queue Load</span>
                    <span className="text-charcoal font-semibold">
                      {queueInfo?.counts
                        ? `${queueInfo.counts.active || 0} active, ${queueInfo.counts.waiting || 0} waiting`
                        : "0 active, 0 waiting"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-stone-border/60">
                    <span className="text-charcoal-secondary">Redis Broker</span>
                    <span className="text-charcoal font-semibold">
                      {redisInfo?.status
                        ? `${redisInfo.status.toUpperCase()}${redisInfo.latency_ms != null ? ` (${redisInfo.latency_ms}ms)` : ""}`
                        : "Unavailable"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-stone-border/60">
                    <span className="text-charcoal-secondary">Database Connection</span>
                    <span className="text-charcoal font-semibold">
                      {mongoInfo?.status
                        ? `${mongoInfo.status.toUpperCase()}${mongoInfo.latency_ms != null ? ` (${mongoInfo.latency_ms}ms)` : ""}`
                        : "Unavailable"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-charcoal-secondary">Retry Policy</span>
                    <span className="text-charcoal font-semibold">Exponential Backoff (5s base)</span>
                  </div>
                </div>

                {lastEvent && (
                  <div className="mt-3 p-2.5 rounded-lg bg-canvas-well border border-stone-border text-2xs font-mono">
                    <div className="flex items-center justify-between text-charcoal-muted mb-1">
                      <span>LAST WS TRANSITION</span>
                      <span>{lastEvent.timestamp}</span>
                    </div>
                    <div className="text-charcoal truncate">
                      ID: {lastEvent.executionId} →{" "}
                      <span className="font-semibold uppercase">{lastEvent.status}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

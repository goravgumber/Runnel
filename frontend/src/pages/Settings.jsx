import React, { useState, useEffect } from "react";
import {
  User,
  Key,
  Sliders,
  ShieldAlert,
  Copy,
  Check,
  Eye,
  EyeOff,
  Terminal,
  Save,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { userAPI, authAPI } from "../services/api";

export default function Settings() {
  const { user, token } = useAuth();

  // Execution policies state
  const [policies, setPolicies] = useState({
    defaultMaxAttempts: 3,
    defaultExecutionTimeoutMs: 30000,
    retryBackoffMs: 1000,
  });

  const [_loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [showToken, setShowToken] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [revokingSessions, setRevokingSessions] = useState(false);

  const showNotification = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await userAPI.getSettings();
        if (res.data?.data?.settings || res.data?.settings) {
          const s = res.data?.data?.settings || res.data?.settings;
          setPolicies({
            defaultMaxAttempts: s.defaultMaxAttempts ?? 3,
            defaultExecutionTimeoutMs: s.defaultExecutionTimeoutMs ?? 30000,
            retryBackoffMs: s.retryBackoffMs ?? 1000,
          });
        }
      } catch (err) {
        console.error("Failed to fetch settings", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleCopyToken = () => {
    if (!token) return;
    navigator.clipboard.writeText(token).then(() => {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    });
  };

  const curlCommand = `curl -X POST http://localhost:5000/api/v1/executions \\
  -H "Authorization: Bearer ${showToken && token ? token : "<YOUR_API_TOKEN>"}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Sync customer webhook",
    "type": "echo",
    "input": {"customerId": "cus_1002"}
  }'`;

  const handleCopyCurl = () => {
    const fullCurl = `curl -X POST http://localhost:5000/api/v1/executions \\
  -H "Authorization: Bearer ${token || "YOUR_TOKEN"}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Sync customer webhook",
    "type": "echo",
    "input": {"customerId": "cus_1002"}
  }'`;
    navigator.clipboard.writeText(fullCurl).then(() => {
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 2000);
    });
  };

  const handleSavePolicies = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        defaultMaxAttempts: Number(policies.defaultMaxAttempts),
        defaultExecutionTimeoutMs: Number(policies.defaultExecutionTimeoutMs),
        retryBackoffMs: Number(policies.retryBackoffMs),
      };
      const res = await userAPI.saveSettings(payload);
      if (res.error) {
        showNotification(res.error, "error");
      } else {
        showNotification("Execution operational policies saved successfully!");
      }
    } catch {
      showNotification("Failed to save settings. Connection error.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeAllSessions = async () => {
    if (!window.confirm("Are you sure you want to revoke all other active sessions?")) return;
    setRevokingSessions(true);
    try {
      const res = await authAPI.logoutAll();
      if (res.error) {
        showNotification(res.error, "error");
      } else {
        showNotification("All other sessions revoked successfully!");
      }
    } catch {
      showNotification("Failed to revoke sessions.", "error");
    } finally {
      setRevokingSessions(false);
    }
  };

  const inputCls =
    "w-full rounded-lg border border-stone-border bg-canvas-subtle px-3 py-2 text-sm text-charcoal font-mono placeholder-charcoal-dim focus:border-forest focus:ring-1 focus:ring-forest/20 focus:outline-none transition-colors";
  const labelCls = "block text-xs font-mono uppercase tracking-wider text-charcoal-secondary mb-1.5";

  return (
    <div className="min-h-full bg-canvas p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-xl font-bold text-charcoal font-sans">Settings &amp; Developer Preferences</h1>
        <p className="text-sm text-charcoal-secondary mt-1">
          Manage your Runnel developer account credentials, execution queue policies, and security sessions.
        </p>
      </div>

      {/* Toast Alert */}
      {toast && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-3 text-sm font-medium transition-all ${
            toast.type === "error"
              ? "bg-terracotta-ghost border-terracotta-border text-terracotta"
              : "bg-[rgba(47,125,90,0.08)] border-[#2F7D5A]/30 text-[#2F7D5A]"
          }`}
        >
          {toast.type === "error" ? (
            <AlertTriangle className="w-5 h-5 shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* 1. Account Profile */}
      <div className="bg-surface border border-stone-border rounded-xl p-6 shadow-card space-y-4">
        <div className="flex items-center gap-3 border-b border-stone-border pb-4">
          <div className="w-9 h-9 rounded-lg bg-forest-ghost border border-forest-border flex items-center justify-center text-forest">
            <User className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-charcoal font-sans">Account &amp; Workspace</h2>
            <p className="text-xs text-charcoal-muted font-mono">Authenticated developer identity</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          <div className="bg-canvas-subtle border border-stone-border rounded-lg p-3">
            <span className="text-2xs font-mono uppercase tracking-wider text-charcoal-secondary block mb-1">
              Username
            </span>
            <span className="text-sm font-mono font-bold text-charcoal">{user?.username || "—"}</span>
          </div>
          <div className="bg-canvas-subtle border border-stone-border rounded-lg p-3">
            <span className="text-2xs font-mono uppercase tracking-wider text-charcoal-secondary block mb-1">
              Role
            </span>
            <span className="text-sm font-mono font-bold text-forest capitalize">{user?.role || "developer"}</span>
          </div>
          <div className="bg-canvas-subtle border border-stone-border rounded-lg p-3">
            <span className="text-2xs font-mono uppercase tracking-wider text-charcoal-secondary block mb-1">
              Session Status
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-mono text-[#2F7D5A]">
              <span className="w-2 h-2 rounded-full bg-[#2F7D5A] animate-pulse" />
              Authenticated (Active)
            </span>
          </div>
        </div>
      </div>

      {/* 2. Developer API Token & Integration */}
      <div className="bg-surface border border-stone-border rounded-xl p-6 shadow-card space-y-4">
        <div className="flex items-center justify-between border-b border-stone-border pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-canvas-well border border-stone-border flex items-center justify-center text-charcoal">
              <Key className="w-5 h-5 text-forest" />
            </div>
            <div>
              <h2 className="text-base font-bold text-charcoal font-sans">Developer API Access</h2>
              <p className="text-xs text-charcoal-muted font-mono">Programmatic access token for dispatching tasks</p>
            </div>
          </div>
        </div>

        <div>
          <label className={labelCls}>Active Bearer Token</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-canvas-subtle border border-stone-border rounded-lg px-3.5 py-2.5 font-mono text-xs text-charcoal truncate">
              {token ? (showToken ? token : `${token.slice(0, 18)}••••••••••••••••••••••••••••••••••••••••${token.slice(-6)}`) : "No active token"}
            </div>
            <button
              onClick={() => setShowToken(!showToken)}
              className="p-2.5 rounded-lg border border-stone-border bg-surface hover:bg-canvas-well text-charcoal-secondary transition-colors cursor-pointer"
              title={showToken ? "Hide token" : "Show token"}
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button
              onClick={handleCopyToken}
              className="p-2.5 rounded-lg border border-stone-border bg-surface hover:bg-canvas-well text-charcoal transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Copy token to clipboard"
            >
              {copiedToken ? <Check className="w-4 h-4 text-[#2F7D5A]" /> : <Copy className="w-4 h-4" />}
              <span className="text-xs font-mono hidden sm:inline">{copiedToken ? "Copied" : "Copy"}</span>
            </button>
          </div>
        </div>

        {/* Quickstart API snippet */}
        <div className="pt-2">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-mono uppercase tracking-wider text-charcoal-secondary flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-forest" /> Quickstart cURL Example
            </label>
            <button
              onClick={handleCopyCurl}
              className="text-2xs font-mono text-charcoal-secondary hover:text-charcoal flex items-center gap-1 transition-colors cursor-pointer"
            >
              {copiedCurl ? <Check className="w-3 h-3 text-[#2F7D5A]" /> : <Copy className="w-3 h-3" />}
              <span>{copiedCurl ? "Copied" : "Copy snippet"}</span>
            </button>
          </div>
          <pre className="bg-canvas-subtle border border-stone-border rounded-lg p-3 text-xs font-mono text-charcoal leading-relaxed overflow-x-auto">
            {curlCommand}
          </pre>
        </div>
      </div>

      {/* 3. Execution Queue Operational Policies */}
      <form onSubmit={handleSavePolicies} className="bg-surface border border-stone-border rounded-xl p-6 shadow-card space-y-4">
        <div className="flex items-center justify-between border-b border-stone-border pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-forest-ghost border border-forest-border flex items-center justify-center text-forest">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-charcoal font-sans">Queue Execution Policies</h2>
              <p className="text-xs text-charcoal-muted font-mono">Default runtime thresholds for submitted work</p>
            </div>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-forest hover:bg-forest-hover px-4 py-2 text-xs font-semibold text-white transition-colors shadow-sm cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? "Saving..." : "Save Policies"}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          <div>
            <label className={labelCls}>Default Max Attempts</label>
            <input
              type="number"
              min={1}
              max={10}
              className={inputCls}
              value={policies.defaultMaxAttempts}
              onChange={(e) => setPolicies({ ...policies, defaultMaxAttempts: Number(e.target.value) })}
            />
            <span className="text-2xs text-charcoal-muted font-mono mt-1 block">Bounded retries before terminal failure</span>
          </div>

          <div>
            <label className={labelCls}>Timeout (ms)</label>
            <input
              type="number"
              min={1000}
              step={1000}
              className={inputCls}
              value={policies.defaultExecutionTimeoutMs}
              onChange={(e) => setPolicies({ ...policies, defaultExecutionTimeoutMs: Number(e.target.value) })}
            />
            <span className="text-2xs text-charcoal-muted font-mono mt-1 block">Maximum job execution duration</span>
          </div>

          <div>
            <label className={labelCls}>Retry Backoff (ms)</label>
            <input
              type="number"
              min={100}
              step={100}
              className={inputCls}
              value={policies.retryBackoffMs}
              onChange={(e) => setPolicies({ ...policies, retryBackoffMs: Number(e.target.value) })}
            />
            <span className="text-2xs text-charcoal-muted font-mono mt-1 block">Base backoff before next attempt</span>
          </div>
        </div>
      </form>

      {/* 4. Security & Active Sessions */}
      <div className="bg-surface border border-stone-border rounded-xl p-6 shadow-card space-y-4">
        <div className="flex items-center gap-3 border-b border-stone-border pb-4">
          <div className="w-9 h-9 rounded-lg bg-terracotta-ghost border border-terracotta-border flex items-center justify-center text-terracotta">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-charcoal font-sans">Security &amp; Active Sessions</h2>
            <p className="text-xs text-charcoal-muted font-mono">Control your refresh tokens and active client connections</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
          <div>
            <p className="text-sm font-semibold text-charcoal">Revoke All Concurrent Sessions</p>
            <p className="text-xs text-charcoal-secondary font-mono mt-0.5">
              Invalidates all issued refresh tokens for this user account across all devices.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRevokeAllSessions}
            disabled={revokingSessions}
            className="px-4 py-2 rounded-lg border border-terracotta-border bg-terracotta-ghost hover:bg-terracotta-ghost/80 text-terracotta text-xs font-mono font-bold transition-colors cursor-pointer disabled:opacity-50 shrink-0"
          >
            {revokingSessions ? "Revoking..." : "Revoke All Other Sessions"}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Alert from "../components/ui/Alert";

export default function Signup() {
  const { signup, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user && !authLoading) {
      navigate("/", { replace: true });
    }
  }, [user, authLoading, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password.trim() || !confirmPassword.trim()) {
      setError("Please fill in all fields.");
      return;
    }
    if (username.trim().length < 3) {
      setError("Username must be at least 3 characters.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const result = await signup(username.trim(), password);
      if (result.success) {
        navigate("/login", { state: { message: "Account created successfully! Please sign in." } });
        return;
      }
      setError(result.error || "Sign up failed.");
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-forest-border border-t-forest" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      <div className="m-auto w-full max-w-sm px-6 py-12">
        <div className="bg-surface border border-stone-border rounded-2xl p-8 shadow-card">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-forest-ghost border border-forest-border text-forest">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h1 className="text-charcoal font-bold text-xl tracking-tight">Runnel</h1>
            <p className="text-charcoal-muted text-xs mt-1">Recovery Inbox for Asynchronous Work</p>
          </div>

          {error && (
            <div className="mb-5">
              <Alert variant="error" onClose={() => setError("")}>{error}</Alert>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-charcoal-secondary text-xs font-mono uppercase tracking-wider mb-1.5">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (error) setError("");
                }}
                className="block w-full bg-canvas-subtle border border-stone-border rounded-lg text-charcoal font-mono text-sm px-3.5 py-2.5 placeholder-charcoal-dim focus:border-forest outline-none ring-1 ring-transparent focus:ring-forest/20 transition-all"
                placeholder="Choose a username"
                autoComplete="username"
                disabled={loading}
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-charcoal-secondary text-xs font-mono uppercase tracking-wider mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError("");
                }}
                className="block w-full bg-canvas-subtle border border-stone-border rounded-lg text-charcoal font-mono text-sm px-3.5 py-2.5 placeholder-charcoal-dim focus:border-forest outline-none ring-1 ring-transparent focus:ring-forest/20 transition-all"
                placeholder="At least 8 characters"
                autoComplete="new-password"
                disabled={loading}
                required
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-charcoal-secondary text-xs font-mono uppercase tracking-wider mb-1.5">
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (error) setError("");
                }}
                className="block w-full bg-canvas-subtle border border-stone-border rounded-lg text-charcoal font-mono text-sm px-3.5 py-2.5 placeholder-charcoal-dim focus:border-forest outline-none ring-1 ring-transparent focus:ring-forest/20 transition-all"
                placeholder="Re-enter your password"
                autoComplete="new-password"
                disabled={loading}
                required
              />
            </div>

            <div className="pt-2">
              <button
                id="signup-submit-btn"
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-forest hover:bg-forest-hover text-white font-semibold text-sm px-4 py-3 transition-colors shadow-sm cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading && (
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                <span>{loading ? "Creating account..." : "Create account"}</span>
              </button>
            </div>
          </form>

          <p className="mt-6 text-center text-sm text-charcoal-secondary">
            Already have an account?{" "}
            <Link to="/login" className="font-semibold text-forest hover:underline transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

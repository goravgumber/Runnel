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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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

    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password.trim() || !confirmPassword.trim()) {
      setError("Please fill in all fields.");
      return;
    }
    if (trimmedUsername.length < 3) {
      setError("Username must be at least 3 characters long.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match. Please verify your confirmation password.");
      return;
    }

    setLoading(true);

    try {
      const result = await signup(trimmedUsername, password);
      if (result.success) {
        navigate("/login", {
          state: { message: "Account created successfully! Please sign in." },
        });
        return;
      }
      setError(result.error || "Sign up failed.");
    } catch (err) {
      setError(err?.message || "Runnel backend service is currently unreachable.");
    } finally {
      setLoading(false);
    }
  };

  const togglePasswordVisibility = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setShowPassword((prev) => !prev);
  };

  const toggleConfirmPasswordVisibility = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setShowConfirmPassword((prev) => !prev);
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-forest-border border-t-forest" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10 sm:px-6">
      <div className="w-full max-w-[460px]">
        {/* Main Authentication Card */}
        <div className="bg-surface border border-stone-border rounded-2xl p-8 sm:p-10 shadow-card">
          {/* Brand Header */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-3.5 flex h-12 w-12 items-center justify-center rounded-xl bg-forest-ghost border border-forest-border text-forest">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </div>
            <h1 className="text-charcoal font-bold text-2xl tracking-tight">Runnel</h1>
            <p className="text-charcoal-secondary text-xs sm:text-sm mt-1">
              Create an account to manage background recovery
            </p>
          </div>

          {/* Feedback Alert */}
          {error && (
            <div className="mb-5" id="signup-error-alert" role="alert" aria-live="assertive">
              <Alert variant="error" onClose={() => setError("")}>
                <div className="flex items-start gap-2.5">
                  <svg
                    className="w-4 h-4 text-terracotta shrink-0 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <span className="font-medium text-xs sm:text-sm leading-snug">{error}</span>
                </div>
              </Alert>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Username Field */}
            <div>
              <label
                htmlFor="username"
                className="block text-charcoal-secondary text-xs font-mono uppercase tracking-wider mb-2"
              >
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="block w-full h-11 bg-canvas-subtle border border-stone-border rounded-lg text-charcoal font-mono text-sm px-3.5 placeholder-charcoal-dim focus:border-forest outline-none ring-1 ring-transparent focus:ring-forest/20 transition-all"
                placeholder="Choose a username (min 3 chars)"
                autoComplete="username"
                disabled={loading}
                required
              />
            </div>

            {/* Password Field */}
            <div>
              <label
                htmlFor="password"
                className="block text-charcoal-secondary text-xs font-mono uppercase tracking-wider mb-2"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full h-11 bg-canvas-subtle border border-stone-border rounded-lg text-charcoal font-mono text-sm pl-3.5 pr-11 placeholder-charcoal-dim focus:border-forest outline-none ring-1 ring-transparent focus:ring-forest/20 transition-all"
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  disabled={loading}
                  required
                />
                <button
                  type="button"
                  id="toggle-signup-password-visibility-btn"
                  onClick={togglePasswordVisibility}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center justify-center h-7 w-7 rounded text-charcoal-secondary hover:text-charcoal focus:outline-none focus:ring-2 focus:ring-forest/30 transition-colors cursor-pointer"
                  tabIndex={0}
                >
                  {showPassword ? (
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Confirm Password Field */}
            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-charcoal-secondary text-xs font-mono uppercase tracking-wider mb-2"
              >
                Confirm password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="block w-full h-11 bg-canvas-subtle border border-stone-border rounded-lg text-charcoal font-mono text-sm pl-3.5 pr-11 placeholder-charcoal-dim focus:border-forest outline-none ring-1 ring-transparent focus:ring-forest/20 transition-all"
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  disabled={loading}
                  required
                />
                <button
                  type="button"
                  id="toggle-signup-confirm-password-visibility-btn"
                  onClick={toggleConfirmPasswordVisibility}
                  aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  title={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center justify-center h-7 w-7 rounded text-charcoal-secondary hover:text-charcoal focus:outline-none focus:ring-2 focus:ring-forest/30 transition-colors cursor-pointer"
                  tabIndex={0}
                >
                  {showConfirmPassword ? (
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Primary Submit Button */}
            <div className="pt-2">
              <button
                id="signup-submit-btn"
                type="submit"
                disabled={loading}
                className="flex w-full h-11 items-center justify-center gap-2 rounded-lg bg-forest hover:bg-forest-hover active:bg-[#143527] text-white font-semibold text-sm px-4 transition-all shadow-sm cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading && (
                  <svg
                    className="animate-spin h-4 w-4 text-white"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                )}
                <span>{loading ? "Creating account..." : "Create account"}</span>
              </button>
            </div>
          </form>

          {/* Navigation to Sign In */}
          <div className="mt-8 pt-6 border-t border-stone-border text-center">
            <p className="text-sm text-charcoal-secondary">
              Already have an account?{" "}
              <Link
                to="/login"
                className="font-semibold text-forest hover:underline transition-colors"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

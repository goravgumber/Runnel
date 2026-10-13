import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import AuthLayout from "../components/auth/AuthLayout";
import Alert from "../components/ui/Alert";

export default function Login() {
  const { login, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState(location.state?.message || "");
  const [expiredMsg, setExpiredMsg] = useState(
    location.state?.reason === "expired"
      ? "Your session has expired. Please sign in again to continue."
      : ""
  );

  useEffect(() => {
    if (user && !authLoading) {
      navigate("/", { replace: true });
    }
  }, [user, authLoading, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedUsername = username.trim();
    if (!trimmedUsername && !password) {
      setError("Please enter your username and password.");
      return;
    }
    if (!trimmedUsername) {
      setError("Please enter your username or email address.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setLoading(true);
    setError("");
    setExpiredMsg("");

    try {
      const result = await login(trimmedUsername, password);
      if (!result.success) {
        setError(result.error || "Unable to sign in. Please verify your credentials.");
      }
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

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FBF9F3]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1B4332] border-t-transparent" />
      </div>
    );
  }

  return (
    <AuthLayout
      mode="login"
      title="Welcome back."
      subtitle="Sign in to continue to Runnel."
      alternateLink="/signup"
      alternateText="New to Runnel?"
      alternateActionText="Create an account"
    >
      {/* Feedback Alerts */}
      {expiredMsg && (
        <div className="mb-4">
          <Alert variant="warning" onClose={() => setExpiredMsg("")}>
            {expiredMsg}
          </Alert>
        </div>
      )}

      {successMsg && (
        <div className="mb-4">
          <Alert variant="success" onClose={() => setSuccessMsg("")}>
            {successMsg}
          </Alert>
        </div>
      )}

      {error && (
        <div className="mb-4" id="login-error-alert" role="alert" aria-live="assertive">
          <Alert variant="error" onClose={() => setError("")}>
            <div className="flex items-start gap-2">
              <span className="font-medium text-xs sm:text-sm leading-snug">{error}</span>
            </div>
          </Alert>
        </div>
      )}

      {/* Login Form */}
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Username Field */}
        <div>
          <label
            htmlFor="username"
            className="block text-xs font-medium text-[#1B1C18] mb-1.5"
          >
            Username
          </label>
          <input
            id="username"
            name="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="block w-full h-11 bg-white border border-[#D1D5DB] rounded-lg text-[#1B1C18] text-sm px-3.5 placeholder-[#9CA3AF] focus:border-[#1B4332] focus:ring-1 focus:ring-[#1B4332] outline-none transition-all"
            placeholder="alex_sre"
            autoComplete="username"
            disabled={loading}
            required
          />
        </div>

        {/* Password Field */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="password"
              className="block text-xs font-medium text-[#1B1C18]"
            >
              Password
            </label>
          </div>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="block w-full h-11 bg-white border border-[#D1D5DB] rounded-lg text-[#1B1C18] text-sm pl-3.5 pr-10 placeholder-[#9CA3AF] focus:border-[#1B4332] focus:ring-1 focus:ring-[#1B4332] outline-none transition-all font-mono"
              placeholder="••••••••••••••••"
              autoComplete="current-password"
              disabled={loading}
              required
            />
            <button
              type="button"
              id="toggle-password-visibility-btn"
              onClick={togglePasswordVisibility}
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center justify-center h-7 w-7 rounded text-[#6B7280] hover:text-[#1B1C18] focus:outline-none transition-colors cursor-pointer"
              tabIndex={0}
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Primary Submit Button */}
        <div className="pt-2">
          <button
            id="login-submit-btn"
            type="submit"
            disabled={loading}
            className="flex w-full h-11 items-center justify-center gap-2 rounded-lg bg-[#1B4332] hover:bg-[#143527] active:bg-[#0E261C] text-white font-medium text-sm px-4 transition-all shadow-sm cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
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
            <span>{loading ? "Signing in..." : "Sign in"}</span>
            <ArrowRight className="w-4 h-4 ml-0.5 sm:hidden" />
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}

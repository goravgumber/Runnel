import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, Info } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import AuthLayout from "../components/auth/AuthLayout";
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
          state: { message: "Account created successfully! Please sign in with your credentials." },
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
      <div className="flex min-h-screen items-center justify-center bg-[#FBF9F3]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1B4332] border-t-transparent" />
      </div>
    );
  }

  return (
    <AuthLayout
      mode="signup"
      title="Create your account."
      subtitle="Start tracking background tasks and recovering failed work."
      alternateLink="/login"
      alternateText="Already have an account?"
      alternateActionText="Sign in"
    >
      {/* Feedback Alert */}
      {error && (
        <div className="mb-4" id="signup-error-alert" role="alert" aria-live="assertive">
          <Alert variant="error" onClose={() => setError("")}>
            <div className="flex items-start gap-2">
              <span className="font-medium text-xs sm:text-sm leading-snug">{error}</span>
            </div>
          </Alert>
        </div>
      )}

      {/* Signup Form */}
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Username Field with @ prefix */}
        <div>
          <label
            htmlFor="username"
            className="block text-xs font-medium text-[#1B1C18] mb-1.5"
          >
            Username
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] text-sm font-mono select-none">
              @
            </span>
            <input
              id="username"
              name="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="block w-full h-11 bg-white border border-[#D1D5DB] rounded-lg text-[#1B1C18] text-sm pl-8 pr-3.5 placeholder-[#9CA3AF] focus:border-[#1B4332] focus:ring-1 focus:ring-[#1B4332] outline-none transition-all font-mono"
              placeholder="username"
              autoComplete="username"
              disabled={loading}
              required
            />
          </div>
        </div>

        {/* Password Field */}
        <div>
          <label
            htmlFor="password"
            className="block text-xs font-medium text-[#1B1C18] mb-1.5"
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
              className="block w-full h-11 bg-white border border-[#D1D5DB] rounded-lg text-[#1B1C18] text-sm pl-3.5 pr-10 placeholder-[#9CA3AF] focus:border-[#1B4332] focus:ring-1 focus:ring-[#1B4332] outline-none transition-all font-mono"
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
          <div className="flex items-center gap-1 text-2xs text-[#6B7280] mt-1.5">
            <Info className="w-3 h-3 text-[#9CA3AF]" />
            <span>At least 8 characters</span>
          </div>
        </div>

        {/* Confirm Password Field */}
        <div>
          <label
            htmlFor="confirmPassword"
            className="block text-xs font-medium text-[#1B1C18] mb-1.5"
          >
            Confirm Password
          </label>
          <div className="relative">
            <input
              id="confirmPassword"
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="block w-full h-11 bg-white border border-[#D1D5DB] rounded-lg text-[#1B1C18] text-sm pl-3.5 pr-10 placeholder-[#9CA3AF] focus:border-[#1B4332] focus:ring-1 focus:ring-[#1B4332] outline-none transition-all font-mono"
              placeholder="Repeat password"
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
              className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center justify-center h-7 w-7 rounded text-[#6B7280] hover:text-[#1B1C18] focus:outline-none transition-colors cursor-pointer"
              tabIndex={0}
            >
              {showConfirmPassword ? (
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
            id="signup-submit-btn"
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
            <span>{loading ? "Creating account..." : "Create account"}</span>
            <ArrowRight className="w-4 h-4 ml-0.5" />
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}

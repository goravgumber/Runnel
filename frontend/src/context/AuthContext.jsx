import React, { createContext, useState, useContext, useEffect, useCallback } from "react";
import { toApiPath, unwrapApiResponse, getFreshToken, performBoundedAuthRequest } from "../services/api";
import { backendWakeup } from "../services/backendWakeup";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  const clearAuthData = useCallback(() => {
    setUser(null);
    setToken(null);
    setRefreshToken(null);
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
  }, []);

  // Listen for global auth expiry event from API client
  useEffect(() => {
    const handleAuthExpired = () => {
      clearAuthData();
    };
    window.addEventListener("runnel:auth-expired", handleAuthExpired);
    return () => window.removeEventListener("runnel:auth-expired", handleAuthExpired);
  }, [clearAuthData]);

  const refreshAccessToken = useCallback(async () => {
    const freshToken = await getFreshToken();
    if (!freshToken) {
      clearAuthData();
      throw new Error("Session refresh failed");
    }

    const savedUser = localStorage.getItem("user");
    const savedRefreshToken = localStorage.getItem("refreshToken");
    if (savedUser) {
      try { setUser(JSON.parse(savedUser)); } catch { /* ignore */ }
    }
    setToken(freshToken);
    if (savedRefreshToken) setRefreshToken(savedRefreshToken);

    return freshToken;
  }, [clearAuthData]);

  const validateToken = useCallback(async (tokenToValidate) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(toApiPath("/auth/validate"), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${tokenToValidate}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        if (res.status === 401) {
          const savedRefreshToken = localStorage.getItem("refreshToken");
          if (savedRefreshToken) {
            try {
              await refreshAccessToken(savedRefreshToken);
              return;
            } catch {
              // Refresh failed, fall through to clear
            }
          }
          throw new Error("Token validation failed");
        }

        // On 502/503/504 gateway responses (backend cold-starting on free tier),
        // do NOT wipe auth state. Trigger wakeup tracking instead.
        if (backendWakeup.isWakeupCandidate(res.status)) {
          backendWakeup.startWakeupTracking();
          return;
        }

        throw new Error("Token validation failed");
      }
    } catch (_error) {
      // If network error or timeout (backend asleep on free tier), do NOT wipe saved session!
      if (backendWakeup.isWakeupCandidate(0, _error) || _error.name === "AbortError") {
        backendWakeup.startWakeupTracking();
        return;
      }
      console.warn("Token validation failed, clearing auth data");
      clearAuthData();
    } finally {
      clearTimeout(timeoutId);
    }
  }, [clearAuthData, refreshAccessToken]);

  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    const savedToken = localStorage.getItem("token");
    const savedRefreshToken = localStorage.getItem("refreshToken");

    if (savedUser && savedToken) {
      try {
        setUser(JSON.parse(savedUser));
        setToken(savedToken);
        if (savedRefreshToken) setRefreshToken(savedRefreshToken);
        validateToken(savedToken);
      } catch (_error) {
        console.error("Error loading saved auth data:", _error);
        clearAuthData();
      }
    }

    setLoading(false);
  }, [clearAuthData, validateToken]);

  // If backend was sleeping and wakes up, quietly re-validate session without disruption
  useEffect(() => {
    const unsubscribe = backendWakeup.onWakeup(() => {
      const currentToken = localStorage.getItem("token");
      if (currentToken) {
        validateToken(currentToken);
      }
    });
    return unsubscribe;
  }, [validateToken]);

  const extractErrorMessage = (payload, fallbackMessage) => {
    if (!payload) return fallbackMessage;

    // Check validation errors (from Zod or express-validator)
    const validationError =
      payload?.error?.details?.validationErrors?.[0]?.message ||
      (Array.isArray(payload?.error?.details) ? payload.error.details[0]?.message : null) ||
      (Array.isArray(payload?.errors) ? (payload.errors[0]?.message || payload.errors[0]?.msg) : null);

    if (validationError) return validationError;

    // Check message in error object
    if (payload?.error?.message && typeof payload.error.message === "string") {
      return payload.error.message;
    }

    // Check top-level message
    if (payload?.message && typeof payload.message === "string") {
      return payload.message;
    }

    // Check string error
    if (typeof payload?.error === "string") {
      return payload.error;
    }

    return fallbackMessage;
  };

  const login = async (username, password) => {
    try {
      setAuthError(null);

      const { ok, status, payload, timedOut, error } =
        await performBoundedAuthRequest("/auth/login", { username, password });

      if (timedOut) {
        backendWakeup.startWakeupTracking();
        const timeoutMsg =
          "Sign-in request timed out. The backend service may be starting up on the free tier. Please wait a moment and try again.";
        setAuthError(timeoutMsg);
        return { success: false, error: timeoutMsg };
      }

      if (backendWakeup.isWakeupCandidate(status)) {
        backendWakeup.startWakeupTracking();
      }

      const data = unwrapApiResponse(payload);

      if (!ok) {
        const isWakeup = backendWakeup.isWakeupCandidate(status, error);
        if (isWakeup) {
          backendWakeup.startWakeupTracking();
        }
        const errorDetail = isWakeup
          ? "Runnel backend service is currently waking up on the free tier. Please wait up to a minute."
          : extractErrorMessage(
              payload,
              status === 401
                ? "Invalid username or password. Please try again."
                : status === 429
                ? "Too many sign-in attempts. Please try again later."
                : status >= 500
                ? "Runnel backend service is currently waking up or unavailable. Please wait a moment and try again."
                : (error || "Sign in failed. Please try again.")
            );
        throw new Error(errorDetail);
      }

      setUser(data.user);
      setToken(data.token);
      setRefreshToken(data.refreshToken);

      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.setItem("token", data.token);
      localStorage.setItem("refreshToken", data.refreshToken);

      return { success: true, data };

    } catch (err) {
      const isWakeup = backendWakeup.isWakeupCandidate(0, err);
      if (isWakeup) {
        backendWakeup.startWakeupTracking();
      }
      const errorMessage = isWakeup
        ? "Runnel backend service is currently waking up on the free tier. Please wait up to a minute."
        : (err.message || "Login failed");
      setAuthError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const signup = async (username, password) => {
    try {
      setAuthError(null);

      const { ok, status, payload, timedOut, error } =
        await performBoundedAuthRequest("/auth/signup", { username, password });

      if (timedOut) {
        backendWakeup.startWakeupTracking();
        const timeoutMsg =
          "Registration request timed out. The backend service may be starting up on the free tier. Please wait a moment and try again.";
        setAuthError(timeoutMsg);
        return { success: false, error: timeoutMsg };
      }

      if (backendWakeup.isWakeupCandidate(status)) {
        backendWakeup.startWakeupTracking();
      }

      if (!ok) {
        const isWakeup = backendWakeup.isWakeupCandidate(status, error);
        if (isWakeup) {
          backendWakeup.startWakeupTracking();
        }
        const errorDetail = isWakeup
          ? "Runnel backend service is currently waking up on the free tier. Please wait up to a minute."
          : extractErrorMessage(
              payload,
              status === 409
                ? "Username already taken. Please choose another username or sign in."
                : status === 429
                ? "Too many registration attempts. Please try again later."
                : status >= 500
                ? "Runnel backend service is currently waking up or unavailable. Please wait a moment and try again."
                : (error || "Signup failed. Please try again.")
            );
        throw new Error(errorDetail);
      }

      return { success: true, data: payload };

    } catch (err) {
      const isWakeup = backendWakeup.isWakeupCandidate(0, err);
      if (isWakeup) {
        backendWakeup.startWakeupTracking();
      }
      const errorMessage = isWakeup
        ? "Runnel backend service is currently waking up on the free tier. Please wait up to a minute."
        : (err.message || "Signup failed");
      setAuthError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const logout = useCallback(async () => {
    try {
      if (token) {
        await fetch(toApiPath("/auth/logout"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ refreshToken }),
        }).catch(() => null);
      }
      clearAuthData();
      setAuthError(null);
    } catch (error) {
      console.error("Logout error:", error);
    }
  }, [clearAuthData, refreshToken, token]);

  const authFetch = useCallback(async (url, options = {}) => {
    try {
      if (!token) {
        throw new Error("No authentication token available");
      }

      const buildRequest = (accessToken) => ({
        ...options,
        headers: {
          ...(options.headers || {}),
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": options.headers?.["Content-Type"] || "application/json",
        },
      });

      let res = await fetch(toApiPath(url), buildRequest(token));

      if (res.status === 401) {
        try {
          const nextToken = await refreshAccessToken();
          res = await fetch(toApiPath(url), buildRequest(nextToken));
        } catch (_refreshError) {
          await logout();
          throw new Error("Session expired. Please login again.");
        }
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          errorData?.error?.message ||
            errorData?.message ||
            `HTTP ${res.status}: ${res.statusText}`
        );
      }

      return res;

    } catch (error) {
      console.error("Auth fetch error:", error);
      throw error;
    }
  }, [logout, refreshAccessToken, token]);

  const isAuthenticated = () => {
    return !!(user && token);
  };

  const clearError = () => {
    setAuthError(null);
  };

  const refreshUser = async () => {
    if (!token) return;

    const response = await authFetch("/auth/me");
    const payload = await response.json();
    const userData = unwrapApiResponse(payload);

    setUser(userData.user);
    localStorage.setItem("user", JSON.stringify(userData.user));

    return userData.user;
  };

  return (
    <AuthContext.Provider
      value={{
        // State
        user,
        token,
        refreshToken,
        loading,
        authError,

        // Methods
        login,
        signup,
        logout,
        authFetch,
        refreshAccessToken,

        // Utilities
        isAuthenticated,
        clearError,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

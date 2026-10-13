import React, { createContext, useState, useContext, useEffect, useCallback } from "react";
import { toApiPath, unwrapApiResponse } from "../services/api";

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

  const refreshAccessToken = useCallback(async (tokenOverride) => {
    const activeRefreshToken = tokenOverride || refreshToken || localStorage.getItem("refreshToken");
    if (!activeRefreshToken) {
      throw new Error("No refresh token available");
    }

    const res = await fetch(toApiPath("/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: activeRefreshToken }),
    });

    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      clearAuthData();
      throw new Error(payload?.error?.message || payload?.message || "Session refresh failed");
    }

    const data = unwrapApiResponse(payload);
    setUser(data.user);
    setToken(data.token);
    setRefreshToken(data.refreshToken);
    localStorage.setItem("user", JSON.stringify(data.user));
    localStorage.setItem("token", data.token);
    localStorage.setItem("refreshToken", data.refreshToken);

    return data.token;
  }, [clearAuthData, refreshToken]);

  const validateToken = useCallback(async (tokenToValidate) => {
    try {
      const res = await fetch(toApiPath("/auth/validate"), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${tokenToValidate}`,
          "Content-Type": "application/json",
        },
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
        }
        throw new Error("Token validation failed");
      }
    } catch (_error) {
      console.warn("Token validation failed, clearing auth data");
      clearAuthData();
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

  const login = async (username, password) => {
    try {
      setLoading(true);
      setAuthError(null);

      const res = await fetch(toApiPath("/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const payload = await res.json().catch(() => ({}));
      const data = unwrapApiResponse(payload);

      if (!res.ok) {
        const errorDetail =
          payload?.error?.details?.validationErrors?.[0]?.message ||
          (Array.isArray(payload?.error?.details) ? payload.error.details[0]?.message : null) ||
          payload?.error?.message ||
          payload?.message ||
          "Login failed";
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
      const errorMessage = err.message || "Login failed";
      setAuthError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const signup = async (username, password) => {
    try {
      setLoading(true);
      setAuthError(null);

      const res = await fetch(toApiPath("/auth/signup"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errorDetail =
          payload?.error?.details?.validationErrors?.[0]?.message ||
          (Array.isArray(payload?.error?.details) ? payload.error.details[0]?.message : null) ||
          payload?.error?.message ||
          payload?.message ||
          "Signup failed";
        throw new Error(errorDetail);
      }

      return { success: true, data: payload };

    } catch (err) {
      const errorMessage = err.message || "Signup failed";
      setAuthError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
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

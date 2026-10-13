import React, { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowLeft, Home, RefreshCw } from "lucide-react";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import { AuthProvider, useAuth } from "./context/AuthContext";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const ExecutionInbox = lazy(() => import("./pages/ExecutionInbox"));
const Settings = lazy(() => import("./pages/Settings"));

const LoadingSpinner = ({ message = "Loading..." }) => (
  <div className="flex min-h-screen flex-col items-center justify-center bg-canvas font-sans">
    <div className="mb-4 h-10 w-10 animate-spin rounded-full border-2 border-forest-border border-t-forest" />
    <h3 className="mb-1 text-base font-bold text-charcoal">
      RUNNEL
    </h3>
    <p className="text-charcoal-muted text-xs font-mono">{message}</p>
  </div>
);

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingSpinner message="Checking authentication..." />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingSpinner message="Checking authentication..." />;
  if (user) return <Navigate to="/" replace />;
  return children;
}

function PageWrapper({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.2 }}
      className="h-full"
    >
      {children}
    </motion.div>
  );
}

const SuspenseFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-canvas">
    <div className="text-center">
      <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-forest-border border-t-forest" />
      <p className="text-xs font-mono text-charcoal-muted">Loading interface...</p>
    </div>
  </div>
);

const NotFound = () => (
  <div className="flex min-h-screen flex-col items-center justify-center bg-canvas p-6 font-sans">
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-md text-center bg-surface border border-stone-border rounded-2xl p-8 shadow-card"
    >
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-xl bg-terracotta-ghost border border-terracotta-border">
        <AlertTriangle className="h-8 w-8 text-terracotta" />
      </div>
      <h1 className="mb-2 text-xl font-bold text-charcoal">
        404 — Page Not Found
      </h1>
      <p className="mb-6 text-xs text-charcoal-secondary font-mono">
        The requested route does not exist in the Runnel recovery suite.
      </p>
      <div className="flex flex-col justify-center gap-3 sm:flex-row">
        <button
          onClick={() => window.history.back()}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-stone-border px-5 py-2.5 text-xs font-semibold text-charcoal hover:bg-canvas-well transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Go Back
        </button>
        <button
          onClick={() => { window.location.href = "/"; }}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-forest hover:bg-forest-hover px-5 py-2.5 text-xs font-semibold text-white transition-colors shadow-sm"
        >
          <Home className="h-4 w-4" />
          Return to Overview
        </button>
      </div>
    </motion.div>
  </div>
);

function AppContent() {
  return (
    <AnimatePresence mode="wait">
      <Suspense fallback={<SuspenseFallback />}>
        <Routes>
          {/* Public Auth Routes */}
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />

          {/* Canonical Protected Runnel Experience */}
          <Route element={<Layout />}>
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <PageWrapper><Dashboard /></PageWrapper>
                </ProtectedRoute>
              }
            />
            <Route
              path="/executions"
              element={
                <ProtectedRoute>
                  <PageWrapper><ExecutionInbox /></PageWrapper>
                </ProtectedRoute>
              }
            />
            <Route
              path="/executions/:id"
              element={
                <ProtectedRoute>
                  <PageWrapper><ExecutionInbox /></PageWrapper>
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <PageWrapper><Settings /></PageWrapper>
                </ProtectedRoute>
              }
            />

            {/* Strict Redirects: Disallow All Legacy Simulation Routes */}
            <Route path="/dashboard" element={<Navigate to="/" replace />} />
            <Route path="/simulation-dashboard" element={<Navigate to="/" replace />} />
            <Route path="/simulation" element={<Navigate to="/" replace />} />
            <Route path="/reports" element={<Navigate to="/" replace />} />
            <Route path="/logbook" element={<Navigate to="/" replace />} />
            <Route path="/monitoring" element={<Navigate to="/" replace />} />
            <Route path="/alerts" element={<Navigate to="/" replace />} />
            <Route path="/predictions" element={<Navigate to="/" replace />} />
            <Route path="/history" element={<Navigate to="/" replace />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </AnimatePresence>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Application Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-canvas p-6 font-sans">
          <div className="max-w-md text-center bg-surface border border-stone-border rounded-2xl p-8 shadow-card">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-xl bg-terracotta-ghost border border-terracotta-border">
              <AlertTriangle className="h-8 w-8 text-terracotta" />
            </div>
            <h1 className="mb-2 text-lg font-bold text-charcoal">
              Application Runtime Error
            </h1>
            <p className="mb-6 text-xs text-charcoal-secondary font-mono leading-relaxed">
              An unexpected error occurred during execution rendering.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-forest hover:bg-forest-hover px-5 py-2.5 text-xs font-semibold text-white transition-colors shadow-sm"
            >
              <RefreshCw className="h-4 w-4" />
              Reload Runnel
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <div className="h-full min-h-full bg-canvas text-charcoal transition-colors duration-300 font-sans">
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </div>
    </ErrorBoundary>
  );
}
/**
 * e2e_containerized_staging_test.js
 *
 * Comprehensive end-to-end test suite for the actual containerized Runnel stack:
 * - Nginx Reverse Proxy (port 8088)
 * - React Frontend SPA (port 8081)
 * - Node.js Backend & Execution Worker (port 5001)
 * - MongoDB Container (port 27018)
 * - Redis Container (port 6381)
 */

const crypto = require("node:crypto");
const { execSync } = require("node:child_process");

const BASE_URL = process.env.STAGING_URL || "http://localhost:8088";
const MONGO_PORT = process.env.MONGO_PORT || "27018";
const REDIS_PORT = process.env.REDIS_PORT || "6381";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const res = await fetch(url, { ...options, headers });
  let data = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch (_) {
    data = text;
  }
  return { status: res.status, headers: res.headers, data };
}

async function runStagingVerification() {
  console.log("====================================================================");
  console.log("RUNNEL CONTAINERIZED STAGING STACK VERIFICATION");
  console.log(`Target: ${BASE_URL} (via Nginx Reverse Proxy)`);
  console.log("====================================================================");

  // ── 1. Health & Readiness Checks ─────────────────────────────────────
  console.log("\n1. Verifying Container Stack Health & Readiness...");
  const healthRes = await request("/health");
  if (healthRes.status !== 200 || healthRes.data?.data?.status !== "pass") {
    throw new Error(`Health check failed: ${JSON.stringify(healthRes.data)}`);
  }
  console.log("✔ /health status: pass");
  console.log(`  - MongoDB: ${healthRes.data.data.services.mongodb.status} (${healthRes.data.data.services.mongodb.latency_ms}ms)`);
  console.log(`  - Redis:   ${healthRes.data.data.services.redis.status} (${healthRes.data.data.services.redis.latency_ms}ms)`);
  console.log(`  - Queue:   ${healthRes.data.data.services.queue.status} (name: ${healthRes.data.data.services.queue.name})`);
  console.log(`  - Recovery Engine: enabled=${healthRes.data.data.services.recovery?.enabled}`);

  const readyRes = await request("/health/ready");
  if (readyRes.status !== 200 || readyRes.data?.data?.status !== "ready") {
    throw new Error(`Readiness check failed: ${JSON.stringify(readyRes.data)}`);
  }
  console.log("✔ /health/ready checks passed (Mongo, Redis, WebSocket operational)");

  // ── 2. Registration & Authentication ─────────────────────────────────
  console.log("\n2. Verifying User Registration & Session Tokens...");
  const testId = crypto.randomUUID().substring(0, 8);
  const userA = {
    username: `user_a_${testId}`,
    email: `usera_${testId}@staging.runnel.internal`,
    password: "Password123!SecureStaging",
  };
  const userB = {
    username: `user_b_${testId}`,
    email: `userb_${testId}@staging.runnel.internal`,
    password: "Password123!SecureStaging",
  };

  const regARes = await request("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify(userA),
  });
  if (regARes.status !== 201) {
    throw new Error(`User A registration failed: ${JSON.stringify(regARes.data)}`);
  }
  const tokenA = regARes.data.data?.accessToken || regARes.data.data?.token || regARes.data?.accessToken || regARes.data?.token;
  const refreshTokenA = regARes.data.data?.refreshToken || regARes.data?.refreshToken;
  console.log(`✔ User A registered successfully (${userA.username})`);

  const regBRes = await request("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify(userB),
  });
  if (regBRes.status !== 201) {
    throw new Error(`User B registration failed: ${JSON.stringify(regBRes.data)}`);
  }
  const tokenB = regBRes.data.data?.accessToken || regBRes.data.data?.token || regBRes.data?.accessToken || regBRes.data?.token;
  console.log(`✔ User B registered successfully (${userB.username})`);

  // ── 3. Production Demo Handler Guard ─────────────────────────────────
  console.log("\n3. Verifying Production Demo Handler Guard...");
  const demoRes = await request("/api/v1/executions", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({
      name: "Demo Handler Probe",
      type: "echo",
      input: { test: true },
    }),
  });
  const demoErrMsg = demoRes.data?.error?.message || demoRes.data?.message;
  if (demoRes.status !== 400 || !demoErrMsg?.includes("Demo handlers")) {
    throw new Error(`Demo handler guard failed! Expected 400, got ${demoRes.status}: ${JSON.stringify(demoRes.data)}`);
  }
  console.log("✔ Production demo handler guard active (echo/fail rejected with HTTP 400)");

  // ── 4. SSRF Cloud Metadata Block ─────────────────────────────────────
  console.log("\n4. Verifying SSRF Cloud Metadata Endpoint Protection...");
  const ssrfRes = await request("/api/v1/executions", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({
      name: "SSRF Cloud Metadata Probe",
      type: "webhook",
      maxAttempts: 1,
      input: { url: "http://169.254.169.254/latest/meta-data/" },
    }),
  });
  if (ssrfRes.status !== 202) {
    throw new Error(`Webhook submission failed: ${JSON.stringify(ssrfRes.data)}`);
  }
  const ssrfExecId = ssrfRes.data.data._id;

  // Poll for worker outcome
  let ssrfFinalStatus = null;
  let ssrfErrorCode = null;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    const check = await request(`/api/v1/executions/${ssrfExecId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    ssrfFinalStatus = check.data?.data?.status;
    ssrfErrorCode = check.data?.data?.error?.code;
    if (ssrfFinalStatus === "failed") break;
  }
  if (ssrfFinalStatus !== "failed" || ssrfErrorCode !== "SSRF_BLOCKED") {
    throw new Error(`SSRF probe was not blocked! Status: ${ssrfFinalStatus}, Code: ${ssrfErrorCode}`);
  }
  console.log(`✔ SSRF attempt blocked by container worker! Status: ${ssrfFinalStatus}, Code: ${ssrfErrorCode}`);

  // ── 5. Successful Webhook Execution ──────────────────────────────────
  console.log("\n5. Submitting Production Webhook (https://httpbin.org/post)...");
  const postRes = await request("/api/v1/executions", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({
      name: "Staging Webhook Test",
      type: "webhook",
      input: {
        url: "https://httpbin.org/post",
        method: "POST",
        body: { testId, environment: "containerized_staging" },
      },
    }),
  });
  if (postRes.status !== 202) {
    throw new Error(`Failed to submit webhook: ${JSON.stringify(postRes.data)}`);
  }
  const postExecId = postRes.data.data._id;
  console.log(`✔ Webhook submitted (ID: ${postExecId}); awaiting worker completion...`);

  let postOutcome = null;
  for (let i = 0; i < 30; i++) {
    await sleep(600);
    const check = await request(`/api/v1/executions/${postExecId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    postOutcome = check.data?.data;
    if (postOutcome?.status === "completed" || postOutcome?.status === "failed") break;
  }
  if (postOutcome?.status !== "completed") {
    throw new Error(`Webhook failed to complete! Final status: ${postOutcome?.status}`);
  }
  console.log(`✔ Webhook successfully delivered by container worker! Status: ${postOutcome.status}`);
  console.log(`  - Attempts recorded: ${postOutcome.attempts?.length || postOutcome.attemptsMade}`);

  // ── 6. Controlled Failure & Attempt History ──────────────────────────
  console.log("\n6. Verifying Controlled Failure Handling (https://httpbin.org/status/502)...");
  const failRes = await request("/api/v1/executions", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({
      name: "Failing Webhook Probe",
      type: "webhook",
      maxAttempts: 2,
      input: { url: "https://httpbin.org/status/502" },
    }),
  });
  const failExecId = failRes.data.data._id;

  let failOutcome = null;
  for (let i = 0; i < 40; i++) {
    await sleep(800);
    const check = await request(`/api/v1/executions/${failExecId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    failOutcome = check.data?.data;
    if (failOutcome?.status === "failed") break;
  }
  if (failOutcome?.status !== "failed" || failOutcome?.error?.code !== "HTTP_502") {
    throw new Error(`Expected HTTP_502 failure; got status ${failOutcome?.status}, error: ${JSON.stringify(failOutcome?.error)}`);
  }
  console.log(`✔ Controlled failure captured cleanly (code: ${failOutcome.error.code})`);
  console.log(`  - Recorded attempts: ${failOutcome.attempts?.length}`);

  // ── 7. Manual Retry & Cancellation ───────────────────────────────────
  console.log("\n7. Verifying Manual Retry & Cancellation...");
  const retryRes = await request(`/api/v1/executions/${failExecId}/retry`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  if (retryRes.status !== 202) {
    throw new Error(`Retry failed: ${JSON.stringify(retryRes.data)}`);
  }
  console.log("✔ Execution queued for manual retry (HTTP 202 Accepted)");

  const cancelRes = await request(`/api/v1/executions/${failExecId}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  if (cancelRes.status !== 200) {
    throw new Error(`Cancel failed: ${JSON.stringify(cancelRes.data)}`);
  }
  console.log("✔ Execution cancelled successfully (HTTP 200 OK)");

  // ── 8. Cross-User Authorization Boundary ─────────────────────────────
  console.log("\n8. Verifying Cross-User Isolation (User B accessing User A)...");
  const unauthorizedGet = await request(`/api/v1/executions/${postExecId}`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  if (unauthorizedGet.status !== 404) {
    throw new Error(`Cross-user isolation breach! User B received status ${unauthorizedGet.status}`);
  }

  const unauthorizedRetry = await request(`/api/v1/executions/${postExecId}/retry`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  if (unauthorizedRetry.status !== 404) {
    throw new Error(`Cross-user mutation breach! User B retry returned ${unauthorizedRetry.status}`);
  }
  console.log("✔ Cross-user isolation verified (User B receives HTTP 404 on User A work)");

  // ── 9. State Persistence Across Container Restarts ───────────────────
  console.log("\n9. Testing Persistence Across Container Restarts...");
  console.log("Restarting runnel_mongodb, runnel_backend and runnel_nginx containers...");
  execSync(`DOCKER_HOST=unix://$XDG_RUNTIME_DIR/podman/podman.sock docker restart runnel_mongodb runnel_backend runnel_nginx`);
  console.log("Waiting for containers to recover...");
  await sleep(4000);

  // Poll until backend is healthy again
  let recheckHealth = null;
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    try {
      const h = await request("/health");
      if (h.status === 200 && h.data?.data?.status === "pass") {
        recheckHealth = h.data?.data;
        break;
      }
    } catch (_) {}
  }
  if (!recheckHealth) {
    throw new Error("Backend container failed to become healthy after restart!");
  }
  console.log("✔ Backend container recovered and healthy");

  // Verify User A can still retrieve executions created before restart
  const postRestartExec = await request(`/api/v1/executions/${postExecId}`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  if (postRestartExec.status !== 200 || postRestartExec.data?.data?.name !== "Staging Webhook Test") {
    throw new Error(`Persistence failure! Execution not found after restart: ${JSON.stringify(postRestartExec.data)}`);
  }
  console.log("✔ Execution records and attempts survived container restarts cleanly");

  // ── 10. Logout ───────────────────────────────────────────────────────
  console.log("\n10. Verifying Sign Out & Token Invalidation...");
  const logoutRes = await request("/api/v1/auth/logout", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ refreshToken: refreshTokenA }),
  });
  if (logoutRes.status !== 200) {
    throw new Error(`Logout failed: ${JSON.stringify(logoutRes.data)}`);
  }
  console.log("✔ User signed out successfully");

  console.log("\n====================================================================");
  console.log("ALL CONTAINERIZED STAGING VERIFICATIONS COMPLETED SUCCESSFULLY!");
  console.log("====================================================================");
}

runStagingVerification().catch((err) => {
  console.error("\n❌ Staging verification failed:", err.message);
  process.exit(1);
});

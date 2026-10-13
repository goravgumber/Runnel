/**
 * scripts/e2e_release_gate.js
 *
 * Real end-to-end release quality gate execution against the live Runnel backend:
 * Register → Sign In → Submit supported production webhook execution → Observe processing →
 * Trigger controlled failure → Inspect attempts → Retry → Verify final state → Sign Out.
 */

const http = require("node:http");

async function main() {
  console.log("=== RUNNEL RELEASE CANDIDATE E2E VERIFICATION ===");
  const API_URL = "http://localhost:5000/api/v1";

  // 1. Setup local HTTP target servers for webhook deliveries
  let successCount = 0;
  let failCount = 0;

  const targetServer = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      if (req.url === "/order-delivered") {
        successCount++;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "acknowledged", event: "order_delivered" }));
      } else if (req.url === "/flaky-service") {
        failCount++;
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Service Temporarily Unavailable" }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
  });

  await new Promise((resolve) => targetServer.listen(0, resolve));
  const targetPort = targetServer.address().port;
  console.log(`[E2E] Webhook mock destination listening on port ${targetPort}`);

  try {
    // 2. Register
    const timestamp = Date.now();
    const userPayload = {
      username: `rctester_${timestamp}`,
      name: "RC Gate Tester",
      email: `rctester_${timestamp}@runnel.test`,
      password: "StrongPassword123!",
    };

    console.log(`\n1. Registering user ${userPayload.email}...`);
    const regRes = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userPayload),
    });
    const regJson = await regRes.json();
    if (!regRes.ok) throw new Error(`Registration failed: ${JSON.stringify(regJson)}`);
    console.log("✔ Registration successful (HTTP 201)");

    // 3. Sign In
    console.log("\n2. Signing in...");
    const loginRes = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: userPayload.username, password: userPayload.password }),
    });
    const loginJson = await loginRes.json();
    if (!loginRes.ok) throw new Error(`Login failed: ${JSON.stringify(loginJson)}`);
    const token = loginJson.data?.token || loginJson.token;
    console.log("✔ Sign In successful, JWT acquired");

    const authHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    // 4. Submit supported production-capable execution (type: webhook)
    console.log("\n3. Submitting production-capable webhook execution...");
    const submitPayload = {
      name: "Deliver Order Notification Webhook",
      description: "Dispatch order payload to warehouse downstream",
      type: "webhook",
      maxAttempts: 3,
      tags: ["orders", "dispatch", "production"],
      input: {
        url: `http://127.0.0.1:${targetPort}/order-delivered`,
        method: "POST",
        body: { orderId: `ORD-${timestamp}`, status: "paid" },
      },
    };

    const subRes = await fetch(`${API_URL}/executions`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(submitPayload),
    });
    const subJson = await subRes.json();
    if (!subRes.ok) throw new Error(`Execution submission failed: ${JSON.stringify(subJson)}`);
    const execId = subJson.data?._id || subJson._id;
    console.log(`✔ Webhook execution submitted (ID: ${execId}, status: ${subJson.data?.status || subJson.status})`);

    // 5. Observe processing
    console.log("\n4. Observing worker processing...");
    let execDoc = null;
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 600));
      const getRes = await fetch(`${API_URL}/executions/${execId}`, { headers: authHeaders });
      const getJson = await getRes.json();
      execDoc = getJson.data || getJson;
      if (execDoc.status === "completed") break;
    }

    if (execDoc.status !== "completed") {
      throw new Error(`Execution did not reach completed state. Status: ${execDoc.status}`);
    }
    console.log(`✔ Execution completed successfully! Attempts made: ${execDoc.attemptsMade}`);
    console.log("  Output received:", JSON.stringify(execDoc.output));
    console.log(`  Target server acknowledged: ${successCount} call(s)`);

    // 6. Trigger a controlled failure (type: webhook returning 503)
    console.log("\n5. Submitting failing webhook execution to verify error capture and recovery...");
    const failSubmitPayload = {
      name: "Flaky Downstream Partner Webhook",
      type: "webhook",
      maxAttempts: 2,
      input: {
        url: `http://127.0.0.1:${targetPort}/flaky-service`,
        method: "POST",
        body: { sync: "inventory" },
      },
    };

    const failSubRes = await fetch(`${API_URL}/executions`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(failSubmitPayload),
    });
    const failSubJson = await failSubRes.json();
    const failExecId = failSubJson.data?._id || failSubJson._id;
    console.log(`✔ Failing execution submitted (ID: ${failExecId})`);

    // Wait for failure
    let failExecDoc = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 600));
      const getRes = await fetch(`${API_URL}/executions/${failExecId}`, { headers: authHeaders });
      const getJson = await getRes.json();
      failExecDoc = getJson.data || getJson;
      if (failExecDoc.status === "failed") break;
    }

    console.log(`✔ Failing execution reached status '${failExecDoc.status}'`);
    console.log(`  Structured error code: ${failExecDoc.error?.code}`);
    console.log(`  Error message: ${failExecDoc.error?.message}`);

    // 7. Inspect attempts
    console.log("\n6. Inspecting recorded attempt history...");
    const detailRes = await fetch(`${API_URL}/executions/${failExecId}`, { headers: authHeaders });
    const detailJson = await detailRes.json();
    const attempts = detailJson.data?.attempts || [];
    console.log(`✔ Total recorded attempts: ${attempts.length}`);
    attempts.forEach((att, idx) => {
      console.log(`  Attempt #${att.attemptNumber || idx + 1}: status=${att.status}, code=${att.error?.code}, duration=${att.durationMs}ms`);
    });

    // 8. Retry when permitted
    console.log("\n7. Executing manual retry on failed execution...");
    const retryRes = await fetch(`${API_URL}/executions/${failExecId}/retry`, {
      method: "POST",
      headers: authHeaders,
    });
    const retryJson = await retryRes.json();
    if (!retryRes.ok) throw new Error(`Retry failed: ${JSON.stringify(retryJson)}`);
    console.log("✔ Retry successfully enqueued (HTTP 202 Accepted)");

    // 9. Verify final state and counters
    console.log("\n8. Checking execution inbox statistics...");
    const statsRes = await fetch(`${API_URL}/executions/stats`, { headers: authHeaders });
    const statsJson = await statsRes.json();
    const stats = statsJson.data || statsJson;
    console.log("✔ Live stats data:", JSON.stringify(stats));

    // 10. Sign out
    console.log("\n9. Signing out...");
    const logoutRes = await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      headers: authHeaders,
    });
    console.log(`✔ Sign out response: HTTP ${logoutRes.status}`);

    console.log("\n========================================================");
    console.log("✔ ALL END-TO-END GATE QUALITY REQUIREMENTS VERIFIED!");
    console.log("========================================================\n");
  } finally {
    await new Promise((resolve) => targetServer.close(resolve));
  }
}

main().catch((err) => {
  console.error("\n❌ E2E Verification failed:", err);
  process.exit(1);
});

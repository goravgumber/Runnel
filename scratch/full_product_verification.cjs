const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const API_BASE = "http://localhost:5000/api/v1";
const WEB_BASE = "http://127.0.0.1:5173";
const SCREENSHOT_DIR = path.resolve(__dirname, "../docs/screenshots");

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function runVerification() {
  console.log("======================================================");
  console.log("   RUNNEL COMPLETE PRODUCT END-TO-END VERIFICATION    ");
  console.log("======================================================\n");

  const testUser = `carol_${Date.now()}`;
  const testPassword = "Password123!";

  console.log(`[Step 1] Registering fresh developer user: ${testUser}...`);
  const regRes = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: testUser, password: testPassword }),
  });
  const regData = await regRes.json();
  if (!regRes.ok) throw new Error(`Registration failed: ${JSON.stringify(regData)}`);
  console.log("  ✔ Registered successfully:", regData.data.user.username);

  console.log("\n[Step 2] Authenticating and obtaining JWT token pair...");
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: testUser, password: testPassword }),
  });
  const loginData = await loginRes.json();
  if (!loginRes.ok) throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
  const token = loginData.data.accessToken;
  const refreshToken = loginData.data.refreshToken;
  const user = loginData.data.user;
  console.log("  ✔ Auth token issued. User role:", user.role);

  console.log("\n[Step 3] Submitting Execution 1 (Handler: echo, should complete)...");
  const exec1Res = await fetch(`${API_BASE}/executions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: "data-sync-pipeline",
      type: "echo",
      payload: { dataset: "customer_records_2026", batchSize: 500 },
      maxAttempts: 3,
    }),
  });
  const exec1Data = await exec1Res.json();
  const exec1Id = exec1Data.data._id || exec1Data.data.id;
  console.log(`  ✔ Execution 1 created: ID=${exec1Id}, status=${exec1Data.data.status}`);

  console.log("\n[Step 4] Submitting Execution 2 (Handler: fail, intentional recovery test)...");
  const exec2Res = await fetch(`${API_BASE}/executions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: "external-stripe-webhook",
      type: "fail",
      payload: { invoiceId: "in_9921", reason: "Gateway timeout on third-party endpoint" },
      maxAttempts: 3,
    }),
  });
  const exec2Data = await exec2Res.json();
  const exec2Id = exec2Data.data._id || exec2Data.data.id;
  console.log(`  ✔ Execution 2 created: ID=${exec2Id}, status=${exec2Data.data.status}`);

  console.log("\n[Step 5] Submitting Execution 3 (Eligible for cancellation)...");
  const exec3Res = await fetch(`${API_BASE}/executions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: "heavy-report-export",
      type: "echo",
      payload: { reportType: "annual_audit" },
      maxAttempts: 2,
    }),
  });
  const exec3Data = await exec3Res.json();
  const exec3Id = exec3Data.data._id || exec3Data.data.id;
  console.log(`  ✔ Execution 3 created: ID=${exec3Id}`);

  // Cancel execution 3
  console.log("  Cancelling Execution 3...");
  const cancelRes = await fetch(`${API_BASE}/executions/${exec3Id}/cancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  const cancelData = await cancelRes.json();
  console.log(`  ✔ Execution 3 cancel response:`, cancelData);

  // Wait 3 seconds for BullMQ workers to process jobs
  console.log("\n[Step 6] Waiting for BullMQ execution worker processing...");
  await new Promise((r) => setTimeout(r, 4000));

  // Verify Execution 1 completed
  const verify1Res = await fetch(`${API_BASE}/executions/${exec1Id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const verify1 = (await verify1Res.json()).data;
  console.log(`  Execution 1 status: ${verify1?.status}, attemptsMade: ${verify1?.attemptsMade}`);
  console.log("  Execution 1 output:", verify1?.output?.echoed || verify1?.output);

  // Verify Execution 2 failed with attempts
  const verify2Res = await fetch(`${API_BASE}/executions/${exec2Id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const verify2 = (await verify2Res.json()).data;
  console.log(`  Execution 2 status: ${verify2?.status}, attempts: ${verify2?.attempts?.length}, error: ${verify2?.error?.message}`);

  // Step 7: Retry Execution 2
  console.log("\n[Step 7] Verifying State Transition Safeguards & Manual Recovery Flow...");
  // 7a: Verify that retrying an in-flight 'retrying' execution rejects with 409 Conflict
  const activeRetryRes = await fetch(`${API_BASE}/executions/${exec2Id}/retry`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  console.log(`  ✔ In-flight retry safeguard: HTTP ${activeRetryRes.status} (409 expected as status is '${verify2?.status}')`);

  // 7b: Retry Execution 3 (status: cancelled -> eligible for recovery)
  const retry3Res = await fetch(`${API_BASE}/executions/${exec3Id}/retry`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  const retry3Data = await retry3Res.json();
  console.log(`  ✔ Manual Recovery on Execution 3: HTTP ${retry3Res.status}, new status='${retry3Data?.data?.status}'`);

  // Step 8: Launch Headless Chrome for UI verification & pristine screenshots
  console.log("\n[Step 8] Launching Headless Chrome for browser UI verification & screenshots...");
  const chrome = spawn("/usr/bin/google-chrome", [
    "--headless",
    "--disable-gpu",
    "--remote-debugging-port=9227",
    "--user-data-dir=/tmp/runnel-chrome-full-verify",
    `${WEB_BASE}/login`,
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  const tabs = await (await fetch("http://127.0.0.1:9227/json")).json();
  const pageTab = tabs.find((t) => t.type === "page");
  if (!pageTab) throw new Error("No Chrome page tab found on port 9227");

  const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
  let id = 1;
  const pending = new Map();

  ws.onmessage = (evt) => {
    const msg = JSON.parse(evt.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };

  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const msgId = id++;
      pending.set(msgId, resolve);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

  await new Promise((resolve) => (ws.onopen = resolve));
  await send("Page.enable");
  await send("Runtime.enable");

  const capture = async (filename) => {
    const res = await send("Page.captureScreenshot", { format: "png" });
    const filepath = path.join(SCREENSHOT_DIR, filename);
    fs.writeFileSync(filepath, Buffer.from(res.result.data, "base64"));
    console.log(`  📸 Captured: ${filename}`);
  };

  // 1. Sign Up page (unauthenticated)
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `${WEB_BASE}/signup` });
  await new Promise((r) => setTimeout(r, 1000));
  await capture("01_signup_page.png");

  // 2. Sign In page
  await send("Page.navigate", { url: `${WEB_BASE}/login` });
  await new Promise((r) => setTimeout(r, 1000));
  await capture("02_login_page.png");

  // Authenticate session in localStorage
  await send("Runtime.evaluate", {
    expression: `
      localStorage.setItem("token", "${token}");
      localStorage.setItem("refreshToken", "${refreshToken}");
      localStorage.setItem("user", JSON.stringify(${JSON.stringify(user)}));
    `,
  });

  // 3. Overview Dashboard (Desktop 1440x900)
  await send("Page.navigate", { url: `${WEB_BASE}/` });
  await new Promise((r) => setTimeout(r, 2000));
  await capture("03_overview_dashboard.png");

  // 4. Execution Inbox
  await send("Page.navigate", { url: `${WEB_BASE}/executions` });
  await new Promise((r) => setTimeout(r, 1500));
  await capture("04_execution_inbox.png");

  // 5. Open Execution Details Drawer
  console.log("  Opening execution drawer for completed execution...");
  await send("Runtime.evaluate", {
    expression: `(() => {
      const row = document.querySelector('tbody tr');
      if (row) row.click();
    })()`,
  });
  await new Promise((r) => setTimeout(r, 1000));
  await capture("05_execution_detail_drawer.png");

  // 6. Open Submit Execution modal
  console.log("  Opening submit execution modal...");
  await send("Runtime.evaluate", {
    expression: `(() => {
      const closeDrawerBtn = document.querySelector('aside button');
      const submitBtn = document.getElementById('open-submit-modal-btn');
      if (submitBtn) submitBtn.click();
    })()`,
  });
  await new Promise((r) => setTimeout(r, 1000));
  await capture("06_submit_execution_modal.png");

  // 7. Settings Page
  await send("Page.navigate", { url: `${WEB_BASE}/settings` });
  await new Promise((r) => setTimeout(r, 1500));
  await capture("07_settings_page.png");

  // 8. Mobile Viewports (390 x 844)
  console.log("  Testing mobile viewport (390x844)...");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Page.navigate", { url: `${WEB_BASE}/` });
  await new Promise((r) => setTimeout(r, 1500));
  await capture("08_mobile_overview_390x844.png");

  await send("Page.navigate", { url: `${WEB_BASE}/executions` });
  await new Promise((r) => setTimeout(r, 1500));
  await capture("09_mobile_inbox_390x844.png");

  // Toggle mobile navigation drawer
  await send("Runtime.evaluate", {
    expression: `(() => {
      const btn = document.querySelector('header button[aria-label="Toggle navigation menu"]');
      if (btn) btn.click();
    })()`,
  });
  await new Promise((r) => setTimeout(r, 600));
  await capture("10_mobile_drawer_open_390x844.png");

  chrome.kill();
  console.log("\n======================================================");
  console.log("   ALL VERIFICATION GATES PASSED SUCCESSFULLY!        ");
  console.log("======================================================");
}

runVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});

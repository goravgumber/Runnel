const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const API_BASE = "http://localhost:5000/api/v1";
const WEB_BASE = "http://127.0.0.1:5173";
const OUTPUT_DIR = path.resolve(__dirname, "../assets/screenshots");
const CHROME_PORT = 9335;

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log("=== RUNNEL PRODUCT SCREENSHOT SHOWCASE CAPTURE ===");
  console.log("Target directory:", OUTPUT_DIR);

  // 1. Seed or authenticate synthetic developer user
  const username = "developer_alex";
  const password = "Password123!";

  console.log("\n[1/7] Preparing synthetic developer account...");
  await fetch(`${API_BASE}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  }).catch(() => {});

  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const loginData = await loginRes.json();
  const token = loginData.data?.accessToken;
  const refreshToken = loginData.data?.refreshToken;
  const user = loginData.data?.user;

  if (!token) throw new Error("Authentication failed: " + JSON.stringify(loginData));
  console.log("✔ Authenticated as:", user.username);

  // 2. Submit realistic executions to populate inbox and dashboard
  console.log("\n[2/7] Submitting synthetic asynchronous workloads...");
  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const tasks = [
    {
      name: "Stripe Webhook Sync (EU-West)",
      type: "echo",
      input: { customerId: "cus_99182", invoiceId: "in_77102", amount: 14900, currency: "USD" },
      maxAttempts: 3,
      tags: ["billing", "stripe", "webhooks"],
    },
    {
      name: "Payment Gateway Fallback (Adyen v3)",
      type: "fail",
      input: { orderId: "ord_5521", provider: "adyen_v3", reason: "GATEWAY_TIMEOUT" },
      maxAttempts: 2,
      tags: ["payments", "critical", "gateway"],
    },
    {
      name: "Customer Lifecycle Event Dispatcher",
      type: "echo",
      input: { userId: "usr_40491", event: "subscription.renewed", plan: "pro_annual" },
      maxAttempts: 3,
      tags: ["lifecycle", "events", "analytics"],
    },
    {
      name: "Inventory Reconciliation Stream",
      type: "echo",
      input: { warehouseId: "wh_frankfurt_01", skuCount: 1420, batchId: "batch_992" },
      maxAttempts: 3,
      tags: ["inventory", "sync", "warehouse"],
    },
  ];

  for (const t of tasks) {
    await fetch(`${API_BASE}/executions`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(t),
    });
  }

  // Wait 2.5 seconds for worker processing
  await wait(2500);

  // 3. Launch headless Chrome with CDP
  console.log("\n[3/7] Launching Headless Chrome via CDP on port", CHROME_PORT);
  const chrome = spawn("/usr/bin/google-chrome", [
    "--headless=new",
    "--disable-gpu",
    `--remote-debugging-port=${CHROME_PORT}`,
    "--user-data-dir=/tmp/runnel-chrome-showcase-" + Date.now(),
    "about:blank",
  ]);

  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await wait(300);
    try {
      const res = await fetch(`http://127.0.0.1:${CHROME_PORT}/json/version`);
      if (res.ok) {
        const data = await res.json();
        wsUrl = data.webSocketDebuggerUrl;
        break;
      }
    } catch (_) {}
  }

  if (!wsUrl) {
    chrome.kill();
    throw new Error("Failed to connect to Chrome debugging endpoint");
  }

  const targetRes = await fetch(`http://127.0.0.1:${CHROME_PORT}/json/new?${WEB_BASE}/login`, {
    method: "PUT",
  });
  const target = await targetRes.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);

  let idCounter = 1;
  const pendingRequests = new Map();

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = idCounter++;
      pendingRequests.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await new Promise((resolve) => { ws.onopen = resolve; });

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pendingRequests.has(data.id)) {
      const { resolve, reject } = pendingRequests.get(data.id);
      pendingRequests.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    }
  };

  await send("Page.enable");
  await send("Runtime.enable");

  async function evaluate(expression) {
    const res = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result?.value;
  }

  async function capture(filename) {
    const res = await send("Page.captureScreenshot", { format: "png" });
    const buffer = Buffer.from(res.data, "base64");
    const filePath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(filePath, buffer);
    console.log(`  ✔ Captured: ${filename} (${(buffer.length / 1024).toFixed(1)} KB)`);
  }

  async function setViewport(width, height, isMobile = false) {
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: isMobile ? 2 : 1,
      mobile: isMobile,
    });
  }

  // 4. Capture Desktop Auth Screens (Unauthenticated)
  console.log("\n[4/7] Capturing Desktop Auth Screens...");
  await setViewport(1440, 900, false);

  // Clear any existing localStorage
  await send("Page.navigate", { url: `${WEB_BASE}/login` });
  await wait(1200);
  await evaluate("localStorage.clear()");
  await send("Page.navigate", { url: `${WEB_BASE}/login` });
  await wait(1500);
  await capture("login-desktop.png");

  await send("Page.navigate", { url: `${WEB_BASE}/signup` });
  await wait(1500);
  await capture("signup-desktop.png");

  // 5. Capture Mobile Auth Screen
  console.log("\n[5/7] Capturing Mobile Auth Screen...");
  await setViewport(390, 844, true);
  await send("Page.navigate", { url: `${WEB_BASE}/login` });
  await wait(1500);
  await capture("login-mobile.png");

  // 6. Inject Authenticated Session & Capture Core Product Screens
  console.log("\n[6/7] Injecting Authenticated Developer Session...");
  await evaluate(`
    localStorage.setItem("token", "${token}");
    localStorage.setItem("refreshToken", "${refreshToken}");
    localStorage.setItem("user", JSON.stringify(${JSON.stringify(user)}));
  `);

  // Return to Desktop Viewport
  await setViewport(1440, 900, false);

  // Main Dashboard
  console.log("Navigating to Overview Dashboard...");
  await send("Page.navigate", { url: `${WEB_BASE}/` });
  await wait(2000);
  await capture("dashboard-desktop.png");

  // Execution Inbox
  console.log("Navigating to Execution Inbox...");
  await send("Page.navigate", { url: `${WEB_BASE}/executions` });
  await wait(2200);
  await capture("execution-inbox-desktop.png");

  // Open Detail Drawer on failed execution (Payment Gateway Fallback)
  console.log("Opening Execution Detail Drawer...");
  await evaluate(`
    const rows = document.querySelectorAll("tbody tr");
    for (const r of rows) {
      if (r.innerText.includes("Payment Gateway Fallback")) {
        r.click();
        break;
      }
    }
  `);
  await wait(1500);
  await capture("execution-details-attempts.png");

  // Open Recovery / Retry Modal
  console.log("Triggering Retry Confirmation State...");
  await evaluate(`
    const retryBtn = document.getElementById("detail-retry-btn");
    if (retryBtn) retryBtn.click();
  `);
  await wait(1200);
  await capture("execution-recovery-state.png");

  // Close modal by clicking dismiss
  await evaluate(`
    const dismissBtn = Array.from(document.querySelectorAll("button")).find(b => b.innerText.includes("Dismiss"));
    if (dismissBtn) dismissBtn.click();
  `);
  await wait(800);

  // Settings Page
  console.log("Navigating to Settings Page...");
  await send("Page.navigate", { url: `${WEB_BASE}/settings` });
  await wait(1800);
  await capture("settings-desktop.png");

  // 7. Capture Mobile Execution Inbox
  console.log("\n[7/7] Capturing Mobile Execution Inbox...");
  await setViewport(390, 844, true);
  await send("Page.navigate", { url: `${WEB_BASE}/executions` });
  await wait(2000);
  await capture("execution-inbox-mobile.png");

  // Teardown
  ws.close();
  chrome.kill();
  console.log("\n=======================================================");
  console.log("  ALL AUTHENTIC PRODUCT SCREENSHOTS CAPTURED CLEANLY!  ");
  console.log("=======================================================\n");
}

run().catch((err) => {
  console.error("Capture failed:", err);
  process.exit(1);
});

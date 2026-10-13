const fs = require("fs");
const path = require("path");

async function run() {
  const base = "http://localhost:5000/api/v1";
  
  // 1. Get or create auth token
  const username = "alice_dev";
  const password = "Password123!";
  
  // Try signup first (ignore if already exists)
  await fetch(`${base}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  }).catch(() => {});
  
  // Login
  const loginRes = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const loginData = await loginRes.json();
  const token = loginData.data?.accessToken;
  const refreshToken = loginData.data?.refreshToken;
  const user = loginData.data?.user;
  
  if (!token) {
    throw new Error("Failed to authenticate: " + JSON.stringify(loginData));
  }
  console.log("Authenticated as:", user.username, "Token acquired");

  // Ensure there are at least 2 executions (1 completed, 1 failed) for genuine screenshots
  const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  
  // Submit an echo execution
  await fetch(`${base}/executions`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      name: "Stripe Webhook Sync (EU-West)",
      type: "echo",
      input: { customerId: "cus_88910", amount: 12500, currency: "EUR" },
      tags: ["billing", "stripe", "webhook"],
    })
  });
  
  // Submit a fail execution (needs recovery)
  await fetch(`${base}/executions`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      name: "Payment Gateway Fallback",
      type: "fail",
      maxAttempts: 1,
      input: { provider: "adyen_v3", reason: "GATEWAY_TIMEOUT" },
      tags: ["payments", "critical", "gateway"],
    })
  });

  // Wait 1.5s for worker processing
  await new Promise((r) => setTimeout(r, 1500));

  // 2. Discover Chrome page
  const tabs = await (await fetch("http://127.0.0.1:9222/json")).json();
  const pageTab = tabs.find((t) => t.type === "page");
  if (!pageTab) throw new Error("No page tab found in Chrome!");
  console.log("Connecting to Chrome page:", pageTab.id, pageTab.url);

  // 3. Connect via CDP WebSocket
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

  await new Promise((resolve) => ws.onopen = resolve);
  console.log("WebSocket connected to Chrome DevTools Protocol");

  await send("Page.enable");
  await send("DOM.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  // 4. Inject Auth into localStorage
  console.log("Injecting authentication into localStorage...");
  await send("Page.navigate", { url: "http://127.0.0.1:5173/login" });
  await new Promise((r) => setTimeout(r, 1000));

  const injectCode = `
    localStorage.setItem("token", ${JSON.stringify(token)});
    localStorage.setItem("refreshToken", ${JSON.stringify(refreshToken)});
    localStorage.setItem("user", ${JSON.stringify(JSON.stringify(user))});
    true;
  `;
  await send("Runtime.evaluate", { expression: injectCode });

  const capture = async (name) => {
    const res = await send("Page.captureScreenshot", { format: "png" });
    const buffer = Buffer.from(res.result.data, "base64");
    const outPath = path.join(__dirname, "../../assets/screenshots", name);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, buffer);
    console.log(`Saved screenshot: ${name} (${buffer.length} bytes)`);
  };

  // 5. Overview Dashboard
  console.log("Navigating to Overview Dashboard...");
  await send("Page.navigate", { url: "http://127.0.0.1:5173/" });
  await new Promise((r) => setTimeout(r, 2000));
  await capture("overview_dashboard.png");

  // 6. Execution Inbox
  console.log("Navigating to Execution Inbox...");
  await send("Page.navigate", { url: "http://127.0.0.1:5173/executions" });
  await new Promise((r) => setTimeout(r, 2000));
  await capture("execution_inbox.png");

  // 7. Click first row to show Detail Recovery Drawer
  console.log("Opening Execution Detail Drawer...");
  await send("Runtime.evaluate", {
    expression: `
      const row = document.querySelector("tbody tr");
      if (row) row.click();
      Boolean(row);
    `
  });
  await new Promise((r) => setTimeout(r, 1200));
  await capture("execution_detail_drawer.png");

  // 8. Settings Page
  console.log("Navigating to Settings...");
  await send("Page.navigate", { url: "http://127.0.0.1:5173/settings" });
  await new Promise((r) => setTimeout(r, 1500));
  await capture("settings_page.png");

  // 9. Test Legacy Route Redirection
  console.log("Testing /simulation-dashboard redirection...");
  await send("Page.navigate", { url: "http://127.0.0.1:5173/simulation-dashboard" });
  await new Promise((r) => setTimeout(r, 1500));
  const currentUrl = await send("Runtime.evaluate", { expression: "window.location.pathname" });
  console.log("Redirection result for /simulation-dashboard -> pathname is:", currentUrl.result?.value);
  await capture("simulation_dashboard_redirect_result.png");

  ws.close();
  console.log("\n>>> ALL GENUINE PRODUCT SCREENSHOTS CAPTURED SUCCESSFULLY! <<<");
}

run().catch((err) => {
  console.error("Capture failed:", err);
  process.exit(1);
});

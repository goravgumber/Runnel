const fs = require("fs");
const path = require("path");

async function captureViewports() {
  const base = "http://localhost:5000/api/v1";
  
  // Login to get token
  const loginRes = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "alice_dev", password: "Password123!" })
  });
  const loginData = await loginRes.json();
  const token = loginData.data?.accessToken;
  const refreshToken = loginData.data?.refreshToken;
  const user = loginData.data?.user;

  // Launch headless Chrome on port 9223 for viewports
  const { spawn } = require("child_process");
  const chrome = spawn("/usr/bin/google-chrome", [
    "--headless",
    "--disable-gpu",
    "--remote-debugging-port=9223",
    "--user-data-dir=/tmp/runnel-chrome-viewports",
    "http://127.0.0.1:5173/login"
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  const tabs = await (await fetch("http://127.0.0.1:9223/json")).json();
  const pageTab = tabs.find((t) => t.type === "page");
  if (!pageTab) throw new Error("No page found on port 9223");

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
  await send("Page.enable");
  await send("Runtime.enable");

  // Inject token
  await send("Page.navigate", { url: "http://127.0.0.1:5173/login" });
  await new Promise((r) => setTimeout(r, 800));
  await send("Runtime.evaluate", {
    expression: `
      localStorage.setItem("token", ${JSON.stringify(token)});
      localStorage.setItem("refreshToken", ${JSON.stringify(refreshToken)});
      localStorage.setItem("user", ${JSON.stringify(JSON.stringify(user))});
      true;
    `
  });

  const capture = async (name) => {
    const res = await send("Page.captureScreenshot", { format: "png" });
    const buffer = Buffer.from(res.result.data, "base64");
    const outPath = path.join(__dirname, "../../assets/screenshots", name);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, buffer);
    console.log(`Saved screenshot: ${name} (${buffer.length} bytes)`);
  };

  // 1. Laptop Viewport: 1366x768
  console.log("Testing 1366x768 viewport...");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1366,
    height: 768,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: "http://127.0.0.1:5173/" });
  await new Promise((r) => setTimeout(r, 1500));
  await capture("overview_dashboard_1366x768.png");

  // 2. Mobile Viewport: 390x844 (iPhone 14 standard)
  console.log("Testing 390x844 mobile viewport...");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await send("Page.navigate", { url: "http://127.0.0.1:5173/" });
  await new Promise((r) => setTimeout(r, 1500));
  await capture("overview_dashboard_mobile_390px.png");

  // Mobile Inbox View
  await send("Page.navigate", { url: "http://127.0.0.1:5173/executions" });
  await new Promise((r) => setTimeout(r, 1500));
  await capture("execution_inbox_mobile_390px.png");

  ws.close();
  chrome.kill();
  console.log("Responsive viewports verification complete!");
}

captureViewports().catch((err) => {
  console.error("Viewport capture error:", err);
  process.exit(1);
});

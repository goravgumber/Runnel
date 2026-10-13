const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

async function run() {
  console.log("=== Verifying Layout & Scrolling UX ===");

  // 1. Authenticate to get valid session
  const loginRes = await fetch("http://localhost:5000/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "alice_dev", password: "Password123!" }),
  });
  const loginData = await loginRes.json();
  const token = loginData.data?.accessToken;
  const refreshToken = loginData.data?.refreshToken;
  const user = loginData.data?.user;

  console.log("Authenticated as:", user?.username);

  // 2. Launch headless Chrome on debug port 9224
  const chrome = spawn("/usr/bin/google-chrome", [
    "--headless",
    "--disable-gpu",
    "--remote-debugging-port=9224",
    "--user-data-dir=/tmp/runnel-chrome-scroll-test",
    "http://127.0.0.1:5173/login",
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  const tabs = await (await fetch("http://127.0.0.1:9224/json")).json();
  const pageTab = tabs.find((t) => t.type === "page");
  if (!pageTab) throw new Error("No page tab found on port 9224");

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

  // Inject session into localStorage
  await send("Page.navigate", { url: "http://127.0.0.1:5173/login" });
  await new Promise((r) => setTimeout(r, 800));
  await send("Runtime.evaluate", {
    expression: `
      localStorage.setItem("token", "${token}");
      localStorage.setItem("refreshToken", "${refreshToken}");
      localStorage.setItem("user", JSON.stringify(${JSON.stringify(user)}));
    `,
  });

  const screenshotDir = path.resolve(__dirname, "../docs/screenshots");
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  const capture = async (filename) => {
    const res = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(screenshotDir, filename), Buffer.from(res.result.data, "base64"));
    console.log(`Saved screenshot: ${filename}`);
  };

  const parseResult = (res) => {
    const val = res?.result?.result?.value || res?.result?.value;
    try {
      return typeof val === "string" ? JSON.parse(val) : val || {};
    } catch (e) {
      return {};
    }
  };

  // --- Test 1: 1366 x 768 ---
  console.log("\n--- Testing 1366x768 Desktop Viewport ---");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1366,
    height: 768,
    deviceScaleFactor: 1,
    mobile: false,
  });

  await send("Page.navigate", { url: "http://127.0.0.1:5173/executions" });
  await new Promise((r) => setTimeout(r, 2000));

  // Verify initial positions
  let diag1 = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const aside = document.querySelector('aside');
      const main = document.querySelector('main');
      const asideRect = aside ? aside.getBoundingClientRect() : null;
      const mainRect = main ? main.getBoundingClientRect() : null;
      return JSON.stringify({
        windowScrollY: window.scrollY,
        windowScrollX: window.scrollX,
        mainScrollTop: main ? main.scrollTop : null,
        mainScrollHeight: main ? main.scrollHeight : null,
        mainClientHeight: main ? main.clientHeight : null,
        asideRect: asideRect ? { top: asideRect.top, left: asideRect.left, width: asideRect.width, height: asideRect.height } : null
      });
    })()`,
  });
  console.log("Initial state (1366x768):", parseResult(diag1));

  // Perform scroll on <main>
  await send("Runtime.evaluate", {
    expression: `(() => {
      const main = document.querySelector('main');
      if (main) main.scrollTop = 300;
      window.scrollBy(0, 300); // Attempt to scroll window
    })()`,
  });
  await new Promise((r) => setTimeout(r, 400));

  let diag1Scrolled = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const aside = document.querySelector('aside');
      const main = document.querySelector('main');
      const asideRect = aside ? aside.getBoundingClientRect() : null;
      return JSON.stringify({
        windowScrollY: window.scrollY,
        mainScrollTop: main ? main.scrollTop : null,
        asideRect: asideRect ? { top: asideRect.top, left: asideRect.left, height: asideRect.height } : null
      });
    })()`,
  });
  const r1 = parseResult(diag1Scrolled);
  console.log("After scroll on main (1366x768):", r1);

  if (r1.windowScrollY === 0 && r1.asideRect && r1.asideRect.top === 0) {
    console.log("✅ SUCCESS: Window scroll remains 0, Sidebar remains firmly anchored at top: 0, height:", r1.asideRect.height);
  } else {
    console.error("❌ FAILED: Sidebar or window moved! windowScrollY:", r1.windowScrollY, "asideRect:", r1.asideRect);
  }
  await capture("desktop_1366x768_independent_scroll.png");

  // --- Test 2: 1440 x 900 ---
  console.log("\n--- Testing 1440x900 Desktop Viewport ---");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await new Promise((r) => setTimeout(r, 500));
  await capture("desktop_1440x900_overview.png");

  // --- Test 3: 390 x 844 (Mobile) ---
  console.log("\n--- Testing 390x844 Mobile Viewport ---");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await send("Page.navigate", { url: "http://127.0.0.1:5173/executions" });
  await new Promise((r) => setTimeout(r, 1200));

  // Check mobile initial
  let diagMobile = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const aside = document.querySelector('aside');
      const header = document.querySelector('header');
      return JSON.stringify({
        windowScrollY: window.scrollY,
        headerVisible: !!header,
        asideTransform: aside ? window.getComputedStyle(aside).transform : null
      });
    })()`,
  });
  console.log("Mobile initial state:", parseResult(diagMobile));
  await capture("mobile_390x844_inbox.png");

  // Click hamburger to open mobile menu
  console.log("Toggling mobile menu drawer...");
  await send("Runtime.evaluate", {
    expression: `(() => {
      const btn = document.querySelector('header button[aria-label="Toggle navigation menu"]');
      if (btn) btn.click();
    })()`,
  });
  await new Promise((r) => setTimeout(r, 600));

  let diagMobileMenu = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const aside = document.querySelector('aside');
      return JSON.stringify({
        asideTransform: aside ? window.getComputedStyle(aside).transform : null
      });
    })()`,
  });
  console.log("Mobile drawer open state:", parseResult(diagMobileMenu));
  await capture("mobile_390x844_drawer_open.png");

  // Close drawer
  await send("Runtime.evaluate", {
    expression: `(() => {
      const btn = document.querySelector('header button[aria-label="Toggle navigation menu"]');
      if (btn) btn.click();
    })()`,
  });
  await new Promise((r) => setTimeout(r, 300));

  // Clean up
  chrome.kill();
  console.log("\n=== Scrolling & Layout UX Verification Complete ===");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

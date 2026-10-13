const http = require("http");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const CHROME_PORT = 9333;
const SCREENSHOT_PATH = "/home/goravgumber/.gemini/antigravity-ide/brain/9fea72fc-c584-405e-9056-9729ac0d92a0/execution_inbox_verified.png";

async function main() {
  console.log("Starting Chrome in headless mode with remote debugging...");
  const chromeProcess = spawn("google-chrome", [
    "--headless=new",
    `--remote-debugging-port=${CHROME_PORT}`,
    "--user-data-dir=/tmp/chrome-runnel-e2e-" + Date.now(),
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ]);

  chromeProcess.stderr.on("data", () => {});
  chromeProcess.stdout.on("data", () => {});

  // Wait for Chrome to open debugging port
  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 300));
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
    chromeProcess.kill();
    throw new Error("Failed to connect to Chrome debugging endpoint");
  }

  console.log("Chrome debugging active:", wsUrl);

  // Create a new target page
  const targetRes = await fetch(`http://127.0.0.1:${CHROME_PORT}/json/new?http://localhost:5173/signup`, {
    method: "PUT",
  });
  const target = await targetRes.json();
  const pageWsUrl = target.webSocketDebuggerUrl;

  const ws = new WebSocket(pageWsUrl);

  let idCounter = 1;
  const pendingRequests = new Map();

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = idCounter++;
      pendingRequests.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await new Promise((resolve) => {
    ws.onopen = resolve;
  });

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

  async function wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  console.log("Navigating to http://localhost:5173/signup...");
  await send("Page.navigate", { url: "http://localhost:5173/signup" });
  await wait(1500);

  // 1. Verify branding
  const brandingText = await evaluate(`document.querySelector("h1")?.innerText`);
  console.log("Header text:", brandingText);
  if (brandingText !== "Runnel") throw new Error(`Expected branding 'Runnel', got '${brandingText}'`);

  const subtitleText = await evaluate(`document.querySelector("p")?.innerText`);
  console.log("Subtitle text:", subtitleText);

  // 2. Verify submit button exists and is visible
  const btnText = await evaluate(`document.getElementById("signup-submit-btn")?.innerText`);
  console.log("Submit button text:", btnText);
  if (!btnText?.includes("Create account")) throw new Error("Create account button not found");

  // 3. Test validation error with empty inputs
  console.log("Testing validation on empty submit...");
  await evaluate(`document.getElementById("signup-submit-btn").click()`);
  await wait(500);
  const alertText = await evaluate(`document.querySelector("[role='alert'], .text-danger, .border-danger")?.innerText`);
  console.log("Validation alert text on empty submit:", alertText);
  if (!alertText?.includes("Please fill in all fields")) {
    throw new Error(`Expected validation alert, got '${alertText}'`);
  }

  // 4. Fill in valid credentials
  const username = `e2e_user_${Date.now()}`;
  const password = "ValidPassword123!";
  console.log(`Filling credentials for: ${username}...`);

  await evaluate(`
    (() => {
      const u = document.getElementById("username");
      const p = document.getElementById("password");
      const cp = document.getElementById("confirmPassword");
      
      const setVal = (input, val) => {
        const proto = Object.getPrototypeOf(input);
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        desc.set.call(input, val);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };

      setVal(u, "${username}");
      setVal(p, "${password}");
      setVal(cp, "${password}");
    })()
  `);
  await wait(400);

  // 5. Submit valid signup
  console.log("Submitting registration...");
  await evaluate(`document.getElementById("signup-submit-btn").click()`);
  await wait(2000);

  // 6. Verify redirect to /login and success message
  const currentUrl = await evaluate(`window.location.pathname`);
  console.log("Current path after signup:", currentUrl);
  if (currentUrl !== "/login") throw new Error(`Expected redirect to /login, got ${currentUrl}`);

  const loginSuccessMsg = await evaluate(`document.body.innerText`);
  if (!loginSuccessMsg.includes("Account created successfully")) {
    throw new Error(`Expected success message on login screen, got text`);
  }
  console.log("Verified success alert on login screen!");

  // 7. Fill login credentials
  console.log("Filling login credentials...");
  await evaluate(`
    (() => {
      const u = document.getElementById("username");
      const p = document.getElementById("password");
      
      const setVal = (input, val) => {
        const proto = Object.getPrototypeOf(input);
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        desc.set.call(input, val);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };

      setVal(u, "${username}");
      setVal(p, "${password}");
    })()
  `);
  await wait(300);

  // 8. Submit login
  console.log("Submitting login...");
  await evaluate(`document.getElementById("login-submit-btn").click()`);
  await wait(2000);

  const postLoginUrl = await evaluate(`window.location.pathname`);
  console.log("Path after login:", postLoginUrl);

  const storedToken = await evaluate(`localStorage.getItem("token")`);
  const storedUser = await evaluate(`localStorage.getItem("user")`);
  console.log("Stored user:", storedUser);
  if (!storedToken) throw new Error("Expected token in localStorage after login");

  // 9. Test page reload session persistence
  console.log("Reloading page to verify session persistence...");
  await send("Page.reload");
  await wait(2000);

  const pathAfterReload = await evaluate(`window.location.pathname`);
  const userAfterReload = await evaluate(`localStorage.getItem("user")`);
  console.log("Path after reload:", pathAfterReload);
  console.log("User after reload:", userAfterReload);
  if (pathAfterReload === "/login") throw new Error("Session lost on reload: kicked back to /login");

  // 10. Navigate to protected Execution Inbox (/executions)
  console.log("Navigating to /executions...");
  await send("Page.navigate", { url: "http://localhost:5173/executions" });
  await wait(2000);

  const execPath = await evaluate(`window.location.pathname`);
  console.log("Path on executions page:", execPath);
  if (execPath !== "/executions") throw new Error(`Expected /executions, got ${execPath}`);

  // 11. Check that Execution Inbox rendered properly with filters
  const inboxText = await evaluate(`document.body.innerText`);
  const hasPending = inboxText.includes("Pending");
  const hasRunning = inboxText.includes("Running");
  const hasCompleted = inboxText.includes("Completed");
  const hasFailed = inboxText.includes("Failed");
  console.log("Inbox filters check:", { hasPending, hasRunning, hasCompleted, hasFailed });

  if (!hasPending || !hasRunning || !hasCompleted || !hasFailed) {
    throw new Error("Execution Inbox status filters not properly rendered");
  }

  // 12. Capture screenshot of Execution Inbox
  console.log("Capturing screenshot of Execution Inbox...");
  const screenshotData = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(screenshotData.data, "base64"));
  console.log("Execution inbox screenshot saved to:", SCREENSHOT_PATH);

  // Cleanup
  ws.close();
  chromeProcess.kill();
  console.log("ALL BROWSER E2E TESTS PASSED SUCCESSFULLY!");
}

main().catch((err) => {
  console.error("Browser E2E Error:", err);
  process.exit(1);
});

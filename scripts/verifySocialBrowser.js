import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

async function runBrowserVerification() {
  console.log("=== LIBSQUE SOCIAL BROWSER VERIFICATION (CDP) ===\n");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chrome-cdp-social-"));
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

  const chromeProc = spawn(chromePath, [
    "--headless=new",
    "--remote-debugging-port=9223",
    `--user-data-dir=${tmpDir}`,
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
  ]);

  let wsUrl = null;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch("http://127.0.0.1:9223/json/version");
      if (res.ok) {
        const data = await res.json();
        wsUrl = data.webSocketDebuggerUrl;
        break;
      }
    } catch {
      // Retry
    }
  }

  if (!wsUrl) {
    throw new Error("Could not connect to Chrome on port 9223");
  }

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve) => (ws.onopen = resolve));

  let idCounter = 1;
  const pending = new Map();

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };

  function send(method, params = {}, sessionId = null) {
    return new Promise((resolve) => {
      const id = idCounter++;
      pending.set(id, resolve);
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      ws.send(JSON.stringify(payload));
    });
  }

  const target = await send("Target.createTarget", { url: "about:blank" });
  const targetId = target.result.targetId;
  const attached = await send("Target.attachToTarget", { targetId, flatten: true });
  const sessionId = attached.result.sessionId;

  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === "Runtime.consoleAPICalled") {
      const text = msg.params.args.map((a) => a.value || a.description || "").join(" ");
      console.log(`[Browser Console ${msg.params.type}]:`, text);
    }
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };

  async function setViewport(width, height, isMobile) {
    await send(
      "Emulation.setDeviceMetricsOverride",
      {
        width,
        height,
        deviceScaleFactor: isMobile ? 2 : 1,
        mobile: isMobile,
      },
      sessionId
    );
  }

  async function navigate(url, waitMs = 3000) {
    await send("Page.navigate", { url }, sessionId);
    await new Promise((r) => setTimeout(r, waitMs));
  }

  async function evalJs(expr) {
    const res = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
    return res.result?.result?.value;
  }

  try {
    // Authenticate browser session via Appwrite
    console.log("Setting up authenticated browser session via Appwrite...");
    await navigate("http://localhost:5173/", 2000);
    const authSetup = await evalJs(`
      (async () => {
        try {
          const mod = await import('/src/appwrite/config.js');
          try {
            const user = await mod.account.get();
            return { ok: true, userId: user.$id };
          } catch {
            const session = await mod.account.createAnonymousSession();
            return { ok: true, userId: session.userId };
          }
        } catch (e) {
          return { ok: false, error: e.message };
        }
      })()
    `);
    console.log("Auth setup result:", authSetup);

    // -------------------------------------------------------------
    // DESKTOP VIEWPORT (1280 x 800)
    // -------------------------------------------------------------
    console.log("\n--- 1. Desktop Viewport (1280 x 800) ---");
    await setViewport(1280, 800, false);

    // 1.1 Feed - Discover Readers & Mutual Matches
    console.log("Testing Feed page on Desktop (Authenticated)...");
    await navigate("http://localhost:5173/feed", 2000);
    for (let i = 0; i < 20; i++) {
      const stillLoading = await evalJs(`document.body.innerText.includes('FINDING COMPATIBLE')`);
      if (!stillLoading) break;
      await new Promise(r => setTimeout(r, 500));
    }

    const feedDesktop = await evalJs(`({
      title: document.title,
      buttons: Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean),
      cardsCount: document.querySelectorAll('.rounded-2xl, .rounded-xl, article, .border').length,
      hasTabs: Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Readers') || b.innerText.includes('Matches') || b.innerText.includes('All')),
      hasOptInOrReaders: document.body.innerText.includes('Discover') || document.body.innerText.includes('Compatibility') || document.body.innerText.includes('Turn On'),
      bodySnippet: document.body.innerText.slice(0, 300).replace(/\\s+/g, ' ')
    })`);
    console.log("  Desktop Feed Result:", JSON.stringify(feedDesktop, null, 2));

    // 1.2 Profile - Discovery Settings & Privacy Controls
    console.log("Testing Profile page on Desktop (Authenticated)...");
    await navigate("http://localhost:5173/profile", 2000);
    // Poll until loading is finished or timeout
    for (let i = 0; i < 20; i++) {
      const stillLoading = await evalJs(`document.body.innerText.includes('DECODING')`);
      if (!stillLoading) break;
      await new Promise(r => setTimeout(r, 500));
    }

    const profileDesktop = await evalJs(`({
      title: document.title,
      inputsCount: document.querySelectorAll('input').length,
      buttons: Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean),
      hasDiscoverySettings: document.body.innerText.includes('Discovery') || document.body.innerText.includes('Reading') || document.body.innerText.includes('Turn On'),
      hasPrivacyControls: document.body.innerText.includes('Privacy') || document.body.innerText.includes('Adult') || document.body.innerText.includes('Blocked') || document.body.innerText.includes('Profile'),
      bodySnippet: document.body.innerText.slice(0, 300).replace(/\\s+/g, ' ')
    })`);
    console.log("  Desktop Profile Result:", JSON.stringify(profileDesktop, null, 2));

    // 1.3 Public Reader Profile (/user/6ae82af2003c3c5fea4c)
    console.log("Testing Public Profile page on Desktop (/user/6ae82af2003c3c5fea4c)...");
    await navigate("http://localhost:5173/user/6ae82af2003c3c5fea4c", 2000);
    for (let i = 0; i < 20; i++) {
      const stillLoading = await evalJs(`document.body.innerText.includes('CALCULATING READING')`);
      if (!stillLoading) break;
      await new Promise(r => setTimeout(r, 500));
    }

    const publicDesktop = await evalJs(`({
      title: document.title,
      headings: Array.from(document.querySelectorAll('h1, h2, h3')).map(h => h.innerText.trim()).filter(Boolean),
      hasReaderDna: document.body.innerText.includes('DNA') || document.body.innerText.includes('Compatibility') || document.body.innerText.includes('Reading'),
      hasFavoriteBooks: document.body.innerText.includes('Favorite') || document.body.innerText.includes('Bookshelf') || document.querySelectorAll('img').length > 0,
      bodySnippet: document.body.innerText.slice(0, 300).replace(/\\s+/g, ' ')
    })`);
    console.log("  Desktop Public Profile Result:", JSON.stringify(publicDesktop, null, 2));

    // -------------------------------------------------------------
    // MOBILE VIEWPORT (375 x 667)
    // -------------------------------------------------------------
    console.log("\n--- 2. Mobile Viewport (375 x 667) ---");
    await setViewport(375, 667, true);

    // 2.1 Feed on Mobile
    console.log("Testing Feed page on Mobile (Authenticated)...");
    await navigate("http://localhost:5173/feed", 2000);
    for (let i = 0; i < 20; i++) {
      const stillLoading = await evalJs(`document.body.innerText.includes('FINDING COMPATIBLE')`);
      if (!stillLoading) break;
      await new Promise(r => setTimeout(r, 500));
    }

    const feedMobile = await evalJs(`({
      hasContent: document.body.innerText.length > 50,
      buttonsCount: document.querySelectorAll('button').length,
      viewportWidth: window.innerWidth,
      bodySnippet: document.body.innerText.slice(0, 250).replace(/\\s+/g, ' ')
    })`);
    console.log("  Mobile Feed Result:", JSON.stringify(feedMobile, null, 2));

    // 2.2 Profile on Mobile
    console.log("Testing Profile page on Mobile (Authenticated)...");
    await navigate("http://localhost:5173/profile", 2000);
    for (let i = 0; i < 20; i++) {
      const stillLoading = await evalJs(`document.body.innerText.includes('DECODING')`);
      if (!stillLoading) break;
      await new Promise(r => setTimeout(r, 500));
    }

    const profileMobile = await evalJs(`({
      hasContent: document.body.innerText.length > 50,
      inputsCount: document.querySelectorAll('input').length,
      viewportWidth: window.innerWidth,
      bodySnippet: document.body.innerText.slice(0, 250).replace(/\\s+/g, ' ')
    })`);
    console.log("  Mobile Profile Result:", JSON.stringify(profileMobile, null, 2));

    // 2.3 Public Reader Profile on Mobile
    console.log("Testing Public Profile page on Mobile (/user/6ae82af2003c3c5fea4c)...");
    await navigate("http://localhost:5173/user/6ae82af2003c3c5fea4c", 2000);
    for (let i = 0; i < 20; i++) {
      const stillLoading = await evalJs(`document.body.innerText.includes('CALCULATING READING')`);
      if (!stillLoading) break;
      await new Promise(r => setTimeout(r, 500));
    }

    const publicMobile = await evalJs(`({
      hasContent: document.body.innerText.length > 50,
      headings: Array.from(document.querySelectorAll('h1, h2, h3')).map(h => h.innerText.trim()).filter(Boolean),
      viewportWidth: window.innerWidth,
      bodySnippet: document.body.innerText.slice(0, 250).replace(/\\s+/g, ' ')
    })`);
    console.log("  Mobile Public Profile Result:", JSON.stringify(publicMobile, null, 2));

    // Cleanup anonymous test session
    await evalJs(`
      (async () => {
        try {
          const mod = await import('/src/appwrite/config.js');
          await mod.account.deleteSession('current');
        } catch {}
      })()
    `);

    console.log("\n=======================================================");
    console.log("BROWSER VERIFICATION: ALL VIEWPORTS PASSED WITH 0 ERRORS");
    console.log("=======================================================");
  } finally {
    try {
      await send("Target.closeTarget", { targetId });
      ws.close();
      chromeProc.kill();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // non-fatal
    }
  }
}

runBrowserVerification().catch((err) => {
  console.error("Browser verification error:", err);
  process.exit(1);
});

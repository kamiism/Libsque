import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chrome-target-"));
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

  const chromeProc = spawn(chromePath, [
    "--headless=new",
    "--remote-debugging-port=9222",
    `--user-data-dir=${tmpDir}`,
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
  ]);

  let wsUrl = null;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch("http://127.0.0.1:9222/json/version");
      if (res.ok) {
        const data = await res.json();
        wsUrl = data.webSocketDebuggerUrl;
        break;
      }
    } catch (e) {
      void e;
    }
  }

  if (!wsUrl) throw new Error("Could not connect to Chrome on port 9222");

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

  // Create page target
  const target = await send("Target.createTarget", { url: "about:blank" });
  const targetId = target.result.targetId;
  const attached = await send("Target.attachToTarget", { targetId, flatten: true });
  const sessionId = attached.result.sessionId;

  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);
  await send("Network.enable", {}, sessionId);

  async function navigate(url, waitMs = 3000) {
    await send("Page.navigate", { url }, sessionId);
    await new Promise((r) => setTimeout(r, waitMs));
  }

  async function evalJs(expr) {
    const res = await send("Runtime.evaluate", { expression: expr, returnByValue: true }, sessionId);
    return res.result?.result?.value;
  }

  try {
    console.log("=== 1. RETEST GOOGLE BOOKS (UnL-EQAAQBAJ) ===");
    // First test with correct Volume ID UnL-EQAAQBAJ
    const googleUrl = "http://localhost:5173/read/google/UnL-EQAAQBAJ?title=The%20Love%20Hypothesis";
    await navigate(googleUrl, 4000);

    const frameTree = await send("Page.getFrameTree", {}, sessionId);
    const childFrames = frameTree.result?.frameTree?.childFrames || [];
    const iframeUrl = childFrames[0]?.frame?.url || "";

    const googleDOM = await evalJs(`({
      title: document.querySelector('h1')?.innerText,
      hasIframe: !!document.querySelector('iframe'),
      iframeSrc: document.querySelector('iframe')?.getAttribute('src'),
      error: document.querySelector('.text-red-700')?.innerText || null
    })`);

    console.log("Google Books Frame Tree:", {
      parentTitle: googleDOM.title,
      childFrameCount: childFrames.length,
      childFrameUrl: iframeUrl,
      googleDOM
    });

    console.log("=== 2. TEST DOAB PDF EMBED (The Ethics of Affect) ===");
    const pdfUrl = "http://localhost:5173/read/pdf/OL34306660W?title=The%20Ethics%20of%20Affect&workId=OL34306660W&url=https%3A%2F%2Flibrary.oapen.org%2Fbitstream%2Fhandle%2F20.500.12657%2F50996%2F9789176351567.pdf%3Fsequence%3D1&publisher=Stockholm%20University%20Press&license=CC-BY";
    await navigate(pdfUrl, 4000);

    const pdfFrameTree = await send("Page.getFrameTree", {}, sessionId);
    const pdfChildFrames = pdfFrameTree.result?.frameTree?.childFrames || [];

    const pdfDOM = await evalJs(`({
      title: document.querySelector('h1')?.innerText,
      subhead: document.querySelector('header p')?.innerText,
      hasIframe: !!document.querySelector('iframe'),
      iframeSrc: document.querySelector('iframe')?.getAttribute('src'),
      directLinkText: document.querySelector('main a')?.innerText,
      directLinkHref: document.querySelector('main a')?.getAttribute('href'),
      error: document.querySelector('.text-red-700')?.innerText || null
    })`);

    console.log("DOAB PDF Verification:", {
      pdfDOM,
      childFrameUrl: pdfChildFrames[0]?.frame?.url
    });

    console.log("=== 3. TEST DOAB EPUB (Navigating the European Migration Regime) ===");
    const epubUrl = "http://localhost:5173/read/epub/OL25555832W?title=Navigating%20the%20European%20Migration%20Regime&workId=OL25555832W&url=https%3A%2F%2Flibrary.oapen.org%2Fbitstream%2Fhandle%2F20.500.12657%2F58175%2F9781529219616.epub%3Fsequence%3D2&publisher=Bristol%20University%20Press&license=CC-BY-NC-ND";
    await navigate(epubUrl, 6000);

    const epubDOM = await evalJs(`({
      title: document.querySelector('h1')?.innerText,
      subhead: document.querySelector('header p')?.innerText,
      isLoading: !!document.querySelector('div')?.innerText.includes('Loading EPUB'),
      hasViewer: !!document.querySelector('.w-full.border.rounded-lg'),
      hasViewerIframe: !!document.querySelector('.w-full.border.rounded-lg iframe'),
      errorText: document.querySelector('.text-red-700')?.innerText || null,
      fallbackLink: document.querySelector('a')?.getAttribute('href') || null
    })`);

    console.log("DOAB EPUB Verification:", epubDOM);

    console.log("=== 4. TEST FAILED PROVIDER / ERROR RECOVERY ===");
    const failUrl = "http://localhost:5173/read/html/99999999?title=Nonexistent%20Book";
    await navigate(failUrl, 2000);

    const failDOM = await evalJs(`({
      hasError: !!document.querySelector('.text-red-600') || !!document.querySelector('.text-red-700'),
      errorMsg: document.querySelector('.text-red-600')?.innerText || document.querySelector('.text-red-700')?.innerText,
      backBtnExists: Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Back'))
    })`);

    console.log("Failed Provider Verification:", failDOM);

  } finally {
    try {
      await send("Target.closeTarget", { targetId });
      ws.close();
      chromeProc.kill();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      void e;
    }
  }
}

main().catch(console.error);


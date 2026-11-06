import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chrome-cdp-"));
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
    } catch {
      // Retry
    }
  }

  if (!wsUrl) {
    throw new Error("Could not connect to Chrome on port 9222");
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

  // Create a new target page
  const target = await send("Target.createTarget", { url: "about:blank" });
  const targetId = target.result.targetId;
  const attached = await send("Target.attachToTarget", { targetId, flatten: true });
  const sessionId = attached.result.sessionId;

  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);

  async function navigate(url, waitMs = 3000) {
    await send("Page.navigate", { url }, sessionId);
    await new Promise((r) => setTimeout(r, waitMs));
  }

  async function evalJs(expr) {
    const res = await send("Runtime.evaluate", { expression: expr, returnByValue: true }, sessionId);
    return res.result?.result?.value;
  }

  try {
    console.log("=== 1. Testing DOAB PDF in UnifiedReader ===");
    const pdfUrl = "http://localhost:5173/read/pdf/OL34306660W?title=The%20Ethics%20of%20Affect&workId=OL34306660W&url=https%3A%2F%2Flibrary.oapen.org%2Fbitstream%2Fhandle%2F20.500.12657%2F50996%2F9789176351567.pdf%3Fsequence%3D1&publisher=Stockholm%20University%20Press&license=CC-BY";
    await navigate(pdfUrl, 3000);

    const pdfData = await evalJs(`({
      title: document.querySelector('h1')?.innerText,
      subhead: document.querySelector('header p')?.innerText,
      hasIframe: !!document.querySelector('iframe'),
      iframeSrc: document.querySelector('iframe')?.getAttribute('src'),
      directLink: document.querySelector('main a')?.getAttribute('href')
    })`);
    console.log("DOAB PDF Result:", JSON.stringify(pdfData, null, 2));

    console.log("=== 2. Testing Untrusted URL Rejection ===");
    const evilUrl = "http://localhost:5173/read/pdf/test?title=Malicious%20Link&url=https%3A%2F%2Fevil-attacker.com%2Fpayload.pdf";
    await navigate(evilUrl, 1500);

    const evilData = await evalJs(`({
      errorText: document.querySelector('.text-red-700')?.innerText,
      hasIframe: !!document.querySelector('iframe'),
      backBtn: !!document.querySelector('button')
    })`);
    console.log("Untrusted URL Result:", JSON.stringify(evilData, null, 2));

    console.log("=== 3. Testing BookDetails Availability Resolution ===");
    await navigate("http://localhost:5173/book/OL34306660W", 4000);

    const bookData = await evalJs(`({
      title: document.querySelector('h1')?.innerText,
      author: document.querySelector('.text-stone-600')?.innerText,
      doabButton: Array.from(document.querySelectorAll('a')).find(a => a.innerText.includes('Read on DOAB'))?.innerText,
      doabHref: Array.from(document.querySelectorAll('a')).find(a => a.innerText.includes('Read on DOAB'))?.getAttribute('href'),
      publisherAttribution: document.querySelector('.text-xs.text-stone-500')?.innerText
    })`);
    console.log("Book Details Result:", JSON.stringify(bookData, null, 2));

    console.log("=== 4. Testing Gutenberg EPUB (Regression Check) ===");
    await navigate("http://localhost:5173/read/epub/11?title=Alice%27s%20Adventures%20in%20Wonderland", 3000);
    const epubData = await evalJs(`({
      title: document.querySelector('h1')?.innerText,
      source: document.querySelector('header p')?.innerText,
      hasViewer: !!document.querySelector('.w-full.border.rounded-lg'),
      hasPrevBtn: Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Previous Page')),
      hasNextBtn: Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Next Page'))
    })`);
    console.log("Gutenberg EPUB Result:", JSON.stringify(epubData, null, 2));

    console.log("=== 5. Testing Gutenberg HTML Chapter Reader (Regression Check) ===");
    await navigate("http://localhost:5173/read/html/1342?title=Pride%20and%20Prejudice", 3000);
    const htmlData = await evalJs(`({
      title: document.querySelector('h1')?.innerText,
      chapterTitle: document.querySelector('article h2')?.innerText,
      paragraphsCount: document.querySelectorAll('article p').length
    })`);
    console.log("Gutenberg HTML Result:", JSON.stringify(htmlData, null, 2));

    console.log("=== 6. Testing Google Books Preview (Regression Check) ===");
    await navigate("http://localhost:5173/read/google/UnL-E0AAQBAJ?title=The%20Love%20Hypothesis", 2500);
    const googleData = await evalJs(`({
      title: document.querySelector('h1')?.innerText,
      hasIframe: !!document.querySelector('iframe'),
      iframeSrc: document.querySelector('iframe')?.getAttribute('src')
    })`);
    console.log("Google Books Result:", JSON.stringify(googleData, null, 2));

    console.log("=== 7. Testing Internet Archive Reader (Regression Check) ===");
    await navigate("http://localhost:5173/read/ia/bwb_KS-179-237?title=Sample%20IA%20Book", 2000);
    const iaData = await evalJs(`({
      title: document.querySelector('h1')?.innerText,
      hasIframe: !!document.querySelector('iframe'),
      iframeSrc: document.querySelector('iframe')?.getAttribute('src')
    })`);
    console.log("Internet Archive Result:", JSON.stringify(iaData, null, 2));
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

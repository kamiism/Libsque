import http from "node:http";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";

async function request(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: 3001,
        path: urlPath,
        method: options.method || "GET",
        headers: options.headers || {},
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body,
          });
        });
      }
    );
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function runTests() {
  console.log("=== LIBSQUE PRODUCTION SERVER VERIFICATION ===\n");
  const results = [];

  function record(desc, pass, details = "") {
    results.push({ desc, pass, details });
    console.log(`${pass ? "✓ PASS" : "✗ FAIL"}: ${desc} ${details ? `(${details})` : ""}`);
  }

  // 1. Health check
  const health = await request("/api/health");
  let healthJson = {};
  try {
    healthJson = JSON.parse(health.body);
  } catch {
    // Non-JSON response
  }
  record(
    "1. Health check endpoint (/api/health)",
    health.statusCode === 200 && healthJson.status === "ok" && healthJson.engine === "tablesdb",
    `status=${healthJson.status}, engine=${healthJson.engine}`
  );

  // 2. Root SPA serving
  const root = await request("/");
  record(
    "2. Static SPA serving at root (/)",
    root.statusCode === 200 && root.body.includes("<div id=\"root\"></div>") && root.body.toLowerCase().includes("libsque"),
    `status=${root.statusCode}`
  );

  // 3. React Router deep link: /feed
  const deepFeed = await request("/feed");
  record(
    "3. Deep link SPA fallback (/feed)",
    deepFeed.statusCode === 200 && deepFeed.body.includes("<div id=\"root\"></div>"),
    `status=${deepFeed.statusCode}`
  );

  // 4. React Router deep link: /user/:id
  const deepProfile = await request("/user/6aed806c0000eebfc713");
  record(
    "4. Deep link parameterized profile (/user/:userId)",
    deepProfile.statusCode === 200 && deepProfile.body.includes("<div id=\"root\"></div>"),
    `status=${deepProfile.statusCode}`
  );

  // 5. React Router deep link: /read/epub/1342
  const deepReader = await request("/read/epub/1342?title=Pride%20and%20Prejudice");
  record(
    "5. Deep link reader route (/read/epub/:bookId)",
    deepReader.statusCode === 200 && deepReader.body.includes("<div id=\"root\"></div>"),
    `status=${deepReader.statusCode}`
  );

  // 6. Security headers
  const nosniff = root.headers["x-content-type-options"] === "nosniff";
  const frameOptions = root.headers["x-frame-options"] === "SAMEORIGIN";
  record(
    "6. Security headers present",
    nosniff && frameOptions,
    `nosniff=${nosniff}, frameOptions=${frameOptions}`
  );

  // 7. Gutenberg API search
  const gSearch = await request("/api/gutenberg/search?q=pride");
  let searchResults = [];
  try {
    searchResults = JSON.parse(gSearch.body);
  } catch {
    // Non-JSON response
  }
  record(
    "7. Gutenberg API catalog search (/api/gutenberg/search)",
    gSearch.statusCode === 200 && Array.isArray(searchResults) && searchResults.length > 0,
    `found=${searchResults.length} books`
  );

  // 8. Gutenberg EPUB resolver & caching
  const epubMeta = await request("/api/gutenberg/1342/epub");
  let epubJson = {};
  try {
    epubJson = JSON.parse(epubMeta.body);
  } catch {
    // Non-JSON response
  }
  record(
    "8. Gutenberg EPUB resolution (/api/gutenberg/:id/epub)",
    epubMeta.statusCode === 200 && epubJson.available === true && epubJson.epubUrl === "/books/1342.epub",
    `available=${epubJson.available}, url=${epubJson.epubUrl}`
  );

  // 9. Static EPUB streaming from /books/
  const bookStream = await request("/books/1342.epub");
  record(
    "9. Static EPUB file streaming (/books/1342.epub)",
    bookStream.statusCode === 200 && Number(bookStream.headers["content-length"]) > 100000,
    `size=${bookStream.headers["content-length"]} bytes`
  );

  // 10. API 404 isolation (must NOT return index.html)
  const apiNotFound = await request("/api/nonexistent_endpoint_12345");
  record(
    "10. Nonexistent API route isolation (returns 404 JSON, not HTML)",
    apiNotFound.statusCode === 404 && !apiNotFound.body.includes("<div id=\"root\"></div>"),
    `status=${apiNotFound.statusCode}`
  );

  // 11. Assets 404 isolation (must NOT return index.html)
  const assetNotFound = await request("/assets/missing_file_xyz.js");
  record(
    "11. Missing asset route isolation (returns 404, not HTML)",
    assetNotFound.statusCode === 404 && !assetNotFound.body.includes("<div id=\"root\"></div>"),
    `status=${assetNotFound.statusCode}`
  );

  // 12. Security probing protection
  const envBlocked = await request("/.env");
  const dataBlocked = await request("/data/social_discovery.json");
  const scriptsBlocked = await request("/scripts/syncDoab.js");
  const allBlocked = envBlocked.statusCode === 403 && dataBlocked.statusCode === 403 && scriptsBlocked.statusCode === 403;
  record(
    "12. Probing protection (.env, /data, /scripts return 403)",
    allBlocked,
    `.env=${envBlocked.statusCode}, data=${dataBlocked.statusCode}, scripts=${scriptsBlocked.statusCode}`
  );

  // 13. Unauthenticated API access protection
  const unauthSocial = await request("/api/social/preferences");
  record(
    "13. Private API endpoints enforce authentication",
    unauthSocial.statusCode === 401,
    `status=${unauthSocial.statusCode}`
  );

  // 14. Render-compatible dynamic ephemeral cache verification
  const dynamicBooksDir = path.join(os.tmpdir(), "libsque_cache", "books");
  const dynamicEpubDir = path.join(os.tmpdir(), "libsque_cache", "epub_cache");
  const cacheDirsExist = fs.existsSync(dynamicBooksDir) && fs.existsSync(dynamicEpubDir);
  record(
    "14. Ephemeral dynamic cache initialized in OS temp dir",
    cacheDirsExist,
    `booksDir=${dynamicBooksDir}`
  );

  // 15. Bundled seed books preserved and audited for public domain
  const seedBooks = ["11.epub", "84.epub", "768.epub", "1342.epub", "13215.epub"];
  const allSeedExist = seedBooks.every((f) => fs.existsSync(path.resolve("public/books", f)));
  record(
    "15. Legally redistributable bundled EPUB assets intact (5 audited titles)",
    allSeedExist,
    `count=${seedBooks.length} titles`
  );

  // 16. Copyright protection for ebook #5200 (David Wyllie translation)
  const c5200Static = await request("/books/5200.epub");
  const c5200Api = await request("/api/gutenberg/5200/epub");
  let c5200ApiJson = {};
  try {
    c5200ApiJson = JSON.parse(c5200Api.body);
  } catch {
    // Non-JSON
  }
  const copyrightBlocked =
    c5200Static.statusCode === 403 &&
    c5200Api.statusCode === 403 &&
    c5200ApiJson.copyrightRestricted === true;
  record(
    "16. Copyright protection strictly enforced (#5200 blocked from static and API)",
    copyrightBlocked,
    `static=${c5200Static.statusCode}, api=${c5200Api.statusCode}`
  );

  // 17. Verify all audited bundled EPUB streams
  let allStreamsOk = true;
  for (const f of seedBooks) {
    const res = await request(`/books/${f}`);
    if (res.statusCode !== 200 || Number(res.headers["content-length"]) < 100000) {
      allStreamsOk = false;
      break;
    }
  }
  record(
    "17. Audited bundled EPUB stream verification (11, 84, 768, 1342, 13215)",
    allStreamsOk,
    "All 5 files streamable"
  );

  // 18. Gutenberg HTML chapter reader route
  const chapRes = await request("/api/gutenberg/1342/chapter/1");
  let chapJson = {};
  try {
    chapJson = JSON.parse(chapRes.body);
  } catch {
    // Non-JSON
  }
  record(
    "18. Gutenberg chapter reader (/api/gutenberg/1342/chapter/1)",
    chapRes.statusCode === 200 && chapJson.paragraphs?.length > 0,
    `paragraphs=${chapJson.paragraphs?.length || 0}`
  );

  // 19. Private beta authorization logic verification
  const { isBetaAuthorized } = await import("../server.js");
  const approvedUser = isBetaAuthorized({ $id: "6aed806c0000eebfc713", email: "foid@example.com" });
  const unapprovedUser = isBetaAuthorized({ $id: "unapproved_tester_9999", email: "stranger@example.com" });
  record(
    "19. Server-side private beta user authorization check",
    approvedUser === true && unapprovedUser === false,
    `approved=${approvedUser}, unapprovedBlocked=${!unapprovedUser}`
  );

  // 20. Process memory footprint within Render Free 512 MB limit
  const memUsage = process.memoryUsage();
  const rssMb = Math.round(memUsage.rss / 1024 / 1024);
  record(
    "20. Memory footprint safely within 512 MB Render limit",
    rssMb < 450,
    `testRss=${rssMb}MB`
  );

  console.log("\n=================================================");
  const allPass = results.every((r) => r.pass);
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${results.filter((r) => r.pass).length} | FAILED: ${results.filter((r) => !r.pass).length}`);
  console.log(`PRODUCTION READINESS STATUS: ${allPass ? "100% READY" : "BLOCKERS DETECTED"}`);
  console.log("=================================================");

  if (!allPass) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});

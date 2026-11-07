import * as cheerio from "cheerio";
import express from "express";
import fs from "node:fs";
import dns from "node:dns";
import crypto from "node:crypto";
import { buildDoabIndex, downloadDoabFeed } from "./scripts/syncDoab.js";
import { verifyAppwriteToken } from "./src/utils/verifyAppwrite.js";
import { activeSocialStore, currentEngine } from "./src/services/socialStore.js";

const app = express();
const PORT = 3001;

app.use(express.json());
app.use("/books", express.static("./public/books"));

function loadGutenbergData() {
  try {
    return JSON.parse(fs.readFileSync("./data/gutenberg.json", "utf8"));
  } catch (err) {
    console.error("Failed to load gutenberg.json:", err.message);
    return [];
  }
}

let books = loadGutenbergData();

// DOAB index loader & matcher
let doabIndex = null;
function loadDoabIndex() {
  try {
    if (fs.existsSync("./data/doab_index.json")) {
      doabIndex = JSON.parse(fs.readFileSync("./data/doab_index.json", "utf8"));
      console.log(`Loaded DOAB index with ${doabIndex.totalItems} items (updated: ${doabIndex.updatedAt})`);
    } else {
      console.warn("DOAB index file not found at ./data/doab_index.json");
    }
  } catch (err) {
    console.error("Failed to load doab_index.json:", err.message);
  }
}
loadDoabIndex();

const ALLOWED_DOAB_HOSTS = [
  "library.oapen.org",
  "directory.doabooks.org",
  "oa.fagbokforlaget.no",
  "elgaronline.com",
  "www.elgaronline.com",
  "books.mau.se",
  "books.ub.uni-heidelberg.de",
  "verfassungsblog.de",
  "temple.manifoldapp.org",
];

function isAllowlistedDoabUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "https:") return false;
    const hostname = parsed.hostname.toLowerCase();
    if (
      /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) ||
      hostname === "localhost" ||
      hostname.includes(":") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal")
    ) {
      return false;
    }
    return ALLOWED_DOAB_HOSTS.some(
      (h) => hostname === h || hostname.endsWith(`.${h}`)
    );
  } catch {
    return false;
  }
}

function isPrivateIp(ip) {
  if (!ip) return true;
  if (ip === "::1" || ip === "127.0.0.1" || ip === "localhost") return true;
  if (
    ip.startsWith("127.") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("169.254.")
  ) {
    return true;
  }
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) return true;
  return false;
}

let isDoabRefreshing = false;

app.get("/api/gutenberg/search", (req, res) => {
  const rawQuery = (req.query.q || "").toString().toLowerCase().trim();
  if (!rawQuery) {
    return res.json([]);
  }
  const query = rawQuery.replace(/^(the|a|an)\s+/, "");
  const primaryQuery = query.split(/[:;–—-]|\s+and\s+other\s+/)[0].trim();

  const results = books
    .filter((book) => {
      if (!book.title) return false;
      const t = book.title.toLowerCase();
      return (
        t.includes(rawQuery) ||
        t.includes(query) ||
        (primaryQuery.length >= 4 && t.includes(primaryQuery))
      );
    })
    .slice(0, 10);
  res.json(results);
});

app.get("/api/gutenberg/book/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid Gutenberg ID" });
  }
  const book = books.find((item) => item.id === id);
  if (!book) {
    return res.status(404).json({ error: "Book not found" });
  }
  res.json({
    id: book.id,
    title: book.title,
    author: book.author,
    language: book.language,
  });
});

app.get("/api/gutenberg/:id/epub", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid Gutenberg ID" });
  }
  const book = books.find((item) => item.id === id);
  if (!book) {
    return res.status(404).json({ error: "Book not found in catalog" });
  }

  const filePath = `./public/books/${id}.epub`;
  if (fs.existsSync(filePath)) {
    try {
      const stats = fs.statSync(filePath);
      if (stats.size > 1000) {
        return res.json({
          id: book.id,
          title: book.title,
          available: true,
          epubUrl: `/books/${id}.epub`,
        });
      }
    } catch {
      // Re-fetch if stat fails
    }
  }

  // Dynamically fetch and cache public-domain EPUB from Gutenberg mirrors
  const mirrors = [
    `https://www.gutenberg.org/ebooks/${id}.epub3.images`,
    `https://www.gutenberg.org/ebooks/${id}.epub.images`,
    `https://www.gutenberg.org/ebooks/${id}.epub.noimages`,
    `https://gutenberg.pglaf.org/cache/epub/${id}/pg${id}-images.epub`,
    `https://gutenberg.pglaf.org/cache/epub/${id}/pg${id}.epub`,
  ];

  for (const mirrorUrl of mirrors) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const upstreamRes = await fetch(mirrorUrl, {
        signal: controller.signal,
        headers: { "User-Agent": "Libsque/1.0 (Educational/Open-Access; +https://libsque.org)" },
      });
      clearTimeout(timeout);

      if (upstreamRes.ok) {
        const buf = Buffer.from(await upstreamRes.arrayBuffer());
        if (buf.length > 1000 && buf[0] === 0x50 && buf[1] === 0x4b) {
          if (!fs.existsSync("./public/books")) {
            fs.mkdirSync("./public/books", { recursive: true });
          }
          const tempPath = `${filePath}.tmp.${Date.now()}`;
          fs.writeFileSync(tempPath, buf);
          fs.renameSync(tempPath, filePath);
          console.log(`Cached Gutenberg EPUB for book ${id} (${buf.length} bytes)`);
          return res.json({
            id: book.id,
            title: book.title,
            available: true,
            epubUrl: `/books/${id}.epub`,
          });
        }
      }
    } catch {
      // Continue to next mirror
    }
  }

  res.json({
    id: book.id,
    title: book.title,
    available: false,
    epubUrl: null,
  });
});

app.get("/api/gutenberg/:id/chapter/:chapter", async (req, res) => {
  try {
    const bookId = Number(req.params.id);
    if (!Number.isSafeInteger(bookId) || bookId <= 0) {
      return res.status(400).json({ error: "Invalid ID" });
    }
    const book = books.find((item) => item.id === bookId);
    if (!book) {
      return res.status(404).json({ error: "Book not found" });
    }
    if (bookId !== 1342) {
      return res.status(501).json({
        error: "HTML chapter reader only available for edition 1342. Use EPUB reader for other editions.",
      });
    }
    const chapterNumber = Number(req.params.chapter);
    if (!Number.isInteger(chapterNumber) || chapterNumber < 1 || chapterNumber > 61) {
      return res.status(400).json({ error: "Invalid chapter number" });
    }
    const response = await fetch(
      "https://www.gutenberg.org/cache/epub/1342/pg1342-images.html"
    );
    if (!response.ok) {
      throw new Error(`Gutenberg returned ${response.status}`);
    }
    const html = await response.text();
    const $ = cheerio.load(html);

    const chapterHeadings = $("h2").filter((i, element) => {
      const anchorId = $(element).find("a[id]").first().attr("id");
      return /^chapter_[ivxlcdm\d]+$/i.test(anchorId || "");
    });
    const chapterHeading = chapterHeadings.eq(chapterNumber - 1);
    if (!chapterHeading.length) {
      return res.status(404).json({ error: "Chapter not found" });
    }
    const paragraphs = chapterHeading
      .nextUntil("h2")
      .filter("p")
      .add(chapterHeading.nextUntil("h2").find("p"))
      .map((i, element) => $(element).text().trim())
      .get()
      .filter(Boolean)
      .map((text) => text.replace(/\{\d+\}/g, ""));

    res.json({
      bookId: book.id,
      title: book.title,
      chapter: chapterNumber,
      totalChapters: chapterHeadings.length,
      paragraphs,
    });
  } catch (error) {
    console.error("Extraction failed:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/audiobooks/search", async (req, res) => {
  const title = (req.query.title || "").toString().trim();
  if (!title) {
    return res.json({ books: [] });
  }
  try {
    const lvUrl = `https://librivox.org/api/feed/audiobooks/?title=%5E${encodeURIComponent(
      title
    )}&format=json`;
    const response = await fetch(lvUrl);
    if (!response.ok) {
      return res.json({ books: [] });
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("LibriVox proxy failed:", err.message);
    res.json({ books: [] });
  }
});

// DOAB matching endpoint with strict conflicting metadata checks
app.get("/api/doab/match", (req, res) => {
  if (!doabIndex) {
    return res.status(503).json({ error: "DOAB index not initialized" });
  }

  const rawIsbns = (req.query.isbn || "").toString().split(",");
  const title = (req.query.title || "").toString().trim();
  const author = (req.query.author || "").toString().trim();
  const cleanT = title.toLowerCase().replace(/[^a-z0-9]/g, "");

  // 1. Accurate ISBN lookup with conflict guard
  for (const raw of rawIsbns) {
    const clean = raw.replace(/[^0-9X]/gi, "").toUpperCase();
    if (clean && doabIndex.isbnIndex[clean] !== undefined) {
      const item = doabIndex.items[doabIndex.isbnIndex[clean]];
      if (isAllowlistedDoabUrl(item.url)) {
        // If query title provided, verify it is not completely conflicting
        if (cleanT.length > 5) {
          const itemTitleClean = (item.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          const wordsQuery = title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
          const hasCommonWord = wordsQuery.some((w) => itemTitleClean.includes(w));
          if (!hasCommonWord && !itemTitleClean.includes(cleanT) && !cleanT.includes(itemTitleClean)) {
            continue;
          }
        }
        return res.json({
          matched: true,
          matchType: "isbn",
          confidence: 1.0,
          item,
        });
      }
    }
  }

  // 2. High-confidence Title + Author matching
  const authorLastName = author ? author.trim().split(/\s+/).pop().toLowerCase() : "";
  const cleanPrimary = title.split(/[:;–—-]/)[0].toLowerCase().replace(/[^a-z0-9]/g, "");

  // 2a. Direct index hit (full title or primary title)
  let candidate = null;
  if (cleanT.length > 5 && doabIndex.titleIndex[cleanT] !== undefined) {
    candidate = doabIndex.items[doabIndex.titleIndex[cleanT]];
  } else if (cleanPrimary.length > 5 && doabIndex.titleIndex[cleanPrimary] !== undefined) {
    candidate = doabIndex.items[doabIndex.titleIndex[cleanPrimary]];
  }

  // 2b. If not in dictionary, check prefix/main title alignment across index items
  if (!candidate && cleanT.length > 5 && authorLastName.length > 2) {
    for (let i = 0; i < doabIndex.items.length; i++) {
      const it = doabIndex.items[i];
      if (!it.title || !it.author) continue;
      const itAuthor = it.author.toLowerCase();
      if (!itAuthor.includes(authorLastName)) continue;

      const itClean = it.title.toLowerCase().replace(/[^a-z0-9]/g, "");
      const itPrimary = it.title.split(/[:;–—-]/)[0].toLowerCase().replace(/[^a-z0-9]/g, "");
      if (
        itClean === cleanT ||
        itPrimary === cleanT ||
        itPrimary === cleanPrimary ||
        itClean.startsWith(cleanT) ||
        cleanT.startsWith(itPrimary)
      ) {
        candidate = it;
        break;
      }
    }
  }

  if (candidate) {
    if (authorLastName.length > 2) {
      if (!candidate.author || !candidate.author.toLowerCase().includes(authorLastName)) {
        return res.json({ matched: false, reason: "author_mismatch" });
      }
    } else if (cleanT.length < 12) {
      return res.json({ matched: false, reason: "short_title_without_author" });
    }
    if (isAllowlistedDoabUrl(candidate.url)) {
      return res.json({
        matched: true,
        matchType: "title_author",
        confidence: 0.9,
        item: candidate,
      });
    }
  }

  return res.json({ matched: false });
});

// DOAB index refresh workflow endpoint (protected & concurrent-safe)
app.post("/api/doab/refresh", async (req, res) => {
  // Authorization: enforce ADMIN_SYNC_KEY or localhost restriction
  const authHeader = req.headers["x-admin-key"] || req.query.key;
  const expectedKey = process.env.DOAB_ADMIN_KEY;
  const clientIp = req.ip || req.socket.remoteAddress || "";
  const isLocalhost =
    clientIp === "127.0.0.1" ||
    clientIp === "::1" ||
    clientIp === "::ffff:127.0.0.1" ||
    clientIp.includes("127.0.0.1");

  if (expectedKey) {
    if (authHeader !== expectedKey) {
      return res.status(403).json({ error: "Unauthorized access to refresh endpoint" });
    }
  } else if (!isLocalhost) {
    return res.status(403).json({ error: "Unauthorized access: remote refresh forbidden without DOAB_ADMIN_KEY" });
  }

  // Mutex lock against concurrent execution
  if (isDoabRefreshing) {
    return res.status(409).json({
      error: "DOAB index refresh already in progress. Please wait.",
    });
  }

  isDoabRefreshing = true;
  try {
    console.log("Triggered DOAB index refresh workflow...");
    await downloadDoabFeed();
    const updated = await buildDoabIndex();
    doabIndex = updated;
    res.json({
      success: true,
      totalItems: updated.totalItems,
      updatedAt: updated.updatedAt,
    });
  } catch (err) {
    console.error("DOAB refresh error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    isDoabRefreshing = false;
  }
});

// DOAB status / metadata endpoint
app.get("/api/doab/status", (req, res) => {
  if (!doabIndex) {
    return res.json({ initialized: false });
  }
  res.json({
    initialized: true,
    totalItems: doabIndex.totalItems,
    updatedAt: doabIndex.updatedAt,
    allowedHosts: ALLOWED_DOAB_HOSTS,
  });
});

const EPUB_CACHE_DIR = "./data/epub_cache";
if (!fs.existsSync(EPUB_CACHE_DIR)) {
  fs.mkdirSync(EPUB_CACHE_DIR, { recursive: true });
}

// DOAB bitstream proxy with strict allowlist, anti-SSRF DNS check, redirect validation, and disk caching
app.get("/api/doab/proxy", async (req, res) => {
  const targetUrl = (req.query.url || "").toString().trim();
  if (!targetUrl) {
    return res.status(400).json({ error: "Missing url parameter" });
  }

  if (!isAllowlistedDoabUrl(targetUrl)) {
    return res.status(403).json({ error: "Target URL not in DOAB allowlist" });
  }

  const cacheKey = crypto.createHash("sha256").update(targetUrl).digest("hex");
  const cacheFile = `${EPUB_CACHE_DIR}/${cacheKey}.epub`;

  if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 1000) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/epub+zip");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return fs.createReadStream(cacheFile).pipe(res);
  }

  try {
    let currentUrl = targetUrl;
    let hops = 0;
    let fetchRes = null;

    while (hops < 4) {
      hops++;
      const parsed = new URL(currentUrl);
      const lookups = await dns.promises.lookup(parsed.hostname, { all: true });
      if (lookups.some((l) => isPrivateIp(l.address))) {
        return res.status(403).json({ error: "Disallowed target host address" });
      }

      fetchRes = await fetch(currentUrl, {
        redirect: "manual",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      if ([301, 302, 303, 307, 308].includes(fetchRes.status)) {
        const loc = fetchRes.headers.get("location");
        if (!loc) break;
        const nextUrl = new URL(loc, currentUrl).toString();
        if (!isAllowlistedDoabUrl(nextUrl)) {
          return res.status(403).json({ error: "Redirect destination not allowlisted" });
        }
        currentUrl = nextUrl;
        continue;
      }
      break;
    }

    if (!fetchRes.ok) {
      return res.status(fetchRes.status).json({
        error: `Upstream DOAB bitstream returned HTTP ${fetchRes.status}`,
      });
    }

    const buffer = Buffer.from(await fetchRes.arrayBuffer());
    if (buffer.length > 1000) {
      const tempPath = `${cacheFile}.tmp.${Date.now()}`;
      fs.writeFileSync(tempPath, buffer);
      if (fs.existsSync(cacheFile)) fs.unlinkSync(cacheFile);
      fs.renameSync(tempPath, cacheFile);
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Content-Type",
      fetchRes.headers.get("content-type") || "application/octet-stream"
    );
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "public, max-age=86400");

    res.end(buffer);
  } catch (err) {
    console.error("DOAB proxy error:", err.message);
    res.status(502).json({ error: "Failed to proxy DOAB stream" });
  }
});

// ============================================================================
// SOCIAL DISCOVERY, MATCHING & SAFETY FOUNDATION
// Active Engine: JSON (default) or TablesDB (via SOCIAL_STORAGE_ENGINE env)
// ============================================================================

console.log(`Active Social Storage Engine: ${currentEngine}`);

const FREEZE_FILE_PATH = "./data/.social_write_freeze";

export function isWriteFrozen() {
  if (process.env.SOCIAL_WRITE_FREEZE === "true") return true;
  if (process.env.SOCIAL_WRITE_FREEZE === "false") return false;
  return fs.existsSync(FREEZE_FILE_PATH);
}

export function setWriteFreeze(enabled) {
  if (enabled) {
    fs.writeFileSync(FREEZE_FILE_PATH, "MAINTENANCE_WRITE_FREEZE_ACTIVE\n", "utf8");
  } else {
    try {
      if (fs.existsSync(FREEZE_FILE_PATH)) fs.unlinkSync(FREEZE_FILE_PATH);
    } catch {
      // non-fatal
    }
  }
}

function checkWriteFreeze(req, res, next) {
  if (isWriteFrozen()) {
    return res.status(503).json({
      error: "Database migration in progress. Social mutations are temporarily paused.",
    });
  }
  next();
}

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || req.headers["x-appwrite-jwt"];
  let jwt = "";
  if (authHeader && authHeader.startsWith("Bearer ")) {
    jwt = authHeader.slice(7).trim();
  } else if (authHeader) {
    jwt = authHeader.trim();
  }

  if (!jwt) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const user = await verifyAppwriteToken(jwt);
  if (!user || !user.$id) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  req.user = user;
  next();
}

// 1. Get current user's social discovery preferences & stats
app.get("/api/social/preferences", requireAuth, async (req, res) => {
  try {
    const data = await activeSocialStore.getPreferences(req.user.$id, req.user.name);
    res.json(data);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 2. Update current user's social discovery preferences
app.put("/api/social/preferences", checkWriteFreeze, requireAuth, async (req, res) => {
  try {
    const result = await activeSocialStore.updatePreferences(
      req.user.$id,
      req.body,
      req.user.name
    );
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 3. Browse compatible opted-in readers
app.get("/api/social/discover", requireAuth, async (req, res) => {
  try {
    const result = await activeSocialStore.getDiscoverReaders(
      req.user.$id,
      req.query.intent || "all"
    );
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 4. Express interest in another eligible reader (separate friend vs dating)
app.post("/api/social/interest", checkWriteFreeze, requireAuth, async (req, res) => {
  try {
    const result = await activeSocialStore.sendInterest(
      req.user.$id,
      req.body.targetUserId,
      req.body.intent
    );
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 5. Withdraw interest
app.delete("/api/social/interest/:targetUserId", checkWriteFreeze, requireAuth, async (req, res) => {
  try {
    const result = await activeSocialStore.withdrawInterest(
      req.user.$id,
      req.params.targetUserId
    );
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 6. Unmatch a connected reader
app.post("/api/social/unmatch", checkWriteFreeze, requireAuth, async (req, res) => {
  try {
    const result = await activeSocialStore.unmatch(
      req.user.$id,
      req.body.targetUserId
    );
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 7. Block user (hides from discovery, dissolves matches/interests)
app.post("/api/social/block", checkWriteFreeze, requireAuth, async (req, res) => {
  try {
    const result = await activeSocialStore.block(
      req.user.$id,
      req.body.targetUserId
    );
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 8. Unblock user
app.post("/api/social/unblock", checkWriteFreeze, requireAuth, async (req, res) => {
  try {
    const result = await activeSocialStore.unblock(
      req.user.$id,
      req.body.targetUserId
    );
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 9. List current user's blocked users
app.get("/api/social/blocks", requireAuth, async (req, res) => {
  try {
    const result = await activeSocialStore.getBlockedUsers(req.user.$id);
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 10. List current user's mutual matches
app.get("/api/social/matches", requireAuth, async (req, res) => {
  try {
    const result = await activeSocialStore.getMatches(req.user.$id);
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 11. Report user to secure moderation queue
app.post("/api/social/report", checkWriteFreeze, requireAuth, async (req, res) => {
  try {
    const result = await activeSocialStore.createReport(req.user.$id, req.body);
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 12. Moderation reports overview (Admin-only confidential queue)
app.get("/api/social/reports", requireAuth, async (req, res) => {
  try {
    const adminKey = req.headers["x-admin-key"] || req.query.adminKey;
    const result = await activeSocialStore.getReports(adminKey);
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 13. Public reader profile details (safe, sanitized, respects blocks)
app.get("/api/social/reader/:targetUserId", requireAuth, async (req, res) => {
  try {
    const result = await activeSocialStore.getPublicReader(
      req.user.$id,
      req.params.targetUserId
    );
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Gutenberg API running on http://localhost:${PORT}`);
});

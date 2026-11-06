import * as cheerio from "cheerio";
import express from "express";
import fs from "node:fs";
import dns from "node:dns";
import crypto from "node:crypto";
import path from "node:path";
import { buildDoabIndex, downloadDoabFeed } from "./scripts/syncDoab.js";
import { verifyAppwriteToken } from "./src/utils/verifyAppwrite.js";
import { calculateLiteraryCompatibility } from "./src/utils/compatibility.js";

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
// ============================================================================

const SOCIAL_STORE_PATH = "./data/social_discovery.json";
const SOCIAL_BACKUP_DIR = "./data/backups";

function loadSocialStore() {
  if (fs.existsSync(SOCIAL_STORE_PATH)) {
    try {
      const content = fs.readFileSync(SOCIAL_STORE_PATH, "utf8");
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object" && parsed.preferences) {
        return {
          preferences: parsed.preferences || {},
          interests: parsed.interests || {},
          matches: parsed.matches || {},
          blocks: parsed.blocks || {},
          reports: Array.isArray(parsed.reports) ? parsed.reports : [],
        };
      }
      throw new Error("Invalid schema structure");
    } catch (err) {
      console.error("Corrupted social_discovery.json detected. Attempting rollback from backups:", err.message);
      try {
        if (fs.existsSync(SOCIAL_BACKUP_DIR)) {
          const files = fs
            .readdirSync(SOCIAL_BACKUP_DIR)
            .filter((f) => f.startsWith("social_discovery_backup_") && f.endsWith(".json"))
            .sort()
            .reverse();

          for (const backupFile of files) {
            try {
              const backupPath = path.join(SOCIAL_BACKUP_DIR, backupFile);
              const backupData = JSON.parse(fs.readFileSync(backupPath, "utf8"));
              if (backupData && backupData.preferences) {
                console.log(`Successfully rolled back social store from ${backupFile}`);
                fs.copyFileSync(backupPath, SOCIAL_STORE_PATH);
                return {
                  preferences: backupData.preferences || {},
                  interests: backupData.interests || {},
                  matches: backupData.matches || {},
                  blocks: backupData.blocks || {},
                  reports: Array.isArray(backupData.reports) ? backupData.reports : [],
                };
              }
            } catch {
              // Try next candidate
            }
          }
        }
      } catch (rollbackErr) {
        console.error("Rollback scan failed:", rollbackErr.message);
      }
    }
  }

  return {
    preferences: {},
    interests: {},
    matches: {},
    blocks: {},
    reports: [],
  };
}

let socialStore = loadSocialStore();

function saveSocialStore() {
  const storeDir = path.dirname(SOCIAL_STORE_PATH);
  const tempFile = path.join(
    storeDir,
    `.tmp_${path.basename(SOCIAL_STORE_PATH)}_${Date.now()}_${process.pid}.json`
  );

  try {
    if (!fs.existsSync(storeDir)) {
      fs.mkdirSync(storeDir, { recursive: true });
    }
    if (!fs.existsSync(SOCIAL_BACKUP_DIR)) {
      fs.mkdirSync(SOCIAL_BACKUP_DIR, { recursive: true });
    }

    const payload = JSON.stringify(socialStore, null, 2);

    // Write to temporary file on the same filesystem and sync to storage
    const fd = fs.openSync(tempFile, "w");
    try {
      fs.writeSync(fd, payload, 0, "utf8");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    // Save timestamped backup snapshot from verified temp file
    const backupFile = path.join(
      SOCIAL_BACKUP_DIR,
      `social_discovery_backup_${Date.now()}.json`
    );
    fs.copyFileSync(tempFile, backupFile);

    // Atomic same-filesystem rename with retry backoff for Windows lock tolerance
    let renamed = false;
    let attempts = 0;
    while (!renamed && attempts < 5) {
      try {
        fs.renameSync(tempFile, SOCIAL_STORE_PATH);
        renamed = true;
      } catch (renameErr) {
        attempts++;
        if (attempts >= 5) throw renameErr;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempts * 20);
      }
    }

    // Retain only latest 10 backups
    try {
      const backups = fs
        .readdirSync(SOCIAL_BACKUP_DIR)
        .filter((f) => f.startsWith("social_discovery_backup_") && f.endsWith(".json"))
        .sort();
      while (backups.length > 10) {
        const oldest = backups.shift();
        fs.unlinkSync(path.join(SOCIAL_BACKUP_DIR, oldest));
      }
    } catch {
      // Rotation warning non-fatal
    }
  } catch (err) {
    console.error("Failed to persist social_discovery.json:", err.message);
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch (cleanErr) {
      void cleanErr;
    }
  }
}

let socialStoreLock = Promise.resolve();
function withSocialStoreLock(fn) {
  const next = socialStoreLock.then(() => fn());
  socialStoreLock = next.catch(() => {});
  return next;
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
app.get("/api/social/preferences", requireAuth, (req, res) => {
  const userId = req.user.$id;
  const userPref = socialStore.preferences[userId] || {
    userId,
    discoveryOptIn: false,
    intent: "friends",
    adultConfirmed: false,
    adultConfirmedAt: null,
    bio: "",
    displayName: req.user.name || "",
    username: "",
    selectedFavorites: [],
    readerDna: { genres: {}, themes: {} },
  };

  const myMatches = Object.values(socialStore.matches).filter(
    (m) => m.user1Id === userId || m.user2Id === userId
  );

  const mySentInterests = Object.values(socialStore.interests).filter(
    (i) => i.senderId === userId
  );

  const myBlocks = Object.values(socialStore.blocks).filter(
    (b) => b.blockerId === userId
  );

  res.json({
    preferences: userPref,
    stats: {
      matchesCount: myMatches.length,
      sentInterestsCount: mySentInterests.length,
      blockedCount: myBlocks.length,
    },
  });
});

// 2. Update current user's social discovery preferences
app.put("/api/social/preferences", requireAuth, async (req, res) => {
  const userId = req.user.$id;
  const {
    discoveryOptIn,
    intent,
    adultConfirmed,
    bio,
    displayName,
    username,
    selectedFavorites,
    readerDna,
  } = req.body;

  const validIntent = ["friends", "dating", "both"].includes(intent)
    ? intent
    : "friends";

  // Strict adult verification check for dating discovery
  if ((validIntent === "dating" || validIntent === "both") && !adultConfirmed) {
    return res.status(400).json({
      error:
        "Explicit adult certification (18+) is required to enable dating discovery.",
    });
  }

  await withSocialStoreLock(async () => {
    const existingPref = socialStore.preferences[userId] || {};

    const cleanFavorites = Array.isArray(selectedFavorites)
      ? selectedFavorites.slice(0, 5).map((f) => ({
          id: String(f.id || f.bookId || "").slice(0, 100),
          title: String(f.title || "").slice(0, 200),
          author: String(f.author || "").slice(0, 100),
          coverId: f.coverId ? Number(f.coverId) : null,
        }))
      : existingPref.selectedFavorites || [];

    const updatedPref = {
      userId,
      discoveryOptIn: Boolean(discoveryOptIn),
      intent: validIntent,
      adultConfirmed: Boolean(adultConfirmed),
      adultConfirmedAt:
        adultConfirmed && !existingPref.adultConfirmedAt
          ? new Date().toISOString()
          : existingPref.adultConfirmedAt || null,
      bio: typeof bio === "string" ? bio.trim().slice(0, 500) : existingPref.bio || "",
      displayName:
        typeof displayName === "string"
          ? displayName.trim().slice(0, 50)
          : existingPref.displayName || req.user.name || "Reader",
      username:
        typeof username === "string"
          ? username.trim().slice(0, 30)
          : existingPref.username || "",
      selectedFavorites: cleanFavorites,
      readerDna:
        readerDna && typeof readerDna === "object"
          ? readerDna
          : existingPref.readerDna || { genres: {}, themes: {} },
      updatedAt: new Date().toISOString(),
    };

    socialStore.preferences[userId] = updatedPref;
    saveSocialStore();

    res.json({ success: true, preferences: updatedPref });
  });
});

// 3. Browse compatible opted-in readers
app.get("/api/social/discover", requireAuth, (req, res) => {
  const userId = req.user.$id;
  const userPref = socialStore.preferences[userId];

  // Discovery is disabled by default
  if (!userPref || !userPref.discoveryOptIn) {
    return res.json({
      optedIn: false,
      message:
        "Reader discovery is currently turned off. Opt in from your settings to browse and connect with compatible readers.",
      readers: [],
    });
  }

  const filterIntent = req.query.intent || "all";

  // Find all opted-in candidates
  const candidates = Object.values(socialStore.preferences).filter((candidate) => {
    if (candidate.userId === userId) return false;
    if (!candidate.discoveryOptIn) return false;

    // Filter blocked users (bidirectional)
    if (socialStore.blocks[`${userId}:${candidate.userId}`]) return false;
    if (socialStore.blocks[`${candidate.userId}:${userId}`]) return false;

    // Intent compatibility
    if (filterIntent === "dating" || userPref.intent === "dating") {
      if (!userPref.adultConfirmed || !candidate.adultConfirmed) return false;
      if (candidate.intent !== "dating" && candidate.intent !== "both") return false;
    } else if (filterIntent === "friends" || userPref.intent === "friends") {
      if (candidate.intent !== "friends" && candidate.intent !== "both") return false;
    } else {
      // Intent "both" or "all"
      if (candidate.intent === "dating" && (!userPref.adultConfirmed || !candidate.adultConfirmed)) {
        return false;
      }
    }

    return true;
  });

  // Calculate compatibility, attach match & interest status
  const readers = candidates.map((candidate) => {
    const pairKey = [userId, candidate.userId].sort().join(":");
    const match = socialStore.matches[pairKey];
    const sentInterest = socialStore.interests[`${userId}:${candidate.userId}`];
    const compatibility = calculateLiteraryCompatibility(userPref, candidate);

    return {
      userId: candidate.userId,
      displayName: candidate.displayName || "Anonymous Reader",
      username: candidate.username || "reader",
      bio: candidate.bio || "",
      intent: candidate.intent,
      adultConfirmed: candidate.adultConfirmed,
      selectedFavorites: candidate.selectedFavorites || [],
      readerDnaSummary: {
        topGenres: Object.entries(candidate.readerDna?.genres || {})
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([g]) => g),
      },
      compatibility,
      isMatched: Boolean(match),
      matchType: match?.type || null,
      hasSentInterest: Boolean(sentInterest),
      sentInterestType: sentInterest?.intent || null,
    };
  });

  // Sort: unmatched first, then by highest compatibility score
  readers.sort((a, b) => {
    if (a.isMatched !== b.isMatched) return a.isMatched ? 1 : -1;
    const scoreA = a.compatibility.score ?? -1;
    const scoreB = b.compatibility.score ?? -1;
    return scoreB - scoreA;
  });

  res.json({
    optedIn: true,
    userIntent: userPref.intent,
    adultConfirmed: userPref.adultConfirmed,
    readers,
  });
});

// 4. Express interest in another eligible reader (separate friend vs dating)
app.post("/api/social/interest", requireAuth, async (req, res) => {
  const senderId = req.user.$id;
  const { targetUserId, intent } = req.body;

  if (!targetUserId || targetUserId === senderId) {
    return res.status(400).json({ error: "Invalid target user" });
  }

  const validIntent = intent === "dating" ? "dating" : "friends";

  await withSocialStoreLock(async () => {
    const senderPref = socialStore.preferences[senderId];
    if (!senderPref || !senderPref.discoveryOptIn) {
      return res.status(403).json({ error: "You must opt into discovery to send interest." });
    }

    const targetPref = socialStore.preferences[targetUserId];
    if (!targetPref || !targetPref.discoveryOptIn) {
      return res.status(404).json({ error: "Target reader is not available in discovery." });
    }

    // Check blocks
    if (
      socialStore.blocks[`${senderId}:${targetUserId}`] ||
      socialStore.blocks[`${targetUserId}:${senderId}`]
    ) {
      return res.status(403).json({ error: "Interaction not permitted." });
    }

    // Adult verification check for dating interest
    if (validIntent === "dating") {
      if (!senderPref.adultConfirmed || !targetPref.adultConfirmed) {
        return res.status(400).json({
          error: "Adult eligibility certification required for dating interest.",
        });
      }
    }

    // Check if already matched
    const pairKey = [senderId, targetUserId].sort().join(":");
    if (socialStore.matches[pairKey]) {
      return res.json({
        status: "matched",
        match: socialStore.matches[pairKey],
        message: "You are already mutually matched with this reader.",
      });
    }

    // Check if duplicate identical interest already registered
    const interestKey = `${senderId}:${targetUserId}`;
    const existingInterest = socialStore.interests[interestKey];
    if (existingInterest && existingInterest.intent === validIntent) {
      return res.json({
        status: "interested",
        alreadySent: true,
        message: "Interest already recorded confidentially. If they express mutual interest, you will be matched.",
      });
    }

    // Record interest
    socialStore.interests[interestKey] = {
      id: crypto.randomUUID(),
      senderId,
      targetUserId,
      intent: validIntent,
      createdAt: new Date().toISOString(),
    };

    // Check for mutual interest
    const reverseKey = `${targetUserId}:${senderId}`;
    const reverseInterest = socialStore.interests[reverseKey];

    if (reverseInterest) {
      // Check intent compatibility
      let matchType = null;
      if (reverseInterest.intent === validIntent) {
        matchType = validIntent;
      } else if (senderPref.intent === "both" || targetPref.intent === "both") {
        matchType = validIntent;
      }

      if (matchType) {
        const match = {
          id: crypto.randomUUID(),
          user1Id: [senderId, targetUserId].sort()[0],
          user2Id: [senderId, targetUserId].sort()[1],
          type: matchType,
          matchedAt: new Date().toISOString(),
        };
        socialStore.matches[pairKey] = match;
        saveSocialStore();

        return res.json({
          status: "matched",
          match,
          message: `It's a mutual match! You are now connected for ${matchType}.`,
        });
      }
    }

    saveSocialStore();
    res.json({
      status: "interested",
      message: "Interest sent confidentially. If they express mutual interest, you will be matched.",
    });
  });
});

// 5. Withdraw interest
app.delete("/api/social/interest/:targetUserId", requireAuth, async (req, res) => {
  const senderId = req.user.$id;
  const targetUserId = req.params.targetUserId;

  await withSocialStoreLock(async () => {
    const interestKey = `${senderId}:${targetUserId}`;
    if (socialStore.interests[interestKey]) {
      delete socialStore.interests[interestKey];
    }

    // If a match existed between them, withdraw invalidates the match
    const pairKey = [senderId, targetUserId].sort().join(":");
    if (socialStore.matches[pairKey]) {
      delete socialStore.matches[pairKey];
    }

    saveSocialStore();
    res.json({ success: true, message: "Interest withdrawn." });
  });
});

// 6. Unmatch a connected reader
app.post("/api/social/unmatch", requireAuth, async (req, res) => {
  const userId = req.user.$id;
  const { targetUserId } = req.body;

  if (!targetUserId) {
    return res.status(400).json({ error: "Target user ID required" });
  }

  await withSocialStoreLock(async () => {
    const pairKey = [userId, targetUserId].sort().join(":");
    if (socialStore.matches[pairKey]) {
      delete socialStore.matches[pairKey];
    }

    // Remove interests in both directions
    delete socialStore.interests[`${userId}:${targetUserId}`];
    delete socialStore.interests[`${targetUserId}:${userId}`];

    saveSocialStore();
    res.json({ success: true, message: "Unmatched successfully." });
  });
});

// 7. Block user (hides from discovery, dissolves matches/interests)
app.post("/api/social/block", requireAuth, async (req, res) => {
  const blockerId = req.user.$id;
  const { targetUserId } = req.body;

  if (!targetUserId || targetUserId === blockerId) {
    return res.status(400).json({ error: "Invalid target user" });
  }

  await withSocialStoreLock(async () => {
    const blockKey = `${blockerId}:${targetUserId}`;
    socialStore.blocks[blockKey] = {
      blockerId,
      blockedId: targetUserId,
      createdAt: new Date().toISOString(),
    };

    // Dissolve any existing match
    const pairKey = [blockerId, targetUserId].sort().join(":");
    delete socialStore.matches[pairKey];

    // Dissolve interests in both directions
    delete socialStore.interests[`${blockerId}:${targetUserId}`];
    delete socialStore.interests[`${targetUserId}:${blockerId}`];

    saveSocialStore();
    res.json({
      success: true,
      message: "User blocked. You will no longer see each other in discovery or interactions.",
    });
  });
});

// 8. Unblock user
app.post("/api/social/unblock", requireAuth, async (req, res) => {
  const blockerId = req.user.$id;
  const { targetUserId } = req.body;

  await withSocialStoreLock(async () => {
    const blockKey = `${blockerId}:${targetUserId}`;
    if (socialStore.blocks[blockKey]) {
      delete socialStore.blocks[blockKey];
      saveSocialStore();
    }

    res.json({ success: true, message: "User unblocked." });
  });
});

// 9. List current user's blocked users
app.get("/api/social/blocks", requireAuth, (req, res) => {
  const userId = req.user.$id;
  const blockedIds = Object.values(socialStore.blocks)
    .filter((b) => b.blockerId === userId)
    .map((b) => b.blockedId);

  const blockedUsers = blockedIds.map((id) => {
    const pref = socialStore.preferences[id];
    return {
      userId: id,
      displayName: pref?.displayName || "Reader",
      username: pref?.username || "reader",
    };
  });

  res.json({ blockedUsers });
});

// 10. List current user's mutual matches
app.get("/api/social/matches", requireAuth, (req, res) => {
  const userId = req.user.$id;
  const userPref = socialStore.preferences[userId] || {};

  const matches = Object.values(socialStore.matches)
    .filter((m) => m.user1Id === userId || m.user2Id === userId)
    .map((m) => {
      const partnerId = m.user1Id === userId ? m.user2Id : m.user1Id;
      const partnerPref = socialStore.preferences[partnerId] || {};
      const compatibility = calculateLiteraryCompatibility(userPref, partnerPref);

      return {
        matchId: m.id,
        matchedAt: m.matchedAt,
        type: m.type,
        partner: {
          userId: partnerId,
          displayName: partnerPref.displayName || "Matched Reader",
          username: partnerPref.username || "reader",
          bio: partnerPref.bio || "",
          selectedFavorites: partnerPref.selectedFavorites || [],
          compatibility,
        },
      };
    });

  res.json({ matches });
});

// 11. Report user to secure moderation queue
app.post("/api/social/report", requireAuth, async (req, res) => {
  const reporterId = req.user.$id;
  const { targetUserId, reason, details, autoBlock = true } = req.body;

  const validReasons = [
    "harassment",
    "inappropriate_content",
    "underage_dating",
    "spam",
    "impersonation",
    "other",
  ];

  if (!targetUserId || targetUserId === reporterId) {
    return res.status(400).json({ error: "Invalid target user" });
  }

  if (!validReasons.includes(reason)) {
    return res.status(400).json({ error: "Invalid report reason" });
  }

  await withSocialStoreLock(async () => {
    // Prevent duplicate report spam within short timeframe
    const existingRecent = socialStore.reports.find(
      (r) =>
        r.reporterId === reporterId &&
        r.reportedUserId === targetUserId &&
        r.reason === reason &&
        Date.now() - new Date(r.createdAt).getTime() < 60000
    );

    if (existingRecent) {
      return res.json({
        success: true,
        alreadyReported: true,
        message: "Report already received and queued for review.",
        reportId: existingRecent.id,
      });
    }

    const report = {
      id: crypto.randomUUID(),
      reporterId,
      reportedUserId: targetUserId,
      reason,
      details: typeof details === "string" ? details.trim().slice(0, 1000) : "",
      createdAt: new Date().toISOString(),
      status: "pending",
    };

    socialStore.reports.push(report);

    // Auto-block reported user for immediate safety
    if (autoBlock) {
      const blockKey = `${reporterId}:${targetUserId}`;
      socialStore.blocks[blockKey] = {
        blockerId: reporterId,
        blockedId: targetUserId,
        createdAt: new Date().toISOString(),
        reason: `Report: ${reason}`,
      };
      const pairKey = [reporterId, targetUserId].sort().join(":");
      delete socialStore.matches[pairKey];
      delete socialStore.interests[`${reporterId}:${targetUserId}`];
      delete socialStore.interests[`${targetUserId}:${reporterId}`];
    }

    saveSocialStore();
    res.json({
      success: true,
      message: "Report securely submitted to the moderation queue.",
      reportId: report.id,
    });
  });
});

// 12. Moderation reports overview (Admin-only confidential queue)
app.get("/api/social/reports", requireAuth, (req, res) => {
  const adminKey = req.headers["x-admin-key"] || req.query.adminKey;
  const expectedKey = process.env.DOAB_ADMIN_KEY || process.env.ADMIN_KEY;
  if (!expectedKey || adminKey !== expectedKey) {
    return res.status(403).json({
      error: "Access denied. Confidential moderation queue requires administrator authorization.",
    });
  }

  res.json({
    totalReports: socialStore.reports.length,
    pendingReports: socialStore.reports.filter((r) => r.status === "pending").length,
    reports: socialStore.reports.slice(-50),
  });
});

// 13. Public reader profile details (safe, sanitized, respects blocks)
app.get("/api/social/reader/:targetUserId", requireAuth, (req, res) => {
  const viewerId = req.user.$id;
  const targetId = req.params.targetUserId;

  // Check blocks in either direction
  if (
    socialStore.blocks[`${viewerId}:${targetId}`] ||
    socialStore.blocks[`${targetId}:${viewerId}`]
  ) {
    return res.status(404).json({ error: "Reader not found or unavailable." });
  }

  const targetPref = socialStore.preferences[targetId] || {
    userId: targetId,
    displayName: "Reader",
    username: "reader",
    bio: "",
    intent: "friends",
    selectedFavorites: [],
    readerDna: { genres: {}, themes: {} },
    discoveryOptIn: false,
  };

  const viewerPref = socialStore.preferences[viewerId] || {};
  const compatibility = calculateLiteraryCompatibility(viewerPref, targetPref);
  const pairKey = [viewerId, targetId].sort().join(":");
  const match = socialStore.matches[pairKey];
  const sentInterest = socialStore.interests[`${viewerId}:${targetId}`];

  res.json({
    reader: {
      userId: targetPref.userId,
      displayName: targetPref.displayName || "Reader",
      username: targetPref.username || "reader",
      bio: targetPref.bio || "",
      intent: targetPref.intent || "friends",
      discoveryOptIn: Boolean(targetPref.discoveryOptIn),
      selectedFavorites: targetPref.selectedFavorites || [],
      topGenres: Object.entries(targetPref.readerDna?.genres || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([g]) => g),
      compatibility,
      isMatched: Boolean(match),
      matchType: match?.type || null,
      hasSentInterest: Boolean(sentInterest),
      sentInterestType: sentInterest?.intent || null,
    },
  });
});

app.listen(PORT, () => {
  console.log(`Gutenberg API running on http://localhost:${PORT}`);
});

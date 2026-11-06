import * as cheerio from "cheerio";
import express from "express";
import fs from "node:fs";
import dns from "node:dns";
import crypto from "node:crypto";
import { buildDoabIndex, downloadDoabFeed } from "./scripts/syncDoab.js";

const app = express();
const PORT = 3001;

app.use(express.json());

function loadGutenbergData() {
  try {
    return JSON.parse(fs.readFileSync("./data/gutenberg.json", "utf8"));
  } catch (err) {
    console.error("Failed to load gutenberg.json:", err.message);
    return [];
  }
}

function loadApprovedEpubs() {
  try {
    return JSON.parse(fs.readFileSync("./data/approvedEpubs.json", "utf8"));
  } catch (err) {
    console.error("Failed to load approvedEpubs.json:", err.message);
    return [];
  }
}

let books = loadGutenbergData();
let approvedEpubs = loadApprovedEpubs();

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
  const query = (req.query.q || "").toString().toLowerCase().trim();
  if (!query) {
    return res.json([]);
  }
  const results = books
    .filter((book) => book.title && book.title.toLowerCase().includes(query))
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

app.get("/api/gutenberg/:id/epub", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid Gutenberg ID" });
  }
  const book = books.find((item) => item.id === id);
  if (!book) {
    return res.status(404).json({ error: "Book not found in catalog" });
  }

  approvedEpubs = loadApprovedEpubs();

  const isApproved = approvedEpubs.some(
    (item) => item.id === id && item.status === "approved-for-local-test"
  );
  const filePath = `./public/books/${id}.epub`;
  const exists = fs.existsSync(filePath);
  const available = isApproved && exists;

  res.json({
    id: book.id,
    title: book.title,
    available,
    epubUrl: available ? `/books/${id}.epub` : null,
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
  if (cleanT.length > 5 && doabIndex.titleIndex[cleanT] !== undefined) {
    const candidate = doabIndex.items[doabIndex.titleIndex[cleanT]];
    if (author) {
      const authorLastName = author.trim().split(/\s+/).pop().toLowerCase();
      if (authorLastName.length > 2) {
        if (!candidate.author || !candidate.author.toLowerCase().includes(authorLastName)) {
          return res.json({ matched: false, reason: "author_mismatch" });
        }
      }
    } else if (cleanT.length < 12) {
      return res.json({ matched: false, reason: "short_title_without_author" });
    }
    if (isAllowlistedDoabUrl(candidate.url)) {
      return res.json({
        matched: true,
        matchType: "title_author",
        confidence: 0.85,
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

app.listen(PORT, () => {
  console.log(`Gutenberg API running on http://localhost:${PORT}`);
});

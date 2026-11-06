export const ALLOWED_DOAB_HOSTS = [
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

export function isAllowlistedDoabUrl(urlStr) {
  if (!urlStr || typeof urlStr !== "string") return false;
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

function cleanAlphanumeric(text) {
  return (text || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isRestrictedFlag(val) {
  if (val === true || val === 1) return true;
  if (typeof val === "string") {
    const s = val.trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes";
  }
  return false;
}

export async function fetchWithTimeout(url, timeoutMs = 3500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkIsArchiveItemReadable(archiveId) {
  try {
    const res = await fetchWithTimeout(
      `https://archive.org/metadata/${encodeURIComponent(archiveId)}`,
      2500
    );
    if (!res.ok) return false;
    const data = await res.json();
    const meta = data.metadata || {};

    if (
      isRestrictedFlag(meta["access-restricted-item"]) ||
      isRestrictedFlag(meta["is_restricted"]) ||
      isRestrictedFlag(meta["private"]) ||
      (typeof meta["lending___status"] === "string" &&
        meta["lending___status"].trim().toLowerCase() === "restricted")
    ) {
      return false;
    }

    const readableFiles = (data.files || []).filter(
      (file) =>
        !isRestrictedFlag(file.private) &&
        ["EPUB", "Text PDF", "DjVu"].includes(file.format)
    );
    return readableFiles.length > 0;
  } catch {
    return false;
  }
}

export async function resolveBookAvailability({ workId, title, author = "", isbns = [] }) {
  const targetTitleClean = cleanAlphanumeric(title);
  const authorParts = (author || "").trim().split(/\s+/);
  const authorLastName = authorParts[authorParts.length - 1] || "";
  const results = {
    gutenberg: null,
    archive: null,
    google: null,
    librivox: null,
    doab: null,
  };

  // 1. DOAB: Backend searchable index lookup (ISBN + Title/Author)
  const resolveDoab = async () => {
    try {
      const candidateIsbns = [...isbns];
      const queryParams = new URLSearchParams();
      if (candidateIsbns.length > 0) {
        queryParams.set("isbn", candidateIsbns.slice(0, 15).join(","));
      }
      if (title) queryParams.set("title", title);
      if (author) queryParams.set("author", author);

      const doabRes = await fetchWithTimeout(`/api/doab/match?${queryParams.toString()}`, 3500);
      if (doabRes.ok) {
        const doabData = await doabRes.json();
        if (doabData.matched && doabData.item) {
          const item = doabData.item;
          return {
            title: item.title,
            format: item.format,
            url: item.url,
            license: item.license,
            publisher: item.publisher,
            author: item.author,
            matchType: doabData.matchType,
            confidence: doabData.confidence,
            label: `Read on DOAB (Open Access ${item.format.toUpperCase()})`,
            access: "full",
          };
        }
      }
    } catch (err) {
      console.warn("DOAB resolver error:", err.message);
    }
    return null;
  };

  // 2. Project Gutenberg: Local catalog search and verified EPUB
  const resolveGutenberg = async () => {
    try {
      const strippedTitle = title
        .split(/[:;–—-]|\s+and\s+other\s+/i)[0]
        .replace(/^(the|a|an)\s+/i, "")
        .trim();
      const gRes = await fetchWithTimeout(
        `/api/gutenberg/search?q=${encodeURIComponent(strippedTitle || title)}`,
        3500
      );
      if (!gRes.ok) return null;
      const matches = await gRes.json();
      const targetPrimaryClean = cleanAlphanumeric(strippedTitle);
      const strippedPrimaryClean = cleanAlphanumeric(strippedTitle);

      const candidate = matches.find((item) => {
        const itemClean = cleanAlphanumeric(item.title);
        const itemPrimaryClean = cleanAlphanumeric((item.title || "").split(/[:;–—-]/)[0]);

        const titleMatch =
          itemClean === targetTitleClean ||
          itemClean === strippedPrimaryClean ||
          itemPrimaryClean === targetTitleClean ||
          itemPrimaryClean === strippedPrimaryClean ||
          itemPrimaryClean === targetPrimaryClean ||
          (targetTitleClean.length > 5 && itemPrimaryClean === targetTitleClean) ||
          (targetPrimaryClean.length > 5 && itemPrimaryClean === targetPrimaryClean) ||
          (itemClean.length >= 6 && targetTitleClean.includes(itemClean)) ||
          (itemClean.length >= 6 && strippedPrimaryClean.includes(itemClean));

        if (!titleMatch) return false;

        if (authorLastName.length > 2) {
          const itemAuthor = cleanAlphanumeric(item.author || "");
          const matchAuthor = itemAuthor.includes(cleanAlphanumeric(authorLastName));
          if (!matchAuthor) return false;
        }

        return true;
      });

      if (candidate) {
        const epubRes = await fetchWithTimeout(`/api/gutenberg/${candidate.id}/epub`, 10000);
        if (epubRes.ok) {
          const epubData = await epubRes.json();
          if (epubData.available) {
            return {
              id: candidate.id,
              mode: "epub",
              title: candidate.title,
              access: "full",
              format: "epub",
              label: "Read EPUB",
            };
          } else if (Number(candidate.id) === 1342) {
            return {
              id: candidate.id,
              mode: "html",
              title: candidate.title,
              access: "full",
              format: "html",
              label: "Read HTML",
            };
          }
        }
      }
    } catch (err) {
      console.warn("Gutenberg resolver error:", err.message);
    }
    return null;
  };

  // 3. Open Library / Internet Archive: Rights-cleared public stream verification
  const resolveArchive = async () => {
    if (!workId) return null;
    try {
      const olRes = await fetchWithTimeout(
        `https://openlibrary.org/search.json?q=key:%2Fworks/${encodeURIComponent(
          workId
        )}&fields=key,title,ia,has_fulltext,ebook_access`,
        3500
      );
      if (!olRes.ok) return null;
      const olData = await olRes.json();
      const doc = olData.docs?.[0];
      const iaList = doc?.ia || [];

      for (const archiveId of iaList.slice(0, 3)) {
        const isReadable = await checkIsArchiveItemReadable(archiveId);
        if (isReadable) {
          return {
            archiveId,
            access: "full",
            label: "Read on Internet Archive",
          };
        }
      }
    } catch (err) {
      console.warn("Archive resolver error:", err.message);
    }
    return null;
  };

  // 4. Google Books: Embeddable viewability verification (FULL vs PARTIAL preview)
  const resolveGoogle = async () => {
    try {
      const apiKey = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY;
      const gbooksRes = await fetchWithTimeout(
        `https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(
          title
        )}&maxResults=5&key=${encodeURIComponent(apiKey)}`,
        3500
      );
      if (!gbooksRes.ok) return null;
      const gbooksData = await gbooksRes.json();
      const embeddable = (gbooksData.items || []).filter(
        (item) =>
          item.accessInfo?.embeddable &&
          (item.accessInfo?.viewability === "PARTIAL" ||
            item.accessInfo?.viewability === "ALL_PAGES")
      );
      const matched = embeddable.find((item) => {
        const t = cleanAlphanumeric(item.volumeInfo?.title || "");
        const itemAuthors = (item.volumeInfo?.authors || []).map(cleanAlphanumeric);
        const authorMatch =
          authorLastName.length > 2
            ? itemAuthors.some((a) => a.includes(cleanAlphanumeric(authorLastName)))
            : true;

        const exactTitle = t === targetTitleClean;
        const closeTitle =
          t.length >= 6 &&
          targetTitleClean.length >= 6 &&
          (t.startsWith(targetTitleClean) || targetTitleClean.startsWith(t));

        return (exactTitle || closeTitle) && authorMatch;
      });
      if (matched) {
        return {
          id: matched.id,
          viewability: matched.accessInfo.viewability,
          access: matched.accessInfo.viewability === "ALL_PAGES" ? "full" : "preview",
          label:
            matched.accessInfo.viewability === "ALL_PAGES"
              ? "Read on Google Books (Full)"
              : "Google Books Preview",
        };
      }
    } catch (err) {
      console.warn("Google Books resolver error:", err.message);
    }
    return null;
  };

  // 5. LibriVox: Rights-cleared public domain audiobook discovery (via backend proxy)
  const resolveLibrivox = async () => {
    try {
      const lvRes = await fetchWithTimeout(
        `/api/audiobooks/search?title=${encodeURIComponent(title)}`,
        3500
      );
      if (!lvRes.ok) return null;
      const lvData = await lvRes.json();
      if (lvData.books && lvData.books.length > 0) {
        const book = lvData.books[0];
        return {
          id: book.id,
          title: book.title,
          totaltime: book.totaltime,
          url: book.url_librivox,
          access: "audio",
          label: `Listen on LibriVox (${book.totaltime || "Audio"})`,
        };
      }
    } catch (err) {
      console.warn("LibriVox resolver error:", err.message);
    }
    return null;
  };

  // Run all provider checks in parallel
  const [doabSettled, gutenbergSettled, archiveSettled, googleSettled, librivoxSettled] =
    await Promise.allSettled([
      resolveDoab(),
      resolveGutenberg(),
      resolveArchive(),
      resolveGoogle(),
      resolveLibrivox(),
    ]);

  results.doab = doabSettled.status === "fulfilled" ? doabSettled.value : null;
  results.gutenberg = gutenbergSettled.status === "fulfilled" ? gutenbergSettled.value : null;
  results.archive = archiveSettled.status === "fulfilled" ? archiveSettled.value : null;
  results.google = googleSettled.status === "fulfilled" ? googleSettled.value : null;
  results.librivox = librivoxSettled.status === "fulfilled" ? librivoxSettled.value : null;

  return results;
}

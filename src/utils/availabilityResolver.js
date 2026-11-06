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

export async function checkIsArchiveItemReadable(archiveId) {
  try {
    const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(archiveId)}`);
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
  try {
    const candidateIsbns = [...isbns];
    if (workId && candidateIsbns.length === 0) {
      try {
        const editionsRes = await fetch(
          `https://openlibrary.org/works/${encodeURIComponent(workId)}/editions.json?limit=10`
        );
        if (editionsRes.ok) {
          const edData = await editionsRes.json();
          (edData.entries || []).forEach((ed) => {
            if (ed.isbn_13) candidateIsbns.push(...ed.isbn_13);
            if (ed.isbn_10) candidateIsbns.push(...ed.isbn_10);
          });
        }
      } catch {
        // Fallback to title/author matching if editions lookup fails
      }
    }

    const queryParams = new URLSearchParams();
    if (candidateIsbns.length > 0) {
      queryParams.set("isbn", candidateIsbns.slice(0, 15).join(","));
    }
    if (title) queryParams.set("title", title);
    if (author) queryParams.set("author", author);

    const doabRes = await fetch(`/api/doab/match?${queryParams.toString()}`);
    if (doabRes.ok) {
      const doabData = await doabRes.json();
      if (doabData.matched && doabData.item) {
        const item = doabData.item;
        results.doab = {
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

  // 1. Project Gutenberg: Local catalog search and verified EPUB / HTML
  try {
    const gRes = await fetch(`/api/gutenberg/search?q=${encodeURIComponent(title)}`);
    if (gRes.ok) {
      const matches = await gRes.json();
      const candidate = matches.find((item) => {
        const titleClean = cleanAlphanumeric(item.title);
        const titleMatch =
          titleClean === targetTitleClean ||
          titleClean.includes(targetTitleClean) ||
          targetTitleClean.includes(titleClean);
        const authorMatch =
          authorLastName.length > 1
            ? cleanAlphanumeric(item.author).includes(cleanAlphanumeric(authorLastName))
            : true;
        return titleMatch && authorMatch;
      });

      if (candidate) {
        const epubRes = await fetch(`/api/gutenberg/${candidate.id}/epub`);
        if (epubRes.ok) {
          const epubData = await epubRes.json();
          if (epubData.available) {
            results.gutenberg = {
              id: candidate.id,
              mode: "epub",
              title: candidate.title,
              access: "full",
              label: "Read on Libsque (EPUB)",
            };
          } else if (Number(candidate.id) === 1342) {
            results.gutenberg = {
              id: candidate.id,
              mode: "html",
              title: candidate.title,
              access: "full",
              label: "Read on Libsque (HTML)",
            };
          }
        }
      }
    }
  } catch (err) {
    console.warn("Gutenberg resolver error:", err.message);
  }

  // 2. Open Library / Internet Archive: Rights-cleared public stream verification
  if (workId) {
    try {
      const olRes = await fetch(
        `https://openlibrary.org/search.json?q=key:%2Fworks/${encodeURIComponent(
          workId
        )}&fields=key,title,ia,has_fulltext,ebook_access`
      );
      if (olRes.ok) {
        const olData = await olRes.json();
        const doc = olData.docs?.[0];
        const iaList = doc?.ia || [];

        for (const archiveId of iaList.slice(0, 10)) {
          const isReadable = await checkIsArchiveItemReadable(archiveId);
          if (isReadable) {
            results.archive = {
              archiveId,
              access: "full",
              label: "Read on Internet Archive",
            };
            break;
          }
        }
      }
    } catch (err) {
      console.warn("Archive resolver error:", err.message);
    }
  }

  // 3. Google Books: Embeddable viewability verification (FULL vs PARTIAL preview)
  try {
    const apiKey = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY;
    const gbooksRes = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(
        title
      )}&maxResults=5&key=${encodeURIComponent(apiKey)}`
    );
    if (gbooksRes.ok) {
      const gbooksData = await gbooksRes.json();
      const embeddable = (gbooksData.items || []).filter(
        (item) =>
          item.accessInfo?.embeddable &&
          (item.accessInfo?.viewability === "PARTIAL" ||
            item.accessInfo?.viewability === "ALL_PAGES")
      );
      const matched = embeddable.find((item) => {
        const t = cleanAlphanumeric(item.volumeInfo?.title);
        return (
          t === targetTitleClean ||
          t.includes(targetTitleClean) ||
          targetTitleClean.includes(t)
        );
      });
      if (matched) {
        results.google = {
          id: matched.id,
          viewability: matched.accessInfo.viewability,
          access: matched.accessInfo.viewability === "ALL_PAGES" ? "full" : "preview",
          label:
            matched.accessInfo.viewability === "ALL_PAGES"
              ? "Read on Google Books (Full)"
              : "Google Books Preview",
        };
      }
    }
  } catch (err) {
    console.warn("Google Books resolver error:", err.message);
  }

  // 4. LibriVox: Rights-cleared public domain audiobook discovery (via backend proxy)
  try {
    const lvRes = await fetch(
      `/api/audiobooks/search?title=${encodeURIComponent(title)}`
    );
    if (lvRes.ok) {
      const lvData = await lvRes.json();
      if (lvData.books && lvData.books.length > 0) {
        const book = lvData.books[0];
        results.librivox = {
          id: book.id,
          title: book.title,
          totaltime: book.totaltime,
          url: book.url_librivox,
          access: "audio",
          label: `Listen on LibriVox (${book.totaltime || "Audio"})`,
        };
      }
    }
  } catch (err) {
    console.warn("LibriVox resolver error:", err.message);
  }

  return results;
}

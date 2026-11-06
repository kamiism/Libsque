import ePub from "epubjs";
import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Query } from "appwrite";
import { account, databases } from "../appwrite/config";
import { isAllowlistedDoabUrl } from "../utils/availabilityResolver";

const THEMES = {
  light: {
    bg: "bg-white",
    text: "text-gray-900",
    name: "Light",
    rendition: {
      body: { background: "#ffffff !important", color: "#111827 !important" },
      p: { color: "#111827 !important" },
    },
  },
  dark: {
    bg: "bg-neutral-900",
    text: "text-gray-100",
    name: "Dark",
    rendition: {
      body: { background: "#171717 !important", color: "#f3f4f6 !important" },
      p: { color: "#f3f4f6 !important" },
    },
  },
  sepia: {
    bg: "bg-[#f4ecd8]",
    text: "text-[#594936]",
    name: "Sepia",
    rendition: {
      body: { background: "#f4ecd8 !important", color: "#594936 !important" },
      p: { color: "#594936 !important" },
    },
  },
};

function UnifiedReader() {
  const { source, bookId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const title = searchParams.get("title") || "Libsque Reader";
  const openLibraryWorkId = searchParams.get("workId");
  const directUrl = searchParams.get("url");
  const publisher = searchParams.get("publisher");
  const license = searchParams.get("license");

  const isUrlBlocked = directUrl ? !isAllowlistedDoabUrl(directUrl) : false;
  const [fontSize, setFontSize] = useState(() => {
    const saved = Number(localStorage.getItem("readerFontSize"));
    return saved >= 14 && saved <= 32 ? saved : 18;
  });

  const [themeKey, setThemeKey] = useState(() => {
    const saved = localStorage.getItem("readerTheme");
    return THEMES[saved] ? saved : "light";
  });

  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(() => !isUrlBlocked);
  const [error, setError] = useState(() =>
    isUrlBlocked ? "Untrusted or unverified book source URL." : ""
  );
  const [currentChapter, setCurrentChapter] = useState(() => {
    const chapterStorageKey = `gutenberg_${bookId}_chapter`;
    const saved = Number(localStorage.getItem(chapterStorageKey));
    return Number.isInteger(saved) && saved >= 1 ? saved : 1;
  });
  const [htmlBookData, setHtmlBookData] = useState(null);

  const epubViewerRef = useRef(null);
  const renditionRef = useRef(null);
  const bookRef = useRef(null);
  const libraryEntryIdRef = useRef(null);
  const progressSaveTimerRef = useRef(null);
  const pendingPercentRef = useRef(null);
  const lastSavedPercentRef = useRef(null);

  // Synchronous/immediate flush of pending progress to Appwrite
  const flushProgress = useCallback(async () => {
    if (progressSaveTimerRef.current) {
      clearTimeout(progressSaveTimerRef.current);
      progressSaveTimerRef.current = null;
    }
    const docId = libraryEntryIdRef.current;
    const target = pendingPercentRef.current;
    if (!docId || target == null || lastSavedPercentRef.current === target) {
      return;
    }
    try {
      await databases.updateDocument(
        import.meta.env.VITE_APPWRITE_DATABASE_ID,
        import.meta.env.VITE_APPWRITE_LIBRARY_COLLECTION_ID,
        docId,
        { progress: target }
      );
      lastSavedPercentRef.current = target;
    } catch (err) {
      console.warn("Could not save progress to Appwrite:", err.message);
    }
  }, []);

  // Sync typography preferences to localStorage
  useEffect(() => {
    localStorage.setItem("readerFontSize", fontSize.toString());
    localStorage.setItem("readerTheme", themeKey);
  }, [fontSize, themeKey]);

  // Lookup Appwrite library entry if workId provided, to sync progress
  useEffect(() => {
    let isCancelled = false;
    async function fetchLibraryEntry() {
      if (!openLibraryWorkId) return;
      try {
        const user = await account.get();
        if (isCancelled) return;
        const result = await databases.listDocuments(
          import.meta.env.VITE_APPWRITE_DATABASE_ID,
          import.meta.env.VITE_APPWRITE_LIBRARY_COLLECTION_ID,
          [
            Query.equal("userId", user.$id),
            Query.equal("bookId", openLibraryWorkId),
          ]
        );
        if (!isCancelled && result.documents?.length > 0) {
          libraryEntryIdRef.current = result.documents[0].$id;
          if (result.documents[0].progress != null) {
            setProgress(result.documents[0].progress);
            lastSavedPercentRef.current = result.documents[0].progress;
          }
        }
      } catch {
        // Unauthenticated or entry not in library yet
      }
    }
    fetchLibraryEntry();
    return () => {
      isCancelled = true;
    };
  }, [openLibraryWorkId]);

  // Flush on unmount if any pending progress was queued
  useEffect(() => {
    return () => {
      flushProgress();
    };
  }, [flushProgress]);

  // Debounced progress updater to Appwrite
  const persistProgress = useCallback((newPercent) => {
    const validPercent = Math.min(100, Math.max(0, Math.round(newPercent)));
    setProgress(validPercent);
    pendingPercentRef.current = validPercent;

    if (progressSaveTimerRef.current) {
      clearTimeout(progressSaveTimerRef.current);
    }

    progressSaveTimerRef.current = setTimeout(() => {
      flushProgress();
    }, 1000);
  }, [flushProgress]);

  useEffect(() => {
    if (source !== "epub") return;
    if (!epubViewerRef.current) return;
    if (isUrlBlocked) return;

    let isMounted = true;

    let epubPath = `/books/${encodeURIComponent(bookId)}.epub`;
    if (directUrl && source === "epub") {
      epubPath = directUrl.startsWith("http")
        ? `/api/doab/proxy?url=${encodeURIComponent(directUrl)}`
        : directUrl;
    }
    const book = ePub(epubPath, { openAs: "epub" });
    bookRef.current = book;

    const rendition = book.renderTo(epubViewerRef.current, {
      width: "100%",
      height: "75vh",
      flow: "paginated",
    });
    renditionRef.current = rendition;
    rendition.themes.fontSize(`${fontSize}px`);
    Object.entries(THEMES).forEach(([key, cfg]) => {
      rendition.themes.register(key, cfg.rendition);
    });
    rendition.themes.select(themeKey);

    const storageLocationKey = `libsque_epub_loc_${bookId}`;
    const savedLocation = localStorage.getItem(storageLocationKey);

    book.ready
      .then(() => {
        if (!isMounted) return;
        return book.locations.generate(1024);
      })
      .then(() => {
        if (!isMounted) return;
        return rendition.display(savedLocation || undefined);
      })
      .then(() => {
        if (isMounted) setLoading(false);
      })
      .catch((err) => {
        if (isMounted) {
          console.error("EPUB load error:", err);
          setError("Could not display this EPUB file.");
          setLoading(false);
        }
      });

    rendition.on("relocated", (location) => {
      if (!isMounted) return;
      if (location?.start?.cfi) {
        localStorage.setItem(storageLocationKey, location.start.cfi);
      }
      if (location?.start?.percentage != null) {
        persistProgress(location.start.percentage * 100);
      }
    });

    return () => {
      isMounted = false;
      try {
        rendition.destroy();
        book.destroy();
      } catch (e) {
        void e;
      }
    };
  }, [source, bookId, directUrl, persistProgress, fontSize, themeKey, isUrlBlocked]);

  useEffect(() => {
    if (source === "epub" && renditionRef.current) {
      renditionRef.current.themes.fontSize(`${fontSize}px`);
      renditionRef.current.themes.select(themeKey);
    }
  }, [source, fontSize, themeKey]);

  useEffect(() => {
    if (source !== "html") return;

    const chapterStorageKey = `gutenberg_${bookId}_chapter`;
    async function fetchChapter(chap) {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/gutenberg/${bookId}/chapter/${chap}`);
        if (!res.ok) throw new Error(`Failed to load chapter (${res.status})`);
        const data = await res.json();
        setHtmlBookData(data);
        localStorage.setItem(chapterStorageKey, chap.toString());
        const total = data.totalChapters || 61;
        persistProgress(((chap - 1) / total) * 100);
      } catch (err) {
        setError(err.message || "Failed to load chapter");
      } finally {
        setLoading(false);
      }
    }

    fetchChapter(currentChapter);
  }, [source, bookId, currentChapter, persistProgress]);

  const getEmbedUrl = () => {
    if (source === "ia") {
      return `https://archive.org/stream/${encodeURIComponent(bookId)}?ui=embed`;
    }
    if (source === "google") {
      const isIsbn = /^[0-9X]{10,13}$/i.test(bookId);
      const param = isIsbn ? `vid=ISBN${encodeURIComponent(bookId)}` : `id=${encodeURIComponent(bookId)}`;
      return `https://books.google.com/books?${param}&printsec=frontcover&output=embed`;
    }
    if (source === "doab" || source === "pdf") {
      const urlParam = searchParams.get("url");
      if (!urlParam) return null;
      if (!isAllowlistedDoabUrl(urlParam)) {
        return null;
      }
      return urlParam;
    }
    return null;
  };

  const embedUrl = getEmbedUrl();
  const currentTheme = THEMES[themeKey];

  return (
    <div className={`w-full min-h-screen flex flex-col ${currentTheme.bg} ${currentTheme.text}`}>
      <header className="border-b px-4 py-3 flex items-center justify-between border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="border rounded px-3 py-1.5 text-sm hover:opacity-80 transition cursor-pointer"
          >
            ← Back
          </button>
          <div>
            <h1 className="font-bold text-base leading-tight truncate max-w-xs md:max-w-md">
              {title}
            </h1>
            <p className="text-xs opacity-60">
              Source: {source.toUpperCase()} {publisher ? `• ${publisher}` : ""} {license ? `• ${license}` : ""} {progress > 0 ? `• ${progress}% read` : ""}
            </p>
          </div>
        </div>

        {(source === "epub" || source === "html") && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-sm">
              <button
                onClick={() => setFontSize((s) => Math.max(14, s - 2))}
                className="border rounded px-2 py-1 text-xs"
                title="Decrease font size"
              >
                A-
              </button>
              <span className="w-8 text-center text-xs">{fontSize}px</span>
              <button
                onClick={() => setFontSize((s) => Math.min(32, s + 2))}
                className="border rounded px-2 py-1 text-xs"
                title="Increase font size"
              >
                A+
              </button>
            </div>

            <div className="flex border rounded overflow-hidden text-xs">
              {Object.entries(THEMES).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => setThemeKey(key)}
                  className={`px-2.5 py-1 ${
                    themeKey === key
                      ? "bg-black text-white dark:bg-white dark:text-black font-semibold"
                      : "opacity-75 hover:opacity-100"
                  }`}
                >
                  {cfg.name}
                </button>
              ))}
            </div>

            {source === "html" && htmlBookData && (
              <select
                value={currentChapter}
                onChange={(e) => {
                  setCurrentChapter(Number(e.target.value));
                  window.scrollTo(0, 0);
                }}
                className="border rounded px-2 py-1 text-xs bg-transparent"
              >
                {Array.from({ length: htmlBookData.totalChapters || 61 }, (_, i) => (
                  <option key={i + 1} value={i + 1} className="text-black bg-white">
                    Ch. {i + 1}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </header>

      <main className="flex-1 flex flex-col relative">
        {error && (
          <div className="p-8 text-center max-w-xl mx-auto">
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-6 mb-4">
              <p className="text-red-700 dark:text-red-400 font-semibold mb-2">{error}</p>
              <p className="text-sm text-red-600 dark:text-red-300 mb-4">
                This book source could not be rendered directly in the embedded reader.
              </p>
              {directUrl && isAllowlistedDoabUrl(directUrl) && (
                <a
                  href={directUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 px-4 py-2 rounded text-sm font-medium hover:opacity-90 transition mb-3"
                >
                  Open Official Publication Directly ↗
                </a>
              )}
            </div>
            <button
              onClick={() => navigate(-1)}
              className="border rounded px-4 py-2 text-sm hover:opacity-80 transition cursor-pointer"
            >
              ← Back to Book Details
            </button>
          </div>
        )}

        {source === "epub" && (
          <div className="flex-1 flex flex-col p-4 max-w-4xl w-full mx-auto">
            {loading && !error && (
              <div className="p-12 text-center opacity-70">Loading EPUB book...</div>
            )}
            <div
              ref={epubViewerRef}
              className="w-full border rounded-lg overflow-hidden shadow-sm"
              style={{ height: "75vh" }}
            />
            <div className="flex justify-between items-center py-4">
              <button
                onClick={() => renditionRef.current?.prev()}
                className="border rounded px-5 py-2 text-sm hover:opacity-80 transition cursor-pointer"
              >
                ← Previous Page
              </button>
              <span className="text-xs opacity-60">
                {progress > 0 ? `${progress}% complete` : "Reading"}
              </span>
              <button
                onClick={() => renditionRef.current?.next()}
                className="border rounded px-5 py-2 text-sm hover:opacity-80 transition cursor-pointer"
              >
                Next Page →
              </button>
            </div>
          </div>
        )}

        {source === "html" && (
          <div className="max-w-3xl mx-auto px-6 py-8 w-full">
            {loading && <p className="opacity-70">Loading chapter...</p>}
            {!loading && htmlBookData && (
              <article>
                <h2 className="text-2xl font-bold mb-2">{htmlBookData.title}</h2>
                <h3 className="text-lg opacity-80 mb-6">Chapter {htmlBookData.chapter}</h3>
                <div
                  className="space-y-5 leading-relaxed"
                  style={{ fontSize: `${fontSize}px` }}
                >
                  {htmlBookData.paragraphs.map((p, idx) => (
                    <p key={idx}>{p}</p>
                  ))}
                </div>
                <div className="flex justify-between border-t mt-12 pt-6">
                  <button
                    disabled={currentChapter <= 1}
                    onClick={() => {
                      setCurrentChapter((c) => Math.max(1, c - 1));
                      window.scrollTo(0, 0);
                    }}
                    className="border rounded px-4 py-2 text-sm disabled:opacity-40"
                  >
                    ← Previous Chapter
                  </button>
                  <button
                    disabled={currentChapter >= (htmlBookData.totalChapters || 61)}
                    onClick={() => {
                      setCurrentChapter((c) => c + 1);
                      window.scrollTo(0, 0);
                    }}
                    className="border rounded px-4 py-2 text-sm disabled:opacity-40"
                  >
                    Next Chapter →
                  </button>
                </div>
              </article>
            )}
          </div>
        )}

        {(source === "ia" || source === "google" || source === "doab" || source === "pdf") && embedUrl && !error && (
          <div className="flex-1 flex flex-col w-full h-full relative">
            <iframe
              key={embedUrl}
              src={embedUrl}
              className="w-full flex-1 border-0 min-h-[85vh]"
              title={title}
              allow="fullscreen"
            />
            {(source === "doab" || source === "pdf") && directUrl && (
              <div className="p-3 text-center border-t text-xs opacity-75 bg-neutral-50 dark:bg-neutral-800">
                <span>Reading official Open Access publication. If display is restricted by browser settings: </span>
                <a
                  href={directUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-semibold hover:opacity-100 ml-1"
                >
                  Open bitstream directly ↗
                </a>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default UnifiedReader;
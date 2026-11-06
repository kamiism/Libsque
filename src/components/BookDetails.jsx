import { ID, Permission, Query, Role } from "appwrite";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { account, databases } from "../appwrite/config";
import { resolveBookAvailability } from "../utils/availabilityResolver";
import { normalizeSubjects } from "../utils/subjectNormalizer";

function BookDetails() {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const [book, setBook] = useState(null);
  const [author, setAuthor] = useState("Unknown author");
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [libraryEntry, setLibraryEntry] = useState(null);
  const [progress, setProgress] = useState(0);
  const [tasteData, setTasteData] = useState({
    genres: [],
    themes: [],
  });
  const [gutenbergOption, setGutenbergOption] = useState(null);
  const [archiveOption, setArchiveOption] = useState(null);
  const [googleOption, setGoogleOption] = useState(null);
  const [librivoxOption, setLibrivoxOption] = useState(null);
  const [doabOption, setDoabOption] = useState(null);
  const [checkingReaders, setCheckingReaders] = useState(true);

  async function addToLibrary(status) {
    try {
      const user = await account.get();
      const existing = await databases.listDocuments(
        import.meta.env.VITE_APPWRITE_DATABASE_ID,
        import.meta.env.VITE_APPWRITE_LIBRARY_COLLECTION_ID,
        [
          Query.equal("userId", user.$id),
          Query.equal("bookId", bookId),
        ]
      );
      if (existing.documents.length > 0) {
        const document = existing.documents[0];
        const updated = await databases.updateDocument(
          import.meta.env.VITE_APPWRITE_DATABASE_ID,
          import.meta.env.VITE_APPWRITE_LIBRARY_COLLECTION_ID,
          document.$id,
          { status }
        );
        setLibraryEntry(updated);
        alert(`Status changed to ${status}`);
        return;
      }
      const created = await databases.createDocument(
        import.meta.env.VITE_APPWRITE_DATABASE_ID,
        import.meta.env.VITE_APPWRITE_LIBRARY_COLLECTION_ID,
        ID.unique(),
        {
          userId: user.$id,
          bookId: bookId,
          title: book.title,
          author: author,
          coverId: book?.covers?.[0] || null,
          status: status,
          rating: null,
          favorite: false,
          progress: 0,
          genres: tasteData.genres,
          themes: tasteData.themes,
        },
        [
          Permission.read(Role.user(user.$id)),
          Permission.update(Role.user(user.$id)),
          Permission.delete(Role.user(user.$id)),
        ]
      );
      setLibraryEntry(created);
      alert("Added to your library");
    } catch (error) {
      console.error("Failed to update library:", error);
      alert(error.message);
    }
  }

  async function rateBook(newRating) {
    try {
      const user = await account.get();
      const existing = await databases.listDocuments(
        import.meta.env.VITE_APPWRITE_DATABASE_ID,
        import.meta.env.VITE_APPWRITE_LIBRARY_COLLECTION_ID,
        [
          Query.equal("userId", user.$id),
          Query.equal("bookId", bookId),
        ]
      );
      if (existing.documents.length === 0) {
        alert("Add this book to your library before rating it.");
        return;
      }
      const document = existing.documents[0];
      const updated = await databases.updateDocument(
        import.meta.env.VITE_APPWRITE_DATABASE_ID,
        import.meta.env.VITE_APPWRITE_LIBRARY_COLLECTION_ID,
        document.$id,
        { rating: newRating }
      );
      setLibraryEntry(updated);
      setRating(newRating);
    } catch (error) {
      console.error("Rating failed:", error);
      alert(error.message);
    }
  }

  async function toggleFavorite() {
    try {
      if (!libraryEntry) {
        alert("Add this book to your library first.");
        return;
      }
      const newFavorite = !libraryEntry.favorite;
      const updated = await databases.updateDocument(
        import.meta.env.VITE_APPWRITE_DATABASE_ID,
        import.meta.env.VITE_APPWRITE_LIBRARY_COLLECTION_ID,
        libraryEntry.$id,
        { favorite: newFavorite }
      );
      setLibraryEntry(updated);
    } catch (error) {
      console.error("Favorite update failed:", error);
      alert(error.message);
    }
  }

  async function updateProgress(newProgress) {
    try {
      if (!libraryEntry) return;
      const updated = await databases.updateDocument(
        import.meta.env.VITE_APPWRITE_DATABASE_ID,
        import.meta.env.VITE_APPWRITE_LIBRARY_COLLECTION_ID,
        libraryEntry.$id,
        { progress: Number(newProgress) }
      );
      setLibraryEntry(updated);
      setProgress(updated.progress);
    } catch (error) {
      console.error("Progress update failed:", error);
      alert(error.message);
    }
  }

  useEffect(() => {
    let isCancelled = false;

    async function loadLibraryEntry() {
      try {
        const user = await account.get();
        if (isCancelled) return;
        const result = await databases.listDocuments(
          import.meta.env.VITE_APPWRITE_DATABASE_ID,
          import.meta.env.VITE_APPWRITE_LIBRARY_COLLECTION_ID,
          [
            Query.equal("userId", user.$id),
            Query.equal("bookId", bookId),
          ]
        );
        if (!isCancelled && result.documents.length > 0) {
          const entry = result.documents[0];
          setLibraryEntry(entry);
          setRating(entry.rating || 0);
          setProgress(entry.progress || 0);
        } else if (!isCancelled) {
          setLibraryEntry(null);
          setRating(0);
          setProgress(0);
        }
      } catch (error) {
        console.warn("Library entry not loaded:", error?.message);
      }
    }

    async function checkReadingAvailability(bookTitle, bookAuthorName) {
      setCheckingReaders(true);
      setGutenbergOption(null);
      setArchiveOption(null);
      setGoogleOption(null);
      setLibrivoxOption(null);

      try {
        const availability = await resolveBookAvailability({
          workId: bookId,
          title: bookTitle,
          author: bookAuthorName,
        });

        if (!isCancelled) {
          setGutenbergOption(availability.gutenberg);
          setArchiveOption(availability.archive);
          setGoogleOption(availability.google);
          setLibrivoxOption(availability.librivox);
          setDoabOption(availability.doab);
        }
      } catch (err) {
        console.warn("Availability resolution failed:", err);
      } finally {
        if (!isCancelled) {
          setCheckingReaders(false);
        }
      }
    }

    async function getBook() {
      try {
        const response = await fetch(`https://openlibrary.org/works/${bookId}.json`);
        if (!response.ok) throw new Error("Book not found");
        const data = await response.json();
        if (isCancelled) return;
        setBook(data);

        const normalizedTaste = normalizeSubjects(data.subjects);
        setTasteData(normalizedTaste);

        let bookAuthor = "Unknown author";
        if (data.authors?.length > 0) {
          const authorKey = data.authors[0].author?.key;
          if (authorKey) {
            const authorResponse = await fetch(`https://openlibrary.org${authorKey}.json`);
            if (authorResponse.ok) {
              const authorData = await authorResponse.json();
              bookAuthor = authorData.name || "Unknown author";
            }
          }
        }
        if (!isCancelled) {
          setAuthor(bookAuthor);
          checkReadingAvailability(data.title, bookAuthor);
        }
      } catch (error) {
        console.error("Failed to get book:", error);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }
    getBook();
    loadLibraryEntry();

    return () => {
      isCancelled = true;
    };
  }, [bookId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F0FAEF] flex items-center justify-center p-10">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-3 border-[#A8DADB] border-t-[#E73847] rounded-full animate-spin mb-4" />
          <p className="font-mono text-sm text-[#1D3557]/70">Loading book...</p>
        </div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="min-h-screen bg-[#F0FAEF] flex items-center justify-center p-10">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-serif font-bold text-[#1D3557] mb-2">Book not found</h1>
          <p className="text-sm text-[#1D3557]/70 mb-6">This edition may have been moved or removed from the catalog.</p>
          <button
            onClick={() => navigate(-1)}
            className="px-5 py-2.5 bg-[#1D3557] text-[#F0FAEF] rounded-xl text-sm font-semibold cursor-pointer"
          >
            ← Back to discovery
          </button>
        </div>
      </div>
    );
  }

  const description =
    typeof book.description === "string"
      ? book.description
      : book.description?.value;
  const coverId = book.covers?.[0];

  return (
    <div className="min-h-screen bg-[#F0FAEF] text-[#1D3557]">
      <main className="max-w-6xl mx-auto px-6 py-10">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#457B9D] hover:text-[#1D3557] transition mb-8 cursor-pointer"
        >
          ← Back
        </button>

        <div className="grid md:grid-cols-[280px_1fr] gap-10 items-start">
          {/* Cover Art Column */}
          <div className="sticky top-24">
            <div className="bg-white p-3 rounded-2xl border border-[#1D3557]/15 shadow-sm overflow-hidden">
              {coverId ? (
                <img
                  src={`https://covers.openlibrary.org/b/id/${coverId}-L.jpg`}
                  alt={book.title}
                  className="w-full aspect-2/3 object-cover rounded-xl"
                />
              ) : (
                <div className="w-full aspect-2/3 bg-[#F0FAEF] border border-[#1D3557]/10 rounded-xl flex flex-col justify-between p-6 text-[#1D3557]">
                  <span className="text-xs uppercase font-mono tracking-wider opacity-60">
                    Open Library Work
                  </span>
                  <div>
                    <h3 className="font-serif font-bold text-xl leading-tight mb-2">
                      {book.title}
                    </h3>
                    <p className="text-sm text-[#457B9D] font-medium">{author}</p>
                  </div>
                  <span className="text-xs font-mono text-[#E73847]">
                    LIBSQUE
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Details Column */}
          <div className="space-y-8">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {tasteData.genres.slice(0, 3).map((g) => (
                  <span
                    key={g}
                    className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1 bg-[#A8DADB]/40 text-[#1D3557] rounded-full border border-[#1D3557]/10"
                  >
                    {g}
                  </span>
                ))}
              </div>

              <h1 className="text-3xl sm:text-5xl font-bold font-serif leading-tight tracking-tight text-[#1D3557]">
                {book.title}
              </h1>
              <p className="text-xl text-[#457B9D] font-medium mt-2 font-serif italic">
                by {author}
              </p>

              {description ? (
                <div className="mt-6 text-[#1D3557]/80 leading-relaxed space-y-4 max-w-2xl text-sm sm:text-base">
                  <p>{description}</p>
                </div>
              ) : (
                <p className="mt-6 text-[#1D3557]/40 italic text-sm">
                  No editorial description logged for this edition.
                </p>
              )}
            </div>

            {/* Bookshelf status controls */}
            <div className="p-6 bg-white rounded-2xl border border-[#1D3557]/12 shadow-[0_4px_0_0_rgba(29,53,87,0.06)]">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-[#457B9D]">
                  Bookshelf Status
                </h2>
                {libraryEntry && (
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#E73847]/10 text-[#E73847]">
                    Shelved as {libraryEntry.status.replaceAll("_", " ")}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2.5">
                {[
                  { key: "want_to_read", label: "Want to Read" },
                  { key: "reading", label: "Currently Reading" },
                  { key: "read", label: "Finished" },
                ].map((item) => {
                  const isSelected = libraryEntry?.status === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={() => addToLibrary(item.key)}
                      className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold tracking-wide transition cursor-pointer ${
                        isSelected
                          ? "bg-[#1D3557] text-[#F0FAEF] shadow-[0_3px_0_0_#122238]"
                          : "bg-white border border-[#1D3557]/20 text-[#1D3557] hover:bg-[#A8DADB]/20"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>

              {libraryEntry?.status === "reading" && (
                <div className="mt-5 pt-5 border-t border-[#1D3557]/10 max-w-sm">
                  <div className="flex justify-between items-baseline mb-2">
                    <span className="text-xs font-semibold text-[#1D3557]">Reading Progress</span>
                    <span className="text-xs font-mono font-bold text-[#E73847]">{progress}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={progress}
                    onChange={(e) => setProgress(Number(e.target.value))}
                    onMouseUp={(e) => updateProgress(e.target.value)}
                    className="w-full accent-[#E73847] cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* Reading Options */}
            <div className="p-6 bg-white rounded-2xl border border-[#1D3557]/12 shadow-xs space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-[#457B9D]">
                Available Formats
              </h2>

              {checkingReaders ? (
                <p className="text-xs text-[#1D3557]/60 font-mono">Checking available formats...</p>
              ) : (
                <div className="flex flex-wrap gap-3 items-center">
                  {gutenbergOption && (
                    <button
                      onClick={() => {
                        navigate(
                          `/read/${gutenbergOption.mode}/${gutenbergOption.id}?title=${encodeURIComponent(
                            book.title
                          )}&workId=${encodeURIComponent(bookId)}`
                        );
                      }}
                      className="bg-[#E73847] hover:bg-[#C62635] text-white px-5 py-2.5 rounded-xl cursor-pointer transition text-xs sm:text-sm font-semibold tracking-wide shadow-xs"
                    >
                      Read EPUB
                    </button>
                  )}

                  {doabOption && (
                    <div className="flex flex-col gap-1">
                      <Link
                        to={`/read/${doabOption.format}/${encodeURIComponent(
                          bookId
                        )}?title=${encodeURIComponent(book.title)}&workId=${encodeURIComponent(
                          bookId
                        )}&url=${encodeURIComponent(doabOption.url)}&publisher=${encodeURIComponent(
                          doabOption.publisher || ""
                        )}&license=${encodeURIComponent(doabOption.license || "")}`}
                        className="bg-[#A8DADB] hover:bg-[#8cc7c8] text-[#1D3557] px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold tracking-wide transition shadow-xs border border-[#1D3557]/20"
                      >
                        {doabOption.label}
                      </Link>
                      <span className="text-[11px] text-[#1D3557]/60 font-mono">
                        {doabOption.publisher ? `${doabOption.publisher} • ` : ""}
                        {doabOption.license || "Open Access"}
                      </span>
                    </div>
                  )}

                  {archiveOption && (
                    <Link
                      to={`/read/ia/${encodeURIComponent(archiveOption.archiveId)}?title=${encodeURIComponent(
                        book.title
                      )}&workId=${encodeURIComponent(bookId)}`}
                      className="bg-white border border-[#1D3557]/25 text-[#1D3557] px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold hover:bg-[#A8DADB]/20 transition"
                    >
                      Internet Archive Viewer
                    </Link>
                  )}

                  {googleOption && (
                    <Link
                      to={`/read/google/${encodeURIComponent(googleOption.id)}?title=${encodeURIComponent(
                        book.title
                      )}&workId=${encodeURIComponent(bookId)}`}
                      className="bg-white border border-[#1D3557]/25 text-[#1D3557] px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold hover:bg-[#A8DADB]/20 transition"
                    >
                      {googleOption.label}
                    </Link>
                  )}

                  {librivoxOption && (
                    <a
                      href={librivoxOption.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-white border border-[#1D3557]/25 text-[#1D3557] px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold hover:bg-[#A8DADB]/20 transition"
                    >
                      🎧 {librivoxOption.label} ↗
                    </a>
                  )}

                  {!gutenbergOption && !archiveOption && !googleOption && !doabOption && !librivoxOption && (
                    <p className="text-xs text-[#1D3557]/60 italic">
                      No public domain reader or preview available for this edition.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Rating and Favourites */}
            <div className="flex flex-wrap items-center justify-between gap-6 pt-4 border-t border-[#1D3557]/10">
              <div>
                <p className="text-xs uppercase font-mono font-bold text-[#457B9D] mb-1.5">
                  Your Rating
                </p>
                <div className="flex gap-1.5 text-2xl">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => rateBook(star)}
                      className={`cursor-pointer transition-transform hover:scale-120 ${
                        star <= rating ? "text-[#E73847]" : "text-[#1D3557]/20"
                      }`}
                      title={`Rate ${star} star`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={toggleFavorite}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer flex items-center gap-2 ${
                  libraryEntry?.favorite
                    ? "bg-[#E73847] text-white shadow-xs"
                    : "bg-white border border-[#1D3557]/20 text-[#1D3557] hover:bg-[#E73847]/10"
                }`}
              >
                <span>{libraryEntry?.favorite ? "♥" : "♡"}</span>
                <span>{libraryEntry?.favorite ? "In Favourites" : "Add to favourites"}</span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default BookDetails;

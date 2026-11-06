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
    return <div className="min-h-screen bg-stone-100 p-10">Loading...</div>;
  }

  if (!book) {
    return <div className="min-h-screen bg-stone-100 p-10">Book not found</div>;
  }

  const description =
    typeof book.description === "string"
      ? book.description
      : book.description?.value;
  const coverId = book.covers?.[0];

  return (
    <div className="min-h-screen bg-stone-100">
      <main className="max-w-5xl mx-auto px-8 py-10">
        <div className="grid md:grid-cols-[280px_1fr] gap-12">
          <div>
            {coverId ? (
              <img
                src={`https://covers.openlibrary.org/b/id/${coverId}-L.jpg`}
                alt={book.title}
                className="w-full rounded-lg shadow-sm"
              />
            ) : (
              <div className="aspect-2/3 bg-stone-300 rounded-lg flex items-center justify-center text-stone-500">
                No Cover
              </div>
            )}
          </div>

          <div>
            <h1 className="text-5xl font-bold">{book.title}</h1>
            <p className="text-lg text-stone-600 mb-2">{author}</p>
            {description ? (
              <p className="mt-6 text-stone-600 leading-7">{description}</p>
            ) : (
              <p className="mt-6 text-stone-400">No description available.</p>
            )}

            {libraryEntry && (
              <p className="mt-4 mb-3 text-sm text-stone-500">
                Currently: {libraryEntry.status.replaceAll("_", " ")}
              </p>
            )}

            <div className="flex flex-wrap gap-3 mt-6">
              <button
                onClick={() => addToLibrary("want_to_read")}
                className={`px-4 py-2 rounded-lg cursor-pointer transition ${
                  libraryEntry?.status === "want_to_read"
                    ? "bg-black text-white"
                    : "border border-stone-300 hover:bg-stone-200"
                }`}
              >
                Want to Read
              </button>
              <button
                onClick={() => addToLibrary("reading")}
                className={`px-4 py-2 rounded-lg cursor-pointer transition ${
                  libraryEntry?.status === "reading"
                    ? "bg-black text-white"
                    : "border border-stone-300 hover:bg-stone-200"
                }`}
              >
                Reading
              </button>
              <button
                onClick={() => addToLibrary("read")}
                className={`px-4 py-2 rounded-lg cursor-pointer transition ${
                  libraryEntry?.status === "read"
                    ? "bg-black text-white"
                    : "border border-stone-300 hover:bg-stone-200"
                }`}
              >
                Read
              </button>
            </div>

            <div className="mt-8 pt-6 border-t border-stone-200">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-500 mb-3">
                Reading Options
              </h2>
              {checkingReaders ? (
                <p className="text-sm text-stone-400">Checking reading availability...</p>
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
                      className="bg-black text-white px-5 py-2.5 rounded-lg cursor-pointer hover:bg-stone-800 transition text-sm font-medium"
                    >
                      Read on Libsque (EPUB)
                    </button>
                  )}

                  {archiveOption && (
                    <Link
                      to={`/read/ia/${encodeURIComponent(archiveOption.archiveId)}?title=${encodeURIComponent(
                        book.title
                      )}&workId=${encodeURIComponent(bookId)}`}
                      className="border border-stone-400 px-4 py-2 rounded-lg text-sm hover:bg-stone-200 transition font-medium"
                    >
                      Read on Internet Archive
                    </Link>
                  )}

                  {googleOption && (
                    <Link
                      to={`/read/google/${encodeURIComponent(googleOption.id)}?title=${encodeURIComponent(
                        book.title
                      )}&workId=${encodeURIComponent(bookId)}`}
                      className="border border-stone-400 px-4 py-2 rounded-lg text-sm hover:bg-stone-200 transition font-medium"
                    >
                      {googleOption.label}
                    </Link>
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
                        className="bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-900 transition font-medium"
                      >
                        {doabOption.label}
                      </Link>
                      <span className="text-xs text-stone-500">
                        {doabOption.publisher ? `${doabOption.publisher} • ` : ""}
                        {doabOption.license || "Open Access"}
                      </span>
                    </div>
                  )}

                  {librivoxOption && (
                    <a
                      href={librivoxOption.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="border border-stone-400 px-4 py-2 rounded-lg text-sm hover:bg-stone-200 transition font-medium text-stone-800"
                    >
                      🎧 {librivoxOption.label} ↗
                    </a>
                  )}

                  {!gutenbergOption && !archiveOption && !googleOption && !doabOption && !librivoxOption && (
                    <p className="text-sm text-stone-500 italic">
                      No public domain reader or preview available for this edition.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="mt-8">
              <p className="font-semibold mb-2">Your rating</p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => rateBook(star)}
                    className="text-3xl cursor-pointer"
                  >
                    {star <= rating ? "★" : "☆"}
                  </button>
                ))}
              </div>

              <button
                onClick={toggleFavorite}
                className="mt-4 text-base cursor-pointer hover:underline block"
              >
                {libraryEntry?.favorite ? "♥ In Favourites" : "♡ Add to favourites"}
              </button>

              {libraryEntry?.status === "reading" && (
                <div className="mt-6 max-w-xs">
                  <p className="font-semibold mb-2">
                    Reading Progress — {progress}%
                  </p>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={progress}
                    onChange={(e) => setProgress(Number(e.target.value))}
                    onMouseUp={(e) => updateProgress(e.target.value)}
                    className="w-full cursor-pointer"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default BookDetails;

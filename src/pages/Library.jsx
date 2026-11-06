import { Query } from "appwrite";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { account, databases } from "../appwrite/config";
import { EmptyBookshelf } from "../components/Illustrations";

function BookCard({ book }) {
  return (
    <Link
      to={`/book/${book.bookId}`}
      className="group flex flex-col bg-white border border-[#1D3557]/15 rounded-xl p-3 shadow-xs hover:shadow-md hover:border-[#1D3557]/30 hover:-translate-y-1 transition duration-200"
    >
      <div className="relative aspect-[2/3] w-full rounded-lg overflow-hidden bg-[#F0FAEF] mb-3 border border-[#1D3557]/10 flex items-center justify-center">
        {book.coverId ? (
          <img
            src={`https://covers.openlibrary.org/b/id/${book.coverId}-M.jpg`}
            alt={book.title}
            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
            loading="lazy"
          />
        ) : (
          <div className="text-center p-3 text-xs text-[#1D3557]/60 font-serif">
            {book.title}
          </div>
        )}
        {book.favorite && (
          <span className="absolute top-2 right-2 bg-white/90 backdrop-blur-xs text-[#E73847] text-xs px-2 py-0.5 rounded-full font-mono font-bold shadow-xs border border-[#E73847]/20">
            ★ Fav
          </span>
        )}
      </div>

      <h3 className="font-serif font-bold text-sm text-[#1D3557] line-clamp-1 group-hover:text-[#E73847] transition">
        {book.title}
      </h3>
      <p className="text-xs text-[#457B9D] line-clamp-1 mt-0.5">
        {book.author || "Unknown author"}
      </p>

      {book.status === "reading" && (
        <div className="mt-3 pt-2 border-t border-[#1D3557]/10">
          <div className="flex items-center justify-between text-[11px] font-mono text-[#1D3557]/70 mb-1">
            <span>Progress</span>
            <span className="font-bold text-[#E73847]">{book.progress || 0}%</span>
          </div>
          <div className="w-full h-1.5 bg-[#A8DADB]/40 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#E73847] rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, book.progress || 0))}%` }}
            />
          </div>
        </div>
      )}
    </Link>
  );
}

function Library() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    let isMounted = true;
    async function getLibrary() {
      try {
        const user = await account.get();
        const result = await databases.listDocuments(
          import.meta.env.VITE_APPWRITE_DATABASE_ID,
          import.meta.env.VITE_APPWRITE_LIBRARY_COLLECTION_ID,
          [Query.equal("userId", user.$id)]
        );
        if (isMounted) {
          setBooks(result.documents);
        }
      } catch (error) {
        console.error("Failed to load library:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    getLibrary();
    return () => {
      isMounted = false;
    };
  }, []);

  const readingBooks = books.filter((book) => book.status === "reading");
  const wantToReadBooks = books.filter((book) => book.status === "want_to_read");
  const readBooks = books.filter((book) => book.status === "read");
  const droppedBooks = books.filter((book) => book.status === "dropped");

  const filterTabs = [
    { key: "all", label: "All Books", count: books.length },
    { key: "reading", label: "Currently Reading", count: readingBooks.length },
    { key: "want_to_read", label: "Want to Read", count: wantToReadBooks.length },
    { key: "read", label: "Finished", count: readBooks.length },
    { key: "dropped", label: "Dropped", count: droppedBooks.length },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F0FAEF] flex items-center justify-center p-8 text-[#1D3557]">
        <div className="font-mono text-sm tracking-wider uppercase opacity-70 animate-pulse">
          Retrieving your personal library...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0FAEF] text-[#1D3557] px-6 py-10 md:px-12 lg:px-16">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <div className="border-b border-[#1D3557]/15 pb-6">
            <h1 className="text-4xl md:text-5xl font-serif font-black text-[#1D3557] tracking-tight">
              My Library
            </h1>
          </div>

          {books.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-6">
              {filterTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`px-4 py-2 rounded-full text-xs font-mono font-medium transition cursor-pointer flex items-center gap-2 ${
                    filter === tab.key
                      ? "bg-[#1D3557] text-[#F0FAEF] shadow-xs"
                      : "bg-white text-[#1D3557] border border-[#1D3557]/20 hover:border-[#1D3557]/50"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      filter === tab.key
                        ? "bg-[#E73847] text-white"
                        : "bg-[#A8DADB]/40 text-[#1D3557]"
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          )}
        </header>

        {books.length === 0 ? (
          <div className="max-w-md mx-auto my-16 text-center bg-white border border-[#1D3557]/15 rounded-2xl p-8 shadow-sm">
            <EmptyBookshelf className="w-48 h-36 mx-auto mb-4" />
            <h2 className="font-serif font-bold text-2xl text-[#1D3557] mb-2">
              Your bookshelf is waiting for its first spark.
            </h2>
            <p className="text-sm text-[#1D3557]/70 font-sans mb-6">
              Add books to your personal library, track your reading progress, and find readers on your literary wavelength.
            </p>
            <Link
              to="/"
              className="inline-block bg-[#E73847] text-white font-mono text-xs font-bold uppercase tracking-wider px-6 py-3 rounded-full hover:bg-[#d02736] transition shadow-xs"
            >
              Discover Books
            </Link>
          </div>
        ) : (
          <div className="space-y-12">
            {(filter === "all" || filter === "reading") && readingBooks.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-5">
                  <h2 className="text-2xl font-serif font-bold text-[#1D3557]">
                    Currently Reading
                  </h2>
                  <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-[#E73847] text-white font-bold">
                    {readingBooks.length}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
                  {readingBooks.map((book) => (
                    <BookCard key={book.$id} book={book} />
                  ))}
                </div>
              </section>
            )}

            {(filter === "all" || filter === "want_to_read") && wantToReadBooks.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-5">
                  <h2 className="text-2xl font-serif font-bold text-[#1D3557]">
                    Want to Read
                  </h2>
                  <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-[#457B9D] text-white font-bold">
                    {wantToReadBooks.length}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
                  {wantToReadBooks.map((book) => (
                    <BookCard key={book.$id} book={book} />
                  ))}
                </div>
              </section>
            )}

            {(filter === "all" || filter === "read") && readBooks.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-5">
                  <h2 className="text-2xl font-serif font-bold text-[#1D3557]">
                    Finished
                  </h2>
                  <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-[#1D3557] text-white font-bold">
                    {readBooks.length}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
                  {readBooks.map((book) => (
                    <BookCard key={book.$id} book={book} />
                  ))}
                </div>
              </section>
            )}

            {(filter === "all" || filter === "dropped") && droppedBooks.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-5">
                  <h2 className="text-2xl font-serif font-bold text-[#1D3557]">
                    Dropped
                  </h2>
                  <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-stone-400 text-white font-bold">
                    {droppedBooks.length}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
                  {droppedBooks.map((book) => (
                    <BookCard key={book.$id} book={book} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Library;

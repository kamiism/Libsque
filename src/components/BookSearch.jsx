import { useState } from "react";
import { Link } from "react-router-dom";
import { SharedBench } from "./Illustrations";

const CURATED_GENRES = [
  "Fiction",
  "Science Fiction",
  "Romance",
  "Mystery",
  "History",
  "Philosophy",
  "Poetry",
];

const FEATURED_BOOKS = [
  {
    id: "OL27479W",
    title: "Pride and Prejudice",
    author: "Jane Austen",
    coverId: 8231998,
    year: 1813,
    availability: "EPUB",
  },
  {
    id: "OL34306660W",
    title: "The Ethics of Affect",
    author: "Patrick W Galbraith",
    coverId: 13156494,
    year: 2021,
    availability: "PDF",
  },
  {
    id: "OL25555832W",
    title: "Navigating the European Migration Regime",
    author: "Anna Wyss",
    coverId: null,
    year: 2022,
    availability: "Open Access",
  },
  {
    id: "OL103123W",
    title: "Frankenstein",
    author: "Mary Shelley",
    coverId: 8258649,
    year: 1818,
    availability: "EPUB",
  },
  {
    id: "OL82563W",
    title: "Alice's Adventures in Wonderland",
    author: "Lewis Carroll",
    coverId: 8259020,
    year: 1865,
    availability: "EPUB",
  },
  {
    id: "OL262758W",
    title: "The Metamorphosis",
    author: "Franz Kafka",
    coverId: 8235113,
    year: 1915,
    availability: "EPUB",
  },
];

function BookCoverFallback({ title, author }) {
  return (
    <div className="w-full h-full p-4 flex flex-col justify-between bg-[#1D3557] text-[#F0FAEF] border-l-4 border-[#A8DADB]/60 relative overflow-hidden select-none">
      <div className="relative z-10">
        <span className="text-[10px] uppercase font-mono tracking-widest text-[#A8DADB] font-bold block">
          LIBSQUE EDITIONS
        </span>
      </div>

      <div className="relative z-10 my-auto py-2">
        <p className="font-serif font-black text-sm sm:text-base leading-snug line-clamp-4 text-white">
          {title}
        </p>
        <div className="w-6 h-0.5 bg-[#E73847] mt-2 mb-1" />
      </div>

      <div className="relative z-10 pt-2 border-t border-white/15">
        <p className="text-[11px] font-sans font-medium text-[#F0FAEF]/80 truncate">
          {author}
        </p>
      </div>
    </div>
  );
}

function getBadgeStyle(availability) {
  switch (availability) {
    case "EPUB":
      return "bg-[#E73847] text-white";
    case "PDF":
      return "bg-[#457B9D] text-white";
    case "Open Access":
      return "bg-[#1D3557] text-white";
    case "Preview":
      return "bg-[#A8DADB] text-[#1D3557]";
    default:
      return "bg-[#1D3557] text-white";
  }
}

function BookSearch() {
  const [query, setQuery] = useState("");
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  async function executeSearch(searchQuery) {
    if (!searchQuery.trim()) return;
    try {
      setLoading(true);
      setHasSearched(true);
      const response = await fetch(
        `https://openlibrary.org/search.json?q=${encodeURIComponent(searchQuery)}&limit=18`
      );
      const data = await response.json();
      const formattedBooks = (data.docs || []).map((book) => {
        let availability = null;
        if (book.ebook_access === "public" || book.public_scan_b) {
          availability = "Open Access";
        } else if (book.has_fulltext) {
          availability = "Preview";
        }
        return {
          id: book.key,
          title: book.title,
          author: book.author_name?.[0] || "Unknown Author",
          coverId: book.cover_i || null,
          year: book.first_publish_year || null,
          isbn: book.isbn?.[0] || null,
          availability,
        };
      });
      setBooks(formattedBooks);
    } catch (error) {
      console.error("Book Search Failed:", error);
    } finally {
      setLoading(false);
    }
  }

  function handleFormSubmit(e) {
    e.preventDefault();
    executeSearch(query);
  }

  function handleGenreClick(genre) {
    if (query === genre && hasSearched) {
      setQuery("");
      setHasSearched(false);
      setBooks([]);
    } else {
      setQuery(genre);
      executeSearch(genre);
    }
  }

  return (
    <div className="min-h-screen bg-[#F0FAEF] text-[#1D3557]">
      {/* Hero */}
      <section className="pt-8 pb-8 px-6 border-b border-[#1D3557]/10">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          <div className="lg:col-span-7 space-y-5">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold font-serif leading-[1.1] tracking-tight">
              Some stories are <span className="text-[#E73847] italic">better shared</span>.
            </h1>

            <p className="text-base sm:text-lg text-[#1D3557]/80 max-w-xl leading-relaxed">
              Find readers who share your taste, track what you read, and explore books across open-access libraries.
            </p>

            {/* Search Form */}
            <form onSubmit={handleFormSubmit} className="max-w-xl pt-1">
              <div className="flex flex-col sm:flex-row gap-2 bg-white p-2 rounded-2xl border border-[#1D3557]/20 shadow-xs focus-within:border-[#1D3557] focus-within:ring-2 focus-within:ring-[#1D3557]/10 transition">
                <input
                  type="text"
                  placeholder="Search by title, author, or keyword..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="flex-1 px-4 py-2.5 sm:py-3 bg-transparent text-[#1D3557] placeholder:text-[#1D3557]/45 text-sm sm:text-base outline-none font-medium"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-[#E73847] hover:bg-[#C62635] text-white px-7 py-2.5 sm:py-3 rounded-xl font-semibold text-sm tracking-wide transition cursor-pointer shadow-xs disabled:opacity-50 shrink-0"
                >
                  {loading ? "Searching..." : "Search"}
                </button>
              </div>
            </form>

            {/* Functional Genre Chips */}
            <div className="pt-1">
              <p className="text-xs font-mono text-[#457B9D] mb-2 font-medium">
                Explore genres
              </p>
              <div className="flex flex-wrap gap-2">
                {CURATED_GENRES.map((genre) => {
                  const isActive = hasSearched && query === genre;
                  return (
                    <button
                      key={genre}
                      onClick={() => handleGenreClick(genre)}
                      className={`text-xs px-3.5 py-1.5 rounded-lg font-mono font-medium transition cursor-pointer ${
                        isActive
                          ? "bg-[#1D3557] text-[#F0FAEF] border border-[#1D3557] shadow-xs"
                          : "bg-white border border-[#1D3557]/15 text-[#1D3557] hover:bg-[#A8DADB]/25 hover:border-[#1D3557]/30"
                      }`}
                    >
                      {genre}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Clean hero character illustration without decorative frames or fake quotes */}
          <div className="lg:col-span-5 flex justify-center items-center">
            <SharedBench className="w-full max-w-md h-auto" />
          </div>
        </div>
      </section>

      {/* Main Catalog / Search Results */}
      <main className="max-w-7xl mx-auto px-6 pt-6 pb-16">
        <div className="flex items-baseline justify-between mb-6 pb-3 border-b border-[#1D3557]/10">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold font-serif">
              {hasSearched ? `Results for "${query}"` : "Featured Books"}
            </h2>
            {hasSearched && (
              <p className="text-xs sm:text-sm font-mono text-[#457B9D] mt-1">
                {books.length} editions found
              </p>
            )}
          </div>

          {hasSearched && (
            <button
              onClick={() => {
                setQuery("");
                setHasSearched(false);
                setBooks([]);
              }}
              className="text-xs font-semibold text-[#E73847] hover:underline cursor-pointer"
            >
              Clear search
            </button>
          )}
        </div>

        {loading && (
          <div className="py-20 text-center">
            <div className="inline-block w-8 h-8 border-3 border-[#A8DADB] border-t-[#E73847] rounded-full animate-spin mb-4" />
            <p className="text-sm font-mono text-[#1D3557]/70">Searching libraries...</p>
          </div>
        )}

        {!loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5 sm:gap-6">
            {(hasSearched ? books : FEATURED_BOOKS).map((book) => {
              const cleanId = (book.id || "").replace("/works/", "");
              return (
                <Link
                  to={`/book/${cleanId}`}
                  key={book.id}
                  className="group flex flex-col h-full bg-white p-3 rounded-2xl border border-[#1D3557]/15 shadow-xs hover:border-[#1D3557]/40 hover:-translate-y-1 transition duration-200 no-underline"
                >
                  <div className="relative w-full aspect-[2/3] rounded-xl overflow-hidden mb-3 border border-[#1D3557]/10 bg-[#1D3557]/5">
                    {book.coverId ? (
                      <img
                        src={`https://covers.openlibrary.org/b/id/${book.coverId}-M.jpg`}
                        alt={book.title}
                        className="w-full h-full object-cover group-hover:scale-103 transition duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <BookCoverFallback title={book.title} author={book.author} />
                    )}
                    {book.availability && (
                      <span
                        className={`absolute top-2 right-2 text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded shadow-xs ${getBadgeStyle(
                          book.availability
                        )}`}
                      >
                        {book.availability}
                      </span>
                    )}
                  </div>

                  <h3 className="font-serif font-bold text-sm leading-snug text-[#1D3557] line-clamp-2 min-h-[2.5rem] group-hover:text-[#E73847] transition">
                    {book.title}
                  </h3>

                  <p className="text-xs text-[#457B9D] font-medium truncate mt-1">
                    {book.author}
                  </p>

                  <div className="mt-auto pt-2.5 flex items-center justify-between text-[11px] font-mono text-[#1D3557]/50 border-t border-[#1D3557]/10">
                    <span>{book.year || "—"}</span>
                    {book.availability && (
                      <span className="text-[10px] font-semibold text-[#1D3557]/70">
                        {book.availability}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {!loading && hasSearched && books.length === 0 && (
          <div className="py-16 text-center max-w-md mx-auto">
            <p className="font-serif text-xl font-bold mb-2">No books found</p>
            <p className="text-sm text-[#1D3557]/70">
              Try searching with another title, author, or keyword.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

export default BookSearch;

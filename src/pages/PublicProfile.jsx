import { Query } from "appwrite";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { account, databases } from "../appwrite/config";
import { calculateMatchScore } from "../utils/matchScore";
import { calculateReaderDna } from "../utils/readerDna";

function PublicProfile() {
  const { userId } = useParams();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [library, setLibrary] = useState([]);
  const [readerDna, setReaderDna] = useState({ genres: {}, themes: {} });
  const [matchScore, setMatchScore] = useState(0);

  const favorites = library.filter((book) => book.favorite === true);
  const topGenres = Object.entries(readerDna.genres || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const topThemes = Object.entries(readerDna.themes || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  useEffect(() => {
    let isMounted = true;
    async function loadProfile() {
      try {
        const result = await databases.listDocuments(
          import.meta.env.VITE_APPWRITE_DATABASE_ID,
          import.meta.env.VITE_APPWRITE_PROFILES_COLLECTION_ID,
          [Query.equal("userId", userId)]
        );

        const libraryResult = await databases.listDocuments(
          import.meta.env.VITE_APPWRITE_DATABASE_ID,
          import.meta.env.VITE_APPWRITE_LIBRARY_COLLECTION_ID,
          [Query.equal("userId", userId)]
        );
        const dna = calculateReaderDna(libraryResult.documents);

        if (isMounted) {
          setLibrary(libraryResult.documents);
          setReaderDna(dna);
          if (result.documents.length > 0) {
            setProfile(result.documents[0]);
          }
        }

        try {
          const currentUser = await account.get();
          if (currentUser.$id !== userId) {
            const myLibraryResult = await databases.listDocuments(
              import.meta.env.VITE_APPWRITE_DATABASE_ID,
              import.meta.env.VITE_APPWRITE_LIBRARY_COLLECTION_ID,
              [Query.equal("userId", currentUser.$id)]
            );
            const myDna = calculateReaderDna(myLibraryResult.documents);
            const score = calculateMatchScore(
              myDna,
              dna,
              myLibraryResult.documents,
              libraryResult.documents
            );
            if (isMounted) setMatchScore(score);
          }
        } catch {
          // Unauthenticated viewer or match calculation skipped
        }
      } catch (error) {
        console.error("Failed to load public profile:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadProfile();
    return () => {
      isMounted = false;
    };
  }, [userId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F0FAEF] flex items-center justify-center p-8 text-[#1D3557]">
        <div className="font-mono text-sm tracking-wider uppercase opacity-70 animate-pulse">
          Analyzing literary wavelength...
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-[#F0FAEF] flex flex-col items-center justify-center p-8 text-center text-[#1D3557]">
        <h2 className="font-serif font-bold text-2xl mb-2">Reader Not Found</h2>
        <p className="text-sm text-[#1D3557]/70 font-sans mb-6">
          This reader profile doesn't exist or is not publicly accessible.
        </p>
        <Link
          to="/feed"
          className="bg-[#1D3557] text-[#F0FAEF] font-mono text-xs font-bold uppercase tracking-wider px-6 py-3 rounded-full hover:bg-[#152740] transition"
        >
          Back to Readers
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0FAEF] text-[#1D3557] px-6 py-10 md:px-12 lg:px-16">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Compatibility Banner */}
        <div className="bg-white border border-[#1D3557]/15 rounded-3xl p-6 sm:p-8 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-4xl sm:text-5xl font-black text-[#E73847]">
                {matchScore}%
              </span>
              <span className="font-serif text-xl sm:text-2xl font-bold text-[#1D3557]">
                Reading Compatibility
              </span>
            </div>
          </div>

          <div className="shrink-0 bg-[#A8DADB]/20 border border-[#1D3557]/10 px-4 py-3 rounded-2xl text-center">
            <span className="block font-mono text-xl font-bold text-[#1D3557]">
              {library.length}
            </span>
            <span className="text-[11px] font-mono uppercase text-[#457B9D]">
              Books on Shelf
            </span>
          </div>
        </div>

        {/* Profile Card */}
        <div className="bg-white border border-[#1D3557]/15 rounded-2xl p-6 sm:p-8 shadow-xs">
          <div className="flex items-start gap-5">
            <div className="w-16 h-16 rounded-2xl bg-[#A8DADB]/30 border border-[#1D3557]/15 flex items-center justify-center shrink-0">
              <span className="font-serif font-black text-2xl text-[#1D3557]">
                {profile.displayName?.charAt(0) || "R"}
              </span>
            </div>
            <div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <h1 className="text-3xl font-serif font-black text-[#1D3557]">
                  {profile.displayName}
                </h1>
                <span className="font-mono text-xs text-[#457B9D]">
                  @{profile.username}
                </span>
              </div>
              <p className="text-sm text-[#1D3557]/80 font-sans mt-3 leading-relaxed max-w-2xl">
                {profile.bio || "No bio yet."}
              </p>
            </div>
          </div>
        </div>

        {/* PROMINENT CORAL RED READER DNA CARD */}
        <div className="bg-[#E73847] text-white rounded-3xl p-6 sm:p-8 shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 border-b border-white/20 pb-4 mb-6">
            <h2 className="text-2xl sm:text-3xl font-serif font-black text-white">
              Reader DNA
            </h2>
            <p className="text-xs font-mono text-white/80">
              Taste profile
            </p>
          </div>

          {topGenres.length === 0 && topThemes.length === 0 ? (
            <p className="text-xs font-mono text-white/80 py-4">
              This reader's taste is still being recorded.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-sm font-mono uppercase tracking-wider text-white/90 font-bold mb-4">
                  Top Genres
                </h3>
                <div className="space-y-3">
                  {topGenres.map(([genre, score]) => (
                    <div key={genre} className="bg-white/10 rounded-xl p-3 backdrop-blur-xs">
                      <div className="flex justify-between text-xs font-mono mb-1.5">
                        <span className="font-bold text-white capitalize">{genre}</span>
                        <span className="text-white/80">{score}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-black/20 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-white rounded-full"
                          style={{ width: `${score}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-mono uppercase tracking-wider text-white/90 font-bold mb-4">
                  Sensibilities & Themes
                </h3>
                <div className="space-y-3">
                  {topThemes.map(([theme, score]) => (
                    <div key={theme} className="bg-white/10 rounded-xl p-3 backdrop-blur-xs">
                      <div className="flex justify-between text-xs font-mono mb-1.5">
                        <span className="font-bold text-white capitalize">{theme}</span>
                        <span className="text-white/80">{score}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-black/20 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#A8DADB] rounded-full"
                          style={{ width: `${score}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Favorite Books */}
        <section className="bg-white border border-[#1D3557]/15 rounded-2xl p-6 sm:p-8 shadow-xs">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-serif font-black text-[#1D3557]">
              Favorite Books
            </h3>
            <span className="font-mono text-xs text-[#E73847] font-bold">
              ★ {favorites.length} chosen
            </span>
          </div>

          {favorites.length === 0 ? (
            <p className="text-sm font-sans text-[#1D3557]/60 italic">
              No favorite books marked yet.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
              {favorites.map((book) => (
                <Link
                  key={book.$id}
                  to={`/book/${book.bookId}`}
                  className="group flex flex-col"
                >
                  <div className="relative aspect-[2/3] w-full rounded-lg overflow-hidden bg-[#F0FAEF] border border-[#1D3557]/15 mb-2 shadow-xs group-hover:-translate-y-1 transition duration-200">
                    {book.coverId ? (
                      <img
                        src={`https://covers.openlibrary.org/b/id/${book.coverId}-M.jpg`}
                        alt={book.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="p-2 text-center text-xs font-serif text-[#1D3557]/70 flex items-center justify-center h-full">
                        {book.title}
                      </div>
                    )}
                  </div>
                  <p className="text-xs font-serif font-bold text-[#1D3557] line-clamp-1 group-hover:text-[#E73847] transition">
                    {book.title}
                  </p>
                  <p className="text-[11px] text-[#457B9D] line-clamp-1">
                    {book.author}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default PublicProfile;

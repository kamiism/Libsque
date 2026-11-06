import { ID, Query } from "appwrite";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { account, databases } from "../appwrite/config";
import { calculateReaderDna } from "../utils/readerDna";

function Profile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [editing, setEditing] = useState(false);
  const [library, setLibrary] = useState([]);
  const readerDna = calculateReaderDna(library);

  useEffect(() => {
    let isMounted = true;
    async function loadProfile() {
      try {
        const user = await account.get();
        const libraryResult = await databases.listDocuments(
          import.meta.env.VITE_APPWRITE_DATABASE_ID,
          import.meta.env.VITE_APPWRITE_LIBRARY_COLLECTION_ID,
          [Query.equal("userId", user.$id)]
        );
        if (isMounted) setLibrary(libraryResult.documents);

        const result = await databases.listDocuments(
          import.meta.env.VITE_APPWRITE_DATABASE_ID,
          import.meta.env.VITE_APPWRITE_PROFILES_COLLECTION_ID,
          [Query.equal("userId", user.$id)]
        );
        if (isMounted && result.documents.length > 0) {
          const savedProfile = result.documents[0];
          setProfile(savedProfile);
          setUsername(savedProfile.username);
          setDisplayName(savedProfile.displayName);
          setBio(savedProfile.bio || "");
        }
      } catch (error) {
        console.error("Failed to load profile:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadProfile();
    return () => {
      isMounted = false;
    };
  }, []);

  const booksRead = library.filter((b) => b.status === "read").length;
  const currentlyReading = library.filter((b) => b.status === "reading").length;
  const wantToRead = library.filter((b) => b.status === "want_to_read").length;
  const favorites = library.filter((b) => b.favorite === true);

  const topGenres = Object.entries(readerDna.genres || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const topThemes = Object.entries(readerDna.themes || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  async function createProfile(e) {
    e.preventDefault();
    try {
      const user = await account.get();
      const created = await databases.createDocument(
        import.meta.env.VITE_APPWRITE_DATABASE_ID,
        import.meta.env.VITE_APPWRITE_PROFILES_COLLECTION_ID,
        ID.unique(),
        {
          userId: user.$id,
          username,
          displayName,
          bio,
        }
      );
      setProfile(created);
    } catch (error) {
      console.error("Failed to create profile:", error);
      alert(error.message);
    }
  }

  async function updateProfile(e) {
    e.preventDefault();
    try {
      const updated = await databases.updateDocument(
        import.meta.env.VITE_APPWRITE_DATABASE_ID,
        import.meta.env.VITE_APPWRITE_PROFILES_COLLECTION_ID,
        profile.$id,
        {
          username,
          displayName,
          bio,
        }
      );
      setProfile(updated);
      setEditing(false);
    } catch (error) {
      console.error("Failed to update profile:", error);
      alert(error.message);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F0FAEF] flex items-center justify-center p-8 text-[#1D3557]">
        <div className="font-mono text-sm tracking-wider uppercase opacity-70 animate-pulse">
          Decoding literary identity...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0FAEF] text-[#1D3557] px-6 py-10 md:px-12 lg:px-16">
      <div className="max-w-4xl mx-auto">
        {!profile ? (
          <div className="bg-white border border-[#1D3557]/15 rounded-2xl p-8 max-w-lg mx-auto shadow-sm">
            <span className="font-mono text-xs uppercase tracking-widest text-[#457B9D] font-bold">
              Reader Identity
            </span>
            <h1 className="text-3xl font-serif font-black text-[#1D3557] mt-1 mb-2">
              Create Your Profile
            </h1>
            <p className="text-sm text-[#1D3557]/70 font-sans mb-6">
              Let other readers discover your bookshelf and find someone on your wavelength.
            </p>

            <form onSubmit={createProfile} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-mono uppercase text-[#1D3557]/80 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  placeholder="e.g. page_wanderer"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-[#F0FAEF] border border-[#1D3557]/20 p-3 rounded-xl text-sm focus:outline-hidden focus:border-[#E73847]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-[#1D3557]/80 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Clara Oswald"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-[#F0FAEF] border border-[#1D3557]/20 p-3 rounded-xl text-sm focus:outline-hidden focus:border-[#E73847]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-[#1D3557]/80 mb-1">
                  Literary Bio
                </label>
                <textarea
                  placeholder="What genres captivate you? What sentence stayed with you?"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full bg-[#F0FAEF] border border-[#1D3557]/20 p-3 rounded-xl text-sm min-h-28 focus:outline-hidden focus:border-[#E73847]"
                />
              </div>

              <button
                type="submit"
                className="bg-[#E73847] text-white font-mono text-xs font-bold uppercase tracking-wider py-3.5 rounded-full hover:bg-[#d02736] transition cursor-pointer shadow-xs mt-2"
              >
                Create Profile
              </button>
            </form>
          </div>
        ) : editing ? (
          <div className="bg-white border border-[#1D3557]/15 rounded-2xl p-8 max-w-lg mx-auto shadow-sm">
            <span className="font-mono text-xs uppercase tracking-widest text-[#457B9D] font-bold">
              Account Settings
            </span>
            <h1 className="text-2xl font-serif font-black text-[#1D3557] mt-1 mb-6">
              Edit Reader Profile
            </h1>

            <form onSubmit={updateProfile} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-mono uppercase text-[#1D3557]/80 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-[#F0FAEF] border border-[#1D3557]/20 p-3 rounded-xl text-sm focus:outline-hidden focus:border-[#E73847]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-[#1D3557]/80 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-[#F0FAEF] border border-[#1D3557]/20 p-3 rounded-xl text-sm focus:outline-hidden focus:border-[#E73847]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-[#1D3557]/80 mb-1">
                  Bio
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full bg-[#F0FAEF] border border-[#1D3557]/20 p-3 rounded-xl text-sm min-h-28 focus:outline-hidden focus:border-[#E73847]"
                />
              </div>

              <div className="flex gap-3 mt-3">
                <button
                  type="submit"
                  className="bg-[#1D3557] text-[#F0FAEF] font-mono text-xs font-bold uppercase tracking-wider px-6 py-3 rounded-full hover:bg-[#152740] transition cursor-pointer"
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="bg-white border border-[#1D3557]/20 text-[#1D3557] font-mono text-xs font-bold uppercase tracking-wider px-6 py-3 rounded-full hover:border-[#1D3557]/40 transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Header Identity Card */}
            <div className="bg-white border border-[#1D3557]/15 rounded-2xl p-6 sm:p-8 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="flex items-start gap-5">
                <div className="w-16 h-16 rounded-2xl bg-[#A8DADB]/30 border border-[#1D3557]/15 flex items-center justify-center shrink-0">
                  <span className="font-serif font-black text-2xl text-[#1D3557]">
                    {profile.displayName?.charAt(0) || "L"}
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
                  <p className="text-sm text-[#1D3557]/80 font-sans mt-2 max-w-xl leading-relaxed">
                    {profile.bio || "No literary bio written yet. Share what stories inspire you."}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setEditing(true)}
                className="bg-white text-[#1D3557] border border-[#1D3557]/20 hover:border-[#1D3557]/50 font-mono text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-full transition cursor-pointer self-start sm:self-auto shrink-0 shadow-xs"
              >
                Edit Profile
              </button>
            </div>

            {/* Reading Stats Grid */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white border border-[#1D3557]/15 rounded-2xl p-5 text-center shadow-xs">
                <span className="block font-mono text-3xl font-bold text-[#1D3557]">
                  {booksRead}
                </span>
                <span className="text-xs font-mono uppercase tracking-wider text-[#457B9D] mt-1 block">
                  Books Read
                </span>
              </div>
              <div className="bg-white border border-[#1D3557]/15 rounded-2xl p-5 text-center shadow-xs">
                <span className="block font-mono text-3xl font-bold text-[#E73847]">
                  {currentlyReading}
                </span>
                <span className="text-xs font-mono uppercase tracking-wider text-[#457B9D] mt-1 block">
                  Reading
                </span>
              </div>
              <div className="bg-white border border-[#1D3557]/15 rounded-2xl p-5 text-center shadow-xs">
                <span className="block font-mono text-3xl font-bold text-[#1D3557]">
                  {wantToRead}
                </span>
                <span className="text-xs font-mono uppercase tracking-wider text-[#457B9D] mt-1 block">
                  Want to Read
                </span>
              </div>
            </div>

            {/* PROMINENT CORAL RED READER DNA CARD */}
            <div className="bg-[#E73847] text-white rounded-3xl p-6 sm:p-8 shadow-md relative overflow-hidden">
              <div className="relative z-10">
                <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 border-b border-white/20 pb-4 mb-6">
                  <h2 className="text-2xl sm:text-3xl font-serif font-black text-white">
                    Reader DNA
                  </h2>
                  <p className="text-xs font-mono text-white/80">
                    Based on your bookshelf
                  </p>
                </div>

                {topGenres.length === 0 && topThemes.length === 0 ? (
                  <div className="py-6 text-center text-white/90">
                    <p className="font-serif text-lg mb-1">
                      Your literary DNA is still crystallizing.
                    </p>
                    <p className="text-xs font-mono text-white/80">
                      Add and read books in your library to reveal your personal genres and themes.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Genres */}
                    <div>
                      <h3 className="text-sm font-mono uppercase tracking-wider text-white/90 font-bold mb-4 flex items-center gap-2">
                        <span>Top Genres</span>
                        <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full">
                          {topGenres.length}
                        </span>
                      </h3>
                      <div className="space-y-3">
                        {topGenres.map(([genre, score]) => (
                          <div key={genre} className="bg-white/10 rounded-xl p-3 backdrop-blur-xs">
                            <div className="flex justify-between items-center text-xs font-mono mb-1.5">
                              <span className="font-bold text-white capitalize">{genre}</span>
                              <span className="text-white/80">{score}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-black/20 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-white rounded-full transition-all duration-300"
                                style={{ width: `${score}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Themes */}
                    <div>
                      <h3 className="text-sm font-mono uppercase tracking-wider text-white/90 font-bold mb-4 flex items-center gap-2">
                        <span>Sensibilities & Themes</span>
                        <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full">
                          {topThemes.length}
                        </span>
                      </h3>
                      <div className="space-y-3">
                        {topThemes.map(([theme, score]) => (
                          <div key={theme} className="bg-white/10 rounded-xl p-3 backdrop-blur-xs">
                            <div className="flex justify-between items-center text-xs font-mono mb-1.5">
                              <span className="font-bold text-white capitalize">{theme}</span>
                              <span className="text-white/80">{score}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-black/20 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#A8DADB] rounded-full transition-all duration-300"
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
            </div>

            {/* Favorite Books Section */}
            {favorites.length > 0 && (
              <section className="bg-white border border-[#1D3557]/15 rounded-2xl p-6 sm:p-8 shadow-xs">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <span className="font-mono text-xs uppercase tracking-widest text-[#457B9D] font-bold">
                      Personal Shelf
                    </span>
                    <h3 className="text-2xl font-serif font-black text-[#1D3557] mt-1">
                      Favorite Books
                    </h3>
                  </div>
                  <span className="font-mono text-xs text-[#E73847] font-bold">
                    ★ {favorites.length} curated
                  </span>
                </div>

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
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Profile;

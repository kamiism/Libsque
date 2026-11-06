import { Query } from "appwrite";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { account, databases } from "../appwrite/config";
import { calculateMatchScore } from "../utils/matchScore";
import { calculateReaderDna } from "../utils/readerDna";
import { SharedBench } from "../components/Illustrations";

function Feed() {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadProfiles() {
      try {
        const user = await account.get();
        const myLibraryResult = await databases.listDocuments(
          import.meta.env.VITE_APPWRITE_DATABASE_ID,
          import.meta.env.VITE_APPWRITE_LIBRARY_COLLECTION_ID,
          [Query.equal("userId", user.$id)]
        );
        const myDna = calculateReaderDna(myLibraryResult.documents);

        const profileResult = await databases.listDocuments(
          import.meta.env.VITE_APPWRITE_DATABASE_ID,
          import.meta.env.VITE_APPWRITE_PROFILES_COLLECTION_ID,
          [Query.notEqual("userId", user.$id)]
        );

        const profilesWithData = [];
        for (const profile of profileResult.documents) {
          const libraryResults = await databases.listDocuments(
            import.meta.env.VITE_APPWRITE_DATABASE_ID,
            import.meta.env.VITE_APPWRITE_LIBRARY_COLLECTION_ID,
            [Query.equal("userId", profile.userId)]
          );
          const readerDna = calculateReaderDna(libraryResults.documents);
          const matchScore = calculateMatchScore(
            myDna,
            readerDna,
            myLibraryResult.documents,
            libraryResults.documents
          );
          profilesWithData.push({
            ...profile,
            library: libraryResults.documents,
            readerDna,
            matchScore,
          });
        }

        // Sort by highest match score
        profilesWithData.sort((a, b) => b.matchScore - a.matchScore);

        if (isMounted) setProfiles(profilesWithData);
      } catch (error) {
        console.error("Failed to load profiles:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadProfiles();
    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F0FAEF] flex items-center justify-center p-8 text-[#1D3557]">
        <div className="font-mono text-sm tracking-wider uppercase opacity-70 animate-pulse">
          Finding readers on your wavelength...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0FAEF] text-[#1D3557] px-6 py-10 md:px-12 lg:px-16">
      <div className="max-w-4xl mx-auto">
        <header className="mb-10 border-b border-[#1D3557]/15 pb-6">
          <h1 className="text-4xl md:text-5xl font-serif font-black text-[#1D3557] tracking-tight">
            Discover Readers
          </h1>
        </header>

        {profiles.length === 0 ? (
          <div className="bg-white border border-[#1D3557]/15 rounded-2xl p-10 text-center max-w-md mx-auto shadow-sm">
            <SharedBench className="w-48 h-36 mx-auto mb-4" />
            <h2 className="font-serif font-bold text-2xl text-[#1D3557] mb-2">
              The courtyard is quiet.
            </h2>
            <p className="text-sm text-[#1D3557]/70 font-sans mb-6">
              You are among the earliest readers here. As new members join and catalog their favorites, your literary matches will surface automatically.
            </p>
            <Link
              to="/"
              className="inline-block bg-[#E73847] text-white font-mono text-xs font-bold uppercase tracking-wider px-6 py-3 rounded-full hover:bg-[#d02736] transition shadow-xs"
            >
              Explore Books
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {profiles.map((profile) => {
              const topGenres = Object.entries(profile.readerDna?.genres || {})
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3);

              return (
                <Link
                  key={profile.$id}
                  to={`/user/${profile.userId}`}
                  className="group bg-white border border-[#1D3557]/15 hover:border-[#1D3557]/35 rounded-2xl p-6 shadow-xs hover:shadow-md hover:-translate-y-1 transition duration-200 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-[#A8DADB]/30 border border-[#1D3557]/15 flex items-center justify-center shrink-0">
                          <span className="font-serif font-black text-lg text-[#1D3557]">
                            {profile.displayName?.charAt(0) || "R"}
                          </span>
                        </div>
                        <div>
                          <h2 className="font-serif font-bold text-lg text-[#1D3557] group-hover:text-[#E73847] transition">
                            {profile.displayName}
                          </h2>
                          <p className="font-mono text-xs text-[#457B9D]">
                            @{profile.username}
                          </p>
                        </div>
                      </div>

                      <div className="bg-[#E73847] text-white px-3 py-1 rounded-full font-mono text-xs font-bold shrink-0 shadow-xs">
                        {profile.matchScore}% Match
                      </div>
                    </div>

                    <p className="text-xs sm:text-sm text-[#1D3557]/80 font-sans line-clamp-2 mb-4 leading-relaxed">
                      {profile.bio || "Avid reader discovering stories and sharing notes."}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-[#1D3557]/10 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap gap-1.5">
                      {topGenres.map(([genre]) => (
                        <span
                          key={genre}
                          className="bg-[#A8DADB]/30 text-[#1D3557] px-2 py-0.5 rounded-full font-mono text-[11px] capitalize"
                        >
                          {genre}
                        </span>
                      ))}
                    </div>

                    <span className="font-mono text-[11px] text-[#457B9D] font-bold">
                      {profile.library?.length || 0} books
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default Feed;

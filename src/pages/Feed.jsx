import { Query } from "appwrite";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { account, databases } from "../appwrite/config";
import { calculateMatchScore } from "../utils/matchScore";
import { calculateReaderDna } from "../utils/readerDna";

function Feed() {
    const [profiles, setProfiles] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadProfiles() {
        try {
            const user = await account.get();
            const myLibraryResult = await databases.listDocuments(
                import.meta.env.VITE_APPWRITE_DATABASE_ID,
                import.meta.env.VITE_APPWRITE_LIBRARY_COLLECTION_ID,
                [
                    Query.equal("userId",user.$id)
                ]
            );
            const myDna = calculateReaderDna(myLibraryResult.documents);
            const profileResult = await databases.listDocuments(
                import.meta.env.VITE_APPWRITE_DATABASE_ID,
                import.meta.env.VITE_APPWRITE_PROFILES_COLLECTION_ID,
                [
                    Query.notEqual("userId",user.$id)
                ]
            );
            const profilesWithData = [];
            for(const profile of profileResult.documents) {
                const libraryResults = await databases.listDocuments(
                    import.meta.env.VITE_APPWRITE_DATABASE_ID,
                    import.meta.env.VITE_APPWRITE_LIBRARY_COLLECTION_ID,
                    [
                        Query.equal("userId", profile.userId)
                    ]
                );
                const readerDna = calculateReaderDna(libraryResults.documents);
                const matchScore = calculateMatchScore(
                    myDna,
                    readerDna
                )
                profilesWithData.push({
                    ...profile,
                    library: libraryResults.documents,
                    readerDna: readerDna,
                    matchScore: matchScore
                });
            }
            setProfiles(profilesWithData);
        } catch(error) {
            console.error("Failed to load profiles:",error)
        } finally {
            setLoading(false)
        }
        }
        loadProfiles();
    }, []);

    if(loading) {
        return <div className="p-10">Loading Profiles...</div>
    }

    return (
        <div className="p-10">
            <h1 className="text-3xl font-bold mb-6">Discover Readers</h1>
            {profiles.length === 0 ? (
                <p>No other Readers yet</p>
            ) : (
                <div className="space-y-4">
                    {profiles.map((profile) => (
                        <Link
                            key={profile.$id}
                            to={`/user/${profile.userId}`}
                            className="block"
                        >
                            <div
                                className="border rounded-lg p-4"
                            >
                                <h2 className="text-xl font-semibold">{profile.displayName}</h2>
                                <p className="text-sm text-gray-500">@{profile.username}</p>
                                {profile.bio && (
                                    <p className="mt-2">{profile.bio}</p>
                                    )}
                                    <p className="mt-3">Books in library: {profile.library.length}</p>
                                    <p className="mt-3 font-bold    ">{profile.matchScore}% Match</p>
                                </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}

export default Feed;
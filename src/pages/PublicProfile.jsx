import { Query } from "appwrite";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { account, databases } from "../appwrite/config";
import { calculateMatchScore } from "../utils/matchScore";
import { calculateReaderDna } from "../utils/readerDna";

function PublicProfile() {
    const { userId } = useParams();
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [library, setLibrary] = useState([]);
    const [readerDna, setReaderDna] = useState({
        genres: {},
        themes: {},
    });
    const favorites = library.filter(
    (book) => book.favorite === true
    );
    const topGenres = Object.entries(readerDna.genres)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

    const topThemes = Object.entries(readerDna.themes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
    const [matchScore, setMatchScore] = useState(0);

    useEffect(() => {
        loadProfile();
    }, [userId]);

    async function loadProfile() {
        try {
        const result = await databases.listDocuments(
            import.meta.env.VITE_APPWRITE_DATABASE_ID,
            import.meta.env.VITE_APPWRITE_PROFILES_COLLECTION_ID,
            [
            Query.equal("userId", userId)
            ]
        );

        const libraryResult = await databases.listDocuments(
            import.meta.env.VITE_APPWRITE_DATABASE_ID,
            import.meta.env.VITE_APPWRITE_LIBRARY_COLLECTION_ID,
            [
                Query.equal("userId", userId)
            ]
            );
        setLibrary(libraryResult.documents);
        const dna = calculateReaderDna(
            libraryResult.documents
        );
        setReaderDna(dna);

        const currentUser = await account.get();
        const myLibraryResult = await databases.listDocuments(
            import.meta.env.VITE_APPWRITE_DATABASE_ID,
            import.meta.env.VITE_APPWRITE_LIBRARY_COLLECTION_ID,
        [
            Query.equal("userId", currentUser.$id)
        ]
        );
        const myDna = calculateReaderDna(
        myLibraryResult.documents
        );
        const score = calculateMatchScore(
            myDna,
            dna,
            myLibraryResult.documents,
            libraryResult.documents
        );
        setMatchScore(score);
    
        if (result.documents.length > 0) {
            setProfile(result.documents[0]);
        }
        } catch (error) {
        console.error("Failed to load public profile:", error);
        } finally {
        setLoading(false);
        }
    }
    if (loading) {
        return <div className="p-10">Loading profile...</div>;
    }
    if (!profile) {
        return <div className="p-10">Profile not found.</div>;
    }
    return (
        <div className="p-10">
        <h1 className="text-3xl font-bold">
            {profile.displayName}
        </h1>
        <p className="text-gray-500">
            @{profile.username}
        </p>

        {profile.bio && (
            <p className="mt-4">
            {profile.bio}
            </p>
        )}
        <p className="mt-4 font-bold">
            {matchScore}% Match
        </p>
        <p className="mt-4">
            Books in library: {library.length}
        </p>
        {favorites.length === 0 ? (
            <p>No favourite books yet.</p>
        ) : (
           <div className="flex gap-4 flex-wrap">
                {favorites.map((book) => (
                    <div key={book.$id}>
                        {book.coverId && (
                            <img
                                src={`https://covers.openlibrary.org/b/id/${book.coverId}-M.jpg`}
                                alt={book.title}
                                className="w-24"
                            />
                        )}
                    <p className="text-sm mt-1">
                    {book.title}
                    </p>
                    </div>
                ))}
            </div>
        )}
        </div>
    );
    }
    export default PublicProfile;
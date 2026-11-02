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
        async function loadProfile() {
            try {
                const user = await account.get();
                const libraryResult = await databases.listDocuments(
                    import.meta.env.VITE_APPWRITE_DATABASE_ID,
                    import.meta.env.VITE_APPWRITE_LIBRARY_COLLECTION_ID,
                    [
                        Query.equal("userId", user.$id)
                    ]
                )
                setLibrary(libraryResult.documents);
                const result = await databases.listDocuments(
                    import.meta.env.VITE_APPWRITE_DATABASE_ID,
                    import.meta.env.VITE_APPWRITE_PROFILES_COLLECTION_ID,
                    [
                        Query.equal("userId",user.$id)
                    ]
                );
                if(result.documents.length > 0) {
                    const savedProfile = result.documents[0];
                    setProfile(savedProfile);
                    setUsername(savedProfile.username);
                    setDisplayName(savedProfile.displayName);
                    setBio(savedProfile.bio || "");
                }
            } catch (error) {
                console.error("Failed to load profile:",error);
            } finally {
                setLoading(false);
            }
        }
        loadProfile();
    },[])

    const booksRead = library.filter(
        (book) => book.status === "read"
    ).length;

    const currentlyReading = library.filter(
        (book) => book.status === "reading"
    ).length;

    const wantToRead = library.filter(
        (book) => book.status === "want_to_read"
    ).length;

    const favorites = library.filter(
        (book) => book.favorite === true
    );

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
                    username: username,
                    displayName: displayName,
                    bio: bio
                }
            )
            setProfile(created);
        } catch(error) {
            console.error("Failed to create profile:",error);
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
                    username: username,
                    displayName: displayName,
                    bio: bio
                }
            )
            setProfile(updated);
            setEditing(false);
        } catch (error) {
            console.error("Failed to update profile:",error);
            alert(error.message);
        }
    }

    if(loading){
        return (
            <div className="p-10">
                Loading Profile...
            </div>
        );
    }
    return (
        <div className="min-h-screen bg-stone-100 p-10">
            <div className="max-w-xl mx-auto">
                <h1 className="text 4-xl font-bold mb-8">Profile</h1>
                {!profile ? (
                    <form onSubmit={createProfile} className="flex flex-col gap-4">
                        <input 
                            type="text"
                            placeholder="Username"
                            value={username}
                            onChange={(e)=> setUsername(e.target.value)}
                            className="border border-stone-300 p-3 rounded-lg"
                            required
                        />
                        <input 
                            type="text"
                            placeholder="Display Name"
                            value={displayName}
                            onChange={(e)=> setDisplayName(e.target.value)}
                            className="border border-stone-300 p-3 rounded-lg"
                            required
                        />
                        <textarea 
                            placeholder="Something about yourself?"
                            value={bio}
                            onChange={(e)=> setBio(e.target.value)}
                            className="border border-stone-300 p-3 rounded-lg min-h-32"
                        />
                        <button type="submit" className="bg-black text-white p-3 rounded-lg cursor-pointer">Create profile</button>
                    </form>
                ) : editing ? (
                    <form
                        onSubmit={updateProfile}
                        className="flex flex-col gap-4"
                    >
                        <input 
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="border border-stone-300 p-3 rounded-lg"
                            required
                        />
                        <input 
                            type="text"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            className="border border-stone-300 p-3 rounded-lg"
                            required
                        />
                        <textarea 
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            className="border border-stone-300 p-3 rounded-lg min-h-32"
                        />
                        <div className="flex gap-3">
                            <button
                                type="submit"
                                className="bg-black text-white px-5 py-2 rounded-lg cursor-pointer"
                            >
                                Save
                            </button>
                            <button
                                type="button"
                                onClick={() => setEditing(false)}
                                className="border border-stone-300 px-5 py-2 rounded-lg cursor-pointer"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                ) : (
                    <div>
                        <h2 className="text-3xl font-bold">{profile.displayName}</h2>
                        <p className="text-stone-500 mb-5">@{profile.username}</p>
                        <p className="mb-6">{profile.bio || "No Bio Yet"}</p>
                        <div className="flex gap-8 mb-8">
                            <div>
                                <p className="text-2xl font-bold">{booksRead}</p>
                                <p className="text-sm text-stone-500">Books Read</p>
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{currentlyReading}</p>
                                <p className="text-sm text-stone-500">Reading</p>
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{wantToRead}</p>
                                <p className="text-sm text-stone-500">Want to Read</p>
                            </div>
                        </div>
                        <div className="mt-8">
                            <h2 className="text-2xl font-bold mb-4">Reader DNA</h2>
                            <h3 className="font-semibold mb-2">Genres</h3>
                            <div className="space-y-2">
                                {Object.entries(readerDna.genres)
                                .sort((a, b) => b[1] - a[1])
                                .slice(0, 5)
                                .map(([genre, score]) => (
                                    <div key={genre}>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span>{genre}</span>
                                        <span>{score}%</span>
                                    </div>
                                    <div className="w-full h-2 bg-gray-200 rounded">
                                        <div
                                        className="h-2 bg-black rounded"
                                        style={{ width: `${score}%` }}
                                        />
                                    </div>
                                    </div>
                                ))}
                            </div>
                            <div className="space-y-2">
                                {Object.entries(readerDna.themes)
                                    .sort((a, b) => b[1] - a[1])
                                    .slice(0, 5)
                                    .map(([theme, score]) => (
                                    <div key={theme}>
                                        <div className="flex justify-between text-sm mb-1">
                                        <span>{theme}</span>
                                        <span>{score}%</span>
                                        </div>

                                        <div className="w-full h-2 bg-gray-200 rounded">
                                        <div
                                            className="h-2 bg-black rounded"
                                            style={{ width: `${score}%` }}
                                        />
                                        </div>
                                    </div>
                                    ))}
                            </div>
                            </div>
                        {favorites.length > 0 && (
                            <div className="mb-10">
                                <h3 className="text-2xl font-bold mb-5">Favorite Books</h3>
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
                                    {favorites.map((book) =>(
                                        <Link
                                            key={book.$id}
                                            to={`/book/${book.bookId}`}
                                            className="group"
                                        >
                                            {book.coverId && (
                                                <img 
                                                    src={`https://covers.openlibrary.org/b/id/${book.coverId}-M.jpg`}
                                                    alt={book.title}
                                                    className="w-full rounded-lg group-hover:opacity-80 transition"
                                                />
                                            )}
                                            <p className="text-sm font-semibold mt-2 group-hover:underline">{book.title}</p>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}
                        <button
                            onClick={() => setEditing(true)}
                            className="border border-stone-300 px-5 py-2 rounded-lg cursor-pointer"
                        >
                            Edit Profile
                        </button>
                    </div>
                )
            }
            </div>
        </div>
    )
}

export default Profile;
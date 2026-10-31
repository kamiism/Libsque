import { ID, Permission, Query, Role } from "appwrite";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { account, databases } from "../appwrite/config";

function BookDetails() {
    const {bookId} = useParams();
    const [book, setBook] = useState(null);
    const [author, setAuthor] = useState("Unknown author");
    const [loading, setLoading] = useState(true);
    const [rating, setRating] = useState(0);
    const [libraryEntry, setLibraryEntry] = useState(null);
    const [progress, setProgress] = useState(0);

    async function addToLibrary(status) {
        try{
            const user = await account.get();

            const existing = await databases.listDocuments(
                import.meta.env.VITE_APPWRITE_DATABASE_ID,
                import.meta.env.VITE_APPWRITE_LIBRARY_COLLECTION_ID,    
                [
                    Query.equal("userId", user.$id),
                    Query.equal("bookId", bookId)
                ]
            )

            if(existing.documents.length>0) {
                const document  = existing.documents[0];

                const updated = await databases.updateDocument(
                    import.meta.env.VITE_APPWRITE_DATABASE_ID,
                    import.meta.env.VITE_APPWRITE_LIBRARY_COLLECTION_ID,
                    document.$id,
                    {
                        status: status
                    }
                );
                setLibraryEntry(updated);
                console.log("Library entry updated:",updated);
                alert(`Status changed to ${status}`);

                return;
            }
            const created = await databases.createDocument(
                import.meta.env.VITE_APPWRITE_DATABASE_ID,
                import.meta.env.VITE_APPWRITE_LIBRARY_COLLECTION_ID,
                ID.unique(),{
                    userId: user.$id,
                    bookId: bookId,
                    title: book.title,
                    author: author,
                    coverId: book?.covers?.[0] || null,
                    status: status,
                    rating: null,
                    favorite: false,
                    progress: 0,
                }, 
                    [
                        Permission.read(Role.user(user.$id)),
                        Permission.update(Role.user(user.$id)),
                        Permission.delete(Role.user(user.$id)),
                    ]
            );
            setLibraryEntry(created);
            console.log("Library Entry Created:",created);
            alert("Added to your library");
        } catch(error){
            console.error("Failed to update:",error);
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
            const updated =     await databases.updateDocument(
            import.meta.env.VITE_APPWRITE_DATABASE_ID,
            import.meta.env.VITE_APPWRITE_LIBRARY_COLLECTION_ID,
            document.$id,
            {
                rating: newRating,
            }
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
            {
                favorite: newFavorite,
            }
            );
            setLibraryEntry(updated);
        } catch (error) {
            console.error("Favorite update failed:", error);
            alert(error.message);
        }
    }

    async function updateProgress(newProgress) {
        try {
            if(!libraryEntry) {
                return;
            }
            const updated = await databases.updateDocument(
                import.meta.env.VITE_APPWRITE_DATABASE_ID,
                import.meta.env.VITE_APPWRITE_LIBRARY_COLLECTION_ID,
                libraryEntry.$id,
                {
                    progress: Number(newProgress)
                }
            );
            setLibraryEntry(updated);
            setProgress(updated.progress)
        } catch(error) {
            console.error("Progression update failed:",error);
            alert(error.message);
        }
    }

    useEffect(() => {
    async function loadLibraryEntry() {
        try{
            const user = await account.get();
            const result = await databases.listDocuments(
                import.meta.env.VITE_APPWRITE_DATABASE_ID,
                import.meta.env.VITE_APPWRITE_LIBRARY_COLLECTION_ID,
                [
                    Query.equal("userId",user.$id),
                    Query.equal("bookId",bookId),
                ]  
            );
            if(result.documents.length > 0) {
                const entry = result.documents[0];

                setLibraryEntry(entry);
                setRating(entry.rating || 0);
                setProgress(entry.progress || 0);
            } else {
                setLibraryEntry(null);
                setRating(0);
                setProgress(0);
            }
        } catch(error) {
            console.error("Cannot load library entry:",error)
        }
    }

        async function getBook() {
            try{
                const response = await fetch(`https://openlibrary.org/works/${bookId}.json`);
                const data = await response.json();
                console.log("Book details:",data);
                setBook(data);
                if(data.authors?.length > 0) {
                    const authorKey = data.authors[0].author.key;
                    const authorResponse = await fetch(
                        `https://openlibrary.org${authorKey}.json`
                    );
                    
                    const authorData = await authorResponse.json();

                    setAuthor(authorData.name);
                }
            } catch(error) {
                console.error("Failed to get book:",error);
            } finally {
                setLoading(false);
            }
        }
        getBook();
        loadLibraryEntry();
    },[bookId]);

    if(loading) {
        return (
            <div className="min-h-screen bg-stone-100 p-10">Loading...</div>
        );
    }

    if(!book){
        return (
            <div className="min-h-screen bg-stone-100 p-10">
                Book not found
            </div>
        );
    }

    const description = typeof book.description === "string" ? book.description : book.description?.value;

    const coverId = book.covers?.[0];

    return (
        <div className="min-h-screen bg-stone-100">
            <nav className="p-8">
                <Link 
                to="/"
                className="font-bold text-2xl text-black no-underline"
                >
                Libsque
                </Link>
            </nav>
            <main className="max-w-5xl mx-auto px-8 py-10">
                <div className="grid md:grid-cols-[280px_1fr] gap-12">
                    <div>
                        {coverId ? (
                            <img src={`https://covers.openlibrary.org/b/id/${coverId}-L.jpg`}
                            alt={book.title}
                            className="w-full rounded-lg" />
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
                            <p className="mb-3 text-sm text-stone-500">
                                Currently: {libraryEntry.status.replaceAll("_", " ")}
                            </p>
                        )}
                        <div className="flex flex-wrap gap-3 mt-8">
                            <button 
                            onClick={() => addToLibrary("want_to_read")}
                            className={`px-4 py-2 rounded-lg cursor-pointer ${
                                libraryEntry?.status === "want_to_read"
                                ? "bg-black text-white"
                                : "border border-stone-300"
                            }`}>
                                Want to Read
                            </button>
                            <button 
                            onClick={() => addToLibrary("reading")}
                            className={`px-4 py-2 rounded-lg cursor-pointer ${
                                libraryEntry?.status === "reading"
                                ? "bg-black text-white"
                                : "border border-stone-300"
                            }`}>
                                Reading
                            </button>
                            <button 
                            onClick={() => addToLibrary("read")}
                            className={`px-4 py-2 rounded-lg cursor-pointer ${
                                libraryEntry?.status === "read"
                                ? "bg-black text-white"
                                : "border border-stone-300"
                            }`}>
                                Read
                            </button>
                        </div>
                        <div className="mt-6">
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
                            className="mt-5 text-lg cursor-pointer"
                            >
                                {libraryEntry?.favorite
                                    ? "♥ Favourite"
                                    : "♡ Add to favourites"}
                            </button>
                            {libraryEntry?.status === "reading" && (
                                <div className="mt-6">
                                    <p className="font-semibold mb-2">
                                        Reading Progress - {progress}%
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
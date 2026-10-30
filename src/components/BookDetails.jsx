import { ID, Permission, Role } from "appwrite";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { account, databases } from "../appwrite/config";

function BookDetails() {
    const {bookId} = useParams();
    const [book, setBook] = useState(null);
    const [loading, setLoading] = useState(true);

    async function addToLibrary(status) {
        try{
            const user = await account.get();
            const result = await databases.createDocument(
                import.meta.env.VITE_APPWRITE_DATABASE_ID,
                import.meta.env.VITE_APPWRITE_LIBRARY_COLLECTION_ID,

                ID.unique(),{
                    userid: user.$id,
                    bookId: bookId,
                    title: book.title,
                    author: "Unknown Author",
                    coverId: coverId || null,
                    status: status,
                    rating: null,
                    favorite: false,
                    progress: 0,
                }, [
                    Permission.read(Role.user(user.$id)),
                    Permission.update(Role.user(user.$id)),
                    Permission.delete(Role.user(user.$id)),
                ]
            );
            console.log("Added to Library:",result);
            alert("Added to your library");
            } catch(error){
                console.error("Failed to add book:",error);
                alert(error.message);
        }
    }

    useEffect(() => {
        async function getBook() {
            try{
                const response = await fetch(`https://openlibrary.org/works/${bookId}.json`);
                const data = await response.json();
                console.log("Book details:",data);
                setBook(data);
            } catch(error) {
                console.error("Failed to get book:",error);
            } finally {
                setLoading(false);
            }
        }
        getBook();
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
                        {description ? (
                            <p className="mt-6 text-stone-600 leading-7">{description}</p>
                        ) : (
                            <p className="mt-6 text-stone-400">No description available.</p>
                        )}
                        <div className="flex flex-wrap gap-3 mt-8">
                            <button 
                            onClick={() => addToLibrary("want_to_read")}
                            className="border border-black px-5 py-3 rounded-lg cursor-pointer">Want to Read</button>
                            <button 
                            onClick={() => addToLibrary("reading")}
                            className="border border-black px-5 py-3 rounded-lg cursor-pointer">Reading</button>
                            <button 
                            onClick={() => addToLibrary("read")}
                            className="bg-black text-white px-5 py-3 rounded-lg cursor-pointer">Read</button>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

export default BookDetails;
import { useState } from "react";
import { Link } from "react-router-dom";

function BookSearch() {
    const [query, setQuery] = useState("");
    const [books, setBooks] = useState([]);
    const [loading, setLoading] = useState(false);

    async function searchBooks(e) {
        e.preventDefault();
        if(!query.trim()) return;
        try{
            setLoading(true);
            const response = await fetch(
                `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=12`
        );

        const data = await response.json();
        console.log(data.docs);
        const formattedBooks = data.docs.map((book) => ({
            id: book.key,
            title: book.title,
            author: book.author_name?.[0] || "Unknown Author",
            coverId: book.cover_i || null,
            year: book.first_publish_year || null,
            isbn: book.isbn?.[0] || null,
        }));
        setBooks(formattedBooks);
        } catch(error){
            console.error("Book Search Failed:",error);
        } finally{
            setLoading(false);
        }
    }

    return(
        <div className="min-h-screen bg-stone-100 p-10">
            <h1 className="text-4xl font-bold mb-8">LIBSQUE</h1>
            <form onSubmit={searchBooks} className="flex gap-2 max-w-xl mb-10">
                <input 
                type="text" 
                placeholder="Search books,authors..." 
                value={query}
                onChange={(e)=>setQuery(e.target.value)}
                className="flex-1 border border-stone-300 rounded-lg px-4 py-3"
                />
                <button type="submit" className="bg-black text-white px-6 rounded-lg cursor-pointer">
                    Search
                </button>
            </form>

            {loading && (
                <p className="text-stone-500">Searching...</p>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                {books.map((book) => (
                <Link
                    to={`/book/${book.id.replace("/works/", "")}`}
                    key={book.id}
                    className="block text-black no-underline"
                >
                    {book.coverId ? (
                    <img
                        src={`https://covers.openlibrary.org/b/id/${book.coverId}-M.jpg`}
                        alt={book.title}
                        className="w-full aspect-2/3 object-cover rounded-md"
                    />
                    ) : (
                    <div className="w-full aspect-2/3 bg-stone-300 rounded-md flex items-center justify-center text-stone-500">
                        No cover
                    </div>  
                    )}

                    <h2 className="font-semibold mt-3">
                    {book.title}
                    </h2>

                    <p className="text-sm text-stone-500">
                    {book.author}
                    </p>

                    {book.year && (
                    <p className="text-xs text-stone-400 mt-1">
                        {book.year}
                    </p>
                    )}
                </Link>
                ))}
            </div>
        </div>
    );
}

export default BookSearch;
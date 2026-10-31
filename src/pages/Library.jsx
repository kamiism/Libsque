import { Query } from "appwrite";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { account, databases } from "../appwrite/config";

function BookCard({book}) {
    return (
        <Link
            to={`/book/${book.bookId}`}
            className="block group"
        >
            {book.coverId && (
                <img
                    src={`https://covers.openlibrary.org/b/id/${book.coverId}-M.jpg`}
                    alt={book.title}
                    className="w-full rounded-lg mb-2 group-hover:opacity-80 transition"
                />
            )}
            <h3 className="font-semibold group-hover:underline">{book.title}</h3>
            <p className="text-sm text-stone-500">{book.author}</p>
        </Link>
    )
}

function Library() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function getLibrary() {
      try {
        const user = await account.get();
        const result = await databases.listDocuments(
          import.meta.env.VITE_APPWRITE_DATABASE_ID,
          import.meta.env.VITE_APPWRITE_LIBRARY_COLLECTION_ID,
          [
            Query.equal("userId", user.$id)
          ]
        );
        console.log("My library:", result.documents);
        setBooks(result.documents);
      } catch (error) {
        console.error("Failed to load library:", error);
      } finally {
        setLoading(false);
      }
    }
    getLibrary();
  }, []);

  const readingBooks = books.filter(
    (book) => book.status === "reading"
  );
  const wantToReadBooks = books.filter(
    (book) => book.status === "want_to_read"
  )
  const readBooks = books.filter(
    (book) => book.status === "read"
  )
  const droppedBooks = books.filter(
    (book) => book.status === "dropped"
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-100 p-10">
        <p>Loading your library...</p>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-stone-100 p-10">
      <h1 className="text-4xl font-bold mb-8">
        My Library
      </h1>
      {books.length === 0 ? (
        <p className="text-stone-500">
          Your library is empty.
        </p>
      ) : (
        <div className="space-y-12">
            {readingBooks.length > 0 && (
                <section>
                    <h2 className="text-2xl font-bold mb-5">
                        Currently Reading
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                        {readingBooks.map((book) => (
                            <BookCard key={book.$id} book={book} />
                        ))}
                    </div>
                </section>
            )}

            {wantToReadBooks.length > 0 && (
                <section>
                    <h2 className="text-2xl font-bold mb-5">
                        Want to Read
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                        {wantToReadBooks.map((book) => (
                            <BookCard key={book.$id} book={book} />
                        ))}
                    </div>
                </section>
            )}

            {readBooks.length > 0 && (
                <section>
                    <h2 className="text-2xl font-bold mb-5">
                        Finished
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                        {readBooks.map((book) => (
                            <BookCard key={book.$id} book={book} />
                        ))}
                    </div>
                </section>
            )}

            {droppedBooks.length > 0 && (
                <section>
                    <h2 className="text-2xl font-bold mb-5">
                        Dropped
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                        {droppedBooks.map((book) => (
                            <BookCard key={book.$id} book={book} />
                        ))}
                    </div>
                </section>
            )}
        </div>
      )}
    </div>
  );
}

export default Library;
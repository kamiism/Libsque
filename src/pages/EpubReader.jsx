import ePub from "epubjs";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

function EpubReader() {
    const {gutenbergId} = useParams();
    const viewerRef = useRef(null);
    const renditionRef = useRef(null);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!viewerRef.current) return;
        const book = ePub(`/books/${gutenbergId}.epub`);
        const rendition = book.renderTo(viewerRef.current, {
        width: "100%",
        height: "100%",
        flow: "paginated",
        });
        renditionRef.current = rendition;
        rendition.display().catch((err) => {
        console.error("EPUB display failed:", err);
        setError("Could not display this EPUB.");
        });

        return () => {
        rendition.destroy();
        book.destroy();
        };
    }, [gutenbergId]);

    return (
        <div className="min-h-screen bg-white text-black p-6">
        <h1 className="text-2xl font-bold mb-4">
            Libsque EPUB Reader
        </h1>
        {error && <p className="text-red-600">{error}</p>}
        <div
            ref={viewerRef}
            className="w-full max-w-4xl mx-auto border"
            style={{ height: "75vh" }}
        />
        <div
            className="flex justify-between max-w-4xl mx-auto mt-6"
        > 
            <button
                onClick={() => renditionRef.current?.prev()}
                className="border rounded px-5 py-2"
            >
                ← Previous
            </button>
            <button
                onClick={() => renditionRef.current?.next()}
                className="border rounded px-5 py-2"
            >
                Next →
            </button>
        </div>
        </div>
    );
}

export default EpubReader;

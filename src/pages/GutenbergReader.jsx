import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

function GutenbergReader(){
    //console.log("GUTENBERG READER MOUNTED");
    const {gutenbergId} = useParams();
    const chapterStorageKey = `gutenberg_${gutenbergId}_chapter`;
    const navigate = useNavigate();
    const [chapter, setChapter] = useState(1)
    const [savedBookId, setSavedBookId] = useState(null);
    const [bookData, setBookData] =  useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [fontSize, setFontSize] = useState(() => {
        const saved = Number(localStorage.getItem("readerFontSize"));
        return saved >= 14 && saved <= 30 ? saved: 18;
    });
    const [theme, setTheme] = useState(() => {
        const saved = localStorage.getItem("readerTheme");
        return ["light", "dark", "sepia"].includes(saved)
            ? saved : "light";
    });
    const themes = {
        light: "bg-white text-gray-900",
        dark: "bg-black text-gray-100",
        sepia: "bg-[#f4ecd8] text-[#594936]"
    };

    const totalChapters = bookData?.totalChapters || 61;
    const progress = Math.round(
        ((chapter - 1)/totalChapters) * 100
    )

    useEffect(() => {
        const saved = Number(localStorage.getItem(chapterStorageKey));
        setChapter(
            Number.isInteger(saved) && saved>=1 ? saved : 1
        );
        setSavedBookId(gutenbergId);
    }, [chapterStorageKey, gutenbergId]);

    useEffect(() => {
        if(savedBookId === gutenbergId){
            localStorage.setItem(chapterStorageKey, chapter);
        }
    }, [chapter, chapterStorageKey, gutenbergId, savedBookId])

    useEffect(() => {
        localStorage.setItem("readerFontSize", fontSize);
        localStorage.setItem("readerTheme", theme);
    }, [fontSize, theme]);

    useEffect(() => {
        //console.log("USE EFFECT RUNNING — Chapter:", chapter);
        async function loadChapter() {
            //console.log("INSIDE LOAD CHAPTER");
            try{
                //console.log("INSIDE TRY BLOCK");
                setLoading(true);
                setError("");

                const url = `/api/gutenberg/${gutenbergId}/chapter/${chapter}`;
                //console.log("FETCH STARTING:", url);
                const response = await fetch(url);
                //console.log("FETCH FINISHED:", response.status);
                const data = await response.json();
                console.log("Gutenberg Reader received:", data);
                setBookData(data);
            } catch (err){
                console.error("Chapter load failed:",err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        //console.log("ABOUT TO FETCH CHAPTER");
        loadChapter();
    }, [chapter, gutenbergId]);

    return (
         <div className={`min-h-screen ${themes[theme]}`}>
      <header className="flex items-center justify-between border-b p-5">
        <button onClick={() => navigate(-1)}>
          ← Back
        </button>
        <h1 className="font-bold">Libsque Reader</h1>
        <select
            value={chapter}
            onChange={(e) => {
                setChapter(Number(e.target.value));
                window.scrollTo(0, 0);
            }}
            className="border rounded px-3 py-2 bg-transparent"
        >
            {Array.from(
                {length: bookData?.totalChapters || 61},
                (_, index) => (
                    <option key={index + 1} value={index + 1}>
                        Chapter {index + 1}
                    </option>
                )
            )}
        </select>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12">
        {loading ? (
          <p>Loading chapter...</p>
        ) : error ? (
          <p>{error}</p>
        ) : bookData ? (
          <>
            <h2 className="text-3xl font-bold mb-3">
              {bookData.title}
            </h2>
            <h3 className="text-xl mb-8">
              Chapter {bookData.chapter}
            </h3>
            <div className="mb-8">
                <div className="flex justify-between text-sm mb-2">
                    <span>Reading Progress</span>
                    <span>{progress}%</span>
                </div>
                <div className="w-full h-2 bg-gray-300 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-green-600 transition-all"
                        style={{width: `${progress}%`}}
                    />
                </div>
            </div>
            <div className="flex items-center gap-4 mb-8">
                <span className="text-sm">Font Size:</span>
                <button
                    onClick={() => setFontSize((size) => Math.max(14, size-2))}
                    className="border rounded px-3 py-1"
                >
                    A-
                </button>
                <span>{fontSize}px</span>
                <button
                    onClick={() => setFontSize((size) => Math.min(30, size+2))}
                    className="border rounded px-3 py-1"
                >
                    A+
                </button>
            </div>
            <div className="flex gap-3 mb-8">
                {["light", "dark", "sepia"].map((option) => (
                    <button
                        key={option}
                        onClick={() => setTheme(option)}
                        className={`px-4 py-2 rounded border capitalize ${
                            theme === option ? "font-bold underline" : ""
                        }`}
                    >
                        {option}
                    </button>
                ))}
            </div>
            <div className="space-y-6 leading-relaxed" style={{fontSize: `${fontSize}px`}}>
              {bookData.paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>

            <div className="flex justify-between mt-12 border-t pt-6">
              <button
                disabled={chapter === 1}
                onClick={() => {
                  setChapter(chapter - 1);
                  window.scrollTo(0, 0);
                }}
                className="border px-4 py-2 rounded disabled:opacity-40"
              >
                ← Previous
              </button>
              <button
                disabled={chapter >= bookData.totalChapters}
                onClick={() => {
                  setChapter(chapter + 1);
                  window.scrollTo(0, 0);
                }}
                className="border px-4 py-2 rounded disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}

export default GutenbergReader;
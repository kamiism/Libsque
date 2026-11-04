import { useNavigate, useParams } from "react-router-dom";

function Reader() {
  const { archiveId, googleBookId } = useParams();
  const navigate = useNavigate();
  const isGoogleBook = Boolean(googleBookId);
  const readerUrl = isGoogleBook ? 
     `https://books.google.com/books?vid=${encodeURIComponent(googleBookId)}&printsec=frontcover&output=embed` : `https://archive.org/stream/${encodeURIComponent(archiveId)}?ui=embed`;
  return (
    <div className="w-full h-screen flex flex-col">
      <div className="border-b p-3 flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="border px-3 py-1 rounded"
        >
          O- Back
        </button>
        <h1 className="font-bold">
          {isGoogleBook ? "Google Preview" : "Libsque Reader"}
        </h1>
        <div className="w-16"></div>
      </div>
      <iframe
        key={readerUrl}
        src={readerUrl}
        className="w-full flex-1 border-0"
        title={isGoogleBook ? "Google Preview" : "Libsque Reader"}
      />
    </div>
  );
}
export default Reader;
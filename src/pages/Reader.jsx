import { useParams } from "react-router-dom";

function Reader() {
  const { archiveId } = useParams();

  return (
    <div className="w-full h-screen">
      <iframe
        src={`https://archive.org/stream/${archiveId}?ui=embed`}
        className="w-full h-full border-0"
        title="Libsque Reader"
        allow="fullscreen"
      />
    </div>
  );
}

export default Reader;

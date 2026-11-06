import { Navigate, useParams } from "react-router-dom";

export default function Reader() {
  const { archiveId, googleBookId } = useParams();
  if (googleBookId) {
    return <Navigate to={`/read/google/${googleBookId}`} replace />;
  }
  return <Navigate to={`/read/ia/${archiveId}`} replace />;
}

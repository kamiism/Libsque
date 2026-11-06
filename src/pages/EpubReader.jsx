import { Navigate, useParams } from "react-router-dom";

export default function EpubReader() {
  const { gutenbergId } = useParams();
  return <Navigate to={`/read/epub/${gutenbergId}`} replace />;
}

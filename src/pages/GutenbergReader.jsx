import { Navigate, useParams, useSearchParams } from "react-router-dom";

export default function GutenbergReader() {
  const { gutenbergId } = useParams();
  const [searchParams] = useSearchParams();
  const workId = searchParams.get("workId");
  const query = workId ? `?workId=${encodeURIComponent(workId)}` : "";
  return <Navigate to={`/read/epub/${gutenbergId}${query}`} replace />;
}

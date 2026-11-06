import { BrowserRouter, Route, Routes, Navigate, useParams } from "react-router-dom";
import BookDetails from "./components/BookDetails";
import BookSearch from "./components/BookSearch";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import Feed from "./pages/Feed";
import Library from "./pages/Library";
import Auth from "./pages/LoginPage";
import Profile from "./pages/Profile";
import PublicProfile from "./pages/PublicProfile";
import UnifiedReader from "./pages/UnifiedReader";

function LegacyArchiveRedirect() {
  const { archiveId } = useParams();
  return <Navigate to={`/read/ia/${archiveId}`} replace />;
}

function LegacyGutenbergRedirect() {
  const { gutenbergId } = useParams();
  return <Navigate to={`/read/epub/${gutenbergId}`} replace />;
}

function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/read/gutenberg/:gutenbergId"
          element={<LegacyGutenbergRedirect />}
        />
        <Route
          path="/read/:source/:bookId"
          element={<UnifiedReader />}
        />
        <Route
          path="/read/:archiveId"
          element={<LegacyArchiveRedirect />}
        />

        <Route path="/" element={<BookSearch />} />
        <Route
          path="/feed"
          element={
            <ProtectedRoute>
              <Feed />
            </ProtectedRoute>
          }
        />
        <Route
          path="/user/:userId"
          element={
            <ProtectedRoute>
              <PublicProfile />
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<Auth />} />
        <Route path="/book/:bookId" element={<BookDetails />} />
        <Route
          path="/library"
          element={
            <ProtectedRoute>
              <Library />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

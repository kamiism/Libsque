import { BrowserRouter, Route, Routes } from "react-router-dom";
import BookDetails from "./components/BookDetails";
import BookSearch from "./components/BookSearch";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import EpubReader from "./pages/EpubReader";
import Feed from "./pages/Feed";
import GutenbergReader from "./pages/GutenbergReader";
import Library from "./pages/Library";
import Auth from "./pages/LoginPage";
import Profile from "./pages/Profile";
import PublicProfile from "./pages/PublicProfile";
import Reader from "./pages/Reader";

function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/profile" element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
          } 
        />
        <Route 
          path="/read/:archiveId"
          element={
            <ProtectedRoute>
              <Reader />
            </ProtectedRoute>
          }
        />
        <Route 
          path="/read/gutenberg/:gutenbergId"
          element={
            <ProtectedRoute>
              <GutenbergReader />
            </ProtectedRoute>
          }
        />
        <Route 
          path="/read/epub/:gutenbergId"
          element={
            <ProtectedRoute>
              <EpubReader />
            </ProtectedRoute>
          }
        />
        <Route 
          path="/read/google/:googleBookId"
          element={
            <ProtectedRoute>
              <Reader />
            </ProtectedRoute>
          }
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
        <Route path="/library" element={
          <ProtectedRoute>
            <Library />
          </ProtectedRoute>
          } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
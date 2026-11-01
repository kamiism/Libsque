import { BrowserRouter, Route, Routes } from "react-router-dom";
import BookDetails from "./components/BookDetails";
import BookSearch from "./components/BookSearch";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import Library from "./pages/Library";
import Auth from "./pages/LoginPage";
import Profile from "./pages/Profile";

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
        <Route path="/" element={<BookSearch />} />
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
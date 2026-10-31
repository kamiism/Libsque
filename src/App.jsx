import { BrowserRouter, Route, Routes } from "react-router-dom";
import BookDetails from "./components/BookDetails";
import BookSearch from "./components/BookSearch";
import Navbar from "./components/NavBar";
import Library from "./pages/Library";
import Auth from "./pages/LoginPage";

function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<BookSearch />} />
        <Route path="/login" element={<Auth />} />
        <Route path="/book/:bookId" element={<BookDetails />} />
        <Route path="/library" element={<Library />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
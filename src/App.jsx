import { BrowserRouter, Route, Routes } from "react-router-dom";
import BookDetails from "./components/BookDetails";
import BookSearch from "./components/BookSearch";
import Auth from "./pages/LoginPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BookSearch />} />
        <Route path="/login" element={<Auth />} />
        <Route path="/book/:bookId" element={<BookDetails />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
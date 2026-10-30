import { BrowserRouter, Route, Routes } from "react-router-dom";
import BookDetails from "./components/BookDetails";
import BookSearch from "./components/BookSearch";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BookSearch />} />
        <Route path="/book/:bookId" element={<BookDetails />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
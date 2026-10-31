import { Link } from "react-router-dom";

function Navbar() {
  return (
    <nav className="flex items-center justify-between px-10 py-5 bg-stone-100 border-b border-stone-200">
      <Link
        to="/"
        className="text-2xl font-bold"
      >
        Libsque
      </Link>
      <div className="flex gap-6">
        <Link
          to="/"
          className="hover:underline"
        >
          Search
        </Link>
        <Link
          to="/profile"
          className="hover:underline"
        >
          Profile
      </Link>
        <Link
          to="/library"
          className="hover:underline"
        >
          My Library
        </Link>
      </div>
    </nav>
  );
}

export default Navbar;
import { Link } from "react-router-dom";
import { account } from "../appwrite/config";
import { useAuth } from "../context/AuthContext";

function Navbar() {
  const { user, setUser, authLoading } = useAuth();

  async function handleLogout() {
    try {
      await account.deleteSession("current");
      setUser(null);
    } catch (error) {
      console.error("Logout failed:",error)
    }
  }

  return (
    <nav className="flex items-center justify-between px-10 py-5 bg-stone-100 border-b border-stone-200">
      <Link
        to="/"
        className="text-2xl font-bold"
      >
        Libsque
      </Link>
      <div className="flex items-center gap-6">
        <Link
          to="/"
          className="hover:underline"
        >
          Search
        </Link>
        {!authLoading && (
          <>
            {user ? (
              <>
                <Link
                  to="/library"
                  className="hover:underline"
                >
                  My Library
                </Link>
                <Link
                  to="/profile"
                  className="hover:underline"
                >
                  Profile
                </Link>
                <button onClick={handleLogout} className="hover:underline cursor-pointer">Logout</button>
              </>
            ) :(
              <Link
                to="/login"
                className="hover:underline"
              >
                Sign In
              </Link>
            )}
          </>
        )}
      </div>
    </nav>
  );
}

export default Navbar;
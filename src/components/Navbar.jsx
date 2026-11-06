import { Link, useLocation } from "react-router-dom";
import { account } from "../appwrite/config";
import { useAuth } from "../context/AuthContext";

function Navbar() {
  const { user, setUser, authLoading } = useAuth();
  const location = useLocation();

  async function handleLogout() {
    try {
      await account.deleteSession("current");
      setUser(null);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }

  const navLinks = [
    { to: "/", label: "Discover" },
    { to: "/feed", label: "Readers" },
    { to: "/library", label: "Bookshelf" },
    { to: "/profile", label: "Profile" },
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#F0FAEF]/95 backdrop-blur-md border-b border-[#1D3557]/10 transition-colors w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2">
        {/* Wordmark: Uppercase, Bold, Coral Red (#E73847) */}
        <div className="flex items-center shrink-0">
          <Link
            to="/"
            className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight text-[#E73847] hover:opacity-90 transition font-serif"
            style={{ fontVariationSettings: '"opsz" 36' }}
          >
            LIBSQUE
          </Link>
        </div>

        {/* Text-first navigation */}
        <nav className="flex items-center gap-1 sm:gap-2 md:gap-4 text-xs sm:text-sm font-medium overflow-x-auto no-scrollbar">
          {navLinks.map((link) => {
            const isActive =
              link.to === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(link.to);
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg transition-all shrink-0 ${
                  isActive
                    ? "bg-[#A8DADB]/40 text-[#1D3557] font-semibold shadow-xs"
                    : "text-[#1D3557]/80 hover:text-[#1D3557] hover:bg-[#A8DADB]/20"
                }`}
              >
                {link.label}
              </Link>
            );
          })}

          <div className="h-4 w-px bg-[#1D3557]/15 mx-0.5 sm:mx-1 shrink-0" />

          {!authLoading && (
            user ? (
              <button
                onClick={handleLogout}
                className="px-2 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs uppercase tracking-wider font-semibold text-[#1D3557]/70 hover:text-[#E73847] transition cursor-pointer shrink-0"
              >
                Sign Out
              </button>
            ) : (
              <Link
                to="/login"
                className="px-2.5 sm:px-4 py-1 sm:py-1.5 bg-[#1D3557] text-[#F0FAEF] rounded-lg text-[11px] sm:text-xs font-semibold tracking-wide uppercase hover:bg-[#457B9D] transition shadow-xs shrink-0"
              >
                Sign In
              </Link>
            )
          )}
        </nav>
      </div>
    </header>
  );
}

export default Navbar;

import { ID } from "appwrite";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { account } from "../appwrite/config";
import { useAuth } from "../context/AuthContext";
import { BookstackWalker } from "../components/Illustrations";

function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const { setUser } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const navigate = useNavigate();

  async function handleSignup(e) {
    e.preventDefault();
    setLoading(true);
    setAuthError("");

    try {
      await account.create({
        userId: ID.unique(),
        email: email,
        password: password,
        name: name,
      });

      await account.createEmailPasswordSession({
        email: email,
        password: password,
      });

      const currentUser = await account.get();
      setUser(currentUser);
      navigate("/");
    } catch (error) {
      console.error("Signup failed:", error);
      setAuthError(error.message || "Failed to create account.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setAuthError("");

    try {
      await account.createEmailPasswordSession({
        email: email,
        password: password,
      });

      const currentUser = await account.get();
      setUser(currentUser);
      navigate("/");
    } catch (error) {
      console.error("Login failed:", error);
      setAuthError(error.message || "Failed to sign in. Check email and password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F0FAEF] flex items-center justify-center px-6 py-12 text-[#1D3557]">
      <div className="w-full max-w-md bg-white border border-[#1D3557]/15 rounded-3xl p-8 sm:p-10 shadow-sm relative overflow-hidden">
        <div className="text-center mb-6">
          <BookstackWalker className="w-28 h-20 mx-auto mb-3" />
          <h1 className="font-serif font-black tracking-tight text-3xl sm:text-4xl text-[#E73847]">
            LIBSQUE
          </h1>
          <p className="text-sm font-sans text-[#1D3557]/70 mt-2">
            {isLogin
              ? "Welcome back."
              : "Find books. Find your people."}
          </p>
        </div>

        {authError && (
          <div className="bg-[#E73847]/10 border border-[#E73847]/30 text-[#E73847] text-xs font-mono p-3 rounded-xl mb-4">
            {authError}
          </div>
        )}

        <form
          onSubmit={isLogin ? handleLogin : handleSignup}
          className="flex flex-col gap-4"
        >
          {!isLogin && (
            <div>
              <label className="block text-xs font-mono uppercase text-[#1D3557]/80 mb-1">
                Your Name
              </label>
              <input
                type="text"
                placeholder="e.g. Jean Valjean"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#F0FAEF] border border-[#1D3557]/20 p-3 rounded-xl text-sm focus:outline-hidden focus:border-[#E73847]"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-mono uppercase text-[#1D3557]/80 mb-1">
              Email Address
            </label>
            <input
              type="email"
              placeholder="reader@libsque.org"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#F0FAEF] border border-[#1D3557]/20 p-3 rounded-xl text-sm focus:outline-hidden focus:border-[#E73847]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-mono uppercase text-[#1D3557]/80 mb-1">
              Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#F0FAEF] border border-[#1D3557]/20 p-3 rounded-xl text-sm focus:outline-hidden focus:border-[#E73847]"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#E73847] text-white font-mono text-xs font-bold uppercase tracking-wider py-3.5 rounded-full hover:bg-[#d02736] transition cursor-pointer shadow-xs mt-2 disabled:opacity-50"
          >
            {loading ? "Please wait..." : isLogin ? "Sign In" : "Create Account"}
          </button>
        </form>

        <div className="text-center mt-6 pt-6 border-t border-[#1D3557]/10">
          <p className="text-xs text-[#1D3557]/70 font-sans">
            {isLogin ? "New to Libsque?" : "Already part of the library?"}
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setAuthError("");
              }}
              className="ml-2 font-mono font-bold text-[#E73847] hover:underline cursor-pointer"
            >
              {isLogin ? "Create account" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Auth;

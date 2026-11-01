import { ID } from "appwrite";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { account } from "../appwrite/config";
import { useAuth } from "../context/AuthContext";

function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const { setUser } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const navigate = useNavigate();

  async function handleSignup(e) {
    e.preventDefault();

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
      alert(error.message);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();

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
      alert(error.message);
    }
  }

  return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center">

      <div className="w-full max-w-md p-8">

        <h1 className="text-5xl font-bold mb-2">
          Libsque.
        </h1>

        <p className="text-stone-500 mb-8">
          {isLogin
            ? "Welcome back."
            : "Find books. Find your people."}
        </p>

        <form
          onSubmit={isLogin ? handleLogin : handleSignup}
          className="flex flex-col gap-4"
        >

          {!isLogin && (
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border border-stone-300 p-3 rounded-lg"
              required
            />
          )}

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border border-stone-300 p-3 rounded-lg"
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border border-stone-300 p-3 rounded-lg"
            required
          />

          <button
            type="submit"
            className="bg-black text-white p-3 rounded-lg cursor-pointer"
          >
            {isLogin ? "Sign in" : "Create account"}
          </button>

        </form>

        <p className="text-center mt-5 text-stone-600">
          {isLogin
            ? "New to Libsque?"
            : "Already have an account?"}

          <button
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="ml-2 font-semibold text-black cursor-pointer"
          >
            {isLogin ? "Create account" : "Sign in"}
          </button>
        </p>

      </div>

    </div>
  );
}

export default Auth;
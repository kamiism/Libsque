import { createContext, useContext, useEffect, useState } from "react";
import { account } from "../appwrite/config";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  useEffect(() => {
    async function checkUser() {
      try {
        const currentUser = await account.get();
        setUser(currentUser);
      } catch (error) {
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    }
    checkUser();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        authLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  return useContext(AuthContext);
}
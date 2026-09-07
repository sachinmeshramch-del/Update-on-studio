import React, { createContext, useContext, useEffect, useState } from 'react';

// Define a simple custom User type to replace the Firebase User type
interface CustomUser {
  email: string;
}

interface AuthContextType {
  user: CustomUser | null;
  loading: boolean;
  loginWithPasscode: (passcode: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  loginWithPasscode: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CustomUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check local storage for existing session
    const storedAuth = localStorage.getItem('gold_swing_auth');
    if (storedAuth === 'true') {
      setUser({ email: 'admin' });
    }
    setLoading(false);
  }, []);

  const loginWithPasscode = async (passcode: string) => {
    // Hardcoded simple passcode
    if (passcode === 'goldswing2024') {
      localStorage.setItem('gold_swing_auth', 'true');
      setUser({ email: 'admin' });
    } else {
      throw new Error("Invalid passcode");
    }
  };

  const logout = async () => {
    localStorage.removeItem('gold_swing_auth');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginWithPasscode, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
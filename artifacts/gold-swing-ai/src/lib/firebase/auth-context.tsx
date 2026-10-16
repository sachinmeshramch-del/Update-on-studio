import React, { createContext, useContext, useEffect, useState } from 'react';

// Define custom User type for dashboard session
export interface CustomUser {
  email: string;
}

interface AuthContextType {
  user: CustomUser | null;
  loading: boolean;
  loginWithPasscode: (passcode: string) => Promise<void>;
  resetPasscodeToDefault: () => Promise<void>;
  changePasscode: (currentPasscode: string, newPasscode: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  loginWithPasscode: async () => {},
  resetPasscodeToDefault: async () => {},
  changePasscode: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CustomUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check local storage for existing session
    let storedAuth = null;
    try {
      storedAuth = localStorage.getItem('gold_swing_auth');
    } catch (e) {
      console.error('LocalStorage blocked', e);
    }

    if (storedAuth === 'true') {
      setUser({ email: 'admin' });
    }
    setLoading(false);
  }, []);

  const loginWithPasscode = async (passcode: string) => {
    const trimmed = (passcode || "").trim();
    const normalizedInput = trimmed.toLowerCase().replace(/\s+/g, '');

    // 1. Try server verification first
    try {
      const res = await fetch("/api/settings/verify-passcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: trimmed })
      });
      if (res.ok) {
        try { localStorage.setItem('gold_swing_auth', 'true'); } catch (e) {}
        setUser({ email: 'admin' });
        return;
      }
    } catch (e) {
      // Backend unreachable or offline, fallback to local validation
    }

    // 2. Fallback to local storage custom passcode or default
    let customPass = null;
    try { customPass = localStorage.getItem('gold_swing_custom_passcode'); } catch (e) {}
    const validPass = customPass || 'goldswing2024';
    const normalizedValid = (validPass || "").toLowerCase().replace(/\s+/g, '');

    if (
      trimmed === validPass ||
      trimmed === 'goldswing2024' ||
      trimmed.toLowerCase() === 'goldswing2024' ||
      normalizedInput === normalizedValid ||
      normalizedInput === 'goldswing2024'
    ) {
      try { localStorage.setItem('gold_swing_auth', 'true'); } catch (e) {}
      setUser({ email: 'admin' });
    } else {
      throw new Error("Invalid passcode. Please enter 'goldswing2024' or tap Quick Unlock.");
    }
  };

  const resetPasscodeToDefault = async () => {
    try {
      await fetch("/api/settings/reset-passcode", { method: "POST" });
    } catch (e) {}
    try { localStorage.removeItem('gold_swing_custom_passcode'); } catch (e) {}
  };

  const changePasscode = async (currentPasscode: string, newPasscode: string) => {
    const trimmedNew = newPasscode.trim();
    if (!trimmedNew || trimmedNew.length < 4) {
      throw new Error("New passcode must be at least 4 characters long");
    }

    // 1. Try server update
    try {
      const res = await fetch("/api/settings/change-passcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPasscode: currentPasscode.trim(), newPasscode: trimmedNew })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update passcode");
      }
    } catch (err: any) {
      // If network failed, check local passcode
      let customPass = null;
      try { customPass = localStorage.getItem('gold_swing_custom_passcode'); } catch (e) {}
      const validPass = customPass || 'goldswing2024';
      if (currentPasscode.trim() !== validPass && currentPasscode.trim() !== 'goldswing2024') {
        throw new Error(err?.message || "Current passcode is incorrect");
      }
    }

    // Save locally
    try { localStorage.setItem('gold_swing_custom_passcode', trimmedNew); } catch (e) {}
  };

  const logout = async () => {
    try { localStorage.removeItem('gold_swing_auth'); } catch (e) {}
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginWithPasscode, resetPasscodeToDefault, changePasscode, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);


const fs = require('fs');

// 1. Rewrite auth-context.tsx
const authFile = 'artifacts/gold-swing-ai/src/lib/firebase/auth-context.tsx';
const authContent = `
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
`;
fs.writeFileSync(authFile, authContent.trim());

// 2. Rewrite App.tsx to remove the email-specific block
const appFile = 'artifacts/gold-swing-ai/src/App.tsx';
let appContent = fs.readFileSync(appFile, 'utf8');

const authGuardRegex = /function AuthGuard\(\{[^}]+\}[^{]+\{.*?return <>{children}<\/>;\n}/s;
const authGuardReplacement = `
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) return null;
  if (!user) return <LoginScreen />;
  
  return <>{children}</>;
}
`.trim();

appContent = appContent.replace(authGuardRegex, authGuardReplacement);
fs.writeFileSync(appFile, appContent);

// 3. Rewrite login.tsx to use a password input
const loginFile = 'artifacts/gold-swing-ai/src/pages/login.tsx';
const loginContent = `
import React, { useState } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Lock, AlertCircle, KeyRound } from 'lucide-react';

export default function LoginScreen() {
  const { loginWithPasscode, loading } = useAuth();
  const [passcode, setPasscode] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode) return;
    
    setIsLoggingIn(true);
    setErrorMsg("");
    try {
      await loginWithPasscode(passcode);
    } catch (err: any) {
      console.error(err);
      setIsLoggingIn(false);
      setErrorMsg(err.message || "Failed to log in.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-900/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-emerald-900/10 rounded-full blur-[120px]" />
      </div>
      
      <Card className="w-full max-w-md bg-zinc-900/50 border-zinc-800 backdrop-blur-xl relative z-10 shadow-2xl">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto bg-zinc-800/50 p-3 rounded-2xl w-fit ring-1 ring-white/10 shadow-inner">
            <Lock className="w-10 h-10 text-emerald-500" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl font-bold tracking-tight text-zinc-100">
              Secure Access
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Please enter the secret passcode to continue.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2 text-red-500 text-sm text-left">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="break-words">{errorMsg}</p>
            </div>
          )}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                type="password"
                placeholder="Enter passcode"
                className="pl-9 bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              size="lg"
              className="w-full font-medium transition-all bg-white text-zinc-900 hover:bg-zinc-200"
              disabled={isLoggingIn || !passcode}
            >
              {isLoggingIn ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : null}
              {isLoggingIn ? 'Verifying...' : 'Unlock Dashboard'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
`;
fs.writeFileSync(loginFile, loginContent.trim());

console.log("Replaced Firebase Auth with simple Passcode Auth");

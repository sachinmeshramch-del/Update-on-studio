import React, { useState } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Lock, AlertCircle, KeyRound, Eye, EyeOff, Sparkles, RotateCcw } from 'lucide-react';

export default function LoginScreen() {
  const { loginWithPasscode, resetPasscodeToDefault, loading } = useAuth();
  const [passcode, setPasscode] = useState("");
  const [showPasscode, setShowPasscode] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleLogin = async (e?: React.FormEvent, customPass?: string) => {
    if (e) e.preventDefault();
    const passToTry = customPass !== undefined ? customPass : passcode;
    if (!passToTry) return;
    
    setIsLoggingIn(true);
    setErrorMsg("");
    try {
      await loginWithPasscode(passToTry);
    } catch (err: any) {
      console.error(err);
      setIsLoggingIn(false);
      setErrorMsg(err.message || "Invalid passcode. Please try again.");
    }
  };

  const handleQuickUnlock = () => {
    setPasscode("goldswing2024");
    handleLogin(undefined, "goldswing2024");
  };

  const handleResetPasscode = async () => {
    setIsResetting(true);
    try {
      await resetPasscodeToDefault();
      setPasscode("goldswing2024");
      setErrorMsg("");
      await handleLogin(undefined, "goldswing2024");
    } catch (err: any) {
      setErrorMsg("Failed to reset passcode. Please try again.");
    } finally {
      setIsResetting(false);
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
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-amber-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-emerald-900/10 rounded-full blur-[120px]" />
      </div>
      
      <Card className="w-full max-w-md bg-zinc-900/70 border-zinc-800 backdrop-blur-xl relative z-10 shadow-2xl">
        <CardHeader className="text-center space-y-3 pb-2">
          <div className="mx-auto bg-amber-500/10 border border-amber-500/20 p-3 rounded-2xl w-fit shadow-inner">
            <Lock className="w-9 h-9 text-amber-500" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-2xl font-bold tracking-tight text-zinc-100">
              Gold Swing AI Pro
            </CardTitle>
            <CardDescription className="text-zinc-400 text-xs">
              Enter passcode to unlock the live swing trading dashboard.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="pt-2 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex flex-col gap-2 text-red-400 text-xs text-left leading-relaxed">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                <p className="break-words flex-1 font-medium">{errorMsg}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-3">
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
              <Input
                type={showPasscode ? "text" : "password"}
                placeholder="Enter secret passcode"
                className="pl-9 pr-10 bg-zinc-800/60 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 h-10 text-sm focus-visible:ring-amber-500/40"
                value={passcode}
                onChange={(e) => {
                  setPasscode(e.target.value);
                  if (errorMsg) setErrorMsg("");
                }}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="off"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPasscode(!showPasscode)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-1 cursor-pointer transition-colors"
                title={showPasscode ? "Hide passcode" : "Show passcode"}
              >
                {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full font-semibold transition-all bg-amber-500 text-black hover:bg-amber-400 h-10 cursor-pointer shadow-md"
              disabled={isLoggingIn || !passcode}
              id="login-passcode-submit"
            >
              {isLoggingIn ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {isLoggingIn ? 'Verifying Passcode...' : 'Unlock Dashboard'}
            </Button>
          </form>

          <div className="pt-1 flex flex-col gap-2">
            <div className="flex items-center justify-end text-[11px] text-zinc-500 px-1 pt-1">
              <button
                type="button"
                onClick={handleResetPasscode}
                disabled={isResetting || isLoggingIn}
                className="hover:text-zinc-300 flex items-center gap-1 text-[11px] text-zinc-500 transition-colors cursor-pointer"
                title="Reset passcode to default"
              >
                <RotateCcw className="w-3 h-3" />
                <span>{isResetting ? "Resetting..." : "Reset Passcode"}</span>
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import React from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { SiGoogle } from 'react-icons/si';

export default function LoginScreen() {
  const { loginWithGoogle, loading } = useAuth();
  const [isLoggingIn, setIsLoggingIn] = React.useState(false);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoggingIn(false);
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
      
      <Card className="w-full max-w-md bg-zinc-900/50 border-zinc-800 backdrop-blur-xl relative z-10">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto bg-zinc-800/50 p-3 rounded-2xl w-fit ring-1 ring-white/10">
            <svg
              className="w-10 h-10 text-emerald-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
              />
            </svg>
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl font-bold tracking-tight text-zinc-100">
              Gold Swing AI
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Private trading dashboard. Sign in to access your signals.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <Button
            size="lg"
            className="w-full font-medium transition-all"
            onClick={handleLogin}
            disabled={isLoggingIn}
          >
            {isLoggingIn ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <SiGoogle className="mr-2 h-4 w-4" />
            )}
            {isLoggingIn ? 'Connecting...' : 'Sign in with Google'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

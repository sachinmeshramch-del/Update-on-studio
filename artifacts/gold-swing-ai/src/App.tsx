import { ErrorBoundary } from "@/components/error-boundary";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import SettingsPage from "@/pages/settings";
import LoginScreen from "@/pages/login";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider, useAuth } from "@/lib/firebase/auth-context";

import { RefreshIntervalProvider, getStoredRefreshInterval } from "@/hooks/useRefreshInterval";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
      refetchIntervalInBackground: true,
      refetchInterval: (query) => {
        const key = query.queryKey?.[0];
        if (
          typeof key === "string" &&
          (key.includes("/api/signal") || key.includes("/api/history") || key.includes("/api/connections"))
        ) {
          const interval = getStoredRefreshInterval();
          return interval > 0 ? interval : false;
        }
        return false;
      },
    },
  },
});

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-100 p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
          <div className="text-sm font-medium text-zinc-400 animate-pulse">Loading dashboard...</div>
        </div>
      </div>
    );
  }
  if (!user) return <LoginScreen />;
  
  return <>{children}</>;
}

import DiagnosticsPage from "@/pages/diagnostics";

function Router() {
  return (
    <AuthGuard>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/diagnostics" component={DiagnosticsPage} />
        <Route component={NotFound} />
      </Switch>
    </AuthGuard>
  );
}

function App() {
  return (
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <RefreshIntervalProvider>
        <ThemeProvider defaultTheme="dark" storageKey="gold-swing-theme">
          <AuthProvider>
            <TooltipProvider>
              <WouterRouter>
                <Router />
              </WouterRouter>
              <Toaster />
              <SonnerToaster />
            </TooltipProvider>
          </AuthProvider>
        </ThemeProvider>
      </RefreshIntervalProvider>
    </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
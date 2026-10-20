import { Header } from "@/components/layout/header";
import { Link } from "wouter";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ModeToggle } from "@/components/mode-toggle";
import { useAuth } from "@/lib/firebase/auth-context";
import { useConnections } from "@/hooks/useConnections";
import {
  Sliders,
  Brain,
  Shield,
  Activity,
  Bell,
  HardDrive,
  LogOut,
  ChevronRight,
  Sparkles,
  Server,
  Zap,
  Lock,
  ExternalLink,
  Code2,
} from "lucide-react";

export default function MorePage() {
  const { user, logout } = useAuth();
  const connections = useConnections();

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20">
      <Header />

      <main className="flex-grow container mx-auto px-2 sm:px-4 py-4 md:py-6 flex flex-col gap-6 max-w-4xl">
        {/* Title */}
        <div className="pb-2 border-b border-border">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            System & Workspace Settings
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Account parameters, MetaApi connectivity, system diagnostics, and autonomous trading configurations.
          </p>
        </div>

        {/* ── Connected Profile / Account Card ────────────────────────────── */}
        <Card className="border-border bg-card">
          <CardContent className="pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 font-bold text-lg font-mono">
                {user?.email?.charAt(0).toUpperCase() || "U"}
              </div>
              <div>
                <div className="font-semibold text-foreground text-sm sm:text-base">
                  {user?.email || "Authenticated Operator"}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                  <Badge variant="outline" className="text-[10px] font-mono border-green-500/30 text-green-500 bg-green-500/10">
                    Live MetaApi Linked
                  </Badge>
                  <span className="font-mono text-[11px]">Symbol: XAUUSD</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => logout()}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400 border border-red-500/20 hover:bg-red-500/10 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </CardContent>
        </Card>

        {/* ── Quick Navigation Sections ────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link href="/settings">
            <Card className="border-border bg-card hover:border-amber-500/40 hover:bg-accent/40 cursor-pointer transition-all h-full">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-amber-500" />
                    <CardTitle className="text-base">Strategy & Execution Settings</CardTitle>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Configure risk percentage, lot sizes, trailing stop variants, max daily drawdown, and MetaApi API keys.
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/diagnostics">
            <Card className="border-border bg-card hover:border-amber-500/40 hover:bg-accent/40 cursor-pointer transition-all h-full">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Brain className="w-5 h-5 text-purple-400" />
                    <CardTitle className="text-base">Hermes AI Brain Telemetry</CardTitle>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Inspect cognitive reflections, regime classification confidence, volatility sensors, and multi-timeframe alignment.
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* ── Active Feeds & Health ────────────────────────────────────────── */}
        <Card className="border-border bg-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-amber-500" />
              <CardTitle className="text-base">Connected API Feeds</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900 border border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                <span className="text-xs font-semibold text-foreground">MetaApi MT5 Bridge</span>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono text-green-400 border-green-500/30">
                Connected ({connections?.latencyMs || 42}ms)
              </Badge>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900 border border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                <span className="text-xs font-semibold text-foreground">Historical OHLC Cache Repository</span>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono text-green-400 border-green-500/30">
                Persistent Storage Active
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* ── App Information & System Status ─────────────────────────────── */}
        <div className="text-center text-xs text-muted-foreground pt-4 pb-2">
          <p className="font-mono">XAUUSD Gold Intraday & Scalping Engine • v2.4.0</p>
          <p className="text-[11px] text-muted-foreground/60 mt-0.5">
            Signal-Only Automated Intelligence • Zero Live Trade Modification Guard Active
          </p>
        </div>
      </main>
    </div>
  );
}

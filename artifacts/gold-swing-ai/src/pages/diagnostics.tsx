import { Header } from "@/components/layout/header";
import { HermesDiagnosticDashboard } from "@/components/trading/hermes-diagnostic-dashboard";
import { Link } from "wouter";
import { ArrowLeft, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DiagnosticsPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col pb-20">
      <Header />

      <main className="flex-grow container mx-auto px-2 sm:px-4 py-4 md:py-8 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-2 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" />
              Back to Trading Dashboard
            </Button>
          </Link>
          <div className="flex items-center gap-2 text-xs font-mono text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
            <Brain className="w-3.5 h-3.5" />
            Hermes Telemetry Console
          </div>
        </div>

        <HermesDiagnosticDashboard defaultExpanded={true} />
      </main>
    </div>
  );
}

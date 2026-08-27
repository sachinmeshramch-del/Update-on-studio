import { useState } from "react";
import { Lock, ArrowRight, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin) return;
    
    setIsLoading(true);
    try {
      const res = await fetch("/api/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      
      const data = await res.json();
      if (data.success) {
        localStorage.setItem("app_auth_token", data.token);
        onUnlock();
      } else {
        toast({
          title: "Access Denied",
          description: "Incorrect PIN entered.",
          variant: "destructive"
        });
        setPin("");
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to verify PIN. Make sure the server is running.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="h-16 w-16 bg-muted/30 rounded-2xl flex items-center justify-center border border-border shadow-lg">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">Enter PIN</h1>
            
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Input
              type="password"
              placeholder="Enter PIN..."
              className="pl-4 pr-12 h-12 text-center text-lg tracking-widest bg-muted/10"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoFocus
              disabled={isLoading}
            />
            <Button 
              type="submit" 
              size="icon"
              disabled={!pin || isLoading}
              className="absolute right-1.5 top-1.5 h-9 w-9 rounded-md transition-all"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

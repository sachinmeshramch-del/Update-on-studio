import { useState } from "react";
import { Brain, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export function MarketAnalysis() {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [apiKey, setApiKey] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("gemini_api_key") || "";
    }
    return "";
  });
  const [showKeyInput, setShowKeyInput] = useState(false);
  const { toast } = useToast();

  const handleKeySave = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setApiKey(val);
    if (typeof window !== "undefined") {
      localStorage.setItem("gemini_api_key", val);
    }
  };

  const fetchAnalysis = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/analyze-market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      
      const data = await res.json();
      setAnalysis(data.analysis);
      if (res.status === 401) {
        setShowKeyInput(true);
      }
    } catch (err) {
      toast({
        title: "Analysis Failed",
        description: "Could not generate AI market analysis.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="col-span-1 md:col-span-2 lg:col-span-3 border-primary/20 bg-primary/5">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-medium flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          AI Market Analysis
        </CardTitle>
        <div className="flex items-center gap-2">
        {showKeyInput && (
          <input
            type="password"
            placeholder="Paste Gemini API Key..."
            className="h-8 w-48 rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            value={apiKey}
            onChange={handleKeySave}
          />
        )}
        <Button 
          variant="outline" 
          size="sm" 
          onClick={fetchAnalysis}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          {isLoading ? "Analyzing..." : "Analyze Now"}
        </Button>
        </div>
      </CardHeader>
      <CardContent>
        {analysis ? (
          <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {analysis}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            Click "Analyze Now" to generate a real-time AI perspective on the current gold market trends.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

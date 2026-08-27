const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/components/trading/MarketAnalysis.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
    '  const [analysis, setAnalysis] = useState<string | null>(null);\n  const [isLoading, setIsLoading] = useState(false);\n  const { toast } = useToast();',
    `  const [analysis, setAnalysis] = useState<string | null>(null);
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
  };`
);

content = content.replace(
    'body: JSON.stringify({}),',
    'body: JSON.stringify({ apiKey }),'
);

content = content.replace(
    '      const data = await res.json();\n      setAnalysis(data.analysis);',
    `      const data = await res.json();
      setAnalysis(data.analysis);
      if (res.status === 401) {
        setShowKeyInput(true);
      }`
);

content = content.replace(
    '</CardTitle>\n        <Button',
    `</CardTitle>
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
        <Button`
);

content = content.replace(
    '{isLoading ? "Analyzing..." : "Analyze Now"}\n        </Button>',
    `{isLoading ? "Analyzing..." : "Analyze Now"}
        </Button>
        </div>`
);

fs.writeFileSync(file, content);
console.log("Patched MarketAnalysis.tsx");

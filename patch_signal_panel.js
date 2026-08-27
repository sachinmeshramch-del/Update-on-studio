const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/components/trading/signal-panel.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'Globe, FlameKindling, Sparkles, Activity, Timer, MoonStar, RotateCcw,\n} from "lucide-react";',
  'Globe, FlameKindling, Sparkles, Activity, Timer, MoonStar, RotateCcw, RefreshCw,\n} from "lucide-react";'
);

content = content.replace(
  'const { data: signalDataRaw, isLoading, isError } = useGetSignal({',
  'const { data: signalDataRaw, isLoading, isError, refetch, isFetching } = useGetSignal({'
);

content = content.replace(
  '<SessionBadge active={session?.active} asian={session?.asian} />\n            </div>',
  `<SessionBadge active={session?.active} asian={session?.asian} />
              <button 
                onClick={() => refetch()} 
                disabled={isFetching}
                className="ml-auto md:ml-2 p-1.5 rounded-full hover:bg-white/10 transition-colors disabled:opacity-50"
                title="Refresh Signal"
              >
                <RefreshCw className={\`w-3.5 h-3.5 text-muted-foreground \${isFetching ? 'animate-spin' : ''}\`} />
              </button>
            </div>`
);

fs.writeFileSync(file, content);
console.log("Patched signal-panel.tsx");

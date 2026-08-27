const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/components/layout/header.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add hide-scrollbar class to index.css if not there
const cssFile = 'artifacts/gold-swing-ai/src/index.css';
if (fs.existsSync(cssFile)) {
    let cssContent = fs.readFileSync(cssFile, 'utf8');
    if (!cssContent.includes('.hide-scrollbar')) {
        cssContent += `\n\n/* Hide scrollbar for Chrome, Safari and Opera */\n.hide-scrollbar::-webkit-scrollbar {\n  display: none;\n}\n\n/* Hide scrollbar for IE, Edge and Firefox */\n.hide-scrollbar {\n  -ms-overflow-style: none;  /* IE and Edge */\n  scrollbar-width: none;  /* Firefox */\n}\n`;
        fs.writeFileSync(cssFile, cssContent);
    }
}

// 2. Remove the existing hover popup and badge from the brand section
const brandSectionOld = `<div className="hidden sm:block relative group">
              <h1 className="text-base font-bold tracking-tight text-foreground leading-none">Gold Scalp AI</h1>
              
              <div className="flex items-center gap-2 mt-1 cursor-help">
                <span className="text-[11px] font-mono tracking-widest text-muted-foreground uppercase">
                  XAUUSD
                </span>
                
                <div 
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border"
                  style={{
                    backgroundColor: !connected 
                      ? "rgba(239,68,68,0.1)" 
                      : data?.source === "metaapi" || data?.source === "twelvedata"
                        ? "rgba(34,197,94,0.1)"
                        : "rgba(234,179,8,0.1)",
                    borderColor: !connected 
                      ? "rgba(239,68,68,0.2)" 
                      : data?.source === "metaapi" || data?.source === "twelvedata"
                        ? "rgba(34,197,94,0.2)"
                        : "rgba(234,179,8,0.2)",
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full transition-colors duration-200"
                    style={{ backgroundColor: blinkOn && connected ? "#22c55e" : connected ? "#16a34a" : "#ef4444" }}
                  />
                  <span
                    className="text-[11px] font-mono font-bold uppercase tracking-wide flex items-center gap-1"
                    style={{
                      color: !connected
                        ? "#ef4444"
                        : data?.source === "metaapi" || data?.source === "twelvedata"
                          ? "#22c55e"
                          : "#6b7280",
                    }}
                  >
                    {!connected
                      ? (error ? "RECONNECTING" : "CONNECTING")
                      : data?.source === "metaapi"
                        ? "MetaApi Live"
                      : data?.source === "twelvedata"
                        ? "TwelveData Live"
                        : "LIVE"}
                  </span>
                </div>
              </div>
              
              {/* Hover popup for connections */}
              <div className="absolute top-full left-0 mt-2 w-64 bg-[#111318] border border-white/10 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 p-3 flex flex-col gap-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Upstream Streams</h3>
                
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-foreground">MetaApi</span>
                  <span className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] uppercase font-bold",
                    connections?.metaapi === "connected" ? "bg-green-500/10 text-green-400" :
                    connections?.metaapi === "connecting" ? "bg-amber-500/10 text-amber-400" :
                    "bg-red-500/10 text-red-400"
                  )}>{connections?.metaapi || "disconnected"}</span>
                </div>

                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-foreground">TwelveData</span>
                  <span className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] uppercase font-bold",
                    connections?.twelvedata === "connected" ? "bg-green-500/10 text-green-400" :
                    connections?.twelvedata === "connecting" ? "bg-amber-500/10 text-amber-400" :
                    "bg-red-500/10 text-red-400"
                  )}>{connections?.twelvedata || "disconnected"}</span>
                </div>
                
                <div className="mt-1 pt-2 border-t border-white/5 flex items-center justify-between text-xs font-mono">
                  <span className="text-muted-foreground">Active Source</span>
                  <span className="text-amber-400 uppercase font-bold">{connections?.activeSource || "none"}</span>
                </div>
              </div>
            </div>`;

const brandSectionNew = `<div className="hidden sm:block relative">
              <h1 className="text-base font-bold tracking-tight text-foreground leading-none">Gold Scalp AI</h1>
              <span className="text-[11px] font-mono tracking-widest text-muted-foreground uppercase mt-1 block">XAUUSD</span>
            </div>`;

content = content.replace(brandSectionOld, brandSectionNew);

// 3. Add the top bar right after the style tag
const styleTagEnd = `</style>`;
const topBar = `
      {/* ── Persistent Connection Status Bar ─────────────────────────── */}
      <div className="w-full bg-[#111318] border-b border-white/5 px-3 py-1.5 flex items-center justify-between text-[10px] sm:text-[11px] font-mono overflow-x-auto hide-scrollbar gap-4 z-[60] relative">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-muted-foreground uppercase tracking-widest">Active Source:</span>
          <span className={cn(
             "font-bold uppercase flex items-center gap-1.5",
             data?.source === "metaapi" ? "text-green-400" :
             data?.source === "twelvedata" ? "text-amber-400" :
             "text-red-400"
          )}>
            <span
              className="w-1.5 h-1.5 rounded-full transition-colors duration-200"
              style={{ backgroundColor: blinkOn && connected ? "currentColor" : "transparent" }}
            />
            {data?.source || "none"}
          </span>
        </div>
        
        <div className="flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground uppercase">MetaApi:</span>
            <span className={cn(
              "font-bold uppercase",
              connections?.metaapi === "connected" ? "text-green-400" :
              connections?.metaapi === "connecting" ? "text-amber-400" :
              "text-red-400"
            )}>{connections?.metaapi || "disconnected"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground uppercase">TwelveData:</span>
            <span className={cn(
              "font-bold uppercase",
              connections?.twelvedata === "connected" ? "text-green-400" :
              connections?.twelvedata === "connecting" ? "text-amber-400" :
              "text-red-400"
            )}>{connections?.twelvedata || "disconnected"}</span>
          </div>
        </div>
      </div>
`;

content = content.replace(styleTagEnd, styleTagEnd + topBar);

// 4. Update the container to allow scrolling if needed on mobile
content = content.replace(
  'className="container mx-auto px-4 h-[72px] flex items-center justify-between gap-4"',
  'className="container mx-auto px-3 sm:px-4 h-[72px] flex items-center justify-between gap-3 sm:gap-4 overflow-x-auto hide-scrollbar"'
);

fs.writeFileSync(file, content);
console.log("Patched header layout for mobile visibility");

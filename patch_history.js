const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/components/trading/history-table.tsx';
let code = fs.readFileSync(file, 'utf8');

if (!code.includes('const [tradeToClose, setTradeToClose] = useState<string | null>(null);')) {
    code = code.replace(
        '  const [confirmClear, setConfirmClear] = useState(false);',
        '  const [confirmClear, setConfirmClear] = useState(false);\n  const [tradeToClose, setTradeToClose] = useState<string | null>(null);\n  const [isClosingTrade, setIsClosingTrade] = useState(false);'
    );
}

// Add the dialog at the bottom
const dialogCode = `
      <Dialog open={!!tradeToClose} onOpenChange={(o) => { if (!o) setTradeToClose(null); }}>
        <DialogContent className="max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle>Force Close Trade</DialogTitle>
            <DialogDescription>
              Are you sure you want to forcefully close this trade at the current market price? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <button
              onClick={() => setTradeToClose(null)}
              className="px-4 py-2 text-sm font-semibold text-foreground bg-secondary rounded-lg hover:bg-secondary/80"
              disabled={isClosingTrade}
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                if (!tradeToClose) return;
                setIsClosingTrade(true);
                try {
                  const res = await fetch(\`/api/signals/\${tradeToClose}/close\`, { method: "POST" });
                  if (!res.ok) throw new Error("Failed to close");
                  toast.success("Trade manually closed successfully!");
                  refetch();
                  setTradeToClose(null);
                } catch (e) {
                  toast.error("Failed to close trade.");
                } finally {
                  setIsClosingTrade(false);
                }
              }}
              className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-500 disabled:opacity-50 flex items-center gap-2"
              disabled={isClosingTrade}
            >
              {isClosingTrade ? "Closing..." : "Close Trade"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}`;

if (!code.includes('Force Close Trade')) {
    code = code.replace('    </>\n  );\n}', dialogCode);
}

fs.writeFileSync(file, code);

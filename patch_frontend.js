const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/components/trading/signal-panel.tsx';
let code = fs.readFileSync(file, 'utf8');

const target = `  const { data: signalDataRaw, isLoading, isError, refetch, isFetching } = useGetSignal({
    query: {
      refetchInterval: 60000,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
      staleTime: 55000,
    }
  });`;

const replace = `  const { data: signalDataRaw, isLoading, isError, refetch, isFetching } = useGetSignal({
    query: {
      refetchInterval: 60000,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
      staleTime: 55000,
    }
  });

  // Diagnostic logging for logic mismatch investigation
  useEffect(() => {
    if (signalDataRaw) {
      console.log("=== FRONTEND SIGNAL DIAGNOSTIC ===");
      console.log("Timestamp:", new Date().toISOString());
      console.log("Signal Direction:", signalDataRaw.signal);
      console.log("Confidence:", signalDataRaw.confidence);
      console.log("Entry Price:", signalDataRaw.entryPrice);
      console.log("Stop Loss:", signalDataRaw.stopLoss);
      console.log("Take Profit:", signalDataRaw.takeProfit);
      console.log("Reason:", signalDataRaw.reason);
      console.log("==================================");
    }
  }, [signalDataRaw]);`;

if (code.includes(target) && !code.includes('FRONTEND SIGNAL DIAGNOSTIC')) {
    code = code.replace(target, replace);
    fs.writeFileSync(file, code);
}

const fs = require('fs');
let code = fs.readFileSync('artifacts/gold-swing-ai/src/App.tsx', 'utf8');

code = `import { ErrorBoundary } from "@/components/error-boundary";\n` + code;

code = code.replace(
  '<QueryClientProvider client={queryClient}>',
  '<ErrorBoundary>\n    <QueryClientProvider client={queryClient}>'
);

code = code.replace(
  '</QueryClientProvider>',
  '</QueryClientProvider>\n    </ErrorBoundary>'
);

fs.writeFileSync('artifacts/gold-swing-ai/src/App.tsx', code);

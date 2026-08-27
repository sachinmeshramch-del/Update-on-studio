const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/App.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace('import { useEffect } from "react";\n', '');
content = content.replace('import Dashboard from "@/pages/dashboard";\n', 'import Dashboard from "@/pages/dashboard";\nimport { ThemeProvider } from "@/components/theme-provider";\n');

const oldApp = `function App() {
  // Force dark mode
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}`;

const newApp = `function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="gold-swing-theme">
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}`;

content = content.replace(oldApp, newApp);
fs.writeFileSync(file, content);
console.log("Patched App.tsx");

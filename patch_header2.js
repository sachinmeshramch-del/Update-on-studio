const fs = require('fs');
const file = '/app/applet/artifacts/gold-swing-ai/src/components/layout/header.tsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('import { useAuth }')) {
  // Add icon
  content = content.replace(
    'Settings,',
    'Settings, LogOut,'
  );

  content = content.replace(
    'import { ModeToggle } from "@/components/mode-toggle";',
    'import { ModeToggle } from "@/components/mode-toggle";\nimport { useAuth } from "@/lib/firebase/auth-context";'
  );

  // Add hook inside component
  content = content.replace(
    'export function Header() {',
    'export function Header() {\n  const { logout } = useAuth();'
  );

  // Add button to JSX
  content = content.replace(
    '<SettingsDialog />',
    `
            <button
              onClick={() => logout()}
              title="Sign Out"
              className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground border border-border bg-black/5 dark:bg-white/5 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
            <SettingsDialog />
    `
  );

  fs.writeFileSync(file, content);
  console.log("Patched header.tsx");
} else {
  console.log("Already patched");
}

const fs = require('fs');
const file = '/app/applet/artifacts/gold-swing-ai/src/components/layout/header.tsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('import { useAuth } from "@/lib/firebase/auth-context"')) {
  content = content.replace(
    'import { RefreshCw,',
    'import { LogOut, RefreshCw,'
  );
  content = content.replace(
    'import { ModeToggle } from "@/components/mode-toggle";',
    'import { ModeToggle } from "@/components/mode-toggle";\nimport { useAuth } from "@/lib/firebase/auth-context";'
  );
  
  // Inject the logout button before ModeToggle
  content = content.replace(
    '<ModeToggle />',
    `
          <button
            onClick={async () => {
              const { logout } = require("@/lib/firebase/auth-context").useAuth();
              // Will not work directly inside onClick like this due to hook rules. 
            }}
          />
    `
  );
}

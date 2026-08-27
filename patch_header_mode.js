const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/components/layout/header.tsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('import { ModeToggle }')) {
  content = content.replace(
    'import { cn } from "@/lib/utils";',
    'import { cn } from "@/lib/utils";\nimport { ModeToggle } from "@/components/mode-toggle";'
  );
}

const notifSection = `{/* ── Notification bell ───────────────────────────────────────── */}`;
const modeToggleSection = `
          {/* ── Theme Toggle & Notifications ───────────────────────────── */}
          <div className="flex items-center gap-2 shrink-0">
            <ModeToggle />
`;
content = content.replace(notifSection, modeToggleSection);

const endOfNotif = `            </button>
          )}`;
const endOfNotifWithDiv = `            </button>
          )}
          </div>`;
content = content.replace(endOfNotif, endOfNotifWithDiv);

fs.writeFileSync(file, content);
console.log("Patched Header for Mode Toggle");

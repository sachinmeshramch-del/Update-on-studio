const fs = require('fs');
const file = '/app/applet/artifacts/gold-swing-ai/src/pages/login.tsx';
let content = fs.readFileSync(file, 'utf8');

// Replace the title
content = content.replace(
  '<CardTitle className="text-2xl font-bold tracking-tight text-zinc-100">              Gold Swing AI            </CardTitle>',
  '<CardTitle className="text-2xl font-bold tracking-tight text-zinc-100">              Secure Access            </CardTitle>'
);

// Replace the description
content = content.replace(
  '<CardDescription className="text-zinc-400">              Private trading dashboard. Sign in to access your signals.            </CardDescription>',
  '<CardDescription className="text-zinc-400">              Please enter your login details to continue.            </CardDescription>'
);

// Replace the icon with a Lock icon
content = content.replace(
  'import { Loader2 } from \'lucide-react\';',
  'import { Loader2, Lock } from \'lucide-react\';'
);

content = content.replace(
  '<svg              className="w-10 h-10 text-emerald-500"              fill="none"              stroke="currentColor"              viewBox="0 0 24 24"              xmlns="http://www.w3.org/2000/svg"            >              <path                strokeLinecap="round"                strokeLinejoin="round"                strokeWidth={2}                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"              />            </svg>',
  '<Lock className="w-10 h-10 text-emerald-500" />'
);

fs.writeFileSync(file, content);
console.log("Patched login.tsx");

const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/index.css';
let content = fs.readFileSync(file, 'utf8');

// Replace the :root section
const newRoot = `:root {
  /* Light Mode Colors */
  --background: 0 0% 100%;
  --foreground: 222 47% 11%;
  --card: 0 0% 98%;
  --card-foreground: 222 47% 11%;
  --popover: 0 0% 100%;
  --popover-foreground: 222 47% 11%;
  --primary: 43 96% 56%;
  --primary-foreground: 222 47% 11%;
  --secondary: 210 40% 96.1%;
  --secondary-foreground: 222 47% 11%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --accent: 210 40% 96.1%;
  --accent-foreground: 222 47% 11%;
  --destructive: 0 84% 60%;
  --destructive-foreground: 210 40% 98%;
  --success: 142 71% 45%;
  --success-foreground: 210 40% 98%;
  --warning: 48 96% 53%;
  --warning-foreground: 210 40% 98%;
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 43 96% 56%;
  --radius: 0.75rem;
}

.dark {
  /* Dark Mode Colors */
  --background: 224 71% 4%;
  --foreground: 213 31% 91%;
  --card: 222 47% 8%;
  --card-foreground: 213 31% 91%;
  --popover: 224 71% 4%;
  --popover-foreground: 215 20.2% 65.1%;
  --primary: 43 96% 56%;
  --primary-foreground: 222 47% 11%;
  --secondary: 222 47% 11%;
  --secondary-foreground: 210 40% 98%;
  --muted: 223 47% 11%;
  --muted-foreground: 215.4 16.3% 56.9%;
  --accent: 216 34% 17%;
  --accent-foreground: 210 40% 98%;
  --destructive: 0 84% 60%;
  --destructive-foreground: 210 40% 98%;
  --success: 142 71% 45%;
  --success-foreground: 144 100% 11%;
  --warning: 48 96% 53%;
  --warning-foreground: 48 100% 11%;
  --border: 216 34% 17%;
  --input: 216 34% 17%;
  --ring: 43 96% 56%;
}`;

content = content.replace(/:root\s*\{[^}]+\}/, newRoot);
fs.writeFileSync(file, content);
console.log("Patched CSS");

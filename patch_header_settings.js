const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/components/layout/header.tsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('SettingsDialog')) {
  content = content.replace('import { ModeToggle } from "@/components/mode-toggle";', 'import { ModeToggle } from "@/components/mode-toggle";\nimport { SettingsDialog } from "./settings-dialog";');
}

content = content.replace('<ModeToggle />', '<SettingsDialog />\n            <ModeToggle />');

fs.writeFileSync(file, content);

const fs = require('fs');
const file = '/app/applet/artifacts/gold-swing-ai/src/components/layout/header.tsx';
let content = fs.readFileSync(file, 'utf8');

// Ensure LogOut is imported from lucide-react
if (!content.includes('LogOut') || !content.match(/import .*LogOut.* from ["']lucide-react["']/)) {
  content = content.replace(
    'import { Activity,',
    'import { LogOut, Activity,'
  );
  fs.writeFileSync(file, content);
  console.log("Fixed LogOut import");
} else {
  console.log("LogOut already imported");
}

const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/hooks/useNotifications.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'alert("Push notifications are blocked in embedded windows. Please open this app directly in a full browser tab or add it to your phone\\'s home screen.");',
  'alert("⚠️ PUSH NOTIFICATIONS BLOCKED\\n\\nBecause you are viewing this app inside the AI Studio editor frame, your browser blocks push notifications for security.\\n\\n👉 FIX: Click the \\"Open in New Tab\\" icon (diagonal arrow) at the top right of this preview window to open the app directly, then click the Bell icon again!");'
);

fs.writeFileSync(file, content);
console.log("Patched alert");

const fs = require('fs');
const authFile = '/app/applet/artifacts/gold-swing-ai/src/lib/firebase/auth-context.tsx';
let authContent = fs.readFileSync(authFile, 'utf8');

authContent = authContent.replace('await signInWithPopup(auth, googleProvider);', 'await signInWithRedirect(auth, googleProvider);');
fs.writeFileSync(authFile, authContent);

console.log("Fixed auth-context.tsx");

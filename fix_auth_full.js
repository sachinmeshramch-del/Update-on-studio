const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/lib/firebase/auth-context.tsx';
let content = fs.readFileSync(file, 'utf8');

// Replace loginWithPasscode
const targetLogin = `  const loginWithPasscode = async (passcode: string) => {
    // Hardcoded simple passcode
    if (passcode === 'goldswing2024') {
      localStorage.setItem('gold_swing_auth', 'true');
      setUser({ email: 'admin' });
    } else {
      throw new Error("Invalid passcode");
    }
  };`;

const replacementLogin = `  const loginWithPasscode = async (passcode: string) => {
    // Hardcoded simple passcode
    if (passcode === 'goldswing2024') {
      try { localStorage.setItem('gold_swing_auth', 'true'); } catch (e) {}
      setUser({ email: 'admin' });
    } else {
      throw new Error("Invalid passcode");
    }
  };`;

content = content.replace(targetLogin, replacementLogin);

// Replace logout
const targetLogout = `  const logout = async () => {
    localStorage.removeItem('gold_swing_auth');
    setUser(null);
  };`;

const replacementLogout = `  const logout = async () => {
    try { localStorage.removeItem('gold_swing_auth'); } catch (e) {}
    setUser(null);
  };`;

content = content.replace(targetLogout, replacementLogout);

fs.writeFileSync(file, content);
console.log("Fully fixed auth context for iframe security.");

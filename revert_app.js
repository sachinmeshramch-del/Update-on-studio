const fs = require('fs');
let code = fs.readFileSync('artifacts/gold-swing-ai/src/App.tsx', 'utf8');
code = code.replace(
  'function AuthGuard({ children }: { children: React.ReactNode }) { return <>{children}</>; }',
  'function AuthGuard({ children }: { children: React.ReactNode }) {\n  const { user, loading } = useAuth();\n  \n  if (loading) return null;\n  if (!user) return <LoginScreen />;\n  \n  return <>{children}</>;\n}'
);
fs.writeFileSync('artifacts/gold-swing-ai/src/App.tsx', code);

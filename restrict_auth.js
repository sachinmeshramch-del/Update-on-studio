const fs = require('fs');
const file = '/app/applet/artifacts/gold-swing-ai/src/App.tsx';
let content = fs.readFileSync(file, 'utf8');

const replacement = `
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  
  if (loading) return null;
  if (!user) return <LoginScreen />;
  
  const ALLOWED_EMAIL = "meshramsachin3@gmail.com";
  
  if (user.email !== ALLOWED_EMAIL) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 p-4 space-y-4 text-center z-50 relative">
        <div className="text-red-500 mb-2">
          <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white">Access Denied</h2>
        <p className="text-zinc-400">This account ({user.email}) is not authorized to access this private dashboard.</p>
        <button 
          onClick={() => logout()}
          className="mt-4 px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors"
        >
          Sign Out & Try Another Account
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
`;

// Replace the old AuthGuard
content = content.replace(/function AuthGuard\(\{[^}]+\}[^{]+\{.*?return <>{children}<\/>;\n}/s, replacement.trim());

fs.writeFileSync(file, content);
console.log("Patched App.tsx to restrict email");

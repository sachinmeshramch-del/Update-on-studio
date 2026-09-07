const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/components/theme-provider.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetState = `  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  )`;

const replacementState = `  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem(storageKey) as Theme) || defaultTheme;
    } catch (e) {
      return defaultTheme;
    }
  });`;

content = content.replace(targetState, replacementState);

const targetSet = `    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme)
      setTheme(theme)
    },`;

const replacementSet = `    setTheme: (theme: Theme) => {
      try { localStorage.setItem(storageKey, theme); } catch (e) {}
      setTheme(theme)
    },`;

content = content.replace(targetSet, replacementSet);

fs.writeFileSync(file, content);
console.log("Fixed ThemeProvider local storage.");

const fs = require('fs');
const file = 'artifacts/api-server/src/routes/ai.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
    'const response = await ai.models.generateContent({',
    `let client = ai;
    if (req.body.apiKey) {
      client = new GoogleGenAI({
        apiKey: req.body.apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });
    }

    const response = await client.models.generateContent({`
);

content = content.replace(
    '} else if (!process.env.GEMINI_API_KEY) {',
    '} else if (!process.env.GEMINI_API_KEY && !req.body.apiKey) {'
);

fs.writeFileSync(file, content);
console.log("Patched ai.ts");

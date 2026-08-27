const fs = require('fs');
const file = 'artifacts/api-server/src/routes/ai.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
    'model: "gemini-3.1-pro-preview",',
    'model: "gemini-2.5-flash",'
);

content = content.replace(
    `    if (error.message && (error.message.includes('API key not valid') || error.message.includes('API_KEY_INVALID'))) {
      res.status(401).json({ analysis: "Invalid Gemini API Key. Please update your GEMINI_API_KEY in Settings > Secrets." });
    } else if (!process.env.GEMINI_API_KEY && !req.body.apiKey) {
      res.status(401).json({ analysis: "Missing Gemini API Key. Please add your GEMINI_API_KEY in Settings > Secrets." });
    } else {
      res.status(500).json({ analysis: "AI analysis currently unavailable. Please check server logs." });
    }`,
    `    if (error.message && (error.message.includes('API key not valid') || error.message.includes('API_KEY_INVALID'))) {
      res.status(401).json({ analysis: "Invalid Gemini API Key. Please update your GEMINI_API_KEY in Settings > Secrets." });
    } else if (error.message && error.message.includes('Quota exceeded')) {
      res.status(429).json({ analysis: "API Quota Exceeded. You have hit the rate limit for your Gemini API Key. Please check your Google AI Studio billing/plan." });
    } else if (!process.env.GEMINI_API_KEY && !req.body.apiKey) {
      res.status(401).json({ analysis: "Missing Gemini API Key. Please add your GEMINI_API_KEY in Settings > Secrets." });
    } else {
      res.status(500).json({ analysis: "AI analysis currently unavailable. Please check server logs." });
    }`
);

fs.writeFileSync(file, content);
console.log("Patched ai.ts");

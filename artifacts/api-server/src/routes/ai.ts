import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import { getRecentSignals } from "@workspace/db";
import { getLatestPrice } from "../lib/priceEvents.js";

const aiRouter = Router();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

aiRouter.post("/analyze-market", async (req, res) => {
  try {
    // Attempt to get the latest live price
    const livePrice = getLatestPrice();
    
    // Fetch recent market signals to provide market context
    const recentSignals = await getRecentSignals(10);
    
    const prompt = `You are an expert AI trading assistant specializing in XAUUSD (Gold).
Analyze the following recent market state and provide a concise, 2-3 sentence short-term market outlook and sentiment analysis.
Include key resistance/support levels if visible or plausible, and state whether the sentiment is Bullish, Bearish, or Neutral.

Recent Market State:
Current Price: ${livePrice ? JSON.stringify(livePrice) : "Unavailable"}
Recent System Signals (last 10 periods):
${JSON.stringify(recentSignals.map((s: any) => ({
  signal: s.signal,
  trend: s.trend,
  entryPrice: s.entryPrice,
  timestamp: s.createdAt,
})), null, 2)}
`;

    let client = ai;
    if (req.body.apiKey) {
      client = new GoogleGenAI({
        apiKey: req.body.apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });
    }

    const response = await client.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are a professional forex and gold trading analyst. Provide concise, clear, and objective analysis without financial disclaimers."
      }
    });

    res.json({ analysis: response.text });
  } catch (error: any) {
    console.error("AI Analysis Error:", error.message || error);
    
    if (error.message && (error.message.includes('API key not valid') || error.message.includes('API_KEY_INVALID'))) {
      res.status(401).json({ analysis: "Invalid Gemini API Key. Please update your GEMINI_API_KEY in Settings > Secrets." });
    } else if (error.message && error.message.includes('Quota exceeded')) {
      res.status(429).json({ analysis: "API Quota Exceeded. You have hit the rate limit for your Gemini API Key. Please check your Google AI Studio billing/plan." });
    } else if (!process.env.GEMINI_API_KEY && !req.body.apiKey) {
      res.status(401).json({ analysis: "Missing Gemini API Key. Please add your GEMINI_API_KEY in Settings > Secrets." });
    } else {
      res.status(500).json({ analysis: "AI analysis currently unavailable. Please check server logs." });
    }
  }
});

export default aiRouter;

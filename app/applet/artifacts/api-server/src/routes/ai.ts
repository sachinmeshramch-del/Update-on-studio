import { Router } from "express";
import { GoogleGenAI } from "@google/genai";

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
    const { prices } = req.body;
    
    if (!prices || prices.length === 0) {
      return res.json({ analysis: "Not enough data to analyze the market." });
    }

    const prompt = `You are an expert AI trading assistant specializing in XAUUSD (Gold).
Analyze the following recent market price data (tick/candle samples) and provide a concise, 2-3 sentence short-term market outlook and sentiment analysis.
Include key resistance/support levels if visible or plausible, and state whether the sentiment is Bullish, Bearish, or Neutral.

Recent Price Data Context:
Total data points provided: ${prices.length}
Latest prices: ${JSON.stringify(prices, null, 2)}
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: prompt,
      config: {
        systemInstruction: "You are a professional forex and gold trading analyst. Provide concise, clear, and objective analysis without financial disclaimers."
      }
    });

    res.json({ analysis: response.text });
  } catch (error) {
    console.error("AI Analysis Error:", error);
    res.status(500).json({ analysis: "AI analysis currently unavailable. Please check API key." });
  }
});

export default aiRouter;
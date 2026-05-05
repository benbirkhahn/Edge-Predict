import { GoogleGenAI } from "@google/genai";
import { GameOdds } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function analyzeEdge(game: GameOdds) {
  try {
    const prompt = `
      Analyze the following sports betting matchup and provide a "Mathematical Edge" summary.
      Game: ${game.home_team} vs ${game.away_team} (${game.sport_title})
      Time: ${new Date(game.commence_time).toLocaleString()}
      
      Consider factors like:
      - Historical trends (high level)
      - Statistical probability (Poisson or Elo if applicable)
      - Market sentiment
      
      Odds Context:
      ${JSON.stringify(game.bookmakers.map(b => ({
        bookie: b.title,
        odds: b.markets[0]?.outcomes
      })))}

      Provide a JSON response with:
      {
        "recommendation": "Team Name or No Bet",
        "justification": "Short, data-driven reasoning",
        "confidence": 0-100,
        "true_probability": 0.0-1.0
      }
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("AI Analysis Error:", error);
    return {
      recommendation: "Manual Review Needed",
      justification: "Unable to reach AI strategist for real-time edge detection.",
      confidence: 0,
      true_probability: 0.5
    };
  }
}

import { AgentCommand, GameOdds, MarketView, RiskSettings, StrategyDecision } from "../types";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || `${url} failed`);
  }
  return data;
}

export async function analyzeMarket(market: MarketView, risk: Partial<RiskSettings>): Promise<StrategyDecision> {
  return postJson<StrategyDecision>("/api/analyze-market", { market, risk });
}

export async function previewOrder(market: MarketView, risk: Partial<RiskSettings>): Promise<StrategyDecision> {
  return postJson<StrategyDecision>("/api/orders/preview", { market, risk });
}

export async function executeOrder(market: MarketView, risk: Partial<RiskSettings>) {
  return postJson("/api/orders/execute", { market, risk });
}

export async function processCommand(userInput: string, _currentState?: unknown): Promise<AgentCommand> {
  const input = userInput.toLowerCase();
  const amount = Number(input.match(/\$?(\d+(\.\d+)?)/)?.[1]);

  if (input.includes("kill") || input.includes("halt") || input.includes("stop")) {
    return { action: "TOGGLE_AUTOPILOT", feedback: "Autopilot halt requested." };
  }
  if (input.includes("allocation") || input.includes("stake")) {
    return { action: "SET_ALLOCATION", params: { value: Number.isFinite(amount) ? amount : 2 }, feedback: "Stake cap updated." };
  }
  if (input.includes("loss")) {
    return { action: "SET_RISK_LIMIT", params: { value: Number.isFinite(amount) ? amount : 10 }, feedback: "Daily loss cap updated." };
  }
  if (input.includes("scan") || input.includes("analyze")) {
    return { action: "ANALYZE_ALL", feedback: "Market scan requested." };
  }

  return { action: "UNKNOWN", feedback: "Command not recognized. Use scan, stake, loss, halt, or stop." };
}

export async function analyzeEdge(game: GameOdds) {
  return {
    recommendation: "Use Kalshi market scanner",
    justification: `${game.home_team} vs ${game.away_team} is legacy sportsbook data. Live execution now uses Kalshi markets and rule validation.`,
    confidence: 0
  };
}

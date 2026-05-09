import { GameOdds, MarketView } from "../types";
import { fetchBrokerBalance } from "./brokerService";

export async function fetchMarkets(limit = 20): Promise<MarketView[]> {
  const response = await fetch(`/api/markets?limit=${limit}`);
  const data = await response.json();
  if (!response.ok && data.data) return data.data;
  if (!response.ok) throw new Error(data?.error || "Market fetch failed");
  return data;
}

export async function fetchOdds(): Promise<GameOdds[]> {
  const response = await fetch("/api/odds?sport=nba");
  const data = await response.json();
  if (!response.ok && data.data) return data.data;
  if (!response.ok) throw new Error(data?.error || "Odds fetch failed");
  return data;
}

export { fetchBrokerBalance };

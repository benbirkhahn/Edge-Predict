import { GameOdds } from "../types";

export async function fetchOdds(sport = "upcoming"): Promise<GameOdds[]> {
  const response = await fetch(`/api/odds?sport=${sport}`);
  const data = await response.json();
  
  if (data.error && data.data) {
    console.warn(data.error);
    return data.data; 
  }
  
  return data;
}

export async function fetchBrokerBalance() {
  const response = await fetch("/api/broker/balance");
  return response.json();
}

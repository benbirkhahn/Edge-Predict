import { AutopilotStatus, BalanceView, BetHistoryEntry, BrokerStatus, FillsResponse, OddsCoverage, PositionsResponse, TradeLogEntry } from "../types";

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || `${url} failed`);
  }
  return data;
}

export function checkBrokerStatus() {
  return getJson<BrokerStatus>("/api/broker/status");
}

export function fetchBrokerBalance() {
  return getJson<BalanceView>("/api/broker/balance");
}

export function fetchTradeLog() {
  return getJson<TradeLogEntry[]>("/api/orders");
}

export function fetchPositions() {
  return getJson<PositionsResponse>("/api/positions");
}

export function fetchFills() {
  return getJson<FillsResponse>("/api/fills");
}

export function fetchBetHistory() {
  return getJson<BetHistoryEntry[]>("/api/bet-history");
}

export function fetchOddsCoverage() {
  return getJson<OddsCoverage>("/api/odds/coverage");
}

export function fetchAutopilotStatus() {
  return getJson<AutopilotStatus>("/api/autopilot/status");
}

export async function startServerAutopilot() {
  const response = await fetch("/api/autopilot/start", { method: "POST" });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || "Autopilot start failed");
  return data as AutopilotStatus;
}

export async function stopServerAutopilot() {
  const response = await fetch("/api/autopilot/stop", { method: "POST" });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || "Autopilot stop failed");
  return data as AutopilotStatus;
}

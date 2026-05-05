export interface Outcome {
  name: string;
  price: number;
}

export interface Market {
  key: string;
  outcomes: Outcome[];
}

export interface Bookmaker {
  key: string;
  title: string;
  markets: Market[];
}

export interface GameOdds {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Bookmaker[];
}

export interface VirtualPosition {
  id: string;
  game: string;
  selection: string;
  odds: number;
  stake: number;
  timestamp: string;
  status: "active" | "settled";
  result?: "win" | "loss";
}

export interface AutopilotState {
  isActive: boolean;
  isBrokerConnected: boolean;
  capital: number;
  totalPositions: number;
  winRate: number;
  log: string[];
}

export interface EdgeAnalysis {
  gameId: string;
  recommendation: string;
  justification: string;
  confidence: number;
}

export type TradingMode = "SIMULATION" | "LIVE_ARMED" | "LIVE_TRADING" | "HALTED";
export type OrderSide = "bid" | "ask";
export type TimeInForce = "fill_or_kill" | "immediate_or_cancel" | "good_till_canceled";

export interface RiskSettings {
  maxStakeDollars: number;
  dailyLossLimitDollars: number;
  maxOpenPositions: number;
  exposureLimitPercent: number;
  minEvPercent: number;
  minConfidencePercent: number;
  minLiquidityDollars: number;
  timeToCloseMinutes: number;
  maxHoursAhead: number;
  marketCooldownMinutes: number;
  kellyFraction: number;
  liveTradingEnabled: boolean;
  killSwitch: boolean;
  orderType: TimeInForce;
  allowedTickerPrefixes: string[];
}

export interface BrokerStatus {
  environment: "demo" | "prod";
  connected: boolean;
  liveEnabled: boolean;
  mode: TradingMode;
  exchangeHealth: string;
  keyPreview: string | null;
}

export interface AutopilotStatus {
  enabled: boolean;
  running: boolean;
  intervalSeconds: number;
  scanned: number;
  approved: number;
  topBlocker: string;
  lastScan: string | null;
  nextScanAt: string | null;
  lastExecution: string | null;
  lastMessage: string;
  openPositions?: number;
}

export interface BalanceView {
  balance: number;
  portfolioValue: number;
  updatedTs?: number;
  simulated: boolean;
  error?: string;
}

export interface MarketView {
  ticker: string;
  title: string;
  category: string;
  yesBid: number;
  yesAsk: number;
  liquidity: number;
  closeTime?: string;
  source: "kalshi" | "simulation";
}

export interface StrategyDecision {
  market: MarketView;
  fairProbability: number;
  rawFairProbability?: number;
  marketProbability: number;
  edgePercent: number;
  evPercent: number;
  confidencePercent: number;
  rawConfidencePercent?: number;
  modelSource: "sportsbook_consensus" | "unmapped";
  consensusProbability?: number;
  mappingConfidence?: number;
  mappedSportsbookEvent?: string;
  booksUsed?: string[];
  intelligenceAdjustment?: {
    league: string;
    samples: number;
    wins: number;
    losses: number;
    roiPercent: number;
    avgMarketMovePercent: number;
    probabilityShiftPercent: number;
    confidenceShift: number;
    note: string;
  };
  suggestedSide: OrderSide;
  suggestedPrice: number;
  suggestedCount: number;
  suggestedStakeDollars: number;
  reasons: string[];
  rejections: string[];
  approved: boolean;
  order?: {
    ticker: string;
    client_order_id: string;
    side: OrderSide;
    count: string;
    price: string;
    time_in_force: TimeInForce;
    self_trade_prevention_type: "taker_at_cross";
    cancel_order_on_pause: true;
  };
}

export interface OddsCoverage {
  fetchedAt: string;
  rawOdds: number;
  events: number;
  twoBookEvents: number;
  oneBookEvents: number;
  byLeague: Record<string, {
    events: number;
    twoBookEvents: number;
    oneBookEvents: number;
    books: Record<string, number>;
  }>;
  topEvents: Array<{
    eventKey: string;
    league: string;
    label: string;
    books: string[];
    sides: string[];
  }>;
}

export interface TradeLogEntry {
  timestamp: string;
  type: "EXECUTED" | "REJECTED" | "FAILED";
  mode?: TradingMode;
  ticker?: string;
  stakeDollars?: number;
  decision?: Partial<StrategyDecision>;
  reason?: string;
  error?: string;
  rejections?: string[];
}

export interface MarketPosition {
  ticker: string;
  position_fp: string;
  market_exposure_dollars: string;
  total_traded_dollars: string;
  fees_paid_dollars: string;
  realized_pnl_dollars: string;
  resting_orders_count: number;
  last_updated_ts?: string;
}

export interface PositionsResponse {
  cursor?: string;
  event_positions?: Array<{
    event_ticker: string;
    event_exposure_dollars: string;
    total_cost_dollars: string;
    fees_paid_dollars: string;
    realized_pnl_dollars: string;
  }>;
  market_positions?: MarketPosition[];
}

export interface Fill {
  action: "buy" | "sell";
  count_fp: string;
  created_time: string;
  fee_cost: string;
  fill_id: string;
  is_taker: boolean;
  market_ticker: string;
  no_price_dollars: string;
  order_id: string;
  side: "yes" | "no";
  ticker: string;
  trade_id: string;
  ts: number;
  yes_price_dollars: string;
}

export interface FillsResponse {
  cursor?: string;
  fills?: Fill[];
}

export interface BetHistoryEntry {
  ticker: string;
  status: "OPEN" | "PENDING" | "WIN" | "LOSS" | "FLAT";
  openedAt?: string;
  updatedAt?: string;
  count: number;
  avgEntryPrice: number;
  totalCostDollars: number;
  feesPaidDollars: number;
  realizedPnlDollars: number;
  exposureDollars: number;
  settledAt?: string;
  marketResult?: "yes" | "no";
  settlementRevenueDollars?: number;
  latestMarketProbability?: number;
  entryVsCurrentPercent?: number;
  lastPriceCheckedAt?: string;
  orderIds: string[];
  fillIds: string[];
  decision?: Partial<StrategyDecision>;
  source: "kalshi";
}

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

export interface EdgeAnalysis {
  gameId?: string;
  recommendation: string;
  justification: string;
  confidence: number;
}

export type ActionType = "SET_ALLOCATION" | "SET_SPORT" | "TOGGLE_AUTOPILOT" | "ANALYZE_ALL" | "QUERY_SYSTEM" | "SET_RISK_LIMIT" | "UNKNOWN";

export interface AgentCommand {
  action: ActionType;
  params?: {
    value?: string | number;
    sport?: string;
  };
  feedback: string;
}

export interface AutopilotState {
  isActive: boolean;
  isBrokerConnected: boolean;
  capital: number;
  totalPositions: number;
  winRate: number;
  log: string[];
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

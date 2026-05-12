import "dotenv/config";
import dotenv from "dotenv";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import express from "express";
import { createServer as createViteServer } from "vite";
import crypto from "crypto";
import dns from "node:dns/promises";
import fs from "fs";
import path from "path";

dotenv.config({ path: ".env.local", override: true });

const PORT = Number(process.env.PORT || 3000);
const execFileAsync = promisify(execFile);
const KALSHI_DEMO_URL = "https://external-api.demo.kalshi.co";
const KALSHI_PROD_URL = "https://external-api.kalshi.com";
const SHARP_API_URL = "https://api.sharpapi.io/api/v1";
const TRADE_API_PREFIX = "/trade-api/v2";
const LOG_PATH = path.join(process.cwd(), "data", "trade-log.json");
const BET_HISTORY_PATH = path.join(process.cwd(), "data", "bet-history.json");
const AUTOPILOT_STATE_PATH = path.join(process.cwd(), "data", "autopilot-state.json");
const MARKET_SNAPSHOT_REFRESH_MS = 10 * 60 * 1000;
const FANDUEL_BRIDGE_PATH = path.join(process.cwd(), "scripts", "fanduel_bridge.py");
const PROVIDER_TIMEOUT_MS = Number(process.env.ODDS_PROVIDER_TIMEOUT_MS || 3500);
const HARD_RULES = {
  maxStakeDollars: 1,
  dailyLossLimitDollars: 10,
  minEvPercent: 1.5,
  minConfidencePercent: 55,
  minLiquidityDollars: 12,
  maxHoursAhead: 36,
  allowedTickerPrefixes: ["KXMLB", "KXNBA", "KXNHL"]
};

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type Mode = "SIMULATION" | "LIVE_ARMED" | "LIVE_TRADING" | "HALTED";

interface AutopilotStatus {
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
type OrderSide = "bid" | "ask";
type TimeInForce = "fill_or_kill" | "immediate_or_cancel" | "good_till_canceled";

interface RiskSettings {
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

interface MarketView {
  ticker: string;
  title: string;
  category: string;
  yesBid: number;
  yesAsk: number;
  liquidity: number;
  closeTime?: string;
  source: "kalshi" | "simulation";
}

interface StrategyDecision {
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
  intelligenceAdjustment?: IntelligenceAdjustment;
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

interface IntelligenceAdjustment {
  league: string;
  samples: number;
  wins: number;
  losses: number;
  roiPercent: number;
  avgMarketMovePercent: number;
  probabilityShiftPercent: number;
  confidenceShift: number;
  note: string;
}

const defaultRisk: RiskSettings = {
  maxStakeDollars: Number(process.env.DEFAULT_MAX_STAKE_DOLLARS || 1),
  dailyLossLimitDollars: Number(process.env.DEFAULT_DAILY_LOSS_LIMIT_DOLLARS || 10),
  maxOpenPositions: Number(process.env.DEFAULT_MAX_OPEN_POSITIONS || 3),
  exposureLimitPercent: Number(process.env.DEFAULT_EXPOSURE_LIMIT_PERCENT || 10),
  minEvPercent: Number(process.env.DEFAULT_MIN_EV_PERCENT || 1.5),
  minConfidencePercent: Number(process.env.DEFAULT_MIN_CONFIDENCE_PERCENT || 55),
  minLiquidityDollars: Number(process.env.DEFAULT_MIN_LIQUIDITY_DOLLARS || 12),
  timeToCloseMinutes: Number(process.env.DEFAULT_TIME_TO_CLOSE_MINUTES || 60),
  maxHoursAhead: Number(process.env.DEFAULT_MAX_HOURS_AHEAD || 36),
  marketCooldownMinutes: Number(process.env.DEFAULT_MARKET_COOLDOWN_MINUTES || 120),
  kellyFraction: Number(process.env.DEFAULT_KELLY_FRACTION || 0.1),
  liveTradingEnabled: process.env.KALSHI_LIVE_TRADING_ENABLED === "true",
  killSwitch: false,
  orderType: "immediate_or_cancel",
  allowedTickerPrefixes: (process.env.DEFAULT_ALLOWED_TICKER_PREFIXES || "KXMLB,KXNBA,KXNHL").split(",").map((prefix) => prefix.trim()).filter(Boolean)
};

interface SportsbookOdd {
  sport: string;
  league: string;
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  eventKey?: string;
  homeTeamId?: string;
  awayTeamId?: string;
  startTime: string;
  book: string;
  outcome: string;
  selectionType: "home" | "away" | string;
  americanOdds: number;
  impliedProbability: number;
  lastUpdated: string;
}

interface ConsensusOutcome {
  sport: string;
  league: string;
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  outcome: string;
  selectionType: string;
  probability: number;
  booksUsed: string[];
}

interface MarketConsensusMatch {
  probability: number;
  confidence: number;
  eventLabel: string;
  booksUsed: string[];
}

interface OddsCoverage {
  fetchedAt: string;
  rawOdds: number;
  events: number;
  twoBookEvents: number;
  oneBookEvents: number;
  byLeague: Record<string, { events: number; twoBookEvents: number; oneBookEvents: number; books: Record<string, number> }>;
  topEvents: Array<{ eventKey: string; league: string; label: string; books: string[]; sides: string[] }>;
}

let oddsCache: { fetchedAt: number; odds: SportsbookOdd[]; error?: string } | null = null;

function hasKalshiCredentials() {
  return Boolean(process.env.KALSHI_API_KEY && process.env.KALSHI_API_SECRET);
}

function hasSharpCredentials() {
  return Boolean(process.env.SHARP_API_KEY);
}

function kalshiBaseUrl() {
  return process.env.KALSHI_ENV === "prod" ? KALSHI_PROD_URL : KALSHI_DEMO_URL;
}

function currentMode(connected: boolean, risk: RiskSettings): Mode {
  if (risk.killSwitch) return "HALTED";
  if (!connected || !risk.liveTradingEnabled || process.env.KALSHI_LIVE_TRADING_ENABLED !== "true") return "SIMULATION";
  return "LIVE_ARMED";
}

function loadPrivateKey() {
  const raw = process.env.KALSHI_API_SECRET || "";
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

function signedHeaders(method: string, apiPath: string) {
  const timestamp = Date.now().toString();
  const pathWithoutQuery = apiPath.split("?")[0];
  const signaturePayload = `${timestamp}${method.toUpperCase()}${pathWithoutQuery}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signaturePayload);
  sign.end();
  const signature = sign.sign({
    key: loadPrivateKey(),
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST
  }).toString("base64");

  return {
    "KALSHI-ACCESS-KEY": process.env.KALSHI_API_KEY || "",
    "KALSHI-ACCESS-SIGNATURE": signature,
    "KALSHI-ACCESS-TIMESTAMP": timestamp
  };
}

async function kalshiRequest<T>(method: string, pathOnly: string, body?: unknown): Promise<T> {
  if (!hasKalshiCredentials()) {
    throw new Error("Kalshi credentials are not configured.");
  }

  const apiPath = `${TRADE_API_PREFIX}${pathOnly}`;
  const response = await fetch(`${kalshiBaseUrl()}${apiPath}`, {
    method,
    headers: {
      ...signedHeaders(method, apiPath),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data?.message || errorMessage(data?.error) || `Kalshi ${method} ${pathOnly} failed with ${response.status}`);
  }
  return data as T;
}

function dollarsFromCents(value?: number) {
  return typeof value === "number" ? value / 100 : 0;
}

function priceToProbability(value: unknown, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return numeric > 1 ? numeric / 100 : numeric;
}

function dollarsValue(...values: unknown[]) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return 0;
}

function normalizeMarket(raw: any): MarketView {
  const yesBid = priceToProbability(raw.yes_bid_dollars ?? raw.yes_bid ?? raw.yesBid ?? raw.last_price_dollars ?? raw.last_price, 0.48);
  const yesAsk = priceToProbability(raw.yes_ask_dollars ?? raw.yes_ask ?? raw.yesAsk ?? raw.last_price_dollars ?? raw.last_price, Math.min(0.99, yesBid + 0.04));
  const askSize = Number(raw.yes_ask_size_fp || 0);
  const executableAskDepth = yesAsk * askSize;
  const title = raw.yes_sub_title ? `${raw.yes_sub_title} - ${raw.title || raw.ticker}` : raw.title || raw.yes_sub_title || raw.subtitle || raw.ticker;
  return {
    ticker: raw.ticker,
    title,
    category: raw.category || raw.series_ticker || raw.event_ticker || "Kalshi",
    yesBid,
    yesAsk,
    liquidity: dollarsValue(raw.liquidity_dollars, executableAskDepth, raw.volume_24h_fp, raw.volume_fp, raw.notional_value_dollars, dollarsFromCents(raw.liquidity)),
    closeTime: raw.occurrence_datetime || raw.expected_expiration_time || raw.close_time || raw.closeTime,
    source: "kalshi"
  };
}

function mockMarkets(): MarketView[] {
  return [
    {
      ticker: "SIM-NBA-LAL-GSW",
      title: "Lakers beat Warriors",
      category: "simulation",
      yesBid: 0.51,
      yesAsk: 0.55,
      liquidity: 180,
      closeTime: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
      source: "simulation"
    },
    {
      ticker: "SIM-MLB-NYY-BOS",
      title: "Yankees beat Red Sox",
      category: "simulation",
      yesBid: 0.58,
      yesAsk: 0.62,
      liquidity: 240,
      closeTime: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
      source: "simulation"
    },
    {
      ticker: "SIM-EPL-MCI-ARS",
      title: "Manchester City beat Arsenal",
      category: "simulation",
      yesBid: 0.44,
      yesAsk: 0.48,
      liquidity: 95,
      closeTime: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      source: "simulation"
    }
  ];
}

function hashProbability(ticker: string) {
  const digest = crypto.createHash("sha256").update(ticker).digest();
  return (digest[0] / 255 - 0.5) * 0.12;
}

function americanOddsToProbability(odds: number) {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function compactName(value: string) {
  return normalizeName(value).replace(/\s+/g, "");
}

const teamAliasMap: Record<string, string> = {
  "laangels": "laa",
  "losangelesangels": "laa",
  "losangelesa": "laa",
  "torontobluejays": "tor",
  "torbluejays": "tor",
  "bluejays": "tor",
  "nyyankees": "nyy",
  "newyorkyankees": "nyy",
  "newyorky": "nyy",
  "yankees": "nyy",
  "nyknicks": "nyk",
  "newyorkknicks": "nyk",
  "philadelphia76ers": "phi76",
  "phi76ers": "phi76",
  "phila76ers": "phi76",
  "minnesotatimberwolves": "min",
  "mintimberwolves": "min",
  "sanantoniospurs": "sas",
  "saspurs": "sas",
  "oklahomacitythunder": "okc",
  "okcthunder": "okc",
  "losangeleslakers": "lal",
  "lalakers": "lal",
  "cavs": "cle",
  "clevelandcavaliers": "cle",
  "detroitpistons": "det",
  "carolinahurricanes": "car",
  "carhurricanes": "car",
  "philadelphiaflyers": "phi",
  "phiflyers": "phi",
  "coloradoavalanche": "col",
  "colavalanche": "col",
  "minnesotawild": "minwild",
  "minwild": "minwild",
  "montrealcanadiens": "mtl",
  "mtlcanadiens": "mtl",
  "buffalosabres": "buf",
  "bufsabres": "buf"
};

function canonicalTeamId(value: string) {
  const compact = compactName(value);
  return teamAliasMap[compact] || compact;
}

function teamVariants(value: string) {
  const normalized = normalizeName(value);
  const compact = compactName(value);
  const canonical = canonicalTeamId(value);
  const words = normalized.split(" ").filter((word) => word.length > 1);
  const variants = new Set([compact, canonical, ...words]);

  if (words.length >= 2) {
    variants.add(words.slice(0, -1).join(""));
    variants.add(words.slice(1).join(""));
    variants.add(words.map((word) => word[0]).join(""));
  }

  return [...variants].filter(Boolean);
}

function containsVariant(haystack: string, variants: string[]) {
  return variants.some((variant) => variant.length > 1 && haystack.includes(variant));
}

function leagueForMarket(market: MarketView) {
  if (market.ticker.startsWith("KXMLB")) return "mlb";
  if (market.ticker.startsWith("KXNBA")) return "nba";
  if (market.ticker.startsWith("KXNHL")) return "nhl";
  return "";
}

function moneylinePriority(market: MarketView) {
  const title = normalizeName(market.title);
  const ticker = market.ticker.toUpperCase();
  if (!leagueForMarket(market)) return 0;
  if (ticker.includes("HRR") || ticker.includes("FIRSTGOAL") || ticker.includes("GOAL") || ticker.includes("PTS") || ticker.includes("AST") || ticker.includes("TB") || title.includes("total bases")) return -100;
  if (ticker.includes("GAME") || title.includes("winner") || title.includes(" win ")) return 100;
  if (ticker.includes("SPREAD") || title.includes("wins by")) return 60;
  if (ticker.includes("TOTAL") || title.includes("total")) return 40;
  return 0;
}

function sharpLeagues() {
  return (process.env.SHARP_API_LEAGUES || "mlb,nba,nhl").split(",").map((league) => league.trim()).filter(Boolean);
}

function fanduelLeagues() {
  return (process.env.FANDUEL_LEAGUES || "mlb,nba,nhl").split(",").map((league) => league.trim()).filter(Boolean);
}

function oddsRefreshMs() {
  return Number(process.env.ODDS_REFRESH_SECONDS || 120) * 1000;
}

function minMappingConfidence() {
  return Math.max(0.85, Number(process.env.DEFAULT_MIN_MAPPING_CONFIDENCE || 0.85));
}

function consensusScoreOnly() {
  return process.env.CONSENSUS_SCORE_ONLY !== "false";
}

function normalizeSharpOdd(raw: any): SportsbookOdd | null {
  const americanOdds = Number(raw.odds_american);
  if (!Number.isFinite(americanOdds)) return null;
  if (raw.market_type !== "moneyline") return null;
  if (raw.selection_type !== "home" && raw.selection_type !== "away") return null;
  const selection = String(raw.selection || "");
  const expectedTeam = raw.selection_type === "home" ? String(raw.home_team || "") : String(raw.away_team || "");
  if (!selectionMatchesTeam(selection, expectedTeam)) return null;
  const homeTeam = String(raw.home_team || "");
  const awayTeam = String(raw.away_team || "");
  const startTime = String(raw.event_start_time || "");
  const homeTeamId = canonicalTeamId(homeTeam);
  const awayTeamId = canonicalTeamId(awayTeam);
  return {
    sport: String(raw.sport || ""),
    league: String(raw.league || ""),
    eventId: String(raw.event_id || ""),
    homeTeam,
    awayTeam,
    eventKey: canonicalEventKeyFromParts(String(raw.league || ""), homeTeamId, awayTeamId, startTime),
    homeTeamId,
    awayTeamId,
    startTime,
    book: String(raw.sportsbook || ""),
    outcome: selection,
    selectionType: String(raw.selection_type || ""),
    americanOdds,
    impliedProbability: Number(raw.odds_probability) || americanOddsToProbability(americanOdds),
    lastUpdated: String(raw.last_seen_at || raw.odds_changed_at || "")
  };
}

function selectionMatchesTeam(selection: string, team: string) {
  const normalizedSelection = normalizeName(selection);
  const normalizedTeam = normalizeName(team);
  if (!normalizedSelection || !normalizedTeam) return false;
  if (normalizedSelection.includes(" over ") || normalizedSelection.includes(" under ") || normalizedSelection.includes(" tie ")) return false;
  const selectionCompact = compactName(selection);
  const teamCompact = compactName(team);
  return selectionCompact === teamCompact || teamVariants(team).some((variant) => variant.length > 2 && selectionCompact.includes(variant));
}

async function fetchSharpLeagueOdds(league: string) {
  const odds: SportsbookOdd[] = [];
  let cursor = "";

  for (let page = 0; page < 3; page += 1) {
    const url = new URL(`${SHARP_API_URL}/odds`);
    url.searchParams.set("league", league);
    url.searchParams.set("sportsbook", process.env.SHARP_API_BOOKS || "draftkings,fanduel");
    url.searchParams.set("market", "moneyline");
    url.searchParams.set("live", "false");
    url.searchParams.set("limit", "200");
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await fetch(url, {
      headers: { "X-API-Key": process.env.SHARP_API_KEY || "" },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || `SharpAPI ${league} odds failed with ${response.status}`);

    odds.push(...(data.data || []).map(normalizeSharpOdd).filter(Boolean));
    const pagination = data.pagination || data.meta?.pagination || {};
    cursor = pagination.has_more ? pagination.next_cursor : "";
    if (!cursor) break;
  }

  return odds;
}

async function runFanduelBridge<T>(args: string[]): Promise<T> {
  const { stdout } = await execFileAsync("python3", [FANDUEL_BRIDGE_PATH, ...args], {
    env: process.env,
    maxBuffer: 8 * 1024 * 1024
  });
  return JSON.parse(stdout) as T;
}

async function fetchFanduelSportsbookOdds() {
  return withTimeout(runFanduelBridge<SportsbookOdd[]>(["sportsbook", ...fanduelLeagues()]), PROVIDER_TIMEOUT_MS, "fanduel odds");
}

async function fetchFanduelGameOdds(sport: string) {
  return withTimeout(runFanduelBridge<any[]>(["games", sport]), PROVIDER_TIMEOUT_MS, "fanduel games");
}

async function getSportsbookOdds() {
  const provider = process.env.ODDS_PROVIDER || "consensus";
  if (oddsCache && Date.now() - oddsCache.fetchedAt < oddsRefreshMs()) return oddsCache.odds;

  const errors: string[] = [];
  let sharpOdds: SportsbookOdd[] = [];
  let fanduelOdds: SportsbookOdd[] = [];

  if ((provider === "sharpapi" || provider === "consensus") && hasSharpCredentials()) {
    try {
      sharpOdds = await Promise.all(sharpLeagues().map(fetchSharpLeagueOdds)).then((results) => results.flat());
    } catch (error) {
      errors.push(`sharpapi: ${errorMessage(error)}`);
    }
  }

  if (provider === "fanduel" || provider === "consensus") {
    try {
      fanduelOdds = await fetchFanduelSportsbookOdds();
    } catch (error) {
      errors.push(`fanduel: ${errorMessage(error)}`);
    }
  }

  const odds = [...sharpOdds, ...fanduelOdds];
  if (!odds.length && oddsCache) return oddsCache.odds;
  oddsCache = { fetchedAt: Date.now(), odds, error: errors.join("; ") };
  return odds;
}

function buildConsensusOutcomes(odds: SportsbookOdd[]) {
  const byEventBook = new Map<string, SportsbookOdd[]>();
  for (const odd of odds) {
    const key = `${canonicalEventKey(odd)}:${normalizeBook(odd.book)}`;
    byEventBook.set(key, [...(byEventBook.get(key) || []), odd]);
  }

  const fairByOutcome = new Map<string, Array<{ probability: number; book: string; odd: SportsbookOdd }>>();
  for (const bookOdds of byEventBook.values()) {
    const dedupedBookOdds = dedupeBookSides(bookOdds);
    if (dedupedBookOdds.length < 2) continue;
    const total = dedupedBookOdds.reduce((sum, odd) => sum + odd.impliedProbability, 0);
    if (total <= 0) continue;
    for (const odd of dedupedBookOdds) {
      const key = `${canonicalEventKey(odd)}:${odd.selectionType || canonicalOutcomeKey(odd)}`;
      fairByOutcome.set(key, [...(fairByOutcome.get(key) || []), { probability: odd.impliedProbability / total, book: odd.book, odd }]);
    }
  }

  const consensus: ConsensusOutcome[] = [];
  for (const entries of fairByOutcome.values()) {
    const first = entries[0].odd;
    consensus.push({
      sport: first.sport,
      league: first.league,
      eventId: first.eventId,
      homeTeam: first.homeTeam,
      awayTeam: first.awayTeam,
      startTime: first.startTime,
      outcome: first.outcome,
      selectionType: first.selectionType,
      probability: entries.reduce((sum, entry) => sum + entry.probability, 0) / entries.length,
      booksUsed: [...new Set(entries.map((entry) => normalizeBook(entry.book)))]
    });
  }

  return consensus;
}

function dedupeBookSides(bookOdds: SportsbookOdd[]) {
  const bySide = new Map<string, SportsbookOdd[]>();
  for (const odd of bookOdds) {
    const side = odd.selectionType || canonicalOutcomeKey(odd);
    bySide.set(side, [...(bySide.get(side) || []), odd]);
  }

  return [...bySide.values()].map((odds) => ({
    ...odds[0],
    impliedProbability: odds.reduce((sum, odd) => sum + odd.impliedProbability, 0) / odds.length,
    lastUpdated: odds.map((odd) => odd.lastUpdated).filter(Boolean).sort().at(-1) || odds[0].lastUpdated
  }));
}

function buildOddsCoverage(odds: SportsbookOdd[]): OddsCoverage {
  const byEvent = new Map<string, SportsbookOdd[]>();
  for (const odd of odds) {
    byEvent.set(canonicalEventKey(odd), [...(byEvent.get(canonicalEventKey(odd)) || []), odd]);
  }

  const byLeague: OddsCoverage["byLeague"] = {};
  const topEvents: OddsCoverage["topEvents"] = [];
  let twoBookEvents = 0;

  for (const [eventKey, eventOdds] of byEvent.entries()) {
    const first = eventOdds[0];
    const league = first.league || "unknown";
    const books = [...new Set(eventOdds.map((odd) => normalizeBook(odd.book)))];
    const sides = [...new Set(eventOdds.map(canonicalOutcomeKey))];
    if (!byLeague[league]) byLeague[league] = { events: 0, twoBookEvents: 0, oneBookEvents: 0, books: {} };
    byLeague[league].events += 1;
    if (books.length >= 2) {
      twoBookEvents += 1;
      byLeague[league].twoBookEvents += 1;
    } else {
      byLeague[league].oneBookEvents += 1;
    }
    for (const book of books) {
      byLeague[league].books[book] = (byLeague[league].books[book] || 0) + 1;
    }
    topEvents.push({
      eventKey,
      league,
      label: `${first.awayTeam} @ ${first.homeTeam}`,
      books,
      sides
    });
  }

  return {
    fetchedAt: new Date(oddsCache?.fetchedAt || Date.now()).toISOString(),
    rawOdds: odds.length,
    events: byEvent.size,
    twoBookEvents,
    oneBookEvents: byEvent.size - twoBookEvents,
    byLeague,
    topEvents: topEvents.sort((a, b) => b.books.length - a.books.length).slice(0, 12)
  };
}

async function checkHost(host: string) {
  try {
    await withTimeout(dns.lookup(host), 1500, `${host} dns`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

async function checkUrl(name: string, url: string) {
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS)
    });
    return { name, ok: response.ok, status: response.status, error: response.ok ? undefined : response.statusText };
  } catch (error) {
    return { name, ok: false, error: errorMessage(error) };
  }
}

async function buildHealthStatus() {
  const dnsChecks = {
    google: await checkHost("google.com"),
    kalshi: await checkHost(new URL(kalshiBaseUrl()).hostname),
    sharpapi: await checkHost(new URL(SHARP_API_URL).hostname)
  };
  const kalshi = await checkUrl("kalshi", `${kalshiBaseUrl()}${TRADE_API_PREFIX}/exchange/status`);
  const oddsCoverage = buildOddsCoverage(await getSportsbookOdds());
  const oddsOk = oddsCoverage.rawOdds > 0;
  const staleScan = autopilotStatus.enabled && autopilotStatus.lastScan
    ? Date.now() - new Date(autopilotStatus.lastScan).getTime() > autopilotStatus.intervalSeconds * 3 * 1000
    : false;
  const ok = dnsChecks.google.ok && dnsChecks.kalshi.ok && kalshi.ok && oddsOk && !staleScan;

  return {
    ok,
    checkedAt: new Date().toISOString(),
    mode: currentMode(kalshi.ok, mergeRisk()),
    dns: dnsChecks,
    providers: {
      kalshi,
      odds: {
        ok: oddsOk,
        rawOdds: oddsCoverage.rawOdds,
        events: oddsCoverage.events,
        twoBookEvents: oddsCoverage.twoBookEvents,
        lastError: oddsCache?.error || null
      }
    },
    autopilot: autopilotStatus,
    notes: [
      !dnsChecks.google.ok ? "VM DNS is unhealthy." : "",
      !kalshi.ok ? "Kalshi is unreachable." : "",
      !oddsOk ? "No sportsbook odds are currently available." : "",
      staleScan ? "Autopilot scan is stale." : ""
    ].filter(Boolean)
  };
}

function canonicalEventKey(odd: SportsbookOdd) {
  if (odd.eventKey) return odd.eventKey;
  return canonicalEventKeyFromParts(odd.league, canonicalTeamId(odd.homeTeam), canonicalTeamId(odd.awayTeam), odd.startTime || odd.eventId);
}

function canonicalEventKeyFromParts(league: string, homeTeamId: string, awayTeamId: string, startTime: string) {
  const teams = [homeTeamId, awayTeamId].sort().join("-");
  const startHour = startTime ? new Date(startTime).toISOString().slice(0, 13) : "unknown";
  return `${league}:${teams}:${startHour}`;
}

function canonicalOutcomeKey(odd: SportsbookOdd) {
  if (odd.selectionType === "home" || odd.selectionType === "away") return odd.selectionType;
  const home = odd.homeTeamId || canonicalTeamId(odd.homeTeam);
  const away = odd.awayTeamId || canonicalTeamId(odd.awayTeam);
  const outcome = canonicalTeamId(odd.outcome);
  if (outcome === home || home.includes(outcome) || outcome.includes(home)) return home;
  if (outcome === away || away.includes(outcome) || outcome.includes(away)) return away;
  return outcome;
}

function normalizeBook(book: string) {
  return compactName(book);
}

function mapMarketToConsensus(market: MarketView, outcomes: ConsensusOutcome[]): MarketConsensusMatch | null {
  const league = leagueForMarket(market);
  if (!league) return null;
  const title = compactName(market.title);
  const selectedLabel = compactName(market.title.split(" - ")[0] || market.title);
  let best: MarketConsensusMatch | null = null;

  for (const outcome of outcomes.filter((item) => item.league === league)) {
    const homeVariants = teamVariants(outcome.homeTeam);
    const awayVariants = teamVariants(outcome.awayTeam);
    const selectionIsHome = outcome.selectionType === "home";
    const selectionVariants = [...new Set([...teamVariants(outcome.outcome), ...(selectionIsHome ? homeVariants : awayVariants)])];
    const opponentVariants = selectionIsHome ? awayVariants : homeVariants;
    let confidence = 0.1;

    if (containsVariant(selectedLabel, selectionVariants)) confidence += 0.4;
    if (containsVariant(selectedLabel, opponentVariants)) confidence -= 0.4;
    if (containsVariant(title, selectionVariants)) confidence += 0.35;
    if (containsVariant(title, opponentVariants)) confidence += 0.25;
    if (containsVariant(title, homeVariants) && containsVariant(title, awayVariants)) confidence += 0.15;
    if (market.closeTime && outcome.startTime) {
      const hoursApart = Math.abs(new Date(market.closeTime).getTime() - new Date(outcome.startTime).getTime()) / 3600000;
      if (hoursApart <= 2) confidence += 0.2;
      else if (hoursApart <= 8) confidence += 0.1;
    }
    if (market.ticker.toLowerCase().includes(league)) confidence += 0.05;
    confidence = Math.min(1, confidence);

    if (confidence > (best?.confidence || 0)) {
      best = {
        probability: outcome.probability,
        confidence,
        eventLabel: `${outcome.awayTeam} @ ${outcome.homeTeam} / ${outcome.outcome}`,
        booksUsed: outcome.booksUsed
      };
    }
  }

  return best && best.confidence >= 0.35 ? best : null;
}

function calculateKelly(winProb: number, price: number) {
  const payoutMultiple = (1 - price) / price;
  if (payoutMultiple <= 0) return 0;
  return Math.max(0, (payoutMultiple * winProb - (1 - winProb)) / payoutMultiple);
}

function mergeRisk(input?: Partial<RiskSettings>): RiskSettings {
  const merged = { ...defaultRisk, ...(input || {}) };
  return {
    ...merged,
    maxStakeDollars: Math.min(merged.maxStakeDollars, HARD_RULES.maxStakeDollars),
    dailyLossLimitDollars: Math.min(merged.dailyLossLimitDollars, HARD_RULES.dailyLossLimitDollars),
    minEvPercent: Math.max(merged.minEvPercent, HARD_RULES.minEvPercent),
    minConfidencePercent: Math.max(merged.minConfidencePercent, HARD_RULES.minConfidencePercent),
    minLiquidityDollars: Math.max(merged.minLiquidityDollars, HARD_RULES.minLiquidityDollars),
    maxHoursAhead: Math.min(merged.maxHoursAhead, HARD_RULES.maxHoursAhead),
    allowedTickerPrefixes: HARD_RULES.allowedTickerPrefixes.filter((prefix) => merged.allowedTickerPrefixes.includes(prefix))
  };
}

function readTradeLog(): any[] {
  try {
    return JSON.parse(fs.readFileSync(LOG_PATH, "utf8"));
  } catch {
    return [];
  }
}

function readBetHistory(): any[] {
  try {
    return JSON.parse(fs.readFileSync(BET_HISTORY_PATH, "utf8"));
  } catch {
    return [];
  }
}

function writeBetHistory(history: any[]) {
  fs.mkdirSync(path.dirname(BET_HISTORY_PATH), { recursive: true });
  const next = JSON.stringify(history, null, 2);
  try {
    if (fs.readFileSync(BET_HISTORY_PATH, "utf8") === next) return;
  } catch {
    // File does not exist yet.
  }
  fs.writeFileSync(BET_HISTORY_PATH, next);
}

function readAutopilotEnabled() {
  try {
    return Boolean(JSON.parse(fs.readFileSync(AUTOPILOT_STATE_PATH, "utf8")).enabled);
  } catch {
    return process.env.SERVER_AUTOPILOT_ENABLED === "true";
  }
}

function writeAutopilotEnabled(enabled: boolean) {
  fs.mkdirSync(path.dirname(AUTOPILOT_STATE_PATH), { recursive: true });
  fs.writeFileSync(AUTOPILOT_STATE_PATH, JSON.stringify({ enabled, updatedAt: new Date().toISOString() }, null, 2));
}

function appendTradeLog(entry: Record<string, unknown>) {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  const log = readTradeLog();
  log.unshift({ timestamp: new Date().toISOString(), ...entry });
  fs.writeFileSync(LOG_PATH, JSON.stringify(log.slice(0, 500), null, 2));
}

function decisionSnapshot(decision: StrategyDecision) {
  return {
    ticker: decision.market.ticker,
    title: decision.market.title,
    modelSource: decision.modelSource,
    fairProbability: decision.fairProbability,
    marketProbability: decision.marketProbability,
    edgePercent: decision.edgePercent,
    evPercent: decision.evPercent,
    confidencePercent: decision.confidencePercent,
    suggestedStakeDollars: decision.suggestedStakeDollars,
    suggestedCount: decision.suggestedCount,
    suggestedPrice: decision.suggestedPrice,
    consensusProbability: decision.consensusProbability,
    mappingConfidence: decision.mappingConfidence,
    mappedSportsbookEvent: decision.mappedSportsbookEvent,
    booksUsed: decision.booksUsed,
    intelligenceAdjustment: decision.intelligenceAdjustment,
    reasons: decision.reasons,
    rejections: decision.rejections
  };
}

async function getPortfolioFills(limit = 100) {
  if (!hasKalshiCredentials()) return { fills: [] as any[] };
  return kalshiRequest<{ fills?: any[] }>("GET", `/portfolio/fills?limit=${limit}`);
}

async function getPortfolioSettlements(limit = 100) {
  if (!hasKalshiCredentials()) return { settlements: [] as any[] };
  return kalshiRequest<{ settlements?: any[] }>("GET", `/portfolio/settlements?limit=${limit}`);
}

async function getMarketByTicker(ticker: string) {
  const data = await kalshiRequest<{ market?: any }>("GET", `/markets/${encodeURIComponent(ticker)}`);
  return data.market ? normalizeMarket(data.market) : null;
}

async function syncBetHistory() {
  const historyByTicker = new Map(readBetHistory().map((bet) => [bet.ticker, bet]));
  const fills = await getPortfolioFills(100).catch(() => ({ fills: [] as any[] }));
  const positions = await getPortfolioPositions().catch(() => ({ market_positions: [] as any[] }));
  const settlements = await getPortfolioSettlements(100).catch(() => ({ settlements: [] as any[] }));
  const positionsByTicker = new Map((positions.market_positions || []).map((position) => [position.ticker, position]));
  const settlementsByTicker = new Map((settlements.settlements || []).map((settlement) => [settlement.ticker, settlement]));
  const executionsByTicker = new Map(readTradeLog().filter((entry) => entry.type === "EXECUTED" && entry.ticker).map((entry) => [entry.ticker, entry]));

  for (const fill of fills.fills || []) {
    const ticker = fill.ticker || fill.market_ticker;
    if (!ticker) continue;
    const existing = historyByTicker.get(ticker) || {};
    const tickerFills = (fills.fills || []).filter((item) => (item.ticker || item.market_ticker) === ticker);
    const fillCost = tickerFills.reduce((sum, item) => sum + Number(item.yes_price_dollars || 0) * Number(item.count_fp || 0), 0);
    const fillFees = tickerFills.reduce((sum, item) => sum + Number(item.fee_cost || 0), 0);
    const fillCount = tickerFills.reduce((sum, item) => sum + Number(item.count_fp || 0), 0);
    const position = positionsByTicker.get(ticker);
    const settlement = settlementsByTicker.get(ticker);
    const settlementRevenue = settlement ? Number(settlement.revenue || 0) / 100 : 0;
    const settlementCost = settlement ? Number(settlement.yes_total_cost_dollars || 0) + Number(settlement.no_total_cost_dollars || 0) : fillCost;
    const settlementFees = settlement ? Number(settlement.fee_cost || 0) : fillFees;
    const realizedPnl = settlement ? settlementRevenue - settlementCost - settlementFees : Number(position?.realized_pnl_dollars || existing.realizedPnlDollars || 0);
    const isOpen = settlement ? false : position ? positionIsOpen(position) : false;
    const status = isOpen ? "OPEN" : settlement ? realizedPnl > 0 ? "WIN" : realizedPnl < 0 ? "LOSS" : "FLAT" : "PENDING";
    const execution = executionsByTicker.get(ticker);
    const shouldRefreshMarket =
      isOpen &&
      (!existing.lastPriceCheckedAt || Date.now() - new Date(existing.lastPriceCheckedAt).getTime() > MARKET_SNAPSHOT_REFRESH_MS);
    const liveMarket = shouldRefreshMarket ? await getMarketByTicker(ticker).catch(() => null) : null;
    const latestMarketProbability = liveMarket?.yesAsk ?? existing.latestMarketProbability;
    const entryVsCurrentPercent = typeof latestMarketProbability === "number" && fillCount > 0
      ? (latestMarketProbability - fillCost / fillCount) * 100
      : existing.entryVsCurrentPercent;

    const materiallySame =
      existing.status === status &&
      Number(existing.count || 0) === fillCount &&
      Number(existing.totalCostDollars || 0) === fillCost &&
      Number(existing.feesPaidDollars || 0) === settlementFees &&
      Number(existing.realizedPnlDollars || 0) === realizedPnl &&
      Number(existing.exposureDollars || 0) === (isOpen ? Number(position?.market_exposure_dollars || 0) : 0) &&
      Number(existing.latestMarketProbability || 0) === Number(latestMarketProbability || 0) &&
      existing.settledAt === (settlement?.settled_time || existing.settledAt);

    historyByTicker.set(ticker, {
      ...existing,
      ticker,
      status,
      openedAt: existing.openedAt || tickerFills.map((item) => item.created_time).sort()[0],
      updatedAt: materiallySame ? existing.updatedAt : new Date().toISOString(),
      count: fillCount,
      avgEntryPrice: fillCount > 0 ? fillCost / fillCount : Number(existing.avgEntryPrice || 0),
      totalCostDollars: fillCost,
      feesPaidDollars: settlementFees,
      realizedPnlDollars: realizedPnl,
      exposureDollars: isOpen ? Number(position?.market_exposure_dollars || 0) : 0,
      settledAt: settlement?.settled_time || existing.settledAt,
      marketResult: settlement?.market_result || existing.marketResult,
      settlementRevenueDollars: settlement ? settlementRevenue : existing.settlementRevenueDollars,
      latestMarketProbability,
      entryVsCurrentPercent,
      lastPriceCheckedAt: liveMarket ? new Date().toISOString() : existing.lastPriceCheckedAt,
      orderIds: [...new Set(tickerFills.map((item) => item.order_id).filter(Boolean))],
      fillIds: [...new Set(tickerFills.map((item) => item.fill_id).filter(Boolean))],
      decision: existing.decision || execution?.decision,
      source: "kalshi"
    });
  }

  const history = [...historyByTicker.values()].sort((a, b) => new Date(b.openedAt || b.updatedAt || 0).getTime() - new Date(a.openedAt || a.updatedAt || 0).getTime());
  writeBetHistory(history);
  return history;
}

function dailyExecutedStake() {
  const today = new Date().toISOString().slice(0, 10);
  return readTradeLog()
    .filter((entry) => entry.timestamp?.startsWith(today) && entry.type === "EXECUTED")
    .reduce((sum, entry) => sum + Number(entry.stakeDollars || 0), 0);
}

function recentExecutionsForTicker(ticker: string, cooldownMinutes: number) {
  const cutoff = Date.now() - cooldownMinutes * 60 * 1000;
  return readTradeLog().filter((entry) => entry.type === "EXECUTED" && entry.ticker === ticker && new Date(entry.timestamp).getTime() >= cutoff);
}

function leagueForTicker(ticker: string) {
  if (ticker.startsWith("KXMLB")) return "mlb";
  if (ticker.startsWith("KXNBA")) return "nba";
  if (ticker.startsWith("KXNHL")) return "nhl";
  return "";
}

function eventKeyFromTicker(ticker: string) {
  return ticker.split("-").slice(0, -1).join("-");
}

async function getPortfolioPositions() {
  if (!hasKalshiCredentials()) return { market_positions: [] as any[] };
  return kalshiRequest<{ market_positions?: any[] }>("GET", "/portfolio/positions?limit=100");
}

function positionIsOpen(position: any) {
  return Math.abs(Number(position.position_fp || 0)) > 0 || Number(position.resting_orders_count || 0) > 0;
}

async function validatePortfolioGuards(decision: StrategyDecision, risk: RiskSettings) {
  const rejections: string[] = [];
  const positions = await getPortfolioPositions();
  const openPositions = (positions.market_positions || []).filter(positionIsOpen);
  const existing = openPositions.find((position) => position.ticker === decision.market.ticker);
  const existingSameEvent = openPositions.find((position) => {
    return position.ticker !== decision.market.ticker && eventKeyFromTicker(position.ticker) === eventKeyFromTicker(decision.market.ticker);
  });

  if (existing) {
    rejections.push(`Existing open position/order for ${decision.market.ticker}; skipping duplicate entry.`);
  }
  if (existingSameEvent) {
    rejections.push(`Existing open position/order in same event ${eventKeyFromTicker(decision.market.ticker)}; skipping correlated opposite-side entry.`);
  }

  return rejections;
}

function intelligenceForMarket(market: MarketView): IntelligenceAdjustment {
  const league = leagueForMarket(market);
  const leagueBets = readBetHistory().filter((bet) => leagueForTicker(bet.ticker) === league);
  const settled = leagueBets.filter((bet) => bet.status === "WIN" || bet.status === "LOSS" || bet.status === "FLAT");
  const samples = settled.length;
  const wins = settled.filter((bet) => bet.status === "WIN").length;
  const losses = settled.filter((bet) => bet.status === "LOSS").length;
  const cost = settled.reduce((sum, bet) => sum + Number(bet.totalCostDollars || 0), 0);
  const pnl = settled.reduce((sum, bet) => sum + Number(bet.realizedPnlDollars || 0), 0);
  const roiPercent = cost > 0 ? (pnl / cost) * 100 : 0;
  const moveSamples = leagueBets.filter((bet) => typeof bet.entryVsCurrentPercent === "number");
  const avgMarketMovePercent = moveSamples.length
    ? moveSamples.reduce((sum, bet) => sum + Number(bet.entryVsCurrentPercent || 0), 0) / moveSamples.length
    : 0;
  const sampleWeight = Math.min(1, samples / 30);
  const roiSignal = Math.max(-3, Math.min(1, roiPercent * 0.08));
  const moveSignal = Math.max(-3, Math.min(1, avgMarketMovePercent * 0.2));
  const probabilityShiftPercent = samples >= 5 ? (roiSignal + moveSignal) * sampleWeight : 0;
  const confidenceShift = samples >= 5 ? Math.round(probabilityShiftPercent * 4) : 0;
  const note = samples < 5
    ? "Learning disabled until at least 5 settled league bets."
    : probabilityShiftPercent < -0.25
      ? "Historical league performance is weak; discounting this signal."
      : probabilityShiftPercent > 0.25
        ? "Historical league performance is favorable; allowing a small confidence credit."
        : "Historical league performance is neutral.";

  return {
    league,
    samples,
    wins,
    losses,
    roiPercent,
    avgMarketMovePercent,
    probabilityShiftPercent,
    confidenceShift,
    note
  };
}

function analyzeMarket(market: MarketView, riskInput?: Partial<RiskSettings>, balanceDollars = 0, consensusMatch?: MarketConsensusMatch | null): StrategyDecision {
  const risk = mergeRisk(riskInput);
  const marketProbability = market.yesAsk;
  const hasConsensus = Boolean(consensusMatch && consensusMatch.confidence >= minMappingConfidence());
  const rawFairProbability = hasConsensus ? consensusMatch!.probability : Math.min(0.97, Math.max(0.03, marketProbability + hashProbability(market.ticker)));
  const intelligenceAdjustment = intelligenceForMarket(market);
  const fairProbability = Math.min(0.97, Math.max(0.03, rawFairProbability + intelligenceAdjustment.probabilityShiftPercent / 100));
  const edgePercent = (fairProbability - marketProbability) * 100;
  const feeAndSlippagePercent = 1.25;
  const evPercent = edgePercent - feeAndSlippagePercent;
  const rawConfidencePercent = Math.round(Math.min(95, Math.max(35, 50 + Math.abs(edgePercent) * 6)));
  const confidencePercent = Math.round(Math.min(95, Math.max(35, rawConfidencePercent + intelligenceAdjustment.confidenceShift)));
  const fullKelly = calculateKelly(fairProbability, marketProbability);
  const suggestedStakeDollars = Math.max(0, Math.min(risk.maxStakeDollars, balanceDollars * fullKelly * risk.kellyFraction || risk.maxStakeDollars));
  const suggestedCount = Math.max(1, Math.floor(suggestedStakeDollars / Math.max(0.01, marketProbability)));
  const rejections: string[] = [];
  const reasons: string[] = [
    `Fair probability ${(fairProbability * 100).toFixed(1)}% vs market ${(marketProbability * 100).toFixed(1)}%.`,
    `Estimated EV after fee/slippage buffer: ${evPercent.toFixed(2)}%.`,
    `${intelligenceAdjustment.league.toUpperCase()} intelligence: ${intelligenceAdjustment.note} Shift ${intelligenceAdjustment.probabilityShiftPercent.toFixed(2)} pts, ROI ${intelligenceAdjustment.roiPercent.toFixed(1)}%, market move ${intelligenceAdjustment.avgMarketMovePercent.toFixed(1)} pts.`
  ];

  if (risk.killSwitch) rejections.push("Kill switch is active.");
  if (!hasConsensus) {
    rejections.push(consensusMatch ? `Low mapping confidence ${(consensusMatch.confidence * 100).toFixed(0)}% is below ${(minMappingConfidence() * 100).toFixed(0)}%.` : "No sportsbook mapping.");
  }
  if (hasConsensus && (consensusMatch?.booksUsed.length || 0) < 2) rejections.push("Consensus needs at least 2 sportsbooks.");
  if (hasConsensus && consensusScoreOnly()) rejections.push("Consensus score-only mode blocks live execution.");
  if (risk.allowedTickerPrefixes.length > 0 && !risk.allowedTickerPrefixes.some((prefix) => market.ticker.startsWith(prefix))) {
    rejections.push(`Market is outside allowed sports: ${risk.allowedTickerPrefixes.join(", ")}.`);
  }
  if (evPercent < risk.minEvPercent) rejections.push(`EV ${evPercent.toFixed(2)}% is below ${risk.minEvPercent}%.`);
  if (confidencePercent < risk.minConfidencePercent) rejections.push(`Confidence ${confidencePercent}% is below ${risk.minConfidencePercent}%.`);
  if (intelligenceAdjustment.samples >= 8 && intelligenceAdjustment.roiPercent < -10 && intelligenceAdjustment.avgMarketMovePercent < -3) {
    rejections.push(`${intelligenceAdjustment.league.toUpperCase()} intelligence throttle: weak ROI and negative market movement.`);
  }
  if (market.liquidity < risk.minLiquidityDollars) rejections.push(`Liquidity $${market.liquidity.toFixed(2)} is below $${risk.minLiquidityDollars}.`);
  if (suggestedStakeDollars <= 0) rejections.push("Suggested stake is zero.");
  if (dailyExecutedStake() + suggestedStakeDollars > risk.dailyLossLimitDollars) rejections.push("Daily live stake cap would be exceeded.");
  if (recentExecutionsForTicker(market.ticker, risk.marketCooldownMinutes).length > 0) rejections.push(`Market is cooling down for ${risk.marketCooldownMinutes} minutes after a recent execution.`);
  if (market.closeTime) {
    const closeDate = new Date(market.closeTime);
    const minutesToClose = (closeDate.getTime() - Date.now()) / 60000;
    if (minutesToClose < risk.timeToCloseMinutes) rejections.push("Market is too close to closing.");
    if (minutesToClose > risk.maxHoursAhead * 60) {
      rejections.push(`Market closes beyond the next ${risk.maxHoursAhead} hours.`);
    }
  }

  const clientOrderId = `edge-${market.ticker}-${Date.now()}`.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 64);
  const order = {
    ticker: market.ticker,
    client_order_id: clientOrderId,
    side: "bid" as const,
    count: `${suggestedCount}.00`,
    price: marketProbability.toFixed(4),
    time_in_force: risk.orderType,
    self_trade_prevention_type: "taker_at_cross" as const,
    cancel_order_on_pause: true as const
  };

  return {
    market,
    fairProbability,
    rawFairProbability,
    marketProbability,
    edgePercent,
    evPercent,
    confidencePercent,
    rawConfidencePercent,
    modelSource: hasConsensus ? "sportsbook_consensus" : "unmapped",
    consensusProbability: hasConsensus ? consensusMatch!.probability : undefined,
    mappingConfidence: consensusMatch?.confidence,
    mappedSportsbookEvent: consensusMatch?.eventLabel,
    booksUsed: consensusMatch?.booksUsed,
    intelligenceAdjustment,
    suggestedSide: "bid",
    suggestedPrice: marketProbability,
    suggestedCount,
    suggestedStakeDollars,
    reasons,
    rejections,
    approved: rejections.length === 0,
    order
  };
}

async function analyzeMarketWithPortfolio(
  market: MarketView,
  riskInput?: Partial<RiskSettings>,
  balanceDollars = 0,
  consensusOutcomes?: ConsensusOutcome[]
) {
  const risk = mergeRisk(riskInput);
  const outcomes = consensusOutcomes || buildConsensusOutcomes(await getSportsbookOdds());
  const consensusMatch = mapMarketToConsensus(market, outcomes);
  const decision = analyzeMarket(market, risk, balanceDollars, consensusMatch);

  if (!hasKalshiCredentials()) return decision;

  try {
    const portfolioRejections = await validatePortfolioGuards(decision, risk);
    if (portfolioRejections.length === 0) return decision;
    return {
      ...decision,
      approved: false,
      rejections: [...decision.rejections, ...portfolioRejections]
    };
  } catch {
    return decision;
  }
}

async function executeMarketOrder(market: MarketView, riskInput?: Partial<RiskSettings>) {
  const risk = mergeRisk(riskInput);
  const balance = await getBalance().catch(() => ({ balance: 0, simulated: true }));
  const connected = hasKalshiCredentials() && !balance.simulated;
  const mode = currentMode(connected, risk);
  const odds = await getSportsbookOdds();
  const consensusMatch = mapMarketToConsensus(market, buildConsensusOutcomes(odds));
  const decision = analyzeMarket(market, risk, balance.balance, consensusMatch);

  if (mode !== "LIVE_ARMED") {
    appendTradeLog({ type: "REJECTED", mode, ticker: market?.ticker, reason: "Live trading is not armed." });
    return { ok: false as const, status: 403, mode, decision, error: "Live trading is not armed." };
  }
  if (!decision.approved || !decision.order) {
    appendTradeLog({ type: "REJECTED", mode, ticker: market?.ticker, rejections: decision.rejections });
    return { ok: false as const, status: 400, mode: "HALTED" as const, decision, error: "Order failed risk validation." };
  }

  try {
    const portfolioRejections = await validatePortfolioGuards(decision, risk);
    if (portfolioRejections.length > 0) {
      const guardedDecision = { ...decision, approved: false, rejections: [...decision.rejections, ...portfolioRejections] };
      appendTradeLog({ type: "REJECTED", mode, ticker: decision.market.ticker, rejections: portfolioRejections });
      return { ok: false as const, status: 400, mode: "HALTED" as const, decision: guardedDecision, error: "Order failed portfolio validation." };
    }

    const result = await kalshiRequest("POST", "/portfolio/events/orders", decision.order);
    appendTradeLog({
      type: "EXECUTED",
      mode: "LIVE_TRADING",
      ticker: decision.market.ticker,
      stakeDollars: decision.suggestedStakeDollars,
      decision: decisionSnapshot(decision),
      order: decision.order,
      result
    });
    return { ok: true as const, mode: "LIVE_TRADING" as const, decision, result };
  } catch (error) {
    appendTradeLog({ type: "FAILED", mode, ticker: decision.market.ticker, error: errorMessage(error) });
    return { ok: false as const, status: 502, mode: "HALTED" as const, decision, error: errorMessage(error) };
  }
}

async function getBalance() {
  if (!hasKalshiCredentials()) {
    return { balance: 0, portfolioValue: 0, simulated: true };
  }
  const data = await kalshiRequest<{ balance: number; portfolio_value: number; updated_ts: number }>("GET", "/portfolio/balance");
  return {
    balance: dollarsFromCents(data.balance),
    portfolioValue: dollarsFromCents(data.portfolio_value),
    updatedTs: data.updated_ts,
    simulated: false
  };
}

async function getMarkets(limit = 20) {
  if (!hasKalshiCredentials()) return mockMarkets();
  const requestedLimit = Math.max(1, Math.min(limit, 100));
  const collected: MarketView[] = await getGameWinnerMarkets();
  let cursor = "";

  for (let page = 0; page < 10; page += 1) {
    const query = `/markets?status=open&mve_filter=exclude&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const data = await kalshiRequest<{ markets?: any[]; cursor?: string }>("GET", query);
    const pageMarkets = (data.markets || [])
      .map(normalizeMarket)
      .filter((market) => market.ticker)
      .filter((market) => defaultRisk.allowedTickerPrefixes.some((prefix) => market.ticker.startsWith(prefix)));

    collected.push(...pageMarkets);
    cursor = data.cursor || "";
    if (!cursor) break;
  }

  const unique = [...new Map(collected.map((market) => [market.ticker, market])).values()];
  return unique
    .sort((a, b) => moneylinePriority(b) - moneylinePriority(a) || b.liquidity - a.liquidity)
    .slice(0, requestedLimit);
}

async function getGameWinnerMarkets() {
  const seriesTickers = (process.env.KALSHI_GAME_SERIES_TICKERS || "KXMLBGAME,KXNBAGAME,KXNHLGAME").split(",").map((ticker) => ticker.trim()).filter(Boolean);
  const markets: MarketView[] = [];

  for (const seriesTicker of seriesTickers) {
    const data = await kalshiRequest<{ events?: Array<{ markets?: any[] }> }>("GET", `/events?status=open&with_nested_markets=true&limit=50&series_ticker=${encodeURIComponent(seriesTicker)}`);
    markets.push(...(data.events || []).flatMap((event) => event.markets || []).map(normalizeMarket));
  }

  return markets;
}

const autopilotStatus: AutopilotStatus = {
  enabled: readAutopilotEnabled(),
  running: false,
  intervalSeconds: Number(process.env.SERVER_AUTOPILOT_INTERVAL_SECONDS || 60),
  scanned: 0,
  approved: 0,
  topBlocker: "No scan yet.",
  lastScan: null,
  nextScanAt: null,
  lastExecution: null,
  lastMessage: "Server autopilot is idle."
};
let autopilotTimer: NodeJS.Timeout | null = null;
let autopilotScanInFlight = false;

function setNextAutopilotScan() {
  autopilotStatus.nextScanAt = autopilotStatus.enabled
    ? new Date(Date.now() + autopilotStatus.intervalSeconds * 1000).toISOString()
    : null;
}

async function runAutopilotScan() {
  if (!autopilotStatus.enabled || autopilotScanInFlight) return;
  autopilotScanInFlight = true;
  autopilotStatus.running = true;

  try {
    const balance = await getBalance().catch(() => ({ balance: 0 }));
    const markets = await getMarkets(24);
    const consensusOutcomes = buildConsensusOutcomes(await getSportsbookOdds());
    const decisions: StrategyDecision[] = [];
    for (const market of markets) {
      decisions.push(await analyzeMarketWithPortfolio(market, defaultRisk, balance.balance, consensusOutcomes));
    }
    const ranked = decisions.sort((a, b) => b.evPercent - a.evPercent);
    const approved = ranked.filter((decision) => decision.approved);
    const blockers = ranked.flatMap((decision) => decision.rejections).reduce<Record<string, number>>((counts, reason) => {
      counts[reason] = (counts[reason] || 0) + 1;
      return counts;
    }, {});
    const topBlocker = Object.entries(blockers).sort((a, b) => b[1] - a[1])[0]?.[0] || "None";

    autopilotStatus.scanned = ranked.length;
    autopilotStatus.approved = approved.length;
    autopilotStatus.topBlocker = topBlocker;
    autopilotStatus.lastScan = new Date().toISOString();

    if (approved[0]) {
      const result = await executeMarketOrder(approved[0].market, defaultRisk);
      if (result.ok) {
        autopilotStatus.lastExecution = new Date().toISOString();
        autopilotStatus.lastMessage = `Executed ${approved[0].market.ticker}.`;
      } else {
        autopilotStatus.lastMessage = `Approved candidate rejected at execution: ${result.error}`;
      }
    } else {
      autopilotStatus.lastMessage = `Scanned ${ranked.length} markets. No approved next-${defaultRisk.maxHoursAhead}h market. Top blocker: ${topBlocker}.`;
    }

    const positions = await getPortfolioPositions().catch(() => ({ market_positions: [] as any[] }));
    autopilotStatus.openPositions = (positions.market_positions || []).filter(positionIsOpen).length;
  } catch (error) {
    autopilotStatus.lastScan = new Date().toISOString();
    autopilotStatus.lastMessage = `Server autopilot scan failed: ${errorMessage(error)}`;
  } finally {
    autopilotStatus.running = false;
    autopilotScanInFlight = false;
    setNextAutopilotScan();
  }
}

function startAutopilotTimer() {
  if (autopilotTimer) return;
  setNextAutopilotScan();
  autopilotTimer = setInterval(() => {
    runAutopilotScan();
  }, autopilotStatus.intervalSeconds * 1000);
  runAutopilotScan();
}

function stopAutopilotTimer() {
  if (autopilotTimer) clearInterval(autopilotTimer);
  autopilotTimer = null;
  autopilotStatus.running = false;
  autopilotStatus.nextScanAt = null;
}

function setAutopilotEnabled(enabled: boolean) {
  autopilotStatus.enabled = enabled;
  writeAutopilotEnabled(enabled);
  if (enabled) {
    autopilotStatus.lastMessage = "Server autopilot enabled.";
    startAutopilotTimer();
  } else {
    autopilotStatus.lastMessage = "Server autopilot stopped.";
    stopAutopilotTimer();
  }
  return autopilotStatus;
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get("/api/broker/status", async (_req, res) => {
    const risk = mergeRisk();
    const credentials = hasKalshiCredentials();
    let connected = false;
    let exchangeHealth = "not_configured";
    try {
      if (credentials) {
        await getBalance();
        connected = true;
        exchangeHealth = "ok";
      }
    } catch (error) {
      exchangeHealth = errorMessage(error);
    }

    res.json({
      environment: process.env.KALSHI_ENV === "prod" ? "prod" : "demo",
      connected,
      liveEnabled: risk.liveTradingEnabled,
      mode: currentMode(connected, risk),
      exchangeHealth,
      keyPreview: process.env.KALSHI_API_KEY ? `***${process.env.KALSHI_API_KEY.slice(-4)}` : null
    });
  });

  app.get("/api/broker/balance", async (_req, res) => {
    try {
      res.json(await getBalance());
    } catch (error) {
      res.status(502).json({ error: errorMessage(error), simulated: false });
    }
  });

  app.get("/api/markets", async (req, res) => {
    try {
      res.json(await getMarkets(Number(req.query.limit || 20)));
    } catch (error) {
      res.status(502).json({ error: errorMessage(error), data: mockMarkets() });
    }
  });

  app.get("/api/odds", async (req, res) => {
    try {
      res.json(await fetchFanduelGameOdds(String(req.query.sport || "nba")));
    } catch (error) {
      res.status(502).json({ error: errorMessage(error), data: [] });
    }
  });

  app.get("/api/odds/coverage", async (_req, res) => {
    try {
      res.json(buildOddsCoverage(await getSportsbookOdds()));
    } catch (error) {
      res.status(502).json({ error: errorMessage(error) });
    }
  });

  app.get("/api/health", async (_req, res) => {
    try {
      const health = await buildHealthStatus();
      res.status(health.ok ? 200 : 503).json(health);
    } catch (error) {
      res.status(503).json({ ok: false, checkedAt: new Date().toISOString(), error: errorMessage(error) });
    }
  });

  app.get("/api/health/live", (_req, res) => {
    res.json({ ok: true, checkedAt: new Date().toISOString(), pid: process.pid });
  });

  app.get("/api/autopilot/status", (_req, res) => {
    res.json(autopilotStatus);
  });

  app.post("/api/autopilot/start", (_req, res) => {
    res.json(setAutopilotEnabled(true));
  });

  app.post("/api/autopilot/stop", (_req, res) => {
    res.json(setAutopilotEnabled(false));
  });

  app.post("/api/analyze-market", async (req, res) => {
    const balance = await getBalance().catch(() => ({ balance: 0 }));
    res.json(await analyzeMarketWithPortfolio(req.body.market, req.body.risk, balance.balance));
  });

  app.post("/api/orders/preview", async (req, res) => {
    const balance = await getBalance().catch(() => ({ balance: 0 }));
    res.json(await analyzeMarketWithPortfolio(req.body.market, req.body.risk, balance.balance));
  });

  app.post("/api/orders/execute", async (req, res) => {
    const result = await executeMarketOrder(req.body.market, req.body.risk);
    if (result.ok) return res.json({ mode: result.mode, decision: result.decision, result: result.result });
    return res.status(result.status).json({ mode: result.mode, decision: result.decision, error: result.error });
  });

  app.get("/api/orders", (_req, res) => res.json(readTradeLog()));
  app.get("/api/positions", async (_req, res) => {
    try {
      if (!hasKalshiCredentials()) return res.json([]);
      const data = await getPortfolioPositions();
      res.json(data);
    } catch (error) {
      res.status(502).json({ error: errorMessage(error) });
    }
  });
  app.get("/api/fills", async (_req, res) => {
    try {
      if (!hasKalshiCredentials()) return res.json([]);
      const data = await getPortfolioFills(50);
      res.json(data);
    } catch (error) {
      res.status(502).json({ error: errorMessage(error) });
    }
  });
  app.get("/api/bet-history", async (_req, res) => {
    try {
      res.json(await syncBetHistory());
    } catch (error) {
      res.status(502).json({ error: errorMessage(error), data: readBetHistory() });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true, watch: { ignored: ["**/data/**"] } }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`EdgePredict server running on http://localhost:${PORT}`);
    if (autopilotStatus.enabled) startAutopilotTimer();
  });
}

startServer();

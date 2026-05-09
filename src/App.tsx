import { FormEvent, useEffect, useState } from "react";
import { Activity, AlertTriangle, Bot, Clock, Database, LineChart as LineChartIcon, Pause, Play, RefreshCw, Shield, Target, Zap } from "lucide-react";
import { motion } from "motion/react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { analyzeMarket, executeOrder, processCommand } from "./services/aiService";
import { checkBrokerStatus, fetchAutopilotStatus, fetchBetHistory, fetchBrokerBalance, fetchFills, fetchOddsCoverage, fetchPositions, fetchTradeLog, startServerAutopilot, stopServerAutopilot } from "./services/brokerService";
import { fetchMarkets } from "./services/oddsService";
import { AutopilotStatus, BalanceView, BetHistoryEntry, BrokerStatus, Fill, FillsResponse, MarketPosition, MarketView, OddsCoverage, PositionsResponse, RiskSettings, StrategyDecision, TradeLogEntry } from "./types";

const defaultRisk: RiskSettings = {
  maxStakeDollars: 1,
  dailyLossLimitDollars: 10,
  maxOpenPositions: 3,
  exposureLimitPercent: 10,
  minEvPercent: 1.5,
  minConfidencePercent: 55,
  minLiquidityDollars: 12,
  timeToCloseMinutes: 60,
  maxHoursAhead: 36,
  marketCooldownMinutes: 120,
  kellyFraction: 0.1,
  liveTradingEnabled: false,
  killSwitch: false,
  orderType: "immediate_or_cancel",
  allowedTickerPrefixes: ["KXMLB", "KXNBA", "KXNHL"]
};

const riskSettingsVersion = "strict-ev-36h-v7";

interface WatcherSummary {
  scanned: number;
  approved: number;
  topBlocker: string;
  nextScanSeconds: number;
  lastExecution: string;
}

function loadRisk(): RiskSettings {
  try {
    const saved = JSON.parse(localStorage.getItem("edge_risk_settings") || "{}");
    const migrated = { ...defaultRisk, ...saved };
    if (localStorage.getItem("edge_risk_settings_version") !== riskSettingsVersion) {
      migrated.maxStakeDollars = 1;
      migrated.dailyLossLimitDollars = 10;
      migrated.minLiquidityDollars = 12;
      migrated.minEvPercent = 1.5;
      migrated.maxHoursAhead = 36;
      migrated.marketCooldownMinutes = 120;
      migrated.allowedTickerPrefixes = defaultRisk.allowedTickerPrefixes;
      localStorage.setItem("edge_risk_settings_version", riskSettingsVersion);
    }
    return migrated;
  } catch {
    return defaultRisk;
  }
}

function loadAutopilot() {
  return localStorage.getItem("edge_autopilot_enabled") === "true";
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function money(value: number) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function modeClass(mode?: string) {
  if (mode === "LIVE_TRADING" || mode === "LIVE_ARMED") return "text-edge-green border-edge-green/40 bg-edge-green/10";
  if (mode === "HALTED") return "text-alert-red border-alert-red/40 bg-alert-red/10";
  return "text-amber-400 border-amber-400/30 bg-amber-400/10";
}

export default function App() {
  const [status, setStatus] = useState<BrokerStatus | null>(null);
  const [balance, setBalance] = useState<BalanceView>({ balance: 0, portfolioValue: 0, simulated: true });
  const [markets, setMarkets] = useState<MarketView[]>([]);
  const [decisions, setDecisions] = useState<StrategyDecision[]>([]);
  const [selected, setSelected] = useState<StrategyDecision | null>(null);
  const [tradeLog, setTradeLog] = useState<TradeLogEntry[]>([]);
  const [positions, setPositions] = useState<PositionsResponse>({});
  const [fills, setFills] = useState<FillsResponse>({});
  const [betHistory, setBetHistory] = useState<BetHistoryEntry[]>([]);
  const [oddsCoverage, setOddsCoverage] = useState<OddsCoverage | null>(null);
  const [risk, setRisk] = useState<RiskSettings>(loadRisk);
  const [autopilot, setAutopilot] = useState(false);
  const [serverAutopilot, setServerAutopilot] = useState<AutopilotStatus | null>(null);
  const [command, setCommand] = useState("");
  const [lastScan, setLastScan] = useState<string>("Never");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>("Ready.");
  const [watcher, setWatcher] = useState<WatcherSummary>({
    scanned: 0,
    approved: 0,
    topBlocker: "No scan yet.",
    nextScanSeconds: 15,
    lastExecution: "None"
  });

  useEffect(() => {
    localStorage.setItem("edge_risk_settings", JSON.stringify(risk));
  }, [risk]);

  const refreshAccount = async () => {
    const nextStatus = await checkBrokerStatus().catch((error) => ({ environment: "demo", connected: false, liveEnabled: false, mode: "HALTED", exchangeHealth: error.message, keyPreview: null } as BrokerStatus));
    setStatus(nextStatus);
    setRisk((current) => current.liveTradingEnabled === nextStatus.liveEnabled ? current : { ...current, liveTradingEnabled: nextStatus.liveEnabled });

    if (nextStatus.connected) {
      try {
        setBalance(await fetchBrokerBalance());
      } catch (error) {
        setMessage(error instanceof Error ? `Balance refresh failed: ${error.message}` : "Balance refresh failed.");
      }
    } else {
      setBalance({ balance: 0, portfolioValue: 0, simulated: true });
    }

    const nextLog = await fetchTradeLog().catch(() => []);
    const nextAutopilot = await fetchAutopilotStatus().catch(() => null);
    if (nextAutopilot) {
      setServerAutopilot(nextAutopilot);
      setAutopilot(nextAutopilot.enabled);
      setLastScan(nextAutopilot.lastScan ? new Date(nextAutopilot.lastScan).toLocaleTimeString() : "Never");
      setMessage(nextAutopilot.lastMessage || message);
    }
    setTradeLog(nextLog);
    setPositions(await fetchPositions().catch(() => ({})));
    setFills(await fetchFills().catch(() => ({})));
    setBetHistory(await fetchBetHistory().catch(() => []));
    setOddsCoverage(await fetchOddsCoverage().catch(() => null));
    setWatcher((current) => ({
      ...current,
      scanned: nextAutopilot?.scanned ?? current.scanned,
      approved: nextAutopilot?.approved ?? current.approved,
      topBlocker: nextAutopilot?.topBlocker ?? current.topBlocker,
      nextScanSeconds: nextAutopilot?.nextScanAt ? Math.max(0, Math.round((new Date(nextAutopilot.nextScanAt).getTime() - Date.now()) / 1000)) : current.nextScanSeconds,
      lastExecution: nextAutopilot?.lastExecution || nextLog.find((entry) => entry.type === "EXECUTED")?.timestamp || "None"
    }));
  };

  const scanMarkets = async (executeApproved = false) => {
    setBusy(true);
    try {
      await refreshAccount();
      const nextMarkets = await fetchMarkets(24);
      const nextDecisions = await Promise.all(nextMarkets.map((market) => analyzeMarket(market, risk)));
      const ranked = nextDecisions.sort((a, b) => b.evPercent - a.evPercent);
      const bestApproved = ranked.find((decision) => decision.approved);
      const bestCandidate = bestApproved || ranked[0] || null;
      const blockerCounts = ranked.flatMap((decision) => decision.rejections).reduce<Record<string, number>>((counts, reason) => {
        counts[reason] = (counts[reason] || 0) + 1;
        return counts;
      }, {});
      const topBlocker = Object.entries(blockerCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "None";
      setMarkets(nextMarkets);
      setDecisions(ranked);
      setSelected(bestCandidate);
      setLastScan(new Date().toLocaleTimeString());
      setWatcher((current) => ({
        ...current,
        scanned: ranked.length,
        approved: ranked.filter((decision) => decision.approved).length,
        topBlocker,
        nextScanSeconds: 15
      }));

      if (executeApproved && bestApproved) {
        const result: any = await executeOrder(bestApproved.market, risk);
        setMessage(`Executed ${bestApproved.market.ticker}: ${result.result?.order_id || "order submitted"}`);
      } else if (executeApproved) {
        const commonBlocker = ranked.flatMap((decision) => decision.rejections)[0] || "No markets passed every rule.";
        setMessage(`Autopilot moved on. No approved next-${risk.maxHoursAhead}h market yet. Best blocker: ${commonBlocker}`);
      } else {
        const passed = ranked.filter((decision) => decision.approved).length;
        setMessage(`Scanned ${ranked.length} markets. ${passed} passed every rule. ${passed === 0 ? `Waiting for a next-${risk.maxHoursAhead}h candidate.` : "Ready."}`);
      }
      await refreshAccount();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Scan failed.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    refreshAccount();
    scanMarkets(false);
    const id = window.setInterval(refreshAccount, 15000);
    return () => window.clearInterval(id);
  }, []);

  const updateRisk = <K extends keyof RiskSettings>(key: K, value: RiskSettings[K]) => {
    setRisk((current) => ({ ...current, [key]: value }));
  };

  const toggleAutopilot = async () => {
    try {
      const next = autopilot ? await stopServerAutopilot() : await startServerAutopilot();
      setServerAutopilot(next);
      setAutopilot(next.enabled);
      setMessage(next.lastMessage);
      setWatcher((current) => ({
        ...current,
        scanned: next.scanned,
        approved: next.approved,
        topBlocker: next.topBlocker,
        nextScanSeconds: next.nextScanAt ? Math.max(0, Math.round((new Date(next.nextScanAt).getTime() - Date.now()) / 1000)) : 0,
        lastExecution: next.lastExecution || current.lastExecution
      }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Autopilot toggle failed.");
    }
  };

  const submitCommand = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = await processCommand(command);
    if (parsed.action === "SET_ALLOCATION") updateRisk("maxStakeDollars", Number(parsed.params?.value || 2));
    if (parsed.action === "SET_RISK_LIMIT") updateRisk("dailyLossLimitDollars", Number(parsed.params?.value || 10));
    if (parsed.action === "ANALYZE_ALL") scanMarkets(false);
    if (parsed.action === "TOGGLE_AUTOPILOT") {
      setAutopilot(false);
      updateRisk("killSwitch", true);
    }
    setMessage(parsed.feedback);
    setCommand("");
  };

  return (
    <div className="min-h-screen bg-bento-bg text-bento-text p-4 md:p-6">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-5 pb-24">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded bg-edge-green text-lg font-black text-black">E</div>
            <div>
              <h1 className="text-xl font-bold uppercase">EdgePredict</h1>
              <p className="mono text-[10px] uppercase text-white/40">Kalshi positive EV execution console</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 mono text-xs">
            <span className={`rounded border px-3 py-1 font-bold ${modeClass(risk.killSwitch ? "HALTED" : status?.mode)}`}>
              {risk.killSwitch ? "HALTED" : status?.mode || "SIMULATION"}
            </span>
            <span className="rounded border border-white/10 px-3 py-1 text-white/60">{status?.environment?.toUpperCase() || "DEMO"}</span>
            <span className="rounded border border-white/10 px-3 py-1 text-white/60">{status?.connected ? `KEY ${status.keyPreview}` : "NO KALSHI KEY"}</span>
            <button onClick={() => scanMarkets(false)} disabled={busy} className="bento-button-primary flex items-center gap-2 disabled:opacity-50">
              <RefreshCw size={13} className={busy ? "animate-spin" : ""} />
              Scan
            </button>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[1.5fr_1fr_1fr]">
          <div className="bento-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xs font-bold uppercase text-white/60"><Database size={14} /> Account</h2>
              <span className="mono text-[10px] text-white/40">Last scan: {lastScan}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Available" value={money(balance.balance)} />
              <Metric label="Portfolio" value={money(balance.portfolioValue)} />
              <Metric label="Executed Today" value={money(tradeLog.filter((entry) => entry.type === "EXECUTED").reduce((sum, entry) => sum + Number(entry.stakeDollars || 0), 0))} />
            </div>
            <p className="mt-4 mono text-[10px] text-white/40">{status?.connected ? "Balance loaded from Kalshi." : "No live balance loaded. Execution remains blocked unless keys and live arming are valid."}</p>
          </div>

          <div className="bento-card p-5">
            <h2 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase text-white/60"><Bot size={14} /> Autopilot</h2>
            <div className="flex items-center gap-3">
              <button
                onClick={toggleAutopilot}
                disabled={risk.killSwitch}
                className={`flex items-center gap-2 rounded border px-4 py-2 text-xs font-bold uppercase ${autopilot ? "border-edge-green text-edge-green" : "border-white/10 text-white/50"} disabled:opacity-30`}
              >
                {autopilot ? <Pause size={14} /> : <Play size={14} />}
                {autopilot ? "Running" : "Standby"}
              </button>
              <button
                onClick={() => {
                  stopServerAutopilot().catch(() => undefined);
                  setAutopilot(false);
                  updateRisk("killSwitch", !risk.killSwitch);
                }}
                className={`rounded border px-4 py-2 text-xs font-bold uppercase ${risk.killSwitch ? "border-alert-red bg-alert-red/10 text-alert-red" : "border-white/10 text-white/50"}`}
              >
                Kill Switch
              </button>
            </div>
            <p className="mt-4 mono text-[10px] text-white/40">{serverAutopilot?.enabled ? serverAutopilot.lastMessage : message}</p>
          </div>

          <div className="bento-card p-5">
            <h2 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase text-white/60"><Shield size={14} /> Live Arming</h2>
            <label className="flex items-center justify-between gap-3 mono text-xs text-white/60">
              Live order requests
              <input type="checkbox" checked={status?.liveEnabled ?? risk.liveTradingEnabled} disabled />
            </label>
            <p className="mt-4 mono text-[10px] text-white/40">
              {status?.connected && status.liveEnabled
                ? "Kalshi credentials are valid and live order requests are armed. Rule checks still block every unapproved order before submission."
                : "Live order requests are blocked until Kalshi credentials and server live arming are valid."}
            </p>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <div className="bento-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xs font-bold uppercase text-white/60"><Target size={14} /> Watcher</h2>
              <span className={`mono rounded border px-2 py-1 text-[10px] ${autopilot ? "border-edge-green/30 text-edge-green" : "border-white/10 text-white/40"}`}>
                {autopilot ? "ACTIVE" : "STANDBY"}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <Metric label="Scanned" value={String(watcher.scanned)} />
              <Metric label="Approved" value={String(watcher.approved)} />
              <Metric label="Next Scan" value={autopilot ? `${watcher.nextScanSeconds}s` : "--"} />
              <Metric label="Open Positions" value={String((positions.market_positions || []).filter(positionIsOpen).length)} />
            </div>
            <p className="mt-4 mono text-[10px] text-white/45">Top blocker: {watcher.topBlocker}</p>
            <p className="mt-2 mono text-[10px] text-white/35">Last execution: {watcher.lastExecution === "None" ? "None" : new Date(watcher.lastExecution).toLocaleString()}</p>
          </div>

          <div className="bento-card p-5">
            <h2 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase text-white/60"><Clock size={14} /> Open Position</h2>
            <OpenPositions positions={(positions.market_positions || []).filter(positionIsOpen)} />
          </div>
        </section>

        <OddsCoveragePanel coverage={oddsCoverage} />

        <section className="grid gap-5 xl:grid-cols-[1.3fr_0.9fr]">
          <div className="bento-card overflow-auto">
            <div className="flex items-center justify-between border-b border-white/10 p-5">
              <h2 className="flex items-center gap-2 text-xs font-bold uppercase text-white/60"><Zap size={14} /> Market Candidates</h2>
              <span className="mono text-[10px] text-white/40">{markets.length} markets</span>
            </div>
            <table className="w-full min-w-[1040px] text-left mono text-xs">
              <thead className="border-b border-white/10 text-[10px] uppercase text-white/40">
                <tr>
                  <th className="p-3">Market</th>
                  <th className="p-3">Ask</th>
                  <th className="p-3">Fair</th>
                  <th className="p-3">EV</th>
                  <th className="p-3">Books</th>
                  <th className="p-3">Map</th>
                  <th className="p-3">Stake</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Top Blocker</th>
                </tr>
              </thead>
              <tbody>
                {decisions.map((decision) => (
                  <tr key={decision.market.ticker} onClick={() => setSelected(decision)} className="cursor-pointer border-b border-white/5 hover:bg-white/5">
                    <td className="p-3">
                      <span className="block font-bold text-white">{decision.market.title}</span>
                      <span className="text-[10px] text-white/35">{decision.market.ticker}</span>
                    </td>
                    <td className="p-3">{pct(decision.marketProbability)}</td>
                    <td className="p-3">{pct(decision.fairProbability)}</td>
                    <td className={decision.evPercent > 0 ? "p-3 text-edge-green" : "p-3 text-alert-red"}>{decision.evPercent.toFixed(2)}%</td>
                    <td className="p-3 text-white/55">{decision.booksUsed?.length ? decision.booksUsed.join(", ") : "--"}</td>
                    <td className="p-3 text-white/55">{decision.mappingConfidence === undefined ? "--" : `${Math.round(decision.mappingConfidence * 100)}%`}</td>
                    <td className="p-3">{money(decision.suggestedStakeDollars)}</td>
                    <td className="p-3">
                      <span className={`rounded border px-2 py-1 text-[10px] ${decision.approved ? "border-edge-green/30 text-edge-green" : decision.modelSource === "sportsbook_consensus" ? "border-sky-400/30 text-sky-300" : "border-amber-400/30 text-amber-400"}`}>
                        {decision.approved ? "PASS" : decision.modelSource === "sportsbook_consensus" ? "SCORE" : "SKIP"}
                      </span>
                    </td>
                    <td className="max-w-[260px] truncate p-3 text-white/40">{decision.rejections[0] || "None"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-5">
            <div className="bento-card p-5">
              <h2 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase text-white/60"><Activity size={14} /> Decision Detail</h2>
              {selected ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 mono text-xs">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                    <p className="font-bold text-white">{selected.market.title}</p>
                    <p className="text-[10px] text-white/40">{selected.market.ticker}</p>
                    </div>
                    <span className={`shrink-0 rounded border px-2 py-1 text-[10px] ${selected.approved ? "border-edge-green/30 text-edge-green" : "border-amber-400/30 text-amber-400"}`}>
                      {selected.approved ? "APPROVED" : "SKIPPED"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Metric label="Edge" value={`${selected.edgePercent.toFixed(2)}%`} />
                    <Metric label="Confidence" value={`${selected.confidencePercent}%`} />
                    <Metric label="Contracts" value={String(selected.suggestedCount)} />
                    <Metric label="Liquidity" value={money(selected.market.liquidity)} />
                    <Metric label="Model" value={selected.modelSource === "sportsbook_consensus" ? "Consensus" : "Unmapped"} />
                    <Metric label="Mapping" value={selected.mappingConfidence === undefined ? "--" : `${Math.round(selected.mappingConfidence * 100)}%`} />
                    <Metric label="Intel Shift" value={selected.intelligenceAdjustment ? `${selected.intelligenceAdjustment.probabilityShiftPercent >= 0 ? "+" : ""}${selected.intelligenceAdjustment.probabilityShiftPercent.toFixed(2)} pts` : "--"} />
                    <Metric label="League ROI" value={selected.intelligenceAdjustment ? `${selected.intelligenceAdjustment.roiPercent >= 0 ? "+" : ""}${selected.intelligenceAdjustment.roiPercent.toFixed(1)}%` : "--"} />
                  </div>
                  <div className="space-y-2">
                    {selected.mappedSportsbookEvent && <p className="text-sky-300/80">Mapped: {selected.mappedSportsbookEvent}</p>}
                    {selected.booksUsed && selected.booksUsed.length > 0 && <p className="text-sky-300/60">Books: {selected.booksUsed.join(", ")}</p>}
                    {selected.consensusProbability !== undefined && <p className="text-sky-300/60">Consensus probability {(selected.consensusProbability * 100).toFixed(1)}%.</p>}
                    {selected.intelligenceAdjustment && (
                      <p className="text-edge-green/70">
                        Learning: {selected.intelligenceAdjustment.league.toUpperCase()} {selected.intelligenceAdjustment.wins}-{selected.intelligenceAdjustment.losses} over {selected.intelligenceAdjustment.samples} settled bets. {selected.intelligenceAdjustment.note}
                      </p>
                    )}
                    {selected.reasons.map((reason) => <p key={reason} className="text-white/55">{reason}</p>)}
                    {selected.rejections.map((reason) => <p key={reason} className="flex gap-2 text-amber-400"><AlertTriangle size={13} /> {reason}</p>)}
                  </div>
                  <button disabled={!selected.approved} onClick={() => executeOrder(selected.market, risk).then(() => scanMarkets(false)).catch((error) => setMessage(error.message))} className="bento-button-primary w-full disabled:cursor-not-allowed disabled:bg-amber-400 disabled:opacity-60">
                    {selected.approved ? "Execute Approved Market" : selected.modelSource === "sportsbook_consensus" ? "Consensus Score Only" : "No Approved Near-Term Market Yet"}
                  </button>
                </motion.div>
              ) : (
                <p className="mono text-xs text-white/40">No market selected.</p>
              )}
            </div>

            <RiskPanel risk={risk} updateRisk={updateRisk} />
          </div>
        </section>

        <PerformancePanel tradeLog={tradeLog} positions={positions} fills={fills.fills || []} betHistory={betHistory} />

        <section className="bento-card p-5">
          <h2 className="mb-4 text-xs font-bold uppercase text-white/60">Execution Log</h2>
          <div className="grid gap-2 mono text-[10px] text-white/50">
            {tradeLog.slice(0, 8).map((entry, index) => (
              <div key={`${entry.timestamp}-${index}`} className="flex flex-wrap justify-between gap-3 border-b border-white/5 pb-2">
                <span>{new Date(entry.timestamp).toLocaleString()} - {entry.type} - {entry.ticker || "system"}</span>
                <span>
                  {entry.error || entry.reason || entry.rejections?.join("; ") || `${money(entry.stakeDollars || 0)} ${entry.decision?.evPercent !== undefined ? `EV ${Number(entry.decision.evPercent).toFixed(2)}%` : ""}`}
                </span>
              </div>
            ))}
            {tradeLog.length === 0 && <span>No live executions recorded yet.</span>}
          </div>
        </section>

        <form onSubmit={submitCommand} className="fixed bottom-5 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/85 px-4 py-2 backdrop-blur">
          <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Command: scan, stake 2, loss 10, halt" className="mono flex-1 bg-transparent text-xs outline-none placeholder:text-white/25" />
          <button className="rounded-full bg-edge-green px-4 py-1.5 text-xs font-bold uppercase text-black">Send</button>
        </form>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/10 bg-white/5 p-3">
      <span className="mono block text-[9px] uppercase text-white/35">{label}</span>
      <span className="mono text-lg font-bold text-white">{value}</span>
    </div>
  );
}

function positionIsOpen(position: MarketPosition) {
  return Math.abs(Number(position.position_fp || 0)) > 0 || Number(position.resting_orders_count || 0) > 0;
}

function OpenPositions({ positions }: { positions: MarketPosition[] }) {
  if (positions.length === 0) {
    return <p className="mono text-xs text-white/40">No open Kalshi positions.</p>;
  }

  return (
    <div className="grid gap-3 mono text-xs">
      {positions.slice(0, 4).map((position) => (
        <div key={position.ticker} className="rounded border border-white/10 bg-white/5 p-3">
          <p className="break-all font-bold text-white">{position.ticker}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-white/45">
            <span>Contracts: {Number(position.position_fp || 0).toFixed(2)}</span>
            <span>Exposure: {money(Number(position.market_exposure_dollars || 0))}</span>
            <span>Traded: {money(Number(position.total_traded_dollars || 0))}</span>
            <span>Fees: {money(Number(position.fees_paid_dollars || 0))}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function OddsCoveragePanel({ coverage }: { coverage: OddsCoverage | null }) {
  const leagueRows = Object.entries(coverage?.byLeague || {});
  return (
    <section className="bento-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase text-white/60"><Database size={14} /> Odds Coverage</h2>
        <span className="mono text-[10px] text-white/35">Canonical event mapping by league/team/start hour</span>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Raw Odds" value={String(coverage?.rawOdds || 0)} />
        <Metric label="Events" value={String(coverage?.events || 0)} />
        <Metric label="2+ Book Events" value={String(coverage?.twoBookEvents || 0)} />
        <Metric label="1 Book Events" value={String(coverage?.oneBookEvents || 0)} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="grid gap-2 mono text-[10px] text-white/50">
          {leagueRows.map(([league, row]) => (
            <div key={league} className="rounded border border-white/10 bg-white/5 p-3">
              <p className="font-bold uppercase text-white/70">{league}</p>
              <p>{row.twoBookEvents}/{row.events} events have 2+ books.</p>
              <p>Books: {Object.entries(row.books).map(([book, count]) => `${book} ${count}`).join(", ") || "--"}</p>
            </div>
          ))}
          {leagueRows.length === 0 && <span>No odds coverage loaded.</span>}
        </div>
        <div className="grid gap-2 mono text-[10px] text-white/50">
          {(coverage?.topEvents || []).slice(0, 6).map((event) => (
            <div key={event.eventKey} className="grid grid-cols-[1fr_auto] gap-3 border-b border-white/5 pb-2">
              <span className="truncate text-white/70">{event.label}</span>
              <span className={event.books.length >= 2 ? "text-edge-green" : "text-amber-400"}>{event.books.join(", ")}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PerformancePanel({ tradeLog, positions, fills, betHistory }: { tradeLog: TradeLogEntry[]; positions: PositionsResponse; fills: Fill[]; betHistory: BetHistoryEntry[] }) {
  const openPositions = (positions.market_positions || []).filter(positionIsOpen);
  const totalExposure = openPositions.reduce((sum, position) => sum + Number(position.market_exposure_dollars || 0), 0);
  const totalFees = betHistory.reduce((sum, bet) => sum + Number(bet.feesPaidDollars || 0), 0);
  const realizedPnl = betHistory.reduce((sum, bet) => sum + Number(bet.realizedPnlDollars || 0), 0);
  const executed = tradeLog.filter((entry) => entry.type === "EXECUTED");
  const wins = betHistory.filter((bet) => bet.status === "WIN").length;
  const losses = betHistory.filter((bet) => bet.status === "LOSS").length;
  const openBets = betHistory.filter((bet) => bet.status === "OPEN").length;
  const pendingBets = betHistory.filter((bet) => bet.status === "PENDING").length;
  const betsWithMarketMove = betHistory.filter((bet) => typeof bet.entryVsCurrentPercent === "number");
  const averageMarketMove = betsWithMarketMove.length
    ? betsWithMarketMove.reduce((sum, bet) => sum + Number(bet.entryVsCurrentPercent || 0), 0) / betsWithMarketMove.length
    : 0;
  const chartData = buildPnlCurve(betHistory);
  const winLossData = buildWinLossBars(betHistory);
  const marketMoveData = buildMarketMoveBars(betHistory);
  const averageEntry = fills.length
    ? fills.reduce((sum, fill) => sum + Number(fill.yes_price_dollars || 0), 0) / fills.length
    : 0;
  const settledCost = betHistory
    .filter((bet) => bet.status === "WIN" || bet.status === "LOSS" || bet.status === "FLAT")
    .reduce((sum, bet) => sum + Number(bet.totalCostDollars || 0), 0);
  const realizedRoi = settledCost > 0 ? (realizedPnl / settledCost) * 100 : 0;

  return (
    <section className="bento-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase text-white/60"><LineChartIcon size={14} /> Bet Performance</h2>
        <span className="mono text-[10px] text-white/35">Settled results update when Kalshi reports realized P/L.</span>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Realized P/L" value={money(realizedPnl)} />
        <Metric label="Open Exposure" value={money(totalExposure)} />
        <Metric label="Fees Paid" value={money(totalFees)} />
        <Metric label="Win / Loss" value={`${wins} / ${losses}`} />
        <Metric label="Avg Market Move" value={`${averageMarketMove >= 0 ? "+" : ""}${averageMarketMove.toFixed(2)} pts`} />
        <Metric label="Realized ROI" value={`${realizedRoi >= 0 ? "+" : ""}${realizedRoi.toFixed(1)}%`} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <div className="rounded border border-white/10 bg-white/5 p-4">
          <div className="mb-3 flex items-center justify-between mono text-[10px] uppercase text-white/35">
            <span>Cumulative Realized P/L</span>
            <span>{wins} wins / {losses} losses / avg entry {(averageEntry * 100).toFixed(1)}%</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#12e982" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#12e982" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(value) => `$${Number(value).toFixed(0)}`} />
                <Tooltip contentStyle={{ background: "#050505", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }} formatter={(value) => money(Number(value))} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.22)" />
                <Area type="monotone" dataKey="pnl" stroke="#12e982" strokeWidth={2} fill="url(#pnlFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {chartData.length === 0 && <p className="mt-3 mono text-[10px] text-white/35">No settled wins/losses loaded for the P/L curve yet.</p>}
        </div>

        <div className="grid gap-3">
          <div className="rounded border border-white/10 bg-white/5 p-4">
            <h3 className="mb-3 mono text-[10px] uppercase text-white/35">Win / Loss P/L By Bet</h3>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={winLossData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 9 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={(value) => `$${Number(value).toFixed(0)}`} />
                  <Tooltip contentStyle={{ background: "#050505", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }} formatter={(value) => money(Number(value))} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.22)" />
                  <Bar dataKey="pnl">
                    {winLossData.map((item) => <Cell key={item.label} fill={item.pnl >= 0 ? "#12e982" : "#ff4444"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded border border-white/10 bg-white/5 p-4">
            <h3 className="mb-3 mono text-[10px] uppercase text-white/35">Entry To Current Market Move</h3>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={marketMoveData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 9 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={(value) => `${Number(value).toFixed(0)}p`} />
                  <Tooltip contentStyle={{ background: "#050505", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }} formatter={(value) => `${Number(value).toFixed(2)} pts`} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.22)" />
                  <Bar dataKey="move">
                    {marketMoveData.map((item) => <Cell key={item.label} fill={item.move >= 0 ? "#12e982" : "#ff4444"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded border border-white/10 bg-white/5 p-4">
            <h3 className="mb-3 mono text-[10px] uppercase text-white/35">Bet Ledger</h3>
            <div className="grid gap-2 mono text-[10px] text-white/50">
              {betHistory.slice(0, 6).map((bet) => (
                <div key={bet.ticker} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 border-b border-white/5 pb-2">
                  <span className="truncate text-white/70">{bet.ticker}</span>
                  <span className={bet.status === "WIN" ? "text-edge-green" : bet.status === "LOSS" ? "text-alert-red" : bet.status === "PENDING" ? "text-amber-400" : "text-white/50"}>{bet.status}</span>
                  <span className={Number(bet.entryVsCurrentPercent || 0) > 0 ? "text-edge-green" : Number(bet.entryVsCurrentPercent || 0) < 0 ? "text-alert-red" : "text-white/35"}>
                    {typeof bet.entryVsCurrentPercent === "number" ? `${bet.entryVsCurrentPercent >= 0 ? "+" : ""}${bet.entryVsCurrentPercent.toFixed(1)} pts` : "--"}
                  </span>
                  <span>{money(Number(bet.realizedPnlDollars || 0))}</span>
                </div>
              ))}
              {betHistory.length === 0 && <span>No bet history synced.</span>}
            </div>
          </div>

          <div className="rounded border border-white/10 bg-white/5 p-4">
            <h3 className="mb-3 mono text-[10px] uppercase text-white/35">Recent Fills</h3>
            <div className="grid gap-2 mono text-[10px] text-white/50">
              {fills.slice(0, 6).map((fill) => (
                <div key={fill.fill_id} className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-white/5 pb-2">
                  <span className="truncate text-white/70">{fill.ticker}</span>
                  <span>{Number(fill.count_fp || 0).toFixed(0)} @ {(Number(fill.yes_price_dollars || 0) * 100).toFixed(0)}%</span>
                  <span>{money(Number(fill.fee_cost || 0))} fee</span>
                </div>
              ))}
              {fills.length === 0 && <span>No fills loaded.</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <Metric label="Executed Orders" value={String(executed.length)} />
        <Metric label="Open Bets" value={String(openBets)} />
        <Metric label="Pending Settle" value={String(pendingBets)} />
        <Metric label="Settled Bets" value={String(wins + losses + betHistory.filter((bet) => bet.status === "FLAT").length)} />
        <Metric label="Tracked Fills" value={String(fills.length)} />
        <Metric label="Move Samples" value={String(betsWithMarketMove.length)} />
      </div>
    </section>
  );
}

function settledBets(betHistory: BetHistoryEntry[]) {
  return [...betHistory]
    .filter((bet) => bet.status === "WIN" || bet.status === "LOSS" || bet.status === "FLAT")
    .sort((a, b) => new Date(a.settledAt || a.updatedAt || a.openedAt || 0).getTime() - new Date(b.settledAt || b.updatedAt || b.openedAt || 0).getTime());
}

function buildPnlCurve(betHistory: BetHistoryEntry[]) {
  let pnl = 0;
  return settledBets(betHistory)
    .map((bet) => {
      pnl += Number(bet.realizedPnlDollars || 0);
      return {
        time: new Date(bet.settledAt || bet.updatedAt || bet.openedAt || Date.now()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        pnl
      };
    });
}

function buildWinLossBars(betHistory: BetHistoryEntry[]) {
  return settledBets(betHistory).slice(-12).map((bet, index) => ({
    label: `${index + 1}`,
    pnl: Number(bet.realizedPnlDollars || 0)
  }));
}

function buildMarketMoveBars(betHistory: BetHistoryEntry[]) {
  return [...betHistory]
    .filter((bet) => typeof bet.entryVsCurrentPercent === "number")
    .sort((a, b) => new Date(a.lastPriceCheckedAt || a.updatedAt || a.openedAt || 0).getTime() - new Date(b.lastPriceCheckedAt || b.updatedAt || b.openedAt || 0).getTime())
    .slice(-12)
    .map((bet, index) => ({
      label: `${index + 1}`,
      move: Number(bet.entryVsCurrentPercent || 0)
    }));
}

function RiskPanel({ risk, updateRisk }: { risk: RiskSettings; updateRisk: <K extends keyof RiskSettings>(key: K, value: RiskSettings[K]) => void }) {
  return (
    <div className="bento-card p-5">
      <h2 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase text-white/60"><Shield size={14} /> Risk Rules</h2>
      <div className="grid gap-3">
        <NumberRule label="Max Stake" value={risk.maxStakeDollars} onChange={(value) => updateRisk("maxStakeDollars", value)} prefix="$" />
        <NumberRule label="Daily Loss Cap" value={risk.dailyLossLimitDollars} onChange={(value) => updateRisk("dailyLossLimitDollars", value)} prefix="$" />
        <NumberRule label="Min EV" value={risk.minEvPercent} onChange={(value) => updateRisk("minEvPercent", value)} suffix="%" />
        <NumberRule label="Min Confidence" value={risk.minConfidencePercent} onChange={(value) => updateRisk("minConfidencePercent", value)} suffix="%" />
        <NumberRule label="Min Liquidity" value={risk.minLiquidityDollars} onChange={(value) => updateRisk("minLiquidityDollars", value)} prefix="$" />
        <label className="flex items-center justify-between gap-3 mono text-xs text-white/55">
          Sports Focus
          <span className="rounded border border-white/10 bg-black px-2 py-1 text-white/70">MLB, NBA, NHL only</span>
        </label>
        <NumberRule label="Hours Ahead" value={risk.maxHoursAhead} onChange={(value) => updateRisk("maxHoursAhead", value)} />
        <NumberRule label="Market Cooldown" value={risk.marketCooldownMinutes} onChange={(value) => updateRisk("marketCooldownMinutes", value)} suffix="m" />
        <NumberRule label="Kelly Fraction" value={risk.kellyFraction} onChange={(value) => updateRisk("kellyFraction", value)} />
        <label className="flex items-center justify-between gap-3 mono text-xs text-white/55">
          Order Type
          <select value={risk.orderType} onChange={(event) => updateRisk("orderType", event.target.value as RiskSettings["orderType"])} className="rounded border border-white/10 bg-black px-2 py-1">
            <option value="immediate_or_cancel">IOC</option>
            <option value="fill_or_kill">FOK</option>
            <option value="good_till_canceled">GTC</option>
          </select>
        </label>
      </div>
    </div>
  );
}

function NumberRule({ label, value, onChange, prefix, suffix }: { label: string; value: number; onChange: (value: number) => void; prefix?: string; suffix?: string }) {
  return (
    <label className="flex items-center justify-between gap-3 mono text-xs text-white/55">
      {label}
      <span className="flex items-center gap-1">
        {prefix && <span className="text-white/30">{prefix}</span>}
        <input type="number" value={value} step="0.1" onChange={(event) => onChange(Number(event.target.value))} className="w-20 rounded border border-white/10 bg-black px-2 py-1 text-right outline-none focus:border-edge-green" />
        {suffix && <span className="text-white/30">{suffix}</span>}
      </span>
    </label>
  );
}

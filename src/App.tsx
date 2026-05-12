import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Activity, BarChart3, Database, Play, RefreshCw, Shield, Siren, Target, Zap } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { analyzeMarket, executeOrder } from "./services/aiService";
import {
  checkBrokerStatus,
  fetchAutopilotStatus,
  fetchBetHistory,
  fetchBrokerBalance,
  fetchOddsCoverage,
  startServerAutopilot,
  stopServerAutopilot
} from "./services/brokerService";
import { fetchMarkets } from "./services/oddsService";
import type { AutopilotStatus, BalanceView, BetHistoryEntry, BrokerStatus, MarketView, OddsCoverage, RiskSettings, StrategyDecision } from "./types";

interface HealthStatus {
  ok: boolean;
  mode: string;
  notes?: string[];
  providers?: {
    kalshi?: { ok: boolean; status?: number; error?: string };
    odds?: { ok: boolean; rawOdds: number; events: number; twoBookEvents: number; lastError?: string | null };
  };
}

const defaultRisk: RiskSettings = {
  maxStakeDollars: 1,
  dailyLossLimitDollars: 10,
  maxOpenPositions: 99,
  exposureLimitPercent: 10,
  minEvPercent: 1.5,
  minConfidencePercent: 55,
  minLiquidityDollars: 12,
  timeToCloseMinutes: 5,
  maxHoursAhead: 36,
  marketCooldownMinutes: 120,
  kellyFraction: 0.1,
  liveTradingEnabled: true,
  killSwitch: false,
  orderType: "immediate_or_cancel",
  allowedTickerPrefixes: ["KXMLB", "KXNBA", "KXNHL"]
};

function money(value = 0) {
  return `$${Number(value).toFixed(2)}`;
}

function pct(value = 0) {
  return `${Number(value).toFixed(1)}%`;
}

function shortTime(value?: string | null) {
  if (!value) return "never";
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function healthLabel(health?: HealthStatus) {
  if (!health) return "CHECKING";
  return health.ok ? "HEALTHY" : "DEGRADED";
}

export default function App() {
  const [broker, setBroker] = useState<BrokerStatus | null>(null);
  const [balance, setBalance] = useState<BalanceView | null>(null);
  const [autopilot, setAutopilot] = useState<AutopilotStatus | null>(null);
  const [coverage, setCoverage] = useState<OddsCoverage | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [markets, setMarkets] = useState<MarketView[]>([]);
  const [decisions, setDecisions] = useState<StrategyDecision[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<string>("");
  const [risk, setRisk] = useState<RiskSettings>(defaultRisk);
  const [history, setHistory] = useState<BetHistoryEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Operator console restored.");

  const selected = useMemo(
    () => decisions.find((decision) => decision.market.ticker === selectedTicker) || decisions[0],
    [decisions, selectedTicker]
  );

  const settled = history.filter((bet) => ["WIN", "LOSS", "FLAT"].includes(bet.status));
  const realizedPnl = settled.reduce((sum, bet) => sum + Number(bet.realizedPnlDollars || 0), 0);
  const tradedCost = settled.reduce((sum, bet) => sum + Number(bet.totalCostDollars || 0), 0);
  const wins = settled.filter((bet) => bet.status === "WIN").length;
  const losses = settled.filter((bet) => bet.status === "LOSS").length;
  const fees = history.reduce((sum, bet) => sum + Number(bet.feesPaidDollars || 0), 0);
  const openExposure = history.filter((bet) => bet.status === "OPEN").reduce((sum, bet) => sum + Number(bet.exposureDollars || 0), 0);
  const avgMarketMove = history.length
    ? history.reduce((sum, bet) => sum + Number(bet.entryVsCurrentPercent || 0), 0) / history.length
    : 0;

  const pnlCurve = settled.reduce<Array<{ label: string; pnl: number }>>((rows, bet) => {
    const previous = rows.at(-1)?.pnl || 0;
    rows.push({ label: shortTime(bet.settledAt || bet.updatedAt || bet.openedAt), pnl: previous + Number(bet.realizedPnlDollars || 0) });
    return rows;
  }, []);

  const betBars = settled.slice(-16).map((bet, index) => ({
    label: String(index + 1),
    pnl: Number(bet.realizedPnlDollars || 0)
  }));

  async function refreshStatus() {
    const [nextBroker, nextBalance, nextAutopilot, nextCoverage, nextHistory] = await Promise.all([
      checkBrokerStatus(),
      fetchBrokerBalance().catch(() => null),
      fetchAutopilotStatus(),
      fetchOddsCoverage().catch(() => null),
      fetchBetHistory().catch(() => [])
    ]);
    setBroker(nextBroker);
    if (nextBalance) setBalance(nextBalance);
    setAutopilot(nextAutopilot);
    if (nextCoverage) setCoverage(nextCoverage);
    setHistory(nextHistory);

    const healthResponse = await fetch("/api/health");
    setHealth(await healthResponse.json());
  }

  async function scanMarkets() {
    setBusy(true);
    try {
      const nextMarkets = await fetchMarkets(24);
      const nextDecisions: StrategyDecision[] = [];
      for (const market of nextMarkets) {
        nextDecisions.push(await analyzeMarket(market, risk));
      }
      const ranked = nextDecisions.sort((a, b) => b.evPercent - a.evPercent);
      setMarkets(nextMarkets);
      setDecisions(ranked);
      setSelectedTicker((current) => current || ranked[0]?.market.ticker || "");
      setMessage(`Scanned ${ranked.length} markets.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Scan failed.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleAutopilot() {
    const next = autopilot?.enabled ? await stopServerAutopilot() : await startServerAutopilot();
    setAutopilot(next);
    setMessage(next.lastMessage);
  }

  async function executeSelected() {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await executeOrder(selected.market, risk);
      setMessage(JSON.stringify(result));
      await refreshStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Execution failed.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refreshStatus().catch((error) => setMessage(error instanceof Error ? error.message : "Status refresh failed."));
    scanMarkets();
    const timer = setInterval(() => {
      refreshStatus().catch(() => undefined);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-bento-bg text-bento-text">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6 p-4 md:p-6">
        <header className="border-b border-white/10 pb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-edge-green text-2xl font-black text-black">E</div>
              <div>
                <h1 className="text-3xl font-black uppercase tracking-tight text-white">EDGEPREDICT</h1>
                <p className="mono text-xs uppercase tracking-[0.24em] text-white/45">Kalshi Positive EV Execution Console</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 mono text-xs uppercase">
              <Badge value={broker?.mode || "LOADING"} good={broker?.mode === "LIVE_ARMED"} />
              <Badge value={broker?.environment || "ENV"} />
              <Badge value={broker?.keyPreview ? `KEY ${broker.keyPreview}` : "NO KEY"} good={Boolean(broker?.keyPreview)} />
              <Badge value={healthLabel(health)} good={Boolean(health?.ok)} />
              <button className="bento-button-primary inline-flex items-center gap-2" disabled={busy} onClick={scanMarkets}>
                <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
                SCAN
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-5 xl:grid-cols-3">
          <Panel title="Account" icon={<Database size={16} />} detail={`Last scan: ${shortTime(autopilot?.lastScan)}`}>
            <div className="grid gap-3 md:grid-cols-3">
              <Metric label="Available" value={money(balance?.balance)} />
              <Metric label="Portfolio" value={money(balance?.portfolioValue)} />
              <Metric label="Executed Today" value={money(0)} />
            </div>
            <p className="mono mt-4 text-sm text-white/45">{broker?.connected ? "Balance loaded from Kalshi." : broker?.exchangeHealth || "Waiting for broker status."}</p>
          </Panel>

          <Panel title="Autopilot" icon={<Play size={16} />}>
            <div className="flex flex-wrap gap-3">
              <button className={autopilot?.enabled ? "bento-button-primary" : "rounded border border-white/10 px-5 py-3 mono text-xs font-bold uppercase text-white/60"} onClick={toggleAutopilot}>
                {autopilot?.enabled ? "RUNNING" : "STANDBY"}
              </button>
              <button className="rounded border border-white/10 px-5 py-3 mono text-xs font-bold uppercase text-white/60" onClick={() => setRisk({ ...risk, killSwitch: true })}>
                KILL SWITCH
              </button>
            </div>
            <p className="mono mt-4 text-sm text-white/45">{autopilot?.lastMessage || message}</p>
          </Panel>

          <Panel title="Health" icon={<Shield size={16} />}>
            <div className="grid gap-3">
              <MiniStatus label="Kalshi" ok={health?.providers?.kalshi?.ok} value={health?.providers?.kalshi?.status ? String(health.providers.kalshi.status) : broker?.exchangeHealth} />
              <MiniStatus label="Odds" ok={health?.providers?.odds?.ok} value={`${coverage?.rawOdds || health?.providers?.odds?.rawOdds || 0} raw / ${coverage?.twoBookEvents || health?.providers?.odds?.twoBookEvents || 0} two-book`} />
              <MiniStatus label="Watcher" ok={autopilot?.enabled} value={autopilot?.nextScanAt ? `next ${shortTime(autopilot.nextScanAt)}` : "off"} />
            </div>
          </Panel>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <Panel title="Market Candidates" icon={<Zap size={16} />} detail={`${markets.length} markets`}>
            <div className="max-h-[430px] overflow-auto">
              <table className="w-full min-w-[820px] text-left mono text-xs">
                <thead className="border-b border-white/10 text-[10px] uppercase text-white/35">
                  <tr>
                    <th className="p-3">Market</th>
                    <th className="p-3">Ask</th>
                    <th className="p-3">Fair</th>
                    <th className="p-3">EV</th>
                    <th className="p-3">Model</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {decisions.map((decision) => (
                    <tr key={decision.market.ticker} className="bento-table-row" onClick={() => setSelectedTicker(decision.market.ticker)}>
                      <td className="p-3">
                        <span className="block text-sm font-bold text-white">{decision.market.title}</span>
                        <span className="text-white/35">{decision.market.ticker}</span>
                      </td>
                      <td className="p-3">{pct(decision.marketProbability * 100)}</td>
                      <td className="p-3">{pct(decision.fairProbability * 100)}</td>
                      <td className={decision.evPercent >= 0 ? "p-3 text-edge-green" : "p-3 text-alert-red"}>{decision.evPercent.toFixed(2)}%</td>
                      <td className="p-3">{decision.modelSource === "sportsbook_consensus" ? "Consensus" : "Unmapped"}</td>
                      <td className="p-3">{decision.approved ? "APPROVED" : "BLOCKED"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Decision Detail" icon={<Activity size={16} />}>
            {selected ? (
              <div className="space-y-4 mono">
                <div>
                  <h3 className="text-lg font-bold text-white">{selected.market.title}</h3>
                  <p className="text-xs text-white/35">{selected.market.ticker}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Metric label="Edge" value={pct(selected.edgePercent)} />
                  <Metric label="Confidence" value={pct(selected.confidencePercent)} />
                  <Metric label="Contracts" value={String(selected.suggestedCount)} />
                  <Metric label="Liquidity" value={money(selected.market.liquidity)} />
                  <Metric label="Model" value={selected.modelSource === "sportsbook_consensus" ? "Consensus" : "Unmapped"} />
                  <Metric label="Mapping" value={selected.mappingConfidence ? pct(selected.mappingConfidence * 100) : "n/a"} />
                </div>
                <div className="space-y-2 text-sm text-white/55">
                  {selected.reasons.map((reason) => <p key={reason}>{reason}</p>)}
                  {selected.rejections.map((reason) => <p key={reason} className="text-edge-gold">WARNING: {reason}</p>)}
                </div>
                <button className="bento-button-primary w-full" disabled={!selected.approved || busy} onClick={executeSelected}>
                  {selected.approved ? "EXECUTE APPROVED MARKET" : "SKIPPED BY RULES"}
                </button>
              </div>
            ) : (
              <p className="mono text-white/45">Run a scan to load decisions.</p>
            )}
          </Panel>
        </section>

        <section className="grid gap-5 xl:grid-cols-[0.75fr_1.25fr]">
          <Panel title="Risk Rules" icon={<Siren size={16} />}>
            <RiskInput label="Max Stake" prefix="$" value={risk.maxStakeDollars} onChange={(value) => setRisk({ ...risk, maxStakeDollars: value })} />
            <RiskInput label="Daily Loss Cap" prefix="$" value={risk.dailyLossLimitDollars} onChange={(value) => setRisk({ ...risk, dailyLossLimitDollars: value })} />
            <RiskInput label="Min EV" suffix="%" value={risk.minEvPercent} onChange={(value) => setRisk({ ...risk, minEvPercent: value })} />
            <RiskInput label="Min Confidence" suffix="%" value={risk.minConfidencePercent} onChange={(value) => setRisk({ ...risk, minConfidencePercent: value })} />
            <RiskInput label="Min Liquidity" prefix="$" value={risk.minLiquidityDollars} onChange={(value) => setRisk({ ...risk, minLiquidityDollars: value })} />
          </Panel>

          <Panel title="Bet Performance" icon={<BarChart3 size={16} />} detail="Settled results update from Kalshi">
            <div className="grid gap-3 md:grid-cols-5">
              <Metric label="Realized P/L" value={money(realizedPnl)} />
              <Metric label="Open Exposure" value={money(openExposure)} />
              <Metric label="Fees Paid" value={money(fees)} />
              <Metric label="Win / Loss" value={`${wins} / ${losses}`} />
              <Metric label="Realized ROI" value={tradedCost ? pct((realizedPnl / tradedCost) * 100) : "0.0%"} />
            </div>
            <Metric label="Avg Market Move" value={`${avgMarketMove.toFixed(2)} pts`} />
            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              <Chart title="Cumulative Realized P/L" data={pnlCurve} type="line" />
              <Chart title="Win / Loss P/L By Bet" data={betBars} type="bar" />
            </div>
          </Panel>
        </section>

        <div className="fixed bottom-5 left-1/2 z-50 w-[min(90vw,780px)] -translate-x-1/2 rounded-full border border-white/10 bg-black/85 px-5 py-3 mono text-sm text-white/45 shadow-2xl">
          {message}
        </div>
      </div>
    </div>
  );
}

function Badge({ value, good = false }: { value: string; good?: boolean }) {
  return <span className={`rounded border px-3 py-2 ${good ? "border-edge-green/40 text-edge-green" : "border-white/10 text-white/55"}`}>{value}</span>;
}

function Panel({ title, icon, detail, children }: { title: string; icon: ReactNode; detail?: string; children: ReactNode }) {
  return (
    <section className="bento-card p-5">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-black uppercase text-white/65">{icon}{title}</h2>
        {detail && <span className="mono text-xs text-white/35">{detail}</span>}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <p className="mono text-[10px] uppercase tracking-widest text-white/35">{label}</p>
      <p className="mt-2 mono text-2xl font-black text-white">{value}</p>
    </div>
  );
}

function MiniStatus({ label, ok, value }: { label: string; ok?: boolean; value?: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 mono text-xs">
      <span className={ok ? "text-edge-green" : "text-edge-gold"}>{ok ? "OK" : "WARN"}</span>
      <span className="text-white/60">{label}</span>
      <span className="text-white/35">{value || "unknown"}</span>
    </div>
  );
}

function RiskInput({ label, value, onChange, prefix = "", suffix = "" }: { label: string; value: number; onChange: (value: number) => void; prefix?: string; suffix?: string }) {
  return (
    <label className="mb-3 flex items-center justify-between gap-3 mono text-sm text-white/55">
      <span>{label}</span>
      <span className="flex items-center gap-2">
        {prefix}
        <input className="w-28 rounded border border-white/10 bg-black px-3 py-2 text-right text-white" value={value} type="number" onChange={(event) => onChange(Number(event.target.value))} />
        {suffix}
      </span>
    </label>
  );
}

function Chart({ title, data, type }: { title: string; data: Array<{ label: string; pnl: number }>; type: "line" | "bar" }) {
  return (
    <div className="rounded border border-white/10 bg-black/20 p-4">
      <p className="mono mb-3 text-xs uppercase text-white/40">{title}</p>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          {type === "line" ? (
            <LineChart data={data}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }} />
              <Tooltip />
              <Line type="monotone" dataKey="pnl" stroke="#88ff7a" strokeWidth={3} dot={false} />
            </LineChart>
          ) : (
            <BarChart data={data}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="pnl">
                {data.map((row) => <Cell key={row.label} fill={row.pnl >= 0 ? "#18d69a" : "#d95468"} />)}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

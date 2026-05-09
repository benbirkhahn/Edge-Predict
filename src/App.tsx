import { type ReactNode, useMemo, useState } from "react";
import { Activity, ArrowRight, BarChart3, Database, Eye, Lock, Radar, Shield, Sparkles, Target } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type DemoStatus = "PASS" | "BLOCKED" | "SCORE_ONLY";

interface DemoCandidate {
  ticker: string;
  title: string;
  league: string;
  askProbability: number;
  fairProbability: number;
  evPercent: number;
  confidencePercent: number;
  mappingConfidence: number;
  liquidity: number;
  stake: number;
  status: DemoStatus;
  topBlocker: string;
  whyItPassed: string[];
  whyItStopped: string[];
}

const demoCandidates: DemoCandidate[] = [
  {
    ticker: "KXMLB-NYY-BOS-0512",
    title: "Yankees to beat Red Sox",
    league: "MLB",
    askProbability: 0.41,
    fairProbability: 0.47,
    evPercent: 3.2,
    confidencePercent: 72,
    mappingConfidence: 0.94,
    liquidity: 128,
    stake: 1,
    status: "PASS",
    topBlocker: "None",
    whyItPassed: [
      "Sportsbook consensus priced the market above the Kalshi ask.",
      "Liquidity cleared the minimum threshold.",
      "Mapping confidence was strong enough for review.",
      "Stake sizing stayed inside the daily and per-market limits."
    ],
    whyItStopped: []
  },
  {
    ticker: "KXNBA-NYK-MIA-0512",
    title: "Knicks to beat Heat",
    league: "NBA",
    askProbability: 0.56,
    fairProbability: 0.55,
    evPercent: -0.4,
    confidencePercent: 61,
    mappingConfidence: 0.91,
    liquidity: 202,
    stake: 0,
    status: "BLOCKED",
    topBlocker: "Negative EV after fees and slippage buffer",
    whyItPassed: [],
    whyItStopped: [
      "Consensus pricing did not beat the market after the execution buffer.",
      "The system blocks trades even when confidence is decent if EV is not there."
    ]
  },
  {
    ticker: "KXNHL-NYR-TBL-0512",
    title: "Rangers to beat Lightning",
    league: "NHL",
    askProbability: 0.38,
    fairProbability: 0.44,
    evPercent: 2.1,
    confidencePercent: 58,
    mappingConfidence: 0.82,
    liquidity: 64,
    stake: 0,
    status: "SCORE_ONLY",
    topBlocker: "Mapping confidence below live-execution threshold",
    whyItPassed: [
      "The pricing signal looks interesting enough to surface to the operator."
    ],
    whyItStopped: [
      "Execution remains blocked until the market-to-event mapping is stronger.",
      "This is the kind of candidate the system can score without allowing live action."
    ]
  },
  {
    ticker: "KXMLB-LAD-SD-0513",
    title: "Dodgers to beat Padres",
    league: "MLB",
    askProbability: 0.62,
    fairProbability: 0.66,
    evPercent: 1.8,
    confidencePercent: 69,
    mappingConfidence: 0.9,
    liquidity: 9,
    stake: 0,
    status: "BLOCKED",
    topBlocker: "Liquidity below minimum threshold",
    whyItPassed: [],
    whyItStopped: [
      "The pricing edge exists, but the book is too thin for the system's rules.",
      "Low-liquidity markets are blocked even when the math looks favorable."
    ]
  }
];

const walkthroughSteps = [
  {
    title: "1. Market Intake",
    text: "EdgePredict pulls supported sports contracts and normalizes the market prices, timing, and liquidity into a single review surface."
  },
  {
    title: "2. Fair Probability",
    text: "Sportsbook odds are de-vigged and combined into a consensus estimate instead of relying on a single book or a gut pick."
  },
  {
    title: "3. EV Scoring",
    text: "The system compares the Kalshi ask to the estimated fair probability and subtracts a fee and slippage buffer before judging the trade."
  },
  {
    title: "4. Hard Risk Checks",
    text: "Execution stays blocked unless EV, mapping confidence, liquidity, exposure, duplicate, and time-window checks all pass."
  },
  {
    title: "5. Reviewable Output",
    text: "Approved, blocked, and score-only markets are surfaced with reasons so the operator can understand exactly what happened."
  }
];

const riskRules = [
  "Max stake per order: $1",
  "Daily loss cap: $10",
  "Minimum EV threshold: 1.5%",
  "Minimum confidence: 55%",
  "Minimum liquidity: $12",
  "Maximum live window: 36 hours",
  "Duplicate and same-event exposure checks",
  "Server-side live arming required for any execution"
];

const pnlData = [
  { label: "1", pnl: 0.2 },
  { label: "2", pnl: 0.55 },
  { label: "3", pnl: 0.31 },
  { label: "4", pnl: 0.92 },
  { label: "5", pnl: 1.18 },
  { label: "6", pnl: 0.96 },
  { label: "7", pnl: 1.42 }
];

const blockerData = [
  { label: "Low EV", count: 12, color: "#ff7a59" },
  { label: "Mapping", count: 7, color: "#f2c94c" },
  { label: "Liquidity", count: 5, color: "#56ccf2" },
  { label: "Exposure", count: 3, color: "#bb6bd9" }
];

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function money(value: number) {
  return `$${value.toFixed(2)}`;
}

function statusClass(status: DemoStatus) {
  if (status === "PASS") return "border-edge-green/30 text-edge-green bg-edge-green/8";
  if (status === "SCORE_ONLY") return "border-sky-400/30 text-sky-300 bg-sky-400/8";
  return "border-amber-400/30 text-amber-300 bg-amber-400/8";
}

export default function App() {
  const [selectedTicker, setSelectedTicker] = useState(demoCandidates[0].ticker);
  const selected = useMemo(
    () => demoCandidates.find((candidate) => candidate.ticker === selectedTicker) || demoCandidates[0],
    [selectedTicker]
  );

  return (
    <div className="min-h-screen bg-bento-bg text-bento-text">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6 p-4 md:p-6">
        <header className="overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(0,255,102,0.16),transparent_28%),radial-gradient(circle_at_top_right,rgba(86,204,242,0.14),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))] p-6 md:p-8">
          <div className="mb-6 flex flex-wrap items-center gap-3 mono text-[10px] uppercase tracking-[0.24em] text-white/45">
            <span className="rounded-full border border-edge-green/30 px-3 py-1 text-edge-green">GitHub Pages Mock Walkthrough</span>
            <span>Read-only portfolio demo</span>
          </div>
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
                EdgePredict turns noisy sports markets into disciplined, explainable decisions.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-white/70 md:text-lg">
                This mock walkthrough shows how the product ingests market data, estimates fair probability from sportsbook consensus,
                scores positive expected value, and blocks unsafe execution with hard server-side risk controls.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <Pill icon={<Eye size={14} />} label="Viewer mode only" />
                <Pill icon={<Shield size={14} />} label="No live controls" />
                <Pill icon={<Lock size={14} />} label="Execution blocked" />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-1">
              <HeroMetric label="Candidates scored" value="24" detail="Across MLB, NBA, NHL" />
              <HeroMetric label="Passed every rule" value="3" detail="Ready for human review" />
              <HeroMetric label="Top blocker" value="Low EV" detail="Most common rejection reason" />
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {walkthroughSteps.map((step) => (
            <div key={step.title} className="bento-card p-5">
              <p className="mono text-[10px] uppercase tracking-[0.18em] text-white/35">{step.title}</p>
              <p className="mt-3 text-sm leading-6 text-white/72">{step.text}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="bento-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <h2 className="flex items-center gap-2 text-xs font-bold uppercase text-white/60">
                  <Radar size={14} />
                  Mock Opportunity Feed
                </h2>
                <p className="mt-1 text-sm text-white/42">Sample markets that demonstrate pass, blocked, and score-only outcomes.</p>
              </div>
              <span className="mono text-[10px] uppercase text-white/35">Static demo data</span>
            </div>
            <div className="overflow-auto">
              <table className="w-full min-w-[920px] text-left mono text-xs">
                <thead className="border-b border-white/10 text-[10px] uppercase text-white/40">
                  <tr>
                    <th className="p-3">Market</th>
                    <th className="p-3">Ask</th>
                    <th className="p-3">Fair</th>
                    <th className="p-3">EV</th>
                    <th className="p-3">Confidence</th>
                    <th className="p-3">Liquidity</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Top Blocker</th>
                  </tr>
                </thead>
                <tbody>
                  {demoCandidates.map((candidate) => (
                    <tr
                      key={candidate.ticker}
                      onClick={() => setSelectedTicker(candidate.ticker)}
                      className={`bento-table-row ${selected.ticker === candidate.ticker ? "bg-white/6" : ""}`}
                    >
                      <td className="p-3">
                        <span className="block font-bold text-white">{candidate.title}</span>
                        <span className="text-[10px] text-white/35">{candidate.league} · {candidate.ticker}</span>
                      </td>
                      <td className="p-3">{pct(candidate.askProbability)}</td>
                      <td className="p-3">{pct(candidate.fairProbability)}</td>
                      <td className={candidate.evPercent > 0 ? "p-3 text-edge-green" : "p-3 text-alert-red"}>
                        {candidate.evPercent > 0 ? "+" : ""}{candidate.evPercent.toFixed(1)}%
                      </td>
                      <td className="p-3">{candidate.confidencePercent}%</td>
                      <td className="p-3">{money(candidate.liquidity)}</td>
                      <td className="p-3">
                        <span className={`rounded-full border px-2 py-1 text-[10px] ${statusClass(candidate.status)}`}>
                          {candidate.status === "SCORE_ONLY" ? "SCORE ONLY" : candidate.status}
                        </span>
                      </td>
                      <td className="max-w-[260px] truncate p-3 text-white/42">{candidate.topBlocker}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="bento-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-xs font-bold uppercase text-white/60">
                    <Target size={14} />
                    Selected Decision
                  </h2>
                  <p className="mt-3 text-lg font-semibold text-white">{selected.title}</p>
                  <p className="mono mt-1 text-[11px] uppercase tracking-[0.16em] text-white/35">{selected.league} · {selected.ticker}</p>
                </div>
                <span className={`rounded-full border px-3 py-1 mono text-[10px] ${statusClass(selected.status)}`}>
                  {selected.status === "SCORE_ONLY" ? "SCORE ONLY" : selected.status}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <MiniMetric label="Ask price" value={pct(selected.askProbability)} />
                <MiniMetric label="Fair price" value={pct(selected.fairProbability)} />
                <MiniMetric label="Expected value" value={`${selected.evPercent > 0 ? "+" : ""}${selected.evPercent.toFixed(1)}%`} />
                <MiniMetric label="Mapping" value={`${Math.round(selected.mappingConfidence * 100)}%`} />
                <MiniMetric label="Confidence" value={`${selected.confidencePercent}%`} />
                <MiniMetric label="Suggested stake" value={selected.stake ? money(selected.stake) : "Blocked"} />
              </div>

              <div className="mt-5 space-y-4 text-sm leading-6">
                <div>
                  <p className="mono text-[10px] uppercase tracking-[0.16em] text-white/35">Why it surfaced</p>
                  <div className="mt-2 space-y-2 text-white/72">
                    {selected.whyItPassed.length > 0 ? selected.whyItPassed.map((item) => (
                      <p key={item}>{item}</p>
                    )) : <p>No execution-ready signal was strong enough to clear the full rule set.</p>}
                  </div>
                </div>
                <div>
                  <p className="mono text-[10px] uppercase tracking-[0.16em] text-white/35">Why execution stops or stays read-only</p>
                  <div className="mt-2 space-y-2 text-white/72">
                    {selected.whyItStopped.length > 0 ? selected.whyItStopped.map((item) => (
                      <p key={item}>{item}</p>
                    )) : <p>All hard checks passed in this mock example, so the market is eligible for human review.</p>}
                  </div>
                </div>
              </div>
            </div>

            <div className="bento-card p-5">
              <h2 className="flex items-center gap-2 text-xs font-bold uppercase text-white/60">
                <Shield size={14} />
                Hard Risk Controls
              </h2>
              <div className="mt-4 grid gap-2 mono text-[11px] text-white/60">
                {riskRules.map((rule) => (
                  <div key={rule} className="rounded-lg border border-white/8 bg-white/4 px-3 py-2">
                    {rule}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <div className="bento-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xs font-bold uppercase text-white/60">
                <BarChart3 size={14} />
                Performance Loop
              </h2>
              <span className="mono text-[10px] uppercase text-white/35">Sample data</span>
            </div>
            <p className="mb-4 max-w-2xl text-sm leading-6 text-white/62">
              The point is not one lucky trade. The system is designed to log decisions, track outcomes, and learn whether the process is producing durable signal over time.
            </p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={pnlData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00FF66" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#00FF66" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(value) => `$${Number(value).toFixed(1)}`} />
                  <Tooltip contentStyle={{ background: "#050505", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }} formatter={(value) => money(Number(value))} />
                  <Area type="monotone" dataKey="pnl" stroke="#00FF66" strokeWidth={2} fill="url(#pnlFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bento-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xs font-bold uppercase text-white/60">
                <Activity size={14} />
                Why Markets Get Blocked
              </h2>
              <span className="mono text-[10px] uppercase text-white/35">Sample distribution</span>
            </div>
            <p className="mb-4 max-w-2xl text-sm leading-6 text-white/62">
              A strong demo should show that most opportunities do not pass. The system earns trust by refusing low-quality trades, not by forcing action.
            </p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={blockerData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: "#050505", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {blockerData.map((item) => <Cell key={item.label} fill={item.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SystemCard
            icon={<Database size={16} />}
            title="Inputs"
            text="Kalshi market pricing, sportsbook odds, market metadata, and basic execution constraints."
          />
          <SystemCard
            icon={<Sparkles size={16} />}
            title="Scoring"
            text="Consensus fair probability, EV after buffer, candidate ranking, and clear rejection reasons."
          />
          <SystemCard
            icon={<Shield size={16} />}
            title="Controls"
            text="Liquidity gates, mapping confidence, duplicate protection, time-window checks, and capped stake sizing."
          />
          <SystemCard
            icon={<ArrowRight size={16} />}
            title="Outcome"
            text="Only reviewable, explainable opportunities make it through. Everything else is blocked or score-only."
          />
        </section>
      </div>
    </div>
  );
}

function Pill({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 mono text-[10px] uppercase tracking-[0.14em] text-white/60">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function HeroMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <p className="mono text-[10px] uppercase tracking-[0.16em] text-white/35">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-sm text-white/48">{detail}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="mono text-[10px] uppercase tracking-[0.14em] text-white/35">{label}</p>
      <p className="mt-2 text-base font-semibold text-white">{value}</p>
    </div>
  );
}

function SystemCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="bento-card p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-edge-green">
        {icon}
      </div>
      <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-white/62">{text}</p>
    </div>
  );
}

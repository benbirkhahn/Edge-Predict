import React, { useState, useEffect } from "react";
import { OddsTable } from "./components/OddsTable.tsx";
import { AISummary } from "./components/AISummary.tsx";
import { EVCalculator } from "./components/EVCalculator.tsx";
import { BankrollTracker } from "./components/BankrollTracker.tsx";
import { AutopilotConsole } from "./components/AutopilotConsole.tsx";
import { fetchOdds, fetchBrokerBalance } from "./services/oddsService.ts";
import { analyzeEdge } from "./services/aiService.ts";
import { GameOdds, EdgeAnalysis } from "./types.ts";
import { Activity, LayoutDashboard, Database, ShieldCheck, RefreshCw, PlusCircle, Bot, Settings } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function App() {
  const [odds, setOdds] = useState<GameOdds[]>([]);
  const [analysis, setAnalysis] = useState<EdgeAnalysis | null>(null);
  const [isLoadingOdds, setIsLoadingOdds] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeSport, setActiveSport] = useState("upcoming");
  const [liveBankroll, setLiveBankroll] = useState(1550);

  useEffect(() => {
    loadOdds();
    loadBalance();
  }, [activeSport]);

  const loadBalance = async () => {
    try {
      const data = await fetchBrokerBalance();
      setLiveBankroll(data.balance);
    } catch (error) {
      console.error("Failed to load balance:", error);
    }
  };

  // Re-reading to fix loadBalance correctly with the new service

  const loadOdds = async () => {
    setIsLoadingOdds(true);
    try {
      const data = await fetchOdds(activeSport);
      setOdds(data);
    } catch (error) {
      console.error("Failed to load odds:", error);
    } finally {
      setIsLoadingOdds(false);
    }
  };

  const handleAnalyze = async (game: GameOdds) => {
    setIsAnalyzing(true);
    setAnalysis(null);
    try {
      const result = await analyzeEdge(game);
      setAnalysis({ ...result, gameId: game.id });
    } catch (error) {
      console.error("Analysis failed:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-bento-bg text-bento-text p-6">
      <div className="max-w-[1400px] mx-auto h-full flex flex-col space-y-6">
        {/* Header */}
        <header className="flex justify-between items-center border-b border-white/10 pb-6">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-edge-green rounded flex items-center justify-center shadow-[0_0_15px_rgba(0,255,102,0.3)]">
              <span className="text-black font-bold text-lg">E</span>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tighter uppercase leading-none">
                Edge<span className="text-edge-green">Predict</span>
              </h1>
              <span className="text-[9px] mono opacity-40 uppercase tracking-[0.3em]">Neural Analytics v4.2.0</span>
            </div>
          </div>
          
          <div className="flex space-x-8 text-xs mono">
            <div className="flex flex-col">
              <span className="opacity-40 uppercase text-[9px] tracking-widest">Main Bankroll</span>
              <span className="text-white font-bold">${liveBankroll.toLocaleString()}</span>
            </div>
            <div className="flex flex-col">
              <span className="opacity-40 uppercase text-[9px] tracking-widest">Bot Fund (Auto)</span>
              <span className="text-edge-green font-bold">${(liveBankroll * 0.1).toFixed(2)}</span>
            </div>
            <div className="flex flex-col">
              <span className="opacity-40 uppercase text-[9px] tracking-widest">ROI (Total)</span>
              <span className="text-edge-green font-bold">+12.4%</span>
            </div>
            <button 
              onClick={() => { loadOdds(); loadBalance(); }}
              className="flex items-center gap-2 px-3 border border-white/10 hover:border-white/30 transition-all rounded"
            >
              <RefreshCw size={12} className={isLoadingOdds ? "animate-spin" : "opacity-40"} />
            </button>
          </div>
        </header>

        {/* Bento Grid */}
        <div className="grid grid-cols-12 auto-rows-[minmax(0,1fr)] gap-6 flex-grow">
          {/* Main Feed Section */}
          <div className="col-span-12 lg:col-span-8 row-span-4 bento-card p-6 flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-4">
                <h2 className="text-sm font-semibold uppercase tracking-widest text-edge-green">Live Market Feed</h2>
                <div className="h-4 w-[1px] bg-white/10"></div>
                <div className="flex gap-4">
                  {[
                    { id: "upcoming", label: "Upcoming" },
                    { id: "basketball_nba", label: "NBA" },
                    { id: "icehockey_nhl", label: "NHL" },
                    { id: "baseball_mlb", label: "MLB" },
                    { id: "soccer_epl", label: "EPL" }
                  ].map((sport) => (
                    <button 
                      key={sport.id}
                      onClick={() => setActiveSport(sport.id)}
                      className={`text-[9px] font-bold uppercase tracking-widest transition-all ${activeSport === sport.id ? "text-white underline underline-offset-8 decoration-edge-green" : "opacity-30 hover:opacity-100"}`}
                    >
                      {sport.label}
                    </button>
                  ))}
                </div>
              </div>
              <span className="text-[10px] mono bg-edge-green/10 text-edge-green px-2 py-1 rounded border border-edge-green/20">
                {odds.length} NODES SCANNED
              </span>
            </div>
            <div className="flex-grow overflow-auto custom-scrollbar">
              {isLoadingOdds ? (
                <div className="h-full flex flex-col items-center justify-center opacity-20 gap-4">
                  <RefreshCw className="animate-spin w-8 h-8" />
                  <span className="mono text-[10px] tracking-[0.5em]">POLLING MARKET GRAPHS...</span>
                </div>
              ) : (
                <OddsTable odds={odds} onAnalyze={handleAnalyze} />
              )}
            </div>
          </div>

          {/* Side Intelligence Panels */}
          <div className="col-span-12 lg:col-span-4 row-span-2 bento-card">
            <AISummary analysis={analysis} loading={isAnalyzing} />
          </div>

          <div className="col-span-12 md:col-span-6 lg:col-span-4 row-span-2 bento-card">
            <EVCalculator />
          </div>

          {/* Footer Area Stats */}
          <div className="col-span-12 md:col-span-12 lg:col-span-8 row-span-2 bento-card">
            <BankrollTracker />
          </div>

          {/* Autopilot Console */}
          <div className="col-span-12 lg:col-span-4 row-span-2 bento-card">
            <AutopilotConsole />
          </div>
        </div>
      </div>
    </div>
  );
}

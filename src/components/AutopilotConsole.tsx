import React, { useState, useEffect } from "react";
import { Bot, Power, Activity, Terminal, ShieldCheck, DollarSign, Settings } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AutopilotState, VirtualPosition } from "../types";
import { checkBrokerStatus } from "../services/brokerService";
import { fetchBrokerBalance } from "../services/oddsService";

export function AutopilotConsole() {
  const [state, setState] = useState<AutopilotState>({
    isActive: false,
    isBrokerConnected: false,
    capital: 0,
    totalPositions: 12,
    winRate: 58.3,
    log: [
      "SYSTEM_BOOT: Autopilot protocols initialized.",
      "VIRTUAL_FUND: Awaiting allocation.",
      "KALSHI_CHECK: Verifying API credentials..."
    ]
  });

  const [isSimulated, setIsSimulated] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [allocation, setAllocation] = useState(100);

  useEffect(() => {
    const initBroker = async () => {
      const status = await checkBrokerStatus();
      const balanceData = await fetchBrokerBalance();
      setIsSimulated(!!balanceData.simulated);
      
      if (status.connected) {
        setState(prev => ({
          ...prev,
          isBrokerConnected: true,
          capital: allocation,
          log: [`${new Date().toLocaleTimeString()} - KALSHI_LINK: API verified. Ready for live execution.`, ...prev.log].slice(0, 5)
        }));
      } else {
        setState(prev => ({
          ...prev,
          isBrokerConnected: false,
          capital: allocation,
          log: [`${new Date().toLocaleTimeString()} - KALSHI_SYNC: No credentials found. Simulation active.`, ...prev.log].slice(0, 5)
        }));
      }
    };

    initBroker();
  }, [allocation]);

  const toggleAutopilot = () => {
    if (!state.isBrokerConnected && !state.isActive) {
      setState(prev => ({
        ...prev,
        log: [`${new Date().toLocaleTimeString()} - WARNING: Live betting disabled. Running in SIMULATION MODE.`, ...prev.log].slice(0, 5)
      }));
    }

    setState(prev => ({
      ...prev,
      isActive: !prev.isActive,
      log: [
        `${new Date().toLocaleTimeString()} - ${!prev.isActive ? "AUTO_DEPLOY: Agent active and scanning nodes." : "SBY: Agent suspended."}`,
        ...prev.log
      ].slice(0, 5)
    }));
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Bot className={`w-4 h-4 ${state.isActive ? "text-edge-green animate-pulse" : "opacity-40"}`} />
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/60">Autonomous Fund Manager</h3>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="p-1 hover:bg-white/5 rounded transition-all"
          >
            <Settings size={12} className="opacity-40 hover:opacity-100" />
          </button>
          <div className="h-4 w-[1px] bg-white/10 mx-1"></div>
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end mr-2">
              <span className="text-[8px] mono opacity-40">KALSHI</span>
              <span className={`text-[9px] font-bold ${state.isBrokerConnected ? "text-edge-green" : "text-amber-500"}`}>
                {state.isBrokerConnected ? "SYNCED" : "OFFLINE"}
              </span>
            </div>
            <button 
              onClick={toggleAutopilot}
              className={`flex items-center gap-2 px-3 py-1 rounded-full border transition-all ${
                state.isActive 
                  ? "bg-edge-green/10 border-edge-green text-edge-green" 
                  : "border-white/10 text-white/40 hover:text-white"
              }`}
            >
              <Power size={10} />
              <span className="text-[9px] mono font-bold">{state.isActive ? "ACTIVE" : "STANDBY"}</span>
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {showSettings ? (
          <motion.div 
            key="settings"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="bg-white/5 border border-white/10 rounded-lg p-4 mb-6"
          >
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-4 flex items-center gap-2">
              <Settings size={10} />
              Agent Configuration
            </h4>
            <div className="space-y-4">
              <div>
                <label className="text-[9px] opacity-40 uppercase tracking-widest block mb-1">Agent Allocation ($)</label>
                <input 
                  type="number"
                  value={allocation}
                  onChange={(e) => setAllocation(Number(e.target.value))}
                  className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-sm mono focus:border-edge-green outline-none"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[9px] opacity-40 uppercase tracking-widest">Risk Model</span>
                <span className="text-[10px] mono text-edge-green bg-edge-green/10 px-2 py-0.5 rounded">Fractional Kelly 0.25x</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[9px] opacity-40 uppercase tracking-widest">Confidence Threshold</span>
                <span className="text-[10px] mono text-white">55%+ Prob</span>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="stats"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-2 gap-4 mb-6"
          >
            <div className="bg-white/5 p-3 rounded-lg border border-white/5">
              <div className="flex justify-between items-start mb-1">
                <span className="text-[9px] opacity-30 uppercase tracking-widest">Agent Capital</span>
                {isSimulated && <span className="text-[7px] bg-amber-500/10 text-amber-500 px-1 rounded">SIM</span>}
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl mono font-bold text-white">${state.capital.toFixed(2)}</span>
                <span className="text-[10px] text-edge-green font-bold">+12.4%</span>
              </div>
            </div>
            <div className="bg-white/5 p-3 rounded-lg border border-white/5">
              <span className="text-[9px] opacity-30 uppercase tracking-widest block mb-1">Agent Accuracy</span>
              <div className="flex items-baseline gap-1">
                <span className="text-xl mono font-bold text-white">{state.winRate}%</span>
                <span className="text-[10px] opacity-40">WR</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-grow flex flex-col">
        <div className="flex items-center gap-2 mb-2">
          <Terminal size={10} className="opacity-40" />
          <span className="text-[9px] opacity-40 uppercase tracking-widest font-bold">Execution Log</span>
        </div>
        <div className="bg-black/40 rounded-lg p-3 border border-white/5 flex-grow font-mono text-[9px] space-y-1 overflow-hidden">
          <AnimatePresence>
            {state.log.map((entry, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                className={i === 0 ? "text-edge-green" : "opacity-40"}
              >
                {`> ${entry}`}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck size={12} className="text-blue-400" />
          <span className="text-[9px] mono opacity-40 uppercase">Guard: Fractional Kelly 0.25x</span>
        </div>
        <div className="text-[9px] mono opacity-80 uppercase tracking-widest">
          Risk Tier: <span className="text-white font-bold">Conservative</span>
        </div>
      </div>
    </div>
  );
}

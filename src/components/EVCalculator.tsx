import React, { useState } from "react";
import { calculateEV, calculateKelly } from "../lib/utils";
import { Calculator, Settings } from "lucide-react";

export function EVCalculator() {
  const [bankroll, setBankroll] = useState<number>(1550);
  const [odds, setOdds] = useState<number>(110);
  const [trueProb, setTrueProb] = useState<number>(55);
  const [riskMultiplier, setRiskMultiplier] = useState<number>(0.25); // Fractional Kelly

  // Default unit for EV calculation (using $100 for percentage visibility)
  const theoreticalStake = 100;
  const ev = calculateEV(trueProb / 100, odds, theoreticalStake);
  
  // Calculate raw Kelly and the Suggested Kelly (fractional)
  const fullKellyFraction = calculateKelly(trueProb / 100, odds, 1);
  const suggestedFraction = fullKellyFraction * riskMultiplier;
  const suggestedStake = bankroll * suggestedFraction;

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Settings className="w-3 h-3 text-blue-400" />
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/60">Execution Heuristics</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] mono opacity-40 uppercase">Kelly Multiplier:</span>
          <select 
            value={riskMultiplier} 
            onChange={(e) => setRiskMultiplier(Number(e.target.value))}
            className="bg-white/5 border border-white/10 text-[9px] mono text-edge-green px-2 py-0.5 rounded outline-none"
          >
            <option value={1}>1.00x (Aggressive)</option>
            <option value={0.5}>0.50x (Moderate)</option>
            <option value={0.25}>0.25x (Conservative)</option>
            <option value={0.1}>0.10x (Safe)</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white/5 p-3 rounded-lg border border-white/5">
          <label className="text-[9px] opacity-40 uppercase tracking-widest block mb-2">Portfolio Cap ($)</label>
          <input 
            type="number" 
            value={bankroll} 
            onChange={(e) => setBankroll(Number(e.target.value))}
            className="w-full bg-transparent border-none p-0 text-lg mono font-bold focus:ring-0 outline-none text-white"
          />
        </div>
        <div className="bg-white/5 p-3 rounded-lg border border-white/5">
          <label className="text-[9px] opacity-40 uppercase tracking-widest block mb-2">Min Odds Threshold</label>
          <input 
            type="number" 
            value={odds} 
            onChange={(e) => setOdds(Number(e.target.value))}
            className="w-full bg-transparent border-none p-0 text-lg mono font-bold focus:ring-0 outline-none text-white"
          />
        </div>
        <div className="bg-white/5 p-3 rounded-lg border border-white/5">
          <label className="text-[9px] opacity-40 uppercase tracking-widest block mb-2">Min Edge Prob (%)</label>
          <input 
            type="number" 
            value={trueProb} 
            onChange={(e) => setTrueProb(Number(e.target.value))}
            className="w-full bg-transparent border-none p-0 text-lg mono font-bold focus:ring-0 outline-none text-white"
          />
        </div>
      </div>

      <div className="mt-auto grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-white/5">
        <div>
          <span className="text-[9px] opacity-30 uppercase tracking-widest block mb-1">Expected ROI</span>
          <div className={`mono text-xl font-bold ${ev >= 0 ? "text-edge-green" : "text-alert-red"}`}>
            {(ev / theoreticalStake * 100).toFixed(2)}%
          </div>
        </div>
        <div>
          <span className="text-[9px] opacity-30 uppercase tracking-widest block mb-1">Kelly Criterion</span>
          <div className="mono text-xl font-bold text-white">
            {(suggestedFraction * 100).toFixed(2)}%
          </div>
        </div>
        <div className="text-right">
          <span className="text-[9px] opacity-30 uppercase tracking-widest block mb-1">Suggested Stake</span>
          <div className="mono text-2xl font-bold text-edge-green shadow-edge-green">
            ${suggestedStake.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
}

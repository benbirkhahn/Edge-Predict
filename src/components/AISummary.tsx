import React from "react";
import { EdgeAnalysis } from "../types";
import { Sparkles, BrainCircuit, Target, ShieldAlert } from "lucide-react";
import { motion } from "motion/react";

interface AISummaryProps {
  analysis: EdgeAnalysis | null;
  loading: boolean;
}

export function AISummary({ analysis, loading }: AISummaryProps) {
  if (loading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center space-y-4 min-h-[160px] animate-pulse">
        <BrainCircuit className="w-8 h-8 text-edge-green opacity-20" />
        <span className="text-[9px] mono uppercase tracking-[0.3em] opacity-40">Synthesizing Market Invariants...</span>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="p-6 flex flex-col items-center justify-center space-y-2 opacity-10 min-h-[160px]">
        <Target className="w-8 h-8" />
        <span className="text-[9px] mono uppercase tracking-[0.3em]">Awaiting Selection</span>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3 h-3 text-edge-green" />
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/60">Neural Intel</h3>
        </div>
        <div className="text-[9px] mono px-2 py-0.5 bg-edge-green/20 text-edge-green rounded border border-edge-green/30">
          CONFIDENCE: {analysis.confidence}%
        </div>
      </div>

      <div className="space-y-5">
        <div>
          <span className="text-[9px] opacity-30 uppercase tracking-widest block mb-1">PROPOSED TARGET</span>
          <p className="text-xl font-bold tracking-tighter text-white">{analysis.recommendation}</p>
        </div>

        <div>
          <span className="text-[9px] opacity-30 uppercase tracking-widest block mb-1">STRATEGIC JUSTIFICATION</span>
          <p className="text-[11px] leading-relaxed opacity-70 mono font-medium">
            {analysis.justification}
          </p>
        </div>

        <div className="pt-4 border-t border-white/5 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${analysis.confidence > 70 ? "bg-edge-green shadow-[0_0_10px_#00FF66]" : "bg-alert-red"}`}></div>
            <span className="text-[10px] mono font-bold tracking-widest uppercase">
              {analysis.confidence > 75 ? "LOW RISK" : "SPECULATIVE"}
            </span>
          </div>
          <button className="text-[9px] underline uppercase tracking-widest opacity-40 hover:opacity-100">Details</button>
        </div>
      </div>
    </motion.div>
  );
}

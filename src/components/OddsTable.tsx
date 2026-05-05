import React from "react";
import { GameOdds } from "../types";
import { formatOdds, calculateImpliedProbability } from "../lib/utils";
import { TrendingUp, TrendingDown, Info } from "lucide-react";
import { motion } from "motion/react";

interface OddsTableProps {
  odds: GameOdds[];
  onAnalyze: (game: GameOdds) => void;
}

export function OddsTable({ odds, onAnalyze }: OddsTableProps) {
  return (
    <div className="w-full">
      <table className="w-full text-left border-collapse">
        <thead className="text-[10px] uppercase text-white/40 border-b border-white/10">
          <tr>
            <th className="font-medium pb-2">Match / Market</th>
            <th className="font-medium pb-2">Bookie Odds</th>
            <th className="font-medium pb-2 text-right">Edge Action</th>
          </tr>
        </thead>
        <tbody className="text-sm mono">
          {odds.map((game) => {
            const homeOutcomes = game.bookmakers.flatMap(b => b.markets.find(m => m.key === 'h2h')?.outcomes.filter(o => o.name === game.home_team) || []);
            const awayOutcomes = game.bookmakers.flatMap(b => b.markets.find(m => m.key === 'h2h')?.outcomes.filter(o => o.name === game.away_team) || []);
            
            const maxHome = homeOutcomes.length > 0 ? Math.max(...homeOutcomes.map(o => o.price)) : null;
            const maxAway = awayOutcomes.length > 0 ? Math.max(...awayOutcomes.map(o => o.price)) : null;

            return (
              <motion.tr 
                key={game.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bento-table-row group"
              >
                <td className="py-4">
                  <span className="block font-bold text-white tracking-tight">{game.home_team} vs {game.away_team}</span>
                  <span className="text-[10px] text-white/40 uppercase tracking-widest">{game.sport_title}</span>
                </td>
                <td className="py-4">
                  <div className="flex gap-4">
                    <div className="flex flex-col">
                      <span className="text-xs opacity-40">Home</span>
                      <span className="text-white font-bold">{maxHome ? formatOdds(maxHome) : "—"}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs opacity-40">Away</span>
                      <span className="text-white font-bold">{maxAway ? formatOdds(maxAway) : "—"}</span>
                    </div>
                  </div>
                </td>
                <td className="py-4 text-right">
                  <button 
                    onClick={() => onAnalyze(game)}
                    className="bento-button-primary opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 transition-all shadow-[0_0_15px_rgba(0,255,102,0.2)]"
                  >
                    Analyze
                  </button>
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

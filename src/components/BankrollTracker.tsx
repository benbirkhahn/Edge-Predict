import React from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { History, TrendingUp } from "lucide-react";

// Mock data for initial view
const data = [
  { day: "01", bankroll: 1000 },
  { day: "05", bankroll: 1150 },
  { day: "10", bankroll: 1080 },
  { day: "15", bankroll: 1250 },
  { day: "20", bankroll: 1400 },
  { day: "25", bankroll: 1380 },
  { day: "30", bankroll: 1550 },
];

export function BankrollTracker() {
  return (
    <div className="p-6 flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-3 h-3 text-edge-green" />
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/60">Equity Growth</h3>
        </div>
        <div className="text-[10px] mono text-edge-green font-bold bg-edge-green/10 px-2 py-0.5 rounded">
          +42.1% TOTAL ROI
        </div>
      </div>

      <div className="flex-1 min-h-[150px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorBankroll" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00FF66" stopOpacity={0.2}/>
                <stop offset="95%" stopColor="#00FF66" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff05" />
            <XAxis dataKey="day" hide />
            <YAxis domain={['dataMin - 100', 'dataMax + 100']} hide />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: "#141416", 
                border: "1px solid #222", 
                borderRadius: "8px",
                color: "#E0E0E0",
                fontFamily: "JetBrains Mono",
                fontSize: "10px"
              }}
              itemStyle={{ color: "#E0E0E0" }}
            />
            <Area 
              type="monotone" 
              dataKey="bankroll" 
              stroke="#00FF66" 
              strokeWidth={2}
              fillOpacity={1} 
              fill="url(#colorBankroll)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-8 mt-6 pt-4 border-t border-white/5">
        <div>
          <span className="text-[9px] opacity-30 uppercase tracking-widest block mb-1">Max Drawdown</span>
          <span className="mono text-lg font-bold text-alert-red">-3.2%</span>
        </div>
        <div className="text-right">
          <span className="text-[9px] opacity-30 uppercase tracking-widest block mb-1">Sharp Ratio</span>
          <span className="mono text-lg font-bold text-white">2.84</span>
        </div>
      </div>
    </div>
  );
}

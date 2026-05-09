import React, { useState } from "react";
import { Send, Terminal, Sparkles, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { processCommand } from "../services/aiService";

interface NeuralCommandBarProps {
  onAction: (command: any) => void;
  currentState: any;
}

export function NeuralCommandBar({ onAction, currentState }: NeuralCommandBarProps) {
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastFeedback, setLastFeedback] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;

    setIsProcessing(true);
    setLastFeedback(null);
    
    try {
      const command = await processCommand(input, currentState);
      setLastFeedback(command.feedback);
      onAction(command);
      setInput("");
      
      // Clear feedback after 3 seconds
      setTimeout(() => setLastFeedback(null), 3000);
    } catch (error) {
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-2xl px-6 z-50">
      <div className="relative">
        <AnimatePresence>
          {lastFeedback && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: -45, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute left-0 right-0 p-2 bg-edge-green/90 text-black text-[10px] font-bold uppercase tracking-widest text-center rounded border border-white/20 shadow-2xl backdrop-blur-md"
            >
              {lastFeedback}
            </motion.div>
          )}
        </AnimatePresence>

        <form 
          onSubmit={handleSubmit}
          className="flex items-center gap-3 bg-black/80 backdrop-blur-xl border border-white/10 rounded-full px-4 py-2 shadow-2xl focus-within:border-edge-green/50 transition-all group"
        >
          <div className="flex items-center gap-2">
            <Terminal size={14} className="opacity-30 group-focus-within:text-edge-green transition-colors" />
            <div className="h-4 w-[1px] bg-white/10"></div>
          </div>
          
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Executive Command (e.g. 'Set NBA allocation to $50')"
            className="flex-grow bg-transparent border-none outline-none text-xs mono text-white placeholder:text-white/20"
          />

          <button 
            type="submit"
            disabled={isProcessing || !input.trim()}
            className={`flex items-center justify-center p-1.5 rounded-full transition-all ${
              input.trim() ? "bg-edge-green text-black" : "bg-white/5 text-white/20"
            }`}
          >
            {isProcessing ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          </button>
          
          <div className="flex items-center gap-2 pl-2">
            <div className="h-4 w-[1px] bg-white/10"></div>
            <Sparkles size={14} className="text-edge-green/40" />
          </div>
        </form>
      </div>
    </div>
  );
}

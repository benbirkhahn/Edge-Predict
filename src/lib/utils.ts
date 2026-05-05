import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export function calculateImpliedProbability(americanOdds: number): number {
  if (americanOdds > 0) {
    return 100 / (americanOdds + 100);
  } else {
    return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  }
}

export function calculateEV(winProb: number, odds: number, stake: number): number {
  const decimalOdds = odds > 0 ? (odds / 100) + 1 : (100 / Math.abs(odds)) + 1;
  const lossProb = 1 - winProb;
  return (winProb * (decimalOdds - 1) * stake) - (lossProb * stake);
}

export function calculateKelly(winProb: number, odds: number, bFraction = 1): number {
  const b = odds > 0 ? (odds / 100) : (100 / Math.abs(odds));
  const q = 1 - winProb;
  const f = (b * winProb - q) / b;
  return Math.max(0, f * bFraction);
}

# EdgePredict Sports Intelligence

EdgePredict is a portfolio-safe version of a sports market intelligence and execution-control project. It analyzes Kalshi sports markets, compares market pricing to sportsbook-implied probabilities, and only allows execution when strict server-side risk rules pass.

This repo is intentionally sanitized for GitHub:

- Real credentials stay in `.env.local`, which is ignored.
- Local trading history and runtime state stay in `data/`, which is ignored.
- Logs, caches, and build output are ignored.

## What The Project Does

- Pulls Kalshi market data for supported sports contracts.
- Ingests sportsbook odds and converts them into consensus fair probabilities.
- Estimates expected value after fees and slippage buffers.
- Applies hard risk controls before any live action is allowed.
- Shows approvals, rejections, bankroll, and execution state in a local dashboard.

This is not a discretionary betting app. It is a rules-based positive-EV engine with multiple server-side blocks against unsafe execution.

## Risk Controls

Live execution remains blocked unless a market clears all required checks, including:

- Positive expected value threshold
- Mapping confidence threshold
- Liquidity threshold
- Exposure and duplicate-position rules
- Supported market and time-window rules
- Explicit live arming and server-side enablement

The default setup is conservative: small stake sizing, daily caps, and live trading disabled until credentials and rules are intentionally enabled.

## Local Run

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Fill in your own demo or test credentials in `.env.local`.
4. Start the app with `npm run dev`.
5. Open `http://localhost:3000`.

## Files Included For GitHub

- `.env.example` with placeholder variables only
- [`EDGE_PREDICT_PLAIN_ENGLISH.md`](./EDGE_PREDICT_PLAIN_ENGLISH.md) for a non-technical explanation
- Source code for the dashboard, scoring flow, and risk checks

## Files Excluded From GitHub

- `.env.local`
- `data/`
- `node_modules/`
- local caches, logs, and build artifacts

## Portfolio Framing

This project demonstrates:

- real-world AI and automation integration
- finance and risk-control thinking
- server-side safeguards for execution systems
- explainable decisioning instead of black-box actions

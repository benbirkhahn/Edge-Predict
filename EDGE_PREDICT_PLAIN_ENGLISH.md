# EdgePredict: Plain-English Explanation

## What This Is

EdgePredict is a small automated trading system for Kalshi sports prediction markets.

Kalshi lets people buy contracts on real-world outcomes. In this case, the system focuses on sports markets like MLB, NBA, and NHL game winners.

The goal is not to guess games based on fandom or gut feeling. The goal is to look for situations where the Kalshi price appears different from the fair price suggested by sportsbook odds.

In simple terms:

> If the system thinks Kalshi is underpricing an outcome, and the math clears our safety rules, it can place a small bet.

## What It Is Trying To Do

The system is trying to find positive expected value, often called positive EV.

That means:

- It compares the market price on Kalshi to an estimated fair probability.
- It only considers a trade if the estimated edge is big enough after fees and slippage.
- It avoids placing bets just because a team feels like a "lock."
- It uses small position sizes so mistakes are survivable.

Positive EV does not mean guaranteed profit. It means the system is trying to make trades that are mathematically favorable over many attempts.

## How It Decides If A Bet Is Worth Taking

For each market, the system checks:

1. What price Kalshi is offering.
2. What sportsbook odds imply about the fair probability.
3. Whether there is enough liquidity.
4. Whether the event is close enough in time.
5. Whether the system already has an open position on that market.
6. Whether the estimated edge is large enough after fees.
7. Whether the confidence and mapping are strong enough.

If any rule fails, the system does not place the bet.

## Example

Suppose Kalshi prices a team at 35 percent.

If sportsbook consensus suggests the team should be closer to 41 percent, the system may see that as a possible edge.

But it still does not automatically bet. It first checks fees, liquidity, duplicates, daily risk limits, and other safety rules.

Only if every rule passes can it place a small order.

## What We Have Built So Far

The system now runs on a Google Cloud virtual machine instead of just on a laptop.

That means:

- The backend can stay online 24/7.
- It can scan markets automatically.
- It can keep logs and history.
- The dashboard can be opened privately through Tailscale.

Tailscale is a private network. It lets approved devices access the dashboard without exposing it to the public internet.

## Current Safety Rules

The system is intentionally conservative.

Important safety controls include:

- Small max stake per order.
- Daily loss cap.
- Minimum edge requirement.
- Minimum liquidity requirement.
- Minimum confidence requirement.
- Duplicate bet prevention.
- Same-event exposure checks.
- Kill switch.
- Server-side validation before any live order.

Even if the dashboard button is clicked, the backend still blocks trades that fail the rules.

## What The Dashboard Shows

The dashboard shows:

- Account balance.
- Current portfolio value.
- Whether live trading is armed.
- Whether autopilot is running.
- How many markets were scanned.
- How many passed the rules.
- Why markets were rejected.
- Open positions.
- Bet history.
- Win/loss tracking.
- Profit and loss charts.
- Fees paid.

The important thing is not just whether it wins or loses one bet. The important thing is whether the system is making disciplined, explainable decisions over time.

## Why We Are Using Small Bets

Right now the goal is testing and learning, not making large profits.

Small bets help us answer:

- Are the markets mapped correctly?
- Are sportsbook odds being read correctly?
- Are fees too expensive?
- Are we finding real edges or fake ones?
- Are the rules too strict or too loose?
- Is performance improving over time?

With a small bankroll, being up or down a few dollars is not the main signal. The main signal is whether the process is working.

## What This Is Not

This is not a guaranteed money machine.

It is not a sports betting hunch app.

It is not designed to chase losses.

It does not use martingale strategies.

It should not place bets because someone likes a team.

It is a rule-based system that only acts when the math and risk checks pass.

## Main Risk

The biggest risks are:

- The fair probability estimate could be wrong.
- Sportsbook data could be stale or incomplete.
- A Kalshi market could be mapped to the wrong sportsbook event.
- Fees could eat too much of the edge.
- Small sample results can be misleading.
- Betting markets can move quickly.

That is why the system logs every decision and starts with small trades.

## Why This Is Interesting

The interesting part is that the system is not just placing random bets.

It is building a feedback loop:

1. Scan markets.
2. Estimate fair probability.
3. Compare against Kalshi.
4. Apply risk rules.
5. Place only approved trades.
6. Track results.
7. Review performance.
8. Improve the model and rules.

Over time, the goal is to learn which leagues, market types, and signals are actually useful.

## Simple Summary

EdgePredict is an automated, rule-based Kalshi sports trading system.

It looks for price differences between Kalshi and sportsbook consensus.

It only places small trades when strict safety rules pass.

It runs 24/7 on a cloud server and is accessed through a private dashboard.

The goal right now is to test whether the system can find real positive-EV opportunities safely and consistently.


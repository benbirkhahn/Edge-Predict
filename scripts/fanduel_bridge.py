#!/usr/bin/env python3

import json
import os
import sys
from pathlib import Path


def load_client():
    package_root = os.environ.get("FANDUEL_CLIENT_PATH", "/Users/benbirkhahn/fanduel_odds_client")
    if str(package_root) not in sys.path:
        sys.path.insert(0, str(package_root))
    from fanduel_odds import FanDuelClient  # type: ignore
    return FanDuelClient


def american_to_probability(odds):
    if odds is None:
        return None
    odds = int(odds)
    if odds > 0:
        return 100 / (odds + 100)
    return abs(odds) / (abs(odds) + 100)


def sportsbooks_payload(sports):
    FanDuelClient = load_client()
    client = FanDuelClient(cache_ttl=2)
    rows = []

    for sport in sports:
        events = client.get_league_odds(sport)
        for event in events:
            lines = event.game_lines
            if not lines or not lines.moneyline_home or not lines.moneyline_away:
                continue
            for runner, selection_type in (
                (lines.moneyline_home, "home"),
                (lines.moneyline_away, "away"),
            ):
                probability = american_to_probability(runner.american_odds)
                if probability is None:
                    continue
                rows.append({
                    "sport": sport,
                    "league": sport,
                    "eventId": str(event.event_id),
                    "homeTeam": lines.moneyline_home.name,
                    "awayTeam": lines.moneyline_away.name,
                    "startTime": event.open_date.isoformat() if event.open_date else "",
                    "book": "fanduel",
                    "outcome": runner.name,
                    "selectionType": selection_type,
                    "americanOdds": int(runner.american_odds),
                    "impliedProbability": probability,
                    "lastUpdated": "",
                })

    return rows


def games_payload(sport):
    FanDuelClient = load_client()
    client = FanDuelClient(cache_ttl=2)
    events = client.get_league_odds(sport)
    games = []

    for event in events:
        lines = event.game_lines
        if not lines or not lines.moneyline_home or not lines.moneyline_away:
            continue

        markets = [{
            "key": "h2h",
            "outcomes": [
                {"name": lines.moneyline_home.name, "price": int(lines.moneyline_home.american_odds)},
                {"name": lines.moneyline_away.name, "price": int(lines.moneyline_away.american_odds)},
            ],
        }]

        if lines.spread_home and lines.spread_away:
            markets.append({
                "key": "spreads",
                "outcomes": [
                    {"name": lines.spread_home.name, "price": int(lines.spread_home.american_odds), "point": lines.spread_home.handicap},
                    {"name": lines.spread_away.name, "price": int(lines.spread_away.american_odds), "point": lines.spread_away.handicap},
                ],
            })

        if lines.total_over and lines.total_under:
            markets.append({
                "key": "totals",
                "outcomes": [
                    {"name": lines.total_over.name, "price": int(lines.total_over.american_odds), "point": lines.total_over.handicap},
                    {"name": lines.total_under.name, "price": int(lines.total_under.american_odds), "point": lines.total_under.handicap},
                ],
            })

        games.append({
            "id": str(event.event_id),
            "sport_key": sport,
            "sport_title": sport.upper(),
            "commence_time": event.open_date.isoformat() if event.open_date else "",
            "home_team": lines.moneyline_home.name,
            "away_team": lines.moneyline_away.name,
            "bookmakers": [{
                "key": "fanduel",
                "title": "FanDuel",
                "markets": markets,
            }],
            "in_play": event.is_live,
        })

    return games


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "sportsbook"
    if mode == "games":
        sport = sys.argv[2] if len(sys.argv) > 2 else "nba"
        print(json.dumps(games_payload(sport)))
        return

    sports = sys.argv[2:] if len(sys.argv) > 2 else ["mlb", "nba", "nhl"]
    print(json.dumps(sportsbooks_payload(sports)))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Private NFL historical research cache from documented nflreadpy loaders.

Historical actuals are NOT reconstructed posted PrizePicks/Underdog lines.
This collector does not make any pick or publish source-owned data on the site.
Output: outputs/nfl/history/<season>/<dataset>.json.gz, manifest.json.
"""
import argparse
import datetime as dt
import gzip
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    "player_weekly": "nflverse.load_player_stats(week)",
    "schedule": "nflverse.load_schedules",
    "team_weekly": "nflverse.load_team_stats(week)",
    "snap_counts": "nflverse.load_snap_counts(PFR via nflverse)",
    "weekly_rosters": "nflverse.load_rosters_weekly",
    "injuries": "nflverse.load_injuries",
    "ftn_charting_research_only": "nflverse.load_ftn_charting (CC-BY-SA 4.0)",
    "kicking_pbp": "nflverse.load_pbp(kicking events only)",
    "pbp_specialty_events": "nflverse.load_pbp(select ordered offensive/defensive/special-team events)",
    "nextgen_passing": "nflverse.load_nextgen_stats(passing)",
    "nextgen_receiving": "nflverse.load_nextgen_stats(receiving)",
    "nextgen_rushing": "nflverse.load_nextgen_stats(rushing)",
    "pfr_pass": "nflverse.load_pfr_advstats(pass)",
    "pfr_rush": "nflverse.load_pfr_advstats(rush)",
    "pfr_rec": "nflverse.load_pfr_advstats(rec)",
    "pfr_def": "nflverse.load_pfr_advstats(def)",
}
KICK_FIELDS = (
    "season", "week", "game_id", "play_id", "game_date", "posteam",
    "kicker_player_id", "kicker_player_name", "field_goal_attempt",
    "field_goal_result", "kick_distance", "extra_point_attempt",
    "extra_point_result", "qtr", "game_seconds_remaining", "desc",
    "roof", "temp", "wind", "yardline_100",
)


# One event-level archive can support many player, punt, kick, first-play,
# threshold and partial-period markets without 97 separate collectors.
# This is a retrospective outcome archive, NOT point-in-time game forecast data.
SPECIALTY_FIELDS = (
    "season", "week", "season_type", "game_id", "play_id", "game_date",
    "home_team", "away_team", "posteam", "defteam", "drive", "qtr",
    "fixed_drive", "fixed_drive_result", "drive_play_count", "drive_inside20",
    "drive_ended_with_score", "drive_play_id_started", "drive_play_id_ended",
    "fourth_down_converted", "fourth_down_failed", "third_down_failed",
    "quarter_seconds_remaining", "game_seconds_remaining", "down", "ydstogo",
    "yardline_100", "play_type", "yards_gained", "passing_yards",
    "rushing_yards", "receiving_yards", "pass_attempt", "rush_attempt",
    "complete_pass", "incomplete_pass", "interception", "sack",
    "pass_touchdown", "rush_touchdown", "touchdown", "first_down_pass",
    "first_down_rush", "first_down_penalty", "third_down_converted",
    "passer_player_id", "receiver_player_id", "rusher_player_id",
    "sack_player_id", "interception_player_id", "tackle_with_assist",
    "solo_tackle_1_player_id", "solo_tackle_2_player_id",
    "assist_tackle_1_player_id", "assist_tackle_2_player_id",
    "punt_attempt", "punt_inside_twenty", "punt_blocked", "punt_yards",
    "punt_touchback", "punt_returner_player_id", "punt_return_yards",
    "punter_player_id", "kickoff_attempt", "touchback",
    "kickoff_returner_player_id", "kickoff_return_yards",
    "field_goal_attempt", "field_goal_result", "kicker_player_id",
    "kick_distance", "extra_point_attempt", "extra_point_result",
    "two_point_conv_result", "penalty", "penalty_type"
)
REQUIRED_SPECIALTY = frozenset((
    "season","season_type","week","game_id","play_id","posteam","defteam","drive",
    "qtr","play_type","yardline_100","passer_player_id",
    "receiver_player_id","rusher_player_id","pass_attempt","rush_attempt",
    "complete_pass","sack","punt_attempt","punter_player_id",
    "field_goal_attempt","extra_point_attempt"
))
PLAY_TYPES = frozenset(("pass","run","punt","kickoff","field_goal",
                        "extra_point","no_play","qb_spike","qb_kneel"))

def specialty_only(pbp):
    """Return ordered, meaningful PBP events with explicit schema validation.

    Missing fields do not become assumed zeros and unknown play types are excluded.
    A no-play penalty is retained so first downs/drive events can be rechecked.
    """
    import polars as pl
    cols = set(pbp.columns)
    missing = REQUIRED_SPECIALTY - cols
    if missing:
        raise ValueError("Specialty PBP missing required fields: " + ", ".join(sorted(missing)))
    selected = [name for name in SPECIALTY_FIELDS if name in cols]
    rows = pbp.filter(
        (pl.col("season_type") == "REG") &
        (pl.col("week") >= 1) & (pl.col("week") <= 18) &
        pl.col("play_type").is_in(sorted(PLAY_TYPES)) &
        pl.col("game_id").is_not_null() &
        pl.col("play_id").is_not_null() &
        (pl.col("qtr") >= 1) &
        (pl.col("qtr") <= 5)
    ).select(selected).sort(["season", "week", "game_id", "play_id"])
    if not len(rows):
        raise ValueError("No ordered NFL specialist events; archive unchanged")
    if rows.select(["game_id", "play_id"]).is_duplicated().any():
        raise ValueError("Duplicate game/play IDs in NFL specialist event source")
    return rows

def kicking_only(pbp):
    """Preserve exact attempt-level field-goal/PAT outcomes and distances."""
    import polars as pl
    cols = set(pbp.columns)
    if not {"field_goal_attempt", "extra_point_attempt"}.issubset(cols):
        raise ValueError("kicking play-by-play missing both attempt flags")
    selected = [c for c in KICK_FIELDS if c in cols]
    if not {"game_id", "play_id", "kick_distance"}.issubset(selected):
        raise ValueError("kicking play-by-play missing required identities/distances")
    return pbp.filter(
        (pl.col("field_goal_attempt") == 1) |
        (pl.col("extra_point_attempt") == 1)
    ).select(selected)

def store(directory, key, frame):
    """Atomically publish only a nonempty, identified dataset; never fabricate 0s."""
    if frame is None or not len(frame):
        raise ValueError(f"{key}: empty historical dataset")
    if not hasattr(frame, "columns"):
        raise ValueError(f"{key}: missing dataframe columns")
    if key == "player_weekly" and not {"season", "week", "player_id"}.issubset(frame.columns):
        raise ValueError("player stats missing season/week/player_id")
    if key == "pbp_specialty_events" and not REQUIRED_SPECIALTY.issubset(frame.columns):
        raise ValueError("Specialty event dataset lacks required identity/position columns")
    if key == "schedule" and "game_id" not in frame.columns:
        raise ValueError("schedule missing game_id")
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / (key + ".json.gz")
    temp = directory / (key + ".json.gz.tmp")
    payload = {
        "schemaVersion": 1,
        "sport": "NFL",
        "dataset": key,
        "source": SOURCES[key],
        "originalLicenseReview": "CC-BY-SA 4.0/sharealike -- research isolation, not commercial model" if key == "ftn_charting_research_only" else "Verify dataset-specific license and attribution before reuse",
        "modelFeatureProductionReady": False,
        "retrospectivePlayerStatsNotPregameLines": True,
        "commercialDisplayCleared": False,
        "specialtyOutcomeOnlyNotPregameAvailable": key == "pbp_specialty_events",
        "recordCount": len(frame),
        "columns": list(frame.columns),
        "rows": frame.to_dicts(),
    }
    with gzip.open(temp, "wt", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, default=str, separators=(",", ":"))
    temp.replace(target)
    return {"dataset": key, "records": len(frame), "path": str(target.relative_to(ROOT)),
            "status": "saved", "columns": len(frame.columns)}

def collect(seasons, include_optional=True):
    import nflreadpy as nfl
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    report = {"schemaVersion": 1, "sport": "NFL", "collectedAt": now,
              "seasons": seasons, "datasets": [], "allRequiredSuccessful": False,
              "officialPrizePicksLinesIncluded": False, "automaticPicksEnabled": False,
              "commercialRedistributionAuthorized": False}
    for season in seasons:
        target = ROOT / "outputs/nfl/history" / str(season)
        pbp_cached = []
        def pbp_once():
            if not pbp_cached:
                pbp_cached.append(nfl.load_pbp(seasons=season))
            return pbp_cached[0]
        required = [
            ("player_weekly", lambda: nfl.load_player_stats(seasons=season, summary_level="week")),
            ("schedule", lambda: nfl.load_schedules(seasons=season)),
            ("kicking_pbp", lambda: kicking_only(pbp_once())),
        ]
        optional = []
        if include_optional:
            # Contextual game / defensive-opponent / availability sources used by
            # the future NFL match-up layer, NOT contemporaneous pregame data.
            optional += [
                ("pbp_specialty_events", lambda: specialty_only(pbp_once())),
                ("team_weekly", lambda: nfl.load_team_stats(seasons=season, summary_level="week")),
                ("snap_counts", lambda: nfl.load_snap_counts(seasons=season)),
                ("weekly_rosters", lambda: nfl.load_rosters_weekly(seasons=season)),
                ("injuries", lambda: nfl.load_injuries(seasons=season)),
                ("ftn_charting_research_only", lambda: nfl.load_ftn_charting(seasons=season)),
            ]
            optional += [
                (f"nextgen_{kind}", lambda kind=kind: nfl.load_nextgen_stats(seasons=season, stat_type=kind))
                for kind in ("passing", "receiving", "rushing")
            ]
            optional += [
                (f"pfr_{kind}", lambda kind=kind: nfl.load_pfr_advstats(seasons=season, stat_type=kind, summary_level="week"))
                for kind in ("pass", "rush", "rec", "def")
            ]
        for key, loader in required + optional:
            try:
                outcome = store(target, key, loader())
                report["datasets"].append({"season": season, **outcome, "required": key in {x[0] for x in required}})
            except Exception as exc:
                report["datasets"].append({
                    "season": season, "dataset": key, "status": "unavailable",
                    "required": key in {x[0] for x in required},
                    "errorType": type(exc).__name__,
                })
    report["allRequiredSuccessful"] = all(
        d["status"] == "saved" for d in report["datasets"] if d["required"]
    ) and sum(d["required"] for d in report["datasets"]) == len(seasons) * 3
    manifest = ROOT / "outputs/nfl/history/manifest.json"
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    if not report["allRequiredSuccessful"]:
        raise RuntimeError("NFL required historical inputs incomplete; see private manifest")
    return report

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--seasons", nargs="+", type=int, default=[2024, 2025, 2026])
    parser.add_argument("--no-optional", action="store_true")
    args = parser.parse_args()
    if len(set(args.seasons)) != len(args.seasons) or any(
        y < 1999 or y > dt.datetime.now(dt.timezone.utc).year for y in args.seasons
    ):
        parser.error("Seasons must be unique existing NFL season years")
    report = collect(args.seasons, include_optional=not args.no_optional)
    print(json.dumps({"seasons": report["seasons"],
        "allRequiredSuccessful": report["allRequiredSuccessful"],
        "datasetsSaved": sum(d["status"] == "saved" for d in report["datasets"]),
        "optionalGaps": [f"{d['season']}:{d['dataset']}" for d in report["datasets"]
                         if not d["required"] and d["status"] != "saved"]}))

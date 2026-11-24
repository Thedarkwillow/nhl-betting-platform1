#!/usr/bin/env python3
"""Refresh NFL 2026 weekly results and schedule without overwriting prior seasons
or optional archived specialist data. NFLverse is a derived research data source,
not authenticated PrizePicks/Underdog settlement evidence.
"""
import argparse
import datetime as dt
import gzip
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("nfl_history_collector",
                                          ROOT / "scripts/collect-nfl-history.py")
HISTORY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HISTORY)

def archive_payload(path):
    if not path.exists():
        raise RuntimeError("Existing private NFL archive absent: " + str(path))
    with gzip.open(path, "rt", encoding="utf-8") as stream:
        obj = json.load(stream)
    if obj.get("sport") != "NFL" or obj.get("recordCount") != len(obj.get("rows", [])):
        raise RuntimeError("Invalid original NFL historical archive: " + str(path))
    return obj

def validate_refresh(old, new, name):
    """Never let a transient provider failure erase previously archived rows."""
    if len(new) < old["recordCount"]:
        raise RuntimeError(name + " provider has fewer records; preserving private original")
    required = {"season", "week", "player_id"} if name == "player_weekly" else {
        "season", "week", "game_id", "home_team", "away_team", "gameday"
    }
    if not required.issubset(set(new.columns)):
        raise RuntimeError(name + " missing required history and matching fields")
    if "season" in new.columns:
        years = set(new.select("season").to_series().drop_nulls().to_list())
        if years != {2026}:
            raise RuntimeError(name + " unexpectedly includes seasons beyond 2026")

def validate_optional(old, new, name):
    """Fail closed if a provider returns incomplete roster/snap evidence."""
    if len(new) < old["recordCount"]:
        raise RuntimeError(name + " fewer rows than preserved archive")
    cols = set(new.columns)
    if not {"season", "week"}.issubset(cols):
        raise RuntimeError(name + " does not include season/week")
    if name == "weekly_rosters":
        if not ({"gsis_id", "player_id"} & cols) or not ({"team", "recent_team"} & cols):
            raise RuntimeError("roster lacks exact identity or team")
    elif name == "snap_counts":
        if "game_id" not in cols or not ({"pfr_player_id", "pfr_id"} & cols):
            raise RuntimeError("snap counts lacks exact game/PFR identifier")
    years = set(new.select("season").to_series().drop_nulls().to_list())
    if years != {2026}:
        raise RuntimeError(name + " unexpectedly includes other seasons")

def validate_identity_preservation(prior, frame, keys):
    if not set(keys).issubset(frame.columns):
        raise RuntimeError("Source lacks matching identities")
    def identities(rows):
        result = [tuple(r.get(k) for k in keys) for r in rows]
        if any(any(v is None or v == "" for v in key) for key in result) or len(set(result)) != len(result):
            raise RuntimeError("Missing or duplicate source identity")
        return set(result)
    if not identities(prior["rows"]).issubset(identities(frame.to_dicts())):
        raise RuntimeError("Source omits existing identities")

def refresh(*,provider=None):
    if provider is None:
        import nflreadpy as provider
    directory = ROOT / "outputs/nfl/history/2026"
    requested = {
        "player_weekly": provider.load_player_stats(seasons=2026, summary_level="week"),
        "schedule": provider.load_schedules(seasons=2026),
    }
    previous = {name: archive_payload(directory / (name + ".json.gz"))
                for name in requested}
    for name, frame in requested.items():
        validate_refresh(previous[name], frame, name)
    saved = [HISTORY.store(directory, name, frame)
             for name, frame in requested.items()]
    # Sunday roster / snap sources are optional. Refresh independently
    # without erasing archived evidence or calling a missing player DNP.
    optional_refreshed = []
    optional_warnings = []
    for name, method in (
        ("weekly_rosters", "load_rosters_weekly"),
        ("snap_counts", "load_snap_counts"),
    ):
        try:
            load = getattr(provider, method)
            frame = load(seasons=2026)
            prior = archive_payload(directory / (name + ".json.gz"))
            validate_optional(prior, frame, name)
            saved.append(HISTORY.store(directory, name, frame))
            optional_refreshed.append(name)
        except Exception:
            # Do not report raw provider errors; source remains stale but intact.
            optional_warnings.append(name + "_source_unavailable_or_incomplete")
    # Refresh the team and event denominators on the same schedule as player
    # outcomes. Existing archive identities must all survive, not only counts.
    pbp = []
    def pbp_once():
        if not pbp:
            pbp.append(provider.load_pbp(seasons=2026))
        return pbp[0]
    for name, loader, keys in (
        ("team_weekly", lambda: provider.load_team_stats(seasons=2026, summary_level="week"), ("season", "week", "team")),
        ("kicking_pbp", lambda: HISTORY.kicking_only(pbp_once()), ("game_id", "play_id")),
        ("pbp_specialty_events", lambda: HISTORY.specialty_only(pbp_once()), ("game_id", "play_id")),
    ):
        try:
            prior = archive_payload(directory / (name + ".json.gz"))
            frame = loader()
            validate_optional(prior, frame, name)
            validate_identity_preservation(prior, frame, keys)
            saved.append(HISTORY.store(directory, name, frame))
            optional_refreshed.append(name)
        except Exception:
            optional_warnings.append(name + "_source_unavailable_or_incomplete")
    manifest_path = ROOT / "outputs/nfl/history/manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for result in saved:
        match = [entry for entry in manifest["datasets"]
                 if entry["season"] == 2026 and entry["dataset"] == result["dataset"]]
        if len(match) != 1:
            raise RuntimeError("Cannot preserve prior original manifest identity")
        match[0].update(result)
    when = dt.datetime.now(dt.timezone.utc).isoformat()
    manifest["last2026CoreRefreshAt"] = when
    manifest["last2026CoreRefreshStatus"] = "source_retrieved_not_all_week_games_final_verified"
    manifest["optionalNFLDatasetsNotRefreshed"] = len(optional_refreshed) != 5
    manifest["last2026OptionalRefreshedDatasets"] = optional_refreshed
    manifest["last2026OptionalWarnings"] = optional_warnings
    manifest["originalPrizePicksLinesIncluded"] = False
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    weekly = requested["player_weekly"]
    counts = weekly.select("week").to_series().value_counts().sort("week").to_dicts()
    return {"status": "archived_2026_core_research_data", "collectedAt": when,
            "datasets": {s["dataset"]: s["records"] for s in saved},
            "weekCounts": counts, "priorSeasonArchivesIntact": True,
            "optionalRefreshed": optional_refreshed,
            "optionalSourceWarnings": optional_warnings,
            "providerSettlementVerified": False, "officialFinalGamesReconciled": False}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", type=int, default=2026)
    args = parser.parse_args()
    if args.season != 2026:
        parser.error("Only incremental current-season 2026 data is refreshed")
    print(json.dumps(refresh(), default=str))

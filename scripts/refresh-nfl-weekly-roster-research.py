"""Refresh an isolated nflverse roster observation for private identity research.
No wagering, paid API, official active-roster or settlement claims.
"""
import datetime as dt
import gzip
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "outputs/nfl/availability/weekly-roster-research-latest.json.gz"

def refresh():
    import nflreadpy as nfl
    frame = nfl.load_rosters_weekly(seasons=2026)
    cols = set(frame.columns)
    if not {"season", "week", "team"}.issubset(cols) or not ({"gsis_id", "player_id"} & cols) or not ({"full_name","player_name","player_display_name"} & cols or {"first_name","last_name"}.issubset(cols)):
        raise RuntimeError("Roster schema unavailable")
    rows = frame.to_dicts()
    if len(rows) < 1000 or {int(x["season"]) for x in rows if x.get("season") is not None} != {2026}:
        raise RuntimeError("Incomplete or incorrect roster season")
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    payload = {"kind":"private_nflverse_weekly_roster_observation_v1","sport":"NFL","dataset":"weekly_rosters","source":"nflverse.load_rosters_weekly","collectedAt":now,"recordCount":len(rows),"rows":rows,"currentActiveRosterVerified":False,"commercialDisplayCleared":False,"retrospectivePlayerStatsNotPregameLines":True}
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    if TARGET.exists():
        with gzip.open(TARGET,"rt",encoding="utf-8") as f:
            old = json.load(f)
        if old.get("kind") != payload["kind"] or len(rows) < old.get("recordCount",0):
            raise RuntimeError("Preserving previous roster observation")
    temp = TARGET.with_suffix(".tmp")
    with gzip.open(temp,"wt",encoding="utf-8") as f:
        json.dump(payload,f,default=str,ensure_ascii=False,separators=(",",":"))
    os.replace(temp,TARGET)
    weeks = sorted({int(x["week"]) for x in rows if x.get("week") is not None})
    print(json.dumps({"rows":len(rows),"weeks":weeks,"observedAt":now,"paidProviderRequests":0,"currentActiveRosterVerified":False}))
if __name__ == "__main__":
    refresh()

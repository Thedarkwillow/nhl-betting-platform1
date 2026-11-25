#!/usr/bin/env python3
"""Prepare the already-authorized four-season NBA model input; pipe only, never Git or logs."""
import datetime as dt, json, pathlib, runpy, sys
root=pathlib.Path(__file__).resolve().parents[1]
m=runpy.run_path(str(root/"scripts/public-nba-alternate-history-audit.py"),run_name="nba_context_library")
today=dt.datetime.now(dt.timezone.utc).date()
rows=[];digests=[]
for season in m["SEASONS"]:
    raw, meta=m["fetch"]("nba_stats_player_game_logs","player_game_logs",season)
    accepted,_=m["normalize"](raw,season,today)
    if not accepted: raise RuntimeError("Missing historical season")
    rows.extend(accepted);digests.append(meta["sha256"])
json.dump({"kind":"nba_mirror_prospective_input_v1","rows":m["model_input"](rows),"digests":digests},sys.stdout,allow_nan=False,separators=(",",":"))

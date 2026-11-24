#!/usr/bin/env python3
"""Enrich existing specialist archives in-place only after identity preservation.
Run in isolated validation checkout before any private archive commit."""
import importlib.util
import json
import datetime as dt
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("refresh",ROOT/"scripts/refresh-nfl-2026-final-history.py")
refresh=importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)
REQUIRED={"fixed_drive","fixed_drive_result","drive_inside20","drive_play_id_started","drive_play_id_ended"}
def backfill(provider=None):
    if provider is None:
        import nflreadpy as provider
    manifest_path=ROOT/"outputs/nfl/history/manifest.json"
    manifest=json.loads(manifest_path.read_text())
    results=[]
    for year in (2024,2025):
        directory=ROOT/"outputs/nfl/history"/str(year)
        name="pbp_specialty_events"
        old=refresh.archive_payload(directory/(name+".json.gz"))
        frame=refresh.HISTORY.specialty_only(provider.load_pbp(seasons=year))
        if not REQUIRED.issubset(frame.columns):
            raise RuntimeError("Drive metadata unavailable")
        if set(frame.select("season").to_series().drop_nulls().to_list())!={year}:
            raise RuntimeError("Unexpected season")
        refresh.validate_identity_preservation(old,frame,("game_id","play_id"))
        matches=[e for e in manifest["datasets"] if e["season"]==year and e["dataset"]==name]
        if len(matches)!=1:
            raise RuntimeError("Missing manifest identity")
        saved=refresh.HISTORY.store(directory,name,frame)
        matches[0].update(saved)
        results.append({"season":year,"records":saved["records"],"priorRecords":old["recordCount"]})
    manifest["specialistDriveBackfillAt"]=dt.datetime.now(dt.timezone.utc).isoformat()
    manifest_path.write_text(json.dumps(manifest,indent=2)+"\n")
    return {"backfilled":results,"modelPromoted":False,"historicalOnly":True}
if __name__=="__main__":
    print(json.dumps(backfill()))

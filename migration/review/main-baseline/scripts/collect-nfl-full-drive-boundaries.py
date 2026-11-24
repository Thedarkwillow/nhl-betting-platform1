#!/usr/bin/env python3
"""Private historical full-play drive-boundary evidence. Does not change outcomes.
All source play types are kept for the boundary check, unlike specialty archive."""
import datetime as dt
import json
import gzip
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OPTIONAL=("qtr","game_seconds_remaining","score_differential","qb_dropback","qb_scramble","qb_kneel","qb_spike","pass_attempt","rush_attempt","sack","xpass","pass_oe","down","two_point_attempt","extra_point_attempt","yardline_100","touchdown","td_team","field_goal_result","punt_attempt","interception","fumble_lost","safety","game_half","ydstogo","yards_gained","drive","first_down","own_kickoff_recovery")
FIELDS=("season","week","season_type","game_id","play_id","posteam","defteam","play_type","fixed_drive","fixed_drive_result","drive_inside20","drive_play_id_started","drive_play_id_ended")
def extract(pbp):
    import polars as pl
    if not set(FIELDS).issubset(pbp.columns):
        raise RuntimeError("Full drive source lacks explicit metadata")
    frame=pbp.filter((pl.col("season_type")=="REG")&pl.col("game_id").is_not_null()&pl.col("play_id").is_not_null()).select(list(FIELDS)+[x for x in OPTIONAL if x in pbp.columns])
    if not len(frame) or frame.select(["game_id","play_id"]).is_duplicated().any():
        raise RuntimeError("Missing or duplicate full-play identities")
    return frame
def collect(provider=None):
    if provider is None:
        import nflreadpy as provider
    result=[]
    for year in (2024,2025,2026):
        frame=extract(provider.load_pbp(seasons=year))
        if set(frame.select("season").to_series().drop_nulls().to_list())!={year}:
            raise RuntimeError("Unexpected source season")
        f=ROOT/"outputs/nfl/history"/str(year)/"drive_boundary_plays.json.gz"
        f.parent.mkdir(parents=True,exist_ok=True)
        rows=frame.to_dicts()
        if f.exists():
            with gzip.open(f,"rt",encoding="utf8") as s:
                old=json.load(s)
            if old.get("dataset")!="drive_boundary_plays" or old.get("recordCount")!=len(old.get("rows",[])):
                raise RuntimeError("Invalid archived drive boundary source")
            if not {(r["game_id"],r["play_id"]) for r in old["rows"]}.issubset({(r["game_id"],r["play_id"]) for r in rows}):
                raise RuntimeError("Source omits previous play identities")
        doc={"sport":"NFL","dataset":"drive_boundary_plays","source":"nflverse full regular-season play-by-play","collectedAt":dt.datetime.now(dt.timezone.utc).isoformat(),"recordCount":len(rows),"retrospectivePlayerStatsNotPregameLines":True,"commercialDisplayCleared":False,"rows":rows}
        temp=f.with_suffix(".tmp")
        with gzip.open(temp,"wt",encoding="utf8") as s:
            json.dump(doc,s,separators=(",",":"),default=str)
        temp.replace(f)
        result.append({"season":year,"records":len(rows)})
    return {"archives":result,"researchOnly":True}
if __name__=="__main__":
    print(json.dumps(collect()))

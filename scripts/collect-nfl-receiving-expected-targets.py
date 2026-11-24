#!/usr/bin/env python3
"""Private historical receiver target CP/xYAC components. No route inference."""
import json,gzip,datetime as dt
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def collect():
    import nflreadpy as nfl
    import polars as pl
    fields=["season","week","game_id","play_id","posteam","defteam","receiver_player_id","passer_player_id","pass_attempt","complete_pass","sack","two_point_attempt","air_yards","cp","xyac_mean_yardage","yards_after_catch","receiving_yards","play_type","season_type"]
    results=[]
    for y in (2024,2025,2026):
        p=nfl.load_pbp(seasons=y)
        if not set(fields).issubset(p.columns): raise ValueError("Missing expected receiving source fields")
        p=p.filter((pl.col("season_type")=="REG")&(pl.col("play_type")=="pass")&(pl.col("pass_attempt")==1)&(pl.col("sack")==0)&(pl.col("two_point_attempt")==0)&pl.col("receiver_player_id").is_not_null()).select(fields)
        if not len(p) or p.select(["game_id","play_id"]).is_duplicated().any(): raise ValueError("Invalid target identities")
        f=ROOT/"outputs/nfl/history"/str(y)/"receiving_expected_targets.json.gz"
        f.parent.mkdir(parents=True,exist_ok=True)
        doc={"sport":"NFL","retrospectivePlayerStatsNotPregameLines":True,"dataset":"receiving_expected_targets","source":"nflverse nflfastR historical play by play","collectedAt":dt.datetime.now(dt.timezone.utc).isoformat(),"recordCount":len(p),"rows":p.to_dicts(),"researchOnly":True,"commercialDisplayCleared":False}
        temp=f.with_suffix(".tmp")
        with gzip.open(temp,"wt",encoding="utf8") as out: json.dump(doc,out,default=str,separators=(",",":"))
        temp.replace(f)
        results.append({"season":y,"targets":len(p)})
    print(json.dumps({"receivingExpectedTargets":results,"routesVerified":False}))
if __name__=="__main__": collect()

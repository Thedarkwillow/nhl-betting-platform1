#!/usr/bin/env python3
"""Historical offensive dropback participation, NOT route counts.
Source: FTN Data via nflverse (CC BY-SA 4.0). Private research.
"""
import json,gzip,re,datetime as dt
from pathlib import Path
from collections import Counter,defaultdict
ROOT=Path(__file__).resolve().parents[1]
def ids(v):
    if not isinstance(v,str): return None
    a=re.findall(r"00-\d{7}",v)
    if len(a)!=11 or len(set(a))!=11 or re.sub(r"00-\d{7}|[;,|\s]","",v): return None
    return a
def build(plays,participation):
    pmap=defaultdict(list)
    for p in participation: pmap[(p["nflverse_game_id"],p["play_id"])].append(p)
    counts=defaultdict(Counter); teams=Counter(); rejected=Counter(); used=Counter(); seen=set()
    for r in plays:
        k=(r["game_id"],r["play_id"]); team=(r["game_id"],r["posteam"])
        if k in seen: raise ValueError("Duplicate PBP identity")
        seen.add(k);teams[team]+=1
        matches=pmap[k]
        if len(matches)!=1: rejected["missing_or_duplicate_participation"]+=1;continue
        p=matches[0]; a=ids(p.get("offense_players"))
        if not a or p.get("n_offense")!=11 or p.get("possession_team")!=r["posteam"]: rejected["invalid_offense_identity"]+=1;continue
        target=r.get("receiver_player_id")
        if target and target not in a: rejected["target_not_on_field"]+=1;continue
        used[team]+=1
        for player in a:
            counts[team][player]+=1
    rows=[]
    for (game,team),c in counts.items():
        if used[(game,team)]!=teams[(game,team)]: continue
        for player,snaps in c.items():
            rows.append({"gameId":game,"team":team,"playerId":player,"onFieldDropbacks":snaps,"teamDropbacks":teams[(game,team)],"actualRoutesVerified":False})
    return {"rows":rows,"fullTeamGames":sum(used[k]==v for k,v in teams.items()),"teamGames":len(teams),"rejections":dict(rejected)}
def main():
    import nflreadpy as nfl
    import polars as pl
    for season in (2024,2025):
        p=nfl.load_pbp(seasons=season).filter((pl.col("season_type")=="REG")&(pl.col("qb_dropback")==1)&(pl.col("two_point_attempt")==0)&pl.col("posteam").is_not_null()).select(["game_id","play_id","posteam","receiver_player_id"])
        a=nfl.load_participation(seasons=season).select(["nflverse_game_id","play_id","possession_team","offense_players","n_offense"])
        d=build(p.to_dicts(),a.to_dicts())
        if not d["rows"]: raise ValueError("No reconciled dropback participation")
        f=ROOT/"outputs/nfl/history"/str(season)/"receiver_dropback_participation.json.gz";f.parent.mkdir(parents=True,exist_ok=True)
        tmp=f.with_suffix(".tmp")
        with gzip.open(tmp,"wt",encoding="utf8") as out: json.dump({"sport":"NFL","retrospectivePlayerStatsNotPregameLines":True,"dataset":"receiver_dropback_participation","recordCount":len(d["rows"]),"collectedAt":dt.datetime.now(dt.timezone.utc).isoformat(),"source":"FTN Data via nflverse; CC BY-SA 4.0","researchOnly":True,**d},out,separators=(",",":"))
        tmp.replace(f)
        print(json.dumps({k:v for k,v in d.items() if k!="rows"}))
if __name__=="__main__": main()

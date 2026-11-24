#!/usr/bin/env python3
"""Bounded private research import. No metered API requests or raw redistribution.
Run with pyarrow installed, in a private checkout. Source rights must be reviewed
before publishing any derived product. Data are retrospective, not frozen offers.
"""
import argparse, hashlib, json, math, tempfile, os, sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen, Request
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parents[1]
BASE="https://github.com/sportsdataverse/sportsdataverse-data/releases/download/"
ASSETS={"box":("espn_nba_player_boxscores","player_box_{}.parquet"),
        "injury":("nba_stats_injury_report","injury_report_{}.parquet"),
        "crosswalk":("nba_crosswalk","nba_player_crosswalk_{}.parquet")}
EAST=ZoneInfo("America/New_York")
def ident(x):
    if isinstance(x,bool) or x is None: raise ValueError("missing ID")
    s=str(x)
    if not s.isdigit(): raise ValueError("invalid ID")
    return s
def number(x):
    if isinstance(x,bool) or x is None: raise ValueError("missing statistic")
    v=float(x)
    if not math.isfinite(v) or v<0: raise ValueError("invalid statistic")
    return v
def load(kind,season):
    import pyarrow.parquet as pq
    tag,name=ASSETS[kind]; url=BASE+tag+"/"+name.format(season)
    stage("download_"+kind,season,url=url)
    with urlopen(Request(url,headers={"User-Agent":"private-nba-research/1.0"}),timeout=60) as r:
        raw=r.read(48*1024*1024+1)
    if len(raw)>48*1024*1024: raise ValueError("asset too large")
    with tempfile.NamedTemporaryFile(suffix=".parquet") as f:
        f.write(raw);f.flush();rows=pq.read_table(f.name).to_pylist()
    stage("downloaded_"+kind,season,rows=len(rows),columns=sorted(rows[0]) if rows else [])
    return rows,{"url":url,"sha256":hashlib.sha256(raw).hexdigest(),"rows":len(rows)}
def stage(name,season,**details):
    r={"stage":name,"season":season,**details}
    print(json.dumps(r),flush=True)
    p=os.environ.get("NBA_IMPORT_DIAGNOSTICS")
    if p:
        with open(p,"a",encoding="utf-8") as f:f.write(json.dumps(r)+"\n")
def eastern_date(t):
    if not isinstance(t,datetime) or t.tzinfo is None: raise ValueError("missing tip timezone")
    return t.astimezone(EAST).date().isoformat()
def report_clock(t):
    if not isinstance(t,datetime) or t.tzinfo is not None: raise ValueError("expected naive Eastern report clock")
    a=t.replace(tzinfo=EAST,fold=0);b=t.replace(tzinfo=EAST,fold=1)
    if a.utcoffset()!=b.utcoffset(): raise ValueError("ambiguous report clock")
    return a.astimezone(timezone.utc).isoformat()
def normalize_boxes(raw,season):
    seen=set();games=defaultdict(list)
    for p in raw:
        if p["season"]!=season or p["season_type"]!=2: continue
        gid,player,team,opp=map(ident,(p["game_id"],p["athlete_id"],p["team_id"],p["opponent_team_id"]))
        key=(gid,player)
        if key in seen: raise ValueError("duplicate player-game")
        seen.add(key)
        if type(p["did_not_play"]) is not bool: raise ValueError("unknown participation")
        if p["did_not_play"]: continue
        mins=number(p["minutes"])
        if not 0<mins<=70 or type(p["starter"]) is not bool: raise ValueError("invalid played row")
        date=eastern_date(p["game_date_time"])
        if date!=str(p["game_date"])[:10]: raise ValueError("date mismatch")
        fields={"points":"points","rebounds":"rebounds","assists":"assists","threePointersMade":"three_point_field_goals_made","fga":"field_goals_attempted","fta":"free_throws_attempted","tov":"turnovers","orb":"offensive_rebounds"}
        stats={k:number(p[v]) for k,v in fields.items()}
        if any(v!=int(v) for v in stats.values()): raise ValueError("invalid count")
        games[gid].append(dict(gameId=gid,playerId=player,player=p["athlete_display_name"],teamId=team,opponentId=opp,team=p["team_abbreviation"],teamName=p["team_display_name"],opponent=p["opponent_team_abbreviation"],date=date,tip=p["game_date_time"].astimezone(timezone.utc).isoformat(),minutes=mins,starter=p["starter"],position=p["athlete_position_abbreviation"],teamScore=number(p["team_score"]),**stats))
    accepted=[]
    for gid,rows in games.items():
        teams={x["teamId"] for x in rows}
        if len(teams)!=2 or len({x["tip"] for x in rows})!=1: raise ValueError("ambiguous game")
        for team in teams:
            a=[r for r in rows if r["teamId"]==team]
            if len(a)<5 or sum(x["starter"] for x in a)!=5 or any(x["opponentId"] not in teams or x["opponentId"]==team for x in a): raise ValueError("incomplete team")
            total=sum(x["minutes"] for x in a)
            if total<235 or abs(total-(240+25*max(0,round((total-240)/25))))>6: raise ValueError("incomplete minutes")
            if sum(x["points"] for x in a)!=a[0]["teamScore"]: raise ValueError("incomplete scoring")
        accepted.extend(rows)
    if len(games)!=1230: raise ValueError("regular-season coverage not 1230 games: "+str(len(games)))
    return accepted
def crosswalk(raw,season):
    ids=defaultdict(set)
    for r in raw:
        if r["season"]!=season or r["nba_player_id"] is None or r["espn_athlete_id"] is None: continue
        ids[ident(r["nba_player_id"])].add(ident(r["espn_athlete_id"]))
    return {k:next(iter(v)) for k,v in ids.items() if len(v)==1}
def normalize_injuries(raw,season,ids):
    out=[]
    for r in raw:
        if r["season"]!=season: continue
        status=r["current_status"]
        pid=ids.get(str(r["person_id"])) if r["match_method"]=="exact" else None
        out.append(dict(date=str(r["game_date"])[:10],reportAt=report_clock(r["report_datetime"]),matchup=r["report_matchup"],teamName=r["team"],nbaGameId=r["game_id"],playerId=pid,status=status,notSubmitted=r["reason"]=="NOT YET SUBMITTED",identityMatched=pid is not None))
    return out
def main():
    p=argparse.ArgumentParser();p.add_argument("season",type=int,choices=[2025,2026]);p.add_argument("--private-research",action="store_true",required=True);a=p.parse_args()
    raw,b=load("box",a.season);stage("normalize_box",a.season);boxes=normalize_boxes(raw,a.season)
    stage("box_validated",a.season,rows=len(boxes),games=len({r["gameId"] for r in boxes}))
    raw,c=load("crosswalk",a.season);stage("normalize_crosswalk",a.season);ids=crosswalk(raw,a.season)
    raw,i=load("injury",a.season);stage("normalize_injury",a.season);inj=normalize_injuries(raw,a.season,ids)
    if not ids or not inj: raise ValueError("empty crosswalk or injury report season")
    doc={"kind":"nba_sdv_research_context_v1","season":a.season,"capturedAt":datetime.now(timezone.utc).isoformat(),"sources":[b,c,i],"boxScores":boxes,"injuries":inj,"prospectiveApproval":False,"redisplayRightsVerified":False,"providerNamespaceCrosswalkVerified":False}
    out=ROOT/"outputs/nba/private-context"/str(a.season)/(datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")+".json")
    out.parent.mkdir(parents=True,exist_ok=True)
    with out.open("x") as f:json.dump(doc,f,separators=(",",":"),allow_nan=False)
    print(json.dumps({"season":a.season,"games":len(set(r["gameId"] for r in boxes)),"boxRows":len(boxes),"injuryRows":len(inj),"mappedInjuryRows":sum(r["identityMatched"] for r in inj),"sourceHashes":[x["sha256"] for x in doc["sources"]],"prospectiveApproval":False}))
if __name__=="__main__":
    try: main()
    except Exception as e:
        stage("failed",sys.argv[1] if len(sys.argv)>1 else None,errorType=type(e).__name__,message=str(e)[:300])
        raise

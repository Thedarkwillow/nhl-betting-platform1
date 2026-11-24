#!/usr/bin/env python3
"""Private, noncommercial research mirror of NBA-derived game logs.
Not a source of official final timestamps or independently authenticated results.
The original dataset documents missing 2024-25 games and DNP exclusion.
"""
import argparse, hashlib, json, math, re, tempfile, os
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
import pyarrow.parquet as pq
REPO="cbratkovics/nba-game-logs"
API="https://huggingface.co/api/datasets/"+REPO
ROOT=Path(os.environ["RESEARCH_ARCHIVE_ROOT"]).resolve() if os.environ.get("RESEARCH_ARCHIVE_ROOT") else Path(__file__).resolve().parents[1]
SEASONS=("2023-24","2024-25","2025-26","2026-27")
EXPECTED={"2023-24":1230,"2024-25":1230,"2025-26":1230}
TEAM_ALIASES={"BRK":"BKN","GS":"GSW","NO":"NOP","NY":"NYK","SA":"SAS","SAN":"SAS","PHO":"PHX","UTAH":"UTA","WSH":"WAS"}
TEAM_CODES=set("ATL BOS BKN CHA CHI CLE DAL DEN DET GSW HOU IND LAC LAL MEM MIA MIL MIN NOP NYK OKC ORL PHI PHX POR SAC SAS TOR UTA WAS".split())
FIELDS={"points":"pts","rebounds":"reb","assists":"ast","threePointersMade":"fg3m","steals":"stl","blocks":"blk","turnovers":"tov"}
def team(x):
    s=str(x or "").upper()
    return TEAM_ALIASES.get(s,s)
def integer(x):
    if isinstance(x,bool) or x is None: raise ValueError("invalid integer")
    n=float(x)
    if not math.isfinite(n) or n!=int(n) or n<0: raise ValueError("invalid integer")
    return int(n)
def normalize(raw,season,at):
    seen=set(); games=defaultdict(list); excluded=0
    for p in raw:
        try:
            gid=str(integer(p["game_id"])).zfill(10)
            player=integer(p["player_id"]); date=str(p["game_date"])[:10]
            d=datetime.strptime(date,"%Y-%m-%d")
            start_year=d.year-(d.month<7)
            a,b=team(p["team"]),team(p["opponent"]); mins=float(p["minutes"])
            name=p["player_name"]
            if not re.fullmatch(r"002\d{7}",gid) or player<1 or date>=at[:10] or start_year!=int(season[:4]) or str(p["season"])!=season or a not in TEAM_CODES or b not in TEAM_CODES or a==b or not isinstance(name,str) or not name.strip() or not math.isfinite(mins) or not 0<mins<=70 or type(p["home"]) is not bool: raise ValueError("invalid appearance")
            counts={k:integer(p[v]) for k,v in FIELDS.items()}
            row={"gameId":int(gid),"gameDate":date,"playerId":player,"player":name,"team":a,"opponent":b,"home":p["home"],"minutes":mins,**counts}
            row.update(pointsReboundsAssists=counts["points"]+counts["rebounds"]+counts["assists"],pointsRebounds=counts["points"]+counts["rebounds"],pointsAssists=counts["points"]+counts["assists"],reboundsAssists=counts["rebounds"]+counts["assists"])
        except (KeyError,TypeError,ValueError,OverflowError):
            excluded+=1; continue
        k=(int(gid),player)
        if k in seen: raise ValueError("duplicate player-game")
        seen.add(k); games[int(gid)].append(row)
    accepted=[]
    for gid,rows in games.items():
        ts={r["team"] for r in rows}
        if len(ts)!=2 or len({r["gameDate"] for r in rows})!=1 or any(sum(r["team"]==t for r in rows)<5 for t in ts) or any(r["opponent"] not in ts or r["opponent"]==r["team"] for r in rows):
            excluded+=len(rows);continue
        accepted.extend(rows)
    if not accepted: raise ValueError("no validated mirror rows")
    return {"rows":accepted,"gameCount":len({r["gameId"] for r in accepted}),"excluded":excluded}
def fetch(url,limit):
    with urlopen(Request(url,headers={"User-Agent":"private-nba-research/1.0"}),timeout=40) as r:
        data=r.read(limit+1)
        if len(data)>limit: raise ValueError("source too large")
        return data
def main():
    p=argparse.ArgumentParser();p.add_argument("season",choices=SEASONS);args=p.parse_args()
    season=args.season
    meta=json.loads(fetch(API,2*1024*1024));rev=meta.get("sha","")
    if not re.fullmatch(r"[a-f0-9]{40}",rev): raise ValueError("unverified dataset revision")
    file="game_logs/game_logs_"+season+".parquet"
    url="https://huggingface.co/datasets/"+REPO+"/resolve/"+rev+"/"+file
    data=fetch(url,20*1024*1024)
    with tempfile.NamedTemporaryFile(suffix=".parquet") as tmp:
        tmp.write(data);tmp.flush();table=pq.read_table(tmp.name)
    at=datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")
    a=normalize(table.to_pylist(),season,at)
    doc={"kind":"nba_historical_mirror_research_v1","season":season,"capturedAt":at,"source":"Hugging Face "+REPO,"sourceUrl":url,"sourceRevision":rev,"sha256":hashlib.sha256(data).hexdigest(),"historicalAppearancesOnly":True,"officialFinalClockVerified":False,"independentlyOfficialVerified":False,"originalPlatformSettlementVerified":False,"seasonCompletenessVerified":False,"expectedRegularSeasonGames":EXPECTED.get(season),"mirrorObservedGameCountMatchesExpected":a["gameCount"]==EXPECTED.get(season),"sourceUse":"private noncommercial research only; upstream NBA rights not independently reviewed",**a}
    out=ROOT/"outputs/nba/history"/season/(at.replace("-","").replace(":","").replace(".","")+".json")
    out.parent.mkdir(parents=True,exist_ok=True)
    with out.open("x") as f:json.dump(doc,f,separators=(",",":"),allow_nan=False)
    print(json.dumps({"season":season,"games":a["gameCount"],"rows":len(a["rows"]),"excluded":a["excluded"],"officialIndependentVerification":False}))
if __name__=="__main__": main()

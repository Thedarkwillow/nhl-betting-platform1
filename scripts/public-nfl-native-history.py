#!/usr/bin/env python3
"""Public NFL source-native historical facts and ESPN-to-GSIS ID reconciliation.
nflverse player stats, schedules and weekly rosters; exclude FTN/participation.
Historical facts only; no reconstructed posted lines, active status, or app settlement."""
import hashlib,json,math,re,sys
from collections import defaultdict
from datetime import datetime,timezone
from pathlib import Path
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"research/pickfinder-public-nfl-v1"
SEASONS=(2024,2025,2026)
METRICS=("completions","attempts","passing_yards","passing_tds","passing_interceptions","carries","rushing_yards","rushing_tds","receptions","targets","receiving_yards","receiving_tds","fg_made","fg_att","pat_made","pat_att","kicking_points")
ATTRIBUTION={"source":"nflverse contributors, nflverse-data via nflreadpy","url":"https://github.com/nflverse/nflverse-data","license":"CC BY 4.0 (nflverse general license; excludes separately licensed datasets)","licenseUrl":"https://creativecommons.org/licenses/by/4.0/","changes":"Selected regular-season schedule, weekly GSIS/ESPN roster IDs, and player-game statistics; validated and normalized."}
def now():return datetime.now(timezone.utc).isoformat().replace("+00:00","Z")
def iso(s):return datetime.fromisoformat(s.replace("Z","+00:00"))
def team(x):return {"JAC":"JAX","WSH":"WAS","LA":"LAR","STL":"LAR","SD":"LAC","OAK":"LV","AZ":"ARI"}.get(str(x or "").upper(),str(x or "").upper())
def gsis(x):return isinstance(x,str) and re.fullmatch(r"\d{2}-\d{7}",x) is not None
def espn(x):return str(x) if re.fullmatch(r"\d+",str(x or "")) else None
def num(x):return type(x) in (int,float) and math.isfinite(x)
def kickoff(date,clock):
    try:
        d=datetime.strptime(str(date)+" "+str(clock),"%Y-%m-%d %H:%M").replace(tzinfo=ZoneInfo("America/New_York"))
        if d.utcoffset()!=d.replace(fold=1).utcoffset():return None
        return d.astimezone(timezone.utc).isoformat().replace("+00:00","Z")
    except (ValueError,TypeError):return None
def schedule(rows,season):
    out={}
    for r in rows:
        if r.get("season")!=season or r.get("game_type")!="REG":continue
        g=r.get("game_id");a,b=team(r.get("away_team")),team(r.get("home_team"));start=kickoff(r.get("gameday"),r.get("gametime"))
        if not isinstance(g,str) or not re.fullmatch(str(season)+r"_\d{1,2}_[A-Z]{2,3}_[A-Z]{2,3}",g) or not start or a==b or not re.fullmatch("[A-Z]{2,3}",a) or not re.fullmatch("[A-Z]{2,3}",b) or type(r.get("week")) is not int:continue
        if g in out:raise ValueError("duplicate game")
        out[g]={"gameId":g,"season":season,"week":r["week"],"away":a,"home":b,"startAt":start,"espnEventId":espn(r.get("espn")),"completedScoreObserved":num(r.get("away_score")) and num(r.get("home_score"))}
    if not out:raise ValueError("no native games")
    return out
def roster(rows,season):
    by=defaultdict(set)
    for r in rows:
        if r.get("season")!=season or not gsis(r.get("gsis_id")) or not espn(r.get("espn_id")) or not isinstance(r.get("full_name"),str) or type(r.get("week")) is not int or not re.fullmatch("[A-Z]{2,3}",team(r.get("team"))):continue
        by[(r["week"],r["gsis_id"])].add((espn(r["espn_id"]),team(r["team"]),r["full_name"]))
    out=[]
    for (w,g),matches in by.items():
        if len(matches)!=1:continue
        e,t,n=next(iter(matches));out.append({"season":season,"week":w,"gsisId":g,"espnId":e,"team":t,"name":n})
    return out
def history(rows,games,season,at):
    lookup=defaultdict(list)
    for g in games.values():
        if not g["completedScoreObserved"] or iso(g["startAt"])>=iso(at):continue
        lookup[(g["week"],g["home"],g["away"])].append(g);lookup[(g["week"],g["away"],g["home"])].append(g)
    out={};bad=set()
    for r in rows:
        if r.get("season")!=season or r.get("season_type")!="REG" or not gsis(r.get("player_id")):continue
        t,o=team(r.get("team") or r.get("recent_team")),team(r.get("opponent_team"));g=lookup.get((r.get("week"),t,o),[])
        if len(g)!=1 or r.get("game_id") not in (None,"",g[0]["gameId"]):continue
        g=g[0];k=(g["gameId"],r["player_id"])
        if k in out:bad.add(k);continue
        stats={m:r[m] for m in METRICS if num(r.get(m)) and int(r[m])==r[m]}
        if not stats:continue
        out[k]={"gameId":g["gameId"],"playerId":r["player_id"],"name":r.get("player_display_name"),"team":t,"opponent":o,"week":g["week"],"gameStartAt":g["startAt"],"stats":stats}
    return [x for k,x in out.items() if k not in bad]
def save(kind,doc):
    raw=(json.dumps(doc,ensure_ascii=False,sort_keys=True,separators=(",",":"),allow_nan=False)+"\n").encode()
    d=hashlib.sha256(raw).hexdigest();p=OUT/kind/(d+".json");p.parent.mkdir(parents=True,exist_ok=True)
    if not p.exists():
        with p.open("xb") as f:f.write(raw)
    return d
def prior(season):
    d=OUT/"season";out=[]
    for p in d.glob("*.json"):
        try:
            raw=p.read_bytes()
            if hashlib.sha256(raw).hexdigest()!=p.stem:continue
            x=json.loads(raw)
            if x.get("season")==season and x.get("kind")=="nflverse_public_native_history_v1":out.append(x)
        except (ValueError,OSError):continue
    return max(out,key=lambda x:x["observedAt"]) if out else None
def main():
    import nflreadpy as nfl
    import importlib.metadata
    report={}
    for season in SEASONS:
        old=prior(season)
        if old and season<2026 and old.get("completeHistoricalSeason") is True:
            report[str(season)]={"status":"cached","games":len(old["games"]),"playerRows":len(old["playerRows"]),"rosterIds":len(old["rosters"])};continue
        try:
            at=now();g=schedule(nfl.load_schedules(seasons=season).to_dicts(),season)
            r=roster(nfl.load_rosters_weekly(seasons=season).to_dicts(),season)
            s=history(nfl.load_player_stats(seasons=season,summary_level="week").to_dicts(),g,season,at)
            if not s or not r:raise ValueError("missing native evidence")
            complete=season<2026 and len(g)==272 and all(x["completedScoreObserved"] for x in g.values()) and len({x["gameId"] for x in s})==272
            doc={"kind":"nflverse_public_native_history_v1","season":season,"observedAt":now(),"attribution":ATTRIBUTION,"loaderVersion":importlib.metadata.version("nflreadpy"),"games":list(g.values()),"rosters":r,"playerRows":s,"completeHistoricalSeason":complete,"pregameRosterStatusVerified":False,"originalPlatformSettlementVerified":False}
            digest=save("season",doc);report[str(season)]={"status":"observed","games":len(g),"playerRows":len(s),"rosterIds":len(r),"completeHistoricalSeason":complete,"archiveDigest":digest}
        except Exception as e:report[str(season)]={"status":"pending","reason":type(e).__name__}
    # Same explicit provider ESPN ID from two sources, same team, same upcoming kickoff; never use names as IDs.
    matches=[]
    d=ROOT/"research/pickfinder-public-identity-v1/native-facts"
    nfl=prior(2026)
    if nfl:
        for p in sorted(d.glob("*.json")):
            try:
                raw=p.read_bytes()
                if hashlib.sha256(raw).hexdigest()!=p.stem:continue
                a=json.loads(raw)
                if a.get("sport")!="nfl" or a.get("source")!="espn:nfl":continue
                for g in a["events"]:
                    if g.get("status")!="pre" or iso(g["startAt"])<=iso(now()):continue
                    pair={team(t["abbr"]) for t in g["teams"]}
                    native=[x for x in nfl["games"] if x["espnEventId"]==g["eventId"] and {x["home"],x["away"]}==pair and abs((iso(x["startAt"])-iso(g["startAt"])).total_seconds())<=300]
                    if len(native)!=1:continue
                    n=native[0]
                    for e in a["roster"]:
                        cand=[x for x in nfl["rosters"] if x["week"]==n["week"] and x["espnId"]==e["playerId"] and x["team"]==team(e["team"]) and x["team"] in pair]
                        if len(cand)==1:matches.append({"espnEventId":g["eventId"],"gsisGameId":n["gameId"],"startAt":n["startAt"],"espnPlayerId":e["playerId"],"gsisPlayerId":cand[0]["gsisId"],"team":cand[0]["team"],"espnEvidenceDigest":p.stem,"pickfinderIdentityVerified":False})
            except (ValueError,KeyError,OSError,TypeError):continue
    matches=list({json.dumps(x,sort_keys=True):x for x in matches}.values())
    if matches:save("native-crosswalks",{"kind":"nfl_espn_gsis_crosswalk_v1","observedAt":now(),"rows":matches,"attribution":ATTRIBUTION,"pickfinderIdentityVerified":False})
    out={"kind":"public_nfl_native_history_health_v1","generatedAt":now(),"seasons":report,"espnGsisCandidateRows":len(matches),"paidRequests":0,"privateRepoUsed":False,"modelApproved":False}
    p=ROOT/"data/pickfinder-public-nfl-history-health.json";p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(out,indent=2)+"\n");print(json.dumps(out))
if __name__=="__main__":main()

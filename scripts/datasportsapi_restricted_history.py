#!/usr/bin/env python3
"""Bounded seven-day DataSportsAPI history and daily private archive.
Stats are source-verified candidates, never official settlement or frozen forecasts.
"""
import json,os,sys,re,urllib.parse
from datetime import datetime,timezone,timedelta
from collections import Counter,defaultdict
from pathlib import Path
from datasportsapi_esports_preflight import Client,fixture_valid,game_valid,lineup_valid,valid_id,stamp
CODES={"counter-strike":"CS2","counter-strike-2":"CS2","cs2":"CS2","counter-strike-global-offensive":"CS2","league-of-legends":"LOL","dota-2":"DOTA2","dota2":"DOTA2"}
def classify(c):
    if not isinstance(c,dict) or not valid_id(c.get("id")) or c.get("sport")!="esports":return None
    labels={re.sub(r"[^a-z0-9]+","-",str(c.get(k) or "").casefold()).strip("-") for k in ("name","slug")}
    hits={CODES[s] for s in labels if s in CODES}
    return next(iter(hits)) if len(hits)==1 else None
def collect(client,now,days):
    if days not in (2,7):raise ValueError("history_days")
    counts=Counter();excluded=Counter();out=[];fixtures={};bad=set();finished_by_title=defaultdict(list);completed_days=set()
    report={"kind":"datasportsapi_restricted_history_v1","daysRequested":days,"officialSettlementVerified":False,"originalOffersMatched":0,"rawRowsPublished":0,"modelPromoted":False,"paidEndpointsCalled":0}
    try:
        cats=client.get("/v2/categories?sport=esports").get("data")
        if not isinstance(cats,list):raise ValueError("category_contract")
        groups=defaultdict(set)
        for c in cats:
            t=classify(c)
            if t:groups[t].add(c["id"])
        titles={t:next(iter(ids)) for t,ids in groups.items() if len(ids)==1}
        report["classifiedTitles"]=sorted(titles)
        if not titles:raise ValueError("unrecognized_categories")
        for delta in reversed(range(days)):
            day=(now-timedelta(days=delta)).date().isoformat()
            for title,cid in sorted(titles.items()):
                if client.stopped or client.calls>=client.max_calls:break
                d=client.get("/v2/fixtures?"+urllib.parse.urlencode({"date":day,"sport":"esports","category":cid}))
                data=d.get("data");meta=d.get("meta")
                if not isinstance(data,list) or not isinstance(meta,dict):raise ValueError("fixture_contract")
                counts["titleDateQueries"]+=1
                if meta.get("hasNextPage") is False and meta.get("complete") is not False and meta.get("count")==len(data):completed_days.add((day,title))
                for f in data:
                    if not fixture_valid(f) or stamp(f["startTime"]).date().isoformat()!=day:excluded["invalid_fixture"]+=1;continue
                    key=f["id"];value=(title,f)
                    if key in fixtures and fixtures[key]!=value:bad.add(key)
                    fixtures[key]=value
        for key,(title,f) in fixtures.items():
            if key in bad:continue
            counts[title+":fixtures"]+=1
            if f["status"].get("type")=="finished" and stamp(f["startTime"])<now:finished_by_title[title].append(f)
        # Rotate titles rather than allowing one title to use the entire cap.
        queues={t:sorted(fs,key=lambda f:f["startTime"]) for t,fs in finished_by_title.items()}
        while any(queues.values()) and not client.stopped and client.calls<client.max_calls-1:
            for title in sorted(queues):
                if not queues[title] or client.stopped or client.calls>=client.max_calls-1:continue
                f=queues[title].pop(0);fid=f["id"];counts[title+":seriesAttempted"]+=1
                try:
                    gs=client.get(f"/v2/fixtures/{fid}/games").get("data")
                    if not isinstance(gs,list):raise ValueError("game_contract")
                    games=[g for g in gs if game_valid(g,now)]
                    ids=Counter(g["id"] for g in games);nums=Counter(g["number"] for g in games)
                    for g in sorted(games,key=lambda x:x["number"]):
                        if client.stopped or client.calls>=client.max_calls:break
                        if ids[g["id"]]!=1 or nums[g["number"]]!=1:excluded["ambiguous_game"]+=1;continue
                        doc=client.get(f"/v2/fixtures/{fid}/games/{g['id']}/lineups")
                        if lineup_valid(doc,g["id"]) is None:
                            d=doc.get("data")
                            if not isinstance(d,dict):reason="lineup_not_object"
                            elif not isinstance(doc.get("meta"),dict) or doc["meta"].get("gameId")!=g["id"]:reason="lineup_game_id_mismatch"
                            elif not all(isinstance(d.get(k),list) for k in ("home","away")):reason="lineup_side_shape"
                            elif not d["home"] or not d["away"]:reason="lineup_empty_side"
                            elif len(d["home"])!=5 or len(d["away"])!=5:reason="lineup_not_five_per_side"
                            else:reason="lineup_missing_identity_or_stats"
                            excluded[reason]+=1
                            counts[title+":incompleteLineups"]+=1
                            continue
                        batch=[]
                        for side in ("home","away"):
                            for p in doc["data"][side]:
                                stats={k:p[k] for k in ("kills","deaths","assists")}
                                for k,canonical in (("headshotKills","headshots"),("creepScore","last_hits" if title=="DOTA2" else "creep_score")):
                                    v=p.get(k)
                                    if type(v) is int and v>=0 and (k!="headshotKills" or v<=p["kills"]):stats[canonical]=v
                                batch.append({"providerPlayerId":str(p["player"]["id"]),"providerTeamId":str(f[side]["id"]),"name":str(p["player"].get("name") or "")[:120],**stats})
                                if "headshots" in stats:counts[title+":headshotRows"]+=1
                        out.append({"title":title,"providerFixtureId":str(fid),"providerGameId":str(g["id"]),"mapOrdinal":g["number"],"map":g.get("map"),"fixtureStartsAt":f["startTime"],"homeTeam":str(f["home"].get("name") or "")[:120],"awayTeam":str(f["away"].get("name") or "")[:120],"homeScore":(g.get("home") or {}).get("score"),"awayScore":(g.get("away") or {}).get("score"),"startsAt":g["startedAt"],"durationSeconds":g["durationSeconds"],"providerCompleted":True,"players":batch,"officialFinalVerified":False,"sourceRef":f"https://api.datasportsapi.com/v2/fixtures/{fid}/games/{g['id']}/lineups"})
                        counts[title+":completeGames"]+=1
                        counts[title+":playerGameRows"]+=10
                except ValueError as e:excluded[str(e) if str(e).startswith("http_") else "invalid_contract_or_limit"]+=1
    except ValueError as e:excluded[str(e) if str(e).startswith("http_") else "invalid_contract_or_limit"]+=1
    except Exception:excluded["source_unavailable"]+=1
    report.update(requests=client.calls,counts=dict(counts),excluded=dict(excluded),titleDateComplete=len(completed_days),fullHistoryVerified=False,status="sample_captured" if out else "no_verified_game_rows")
    return report,out
def main():
    key=os.environ.get("DATASPORTSAPI_API_KEY","").strip()
    if not key:print(json.dumps({"kind":"datasportsapi_restricted_history_v1","status":"missing_key","requests":0,"rawRowsPublished":0,"paidEndpointsCalled":0}));return
    root=Path(os.environ["RUNNER_TEMP"]).resolve();dest=Path(os.environ["DATASPORTS_RESTRICTED_OUTPUT"]).resolve()
    if dest.parent!=root:raise ValueError("restricted output path")
    now=datetime.now(timezone.utc);days=int(os.environ.get("DATASPORTS_HISTORY_DAYS","7"));report,rows=collect(Client(key,max_calls=40 if days==7 else 24),now,days)
    if rows:
        fd=os.open(dest,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,"w") as f:json.dump({"kind":"datasportsapi_restricted_game_archive_v1","observedAt":now.isoformat(),"source":"DataSportsAPI","report":report,"rows":rows,"publicRedistributionAllowed":False},f,allow_nan=False)
    print(json.dumps(report))
if __name__=="__main__":main()

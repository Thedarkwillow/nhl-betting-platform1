#!/usr/bin/env python3
"""Bounded authenticated read-only DataSportsAPI contract check.
No secret logging, paid endpoints, raw data publication or model approval.
"""
import json,os,time,urllib.request,urllib.error,urllib.parse
from datetime import datetime,timezone,timedelta
from collections import Counter
BASE="https://api.datasportsapi.com"
MAX_CALLS=12
def valid_id(x):return type(x) is int and x>0
def stamp(x):
    try:
        t=datetime.fromisoformat(x.replace("Z","+00:00"))
        return t.astimezone(timezone.utc) if t.tzinfo is not None else None
    except (ValueError,TypeError,AttributeError):return None
def fixture_valid(r):
    return isinstance(r,dict) and r.get("sport")=="esports" and valid_id(r.get("id")) and stamp(r.get("startTime")) is not None and isinstance(r.get("status"),dict) and all(isinstance(r.get(s),dict) and valid_id(r[s].get("id")) for s in ("home","away")) and r["home"]["id"]!=r["away"]["id"]
def game_valid(g,now):
    if not isinstance(g,dict) or not valid_id(g.get("id")) or not valid_id(g.get("number")) or g.get("status")!="finished" or g.get("winner") not in ("home","away"):return False
    t=stamp(g.get("startedAt"));d=g.get("durationSeconds")
    return t is not None and valid_id(d) and t+timedelta(seconds=d)<=now
def lineup_valid(doc,game_id):
    d=doc.get("data");m=doc.get("meta")
    if not isinstance(d,dict) or not isinstance(m,dict) or m.get("gameId")!=game_id:return None
    if not all(isinstance(d.get(s),list) and len(d[s])==5 for s in ("home","away")):return None
    players=d["home"]+d["away"]
    if not all(isinstance(p,dict) and isinstance(p.get("player"),dict) and valid_id(p["player"].get("id")) and all(type(p.get(k)) is int and p[k]>=0 for k in ("kills","deaths","assists")) for p in players):return None
    if len({p["player"]["id"] for p in players})!=10:return None
    fields=Counter()
    for p in players:
        if type(p.get("headshotKills")) is int and 0<=p["headshotKills"]<=p["kills"]:fields["headshotKills"]+=1
        if type(p.get("creepScore")) is int and p["creepScore"]>=0:fields["creepScore"]+=1
    return fields
class Client:
    def __init__(self,key):
        self.key=key;self.calls=0;self.stopped=False
    def get(self,path):
        if self.stopped or self.calls>=MAX_CALLS:raise ValueError("request_cap")
        if self.calls:time.sleep(6.5)
        self.calls+=1
        req=urllib.request.Request(BASE+path,headers={"Authorization":"Bearer "+self.key,"Accept":"application/json","User-Agent":"EsportsResearchContract/1.0"})
        # Do not forward credentials to redirects.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self,*args,**kwargs):return None
        try:
            with urllib.request.build_opener(NoRedirect()).open(req,timeout=20) as r:
                body=r.read(3_000_001)
            if len(body)>3_000_000:raise ValueError("response_cap")
            doc=json.loads(body)
            if not isinstance(doc,dict) or "data" not in doc:raise ValueError("response_contract")
            return doc
        except urllib.error.HTTPError as e:
            if e.code in (401,403,429) or 300<=e.code<400:self.stopped=True
            raise ValueError("http_"+str(e.code)) from None
def audit(client,now):
    report={"kind":"datasportsapi_esports_preflight_v1","status":"connected","fixturesRead":0,"upcomingFixtures":0,"finishedFixtures":0,"completedGames":0,"completeLineupMaps":0,"playerMapRows":0,"statCoverage":{},"errors":{},"fixturePaginationComplete":False,"historicalArchiveEnabled":False,"originalOffersMatched":0,"officialSettlementVerified":False,"rawRowsPublished":0,"paidEndpointsCalled":0,"modelPromoted":False}
    errors=Counter();stats=Counter();fixtures={}
    try:
        for delta in (0,1):
            if client.stopped:break
            day=(now-timedelta(days=delta)).date().isoformat()
            doc=client.get("/v2/fixtures?"+urllib.parse.urlencode({"date":day,"sport":"esports"}))
            if not isinstance(doc["data"],list):raise ValueError("fixture_contract")
            for r in doc["data"]:
                if fixture_valid(r):fixtures[r["id"]]=r
            report["fixturePaginationComplete"]=False # sample first pages, never assert full coverage
        report["fixturesRead"]=len(fixtures)
        finals=[r for r in fixtures.values() if r["status"].get("type")=="finished" and stamp(r["startTime"])<now]
        report["finishedFixtures"]=len(finals)
        report["upcomingFixtures"]=sum(r["status"].get("type")=="notstarted" for r in fixtures.values())
        for f in sorted(finals,key=lambda r:r["startTime"],reverse=True)[:3]:
            if client.stopped or client.calls>=MAX_CALLS-1:break
            try:
                doc=client.get(f"/v2/fixtures/{f['id']}/games")
                if not isinstance(doc["data"],list):raise ValueError("game_contract")
                games=[g for g in doc["data"] if game_valid(g,now)]
                ids=Counter(g["id"] for g in games);numbers=Counter(g["number"] for g in games)
                for g in games:
                    if ids[g["id"]]!=1 or numbers[g["number"]]!=1:continue
                    report["completedGames"]+=1
                    if client.stopped or client.calls>=MAX_CALLS:break
                    line=client.get(f"/v2/fixtures/{f['id']}/games/{g['id']}/lineups")
                    counts=lineup_valid(line,g["id"])
                    if counts is None:errors["incomplete_lineup"]+=1;continue
                    stats.update(counts);report["completeLineupMaps"]+=1;report["playerMapRows"]+=10
            except ValueError as e:errors[str(e) if str(e).startswith("http_") else "contract_or_limit"]+=1
            except Exception:errors["game_request_unavailable"]+=1
    except ValueError as e:errors[str(e) if str(e).startswith("http_") else "contract_or_limit"]+=1;report["status"]="connection_or_contract_failed"
    except Exception:errors["request_unavailable"]+=1;report["status"]="connection_or_contract_failed"
    report["errors"]=dict(errors);report["statCoverage"]=dict(stats);report["requests"]=client.calls
    return report
def main():
    key=os.environ.get("DATASPORTSAPI_API_KEY","").strip()
    if not key:
        print(json.dumps({"kind":"datasportsapi_esports_preflight_v1","status":"missing_key","requests":0,"paidEndpointsCalled":0,"rawRowsPublished":0}))
        return
    print(json.dumps(audit(Client(key),datetime.now(timezone.utc))))
if __name__=="__main__":main()

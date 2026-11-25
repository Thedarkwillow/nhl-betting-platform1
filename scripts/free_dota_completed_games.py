#!/usr/bin/env python3
"""Bounded no-key OpenDota result sample; not a platform settlement adapter."""
import json, time, urllib.error, urllib.request
from datetime import datetime,timezone
from collections import Counter
BASE="https://api.opendota.com/api"
def download(path,limit):
    req=urllib.request.Request(BASE+path,headers={"User-Agent":"EsportsResearchDataAudit/1.0","Accept":"application/json"})
    with urllib.request.urlopen(req,timeout=25) as r:
        data=r.read(limit+1)
    if len(data)>limit:raise ValueError("size")
    return json.loads(data)
def valid_id(x):return type(x) is int and x>0
def normalized(index,m,now):
    if not valid_id(index.get("match_id")) or m.get("match_id")!=index["match_id"]:return None
    if not all(valid_id(m.get(k)) and m[k]==index.get(k) for k in ("leagueid","radiant_team_id","dire_team_id","start_time","duration")):return None
    if m["radiant_team_id"]==m["dire_team_id"] or type(m.get("radiant_win")) is not bool or m["radiant_win"]!=index.get("radiant_win"):return None
    if m["start_time"]+m["duration"]>now or m["duration"]<600:return None
    players=m.get("players")
    if not isinstance(players,list) or len(players)!=10:return None
    if not all(valid_id(p.get("account_id")) for p in players) or len({p["account_id"] for p in players})!=10:return None
    slots=[p.get("player_slot") for p in players]
    if any(type(s)is not int for s in slots) or set(slots)!=set(range(5))|set(range(128,133)):return None
    markets=("kills","deaths","assists","last_hits")
    if not all(type(p.get(k))is int and p[k]>=0 for p in players for k in markets):return None
    # API supplies a single Dota game. No inferred best-of, ordinal, or full-series ID.
    return {"sourceGameId":str(m["match_id"]),"sport":"DOTA2","startsAt":m["start_time"],"endsAt":m["start_time"]+m["duration"],"playerRows":[{"playerId":str(p["account_id"]),**{k:p[k] for k in markets}} for p in players],"seriesScopeVerified":False,"platformSettlementVerified":False}
def audit(client=download,now=None,sleep=time.sleep):
    now=int(time.time()) if now is None else now;requests=0;out=[];reasons=Counter()
    try:
        requests+=1;index=client("/proMatches",2_000_000)
        if not isinstance(index,list):raise ValueError("index")
        eligible=[r for r in index if isinstance(r,dict) and valid_id(r.get("match_id")) and valid_id(r.get("start_time")) and valid_id(r.get("duration")) and r["start_time"]+r["duration"]<=now]
        seen=set()
        for item in sorted(eligible,key=lambda r:r["start_time"],reverse=True):
            mid=item["match_id"]
            if mid in seen:continue
            if len(seen)>=3:break
            seen.add(mid);sleep(1.2);requests+=1
            try:
                row=normalized(item,client(f"/matches/{mid}",5_000_000),now)
                if row:out.append(row)
                else:reasons["incomplete_or_conflicting_game"]+=1
            except urllib.error.HTTPError as e:
                reasons["http_"+str(e.code)]+=1
                if e.code in (403,429):break
            except Exception:reasons["response_unavailable"]+=1
    except Exception:reasons["index_unavailable"]+=1
    latest=max((r["endsAt"] for r in out),default=None)
    return {"kind":"free_dota_completed_game_audit_v1","freeRequests":requests,"completedGameStatRecords":len(out),"playerGameRows":sum(len(r["playerRows"]) for r in out),"latestCompletedAt":datetime.fromtimestamp(latest,timezone.utc).isoformat() if latest else None,"freshWithin24h":latest is not None and 0<=now-latest<=86400,"excluded":dict(reasons),"seriesScopeVerified":False,"originalOffersMatched":0,"officialSettlementVerified":False,"rawRowsPublished":0,"paidRequests":0}
if __name__=="__main__":print(json.dumps(audit()))

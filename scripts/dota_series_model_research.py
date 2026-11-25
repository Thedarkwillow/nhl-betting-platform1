"""Native series candidate history; no independent map ordinal or original offer claim."""
import json,urllib.parse,urllib.request,hashlib
from collections import defaultdict,Counter
from datetime import datetime,timezone
from esports_context_models import evaluate as context
from esports_scope_history import evaluate as scope
SQL="""SELECT m.match_id,m.series_id,m.series_type,m.leagueid,m.start_time,m.duration,m.radiant_team_id,m.dire_team_id,m.radiant_win,pm.account_id,pm.player_slot,pm.hero_id,pm.kills,pm.deaths,pm.assists,pm.last_hits
FROM matches m JOIN player_matches pm ON m.match_id=pm.match_id
WHERE m.leagueid>0 AND m.series_id>0 AND m.radiant_team_id>0 AND m.dire_team_id>0 AND m.start_time>=1735689600 AND m.start_time<1795564800 AND pm.account_id>0 ORDER BY m.match_id DESC LIMIT 30000"""
M=("kills","deaths","assists","last_hits")
def parse(raw):
    g=defaultdict(list);ex=Counter()
    for r in raw:
        try:
            if not all(type(r[k]) is int and r[k]>0 for k in ("match_id","series_id","leagueid","account_id","hero_id","start_time","duration","radiant_team_id","dire_team_id")):raise ValueError()
            if r["account_id"]==4294967295 or type(r["radiant_win"]) is not bool or r["radiant_team_id"]==r["dire_team_id"] or not 600<=r["duration"]<=14400 or r["player_slot"] not in (*range(5),*range(128,133)):raise ValueError()
            if not all(type(r[k]) is int and r[k]>=0 for k in M):raise ValueError()
            g[r["match_id"]].append(r)
        except (ValueError,TypeError,KeyError):ex["invalid"]+=1
    series=defaultdict(list);rows=[]
    for mid,a in g.items():
        if len(a)!=10 or len({r["account_id"] for r in a})!=10 or len({r["player_slot"] for r in a})!=10 or len({tuple(r[k] for k in ("series_id","series_type","leagueid","start_time","duration","radiant_team_id","dire_team_id","radiant_win")) for r in a})!=1:ex["incomplete_game"]+=1;continue
        x=a[0];teams=[x["radiant_team_id"],x["dire_team_id"]];day=datetime.fromtimestamp(x["start_time"],timezone.utc).date().isoformat()
        batch=[dict(event=str(mid),player=str(r["account_id"]),date=day,hero=str(r["hero_id"]),side="radiant" if r["player_slot"]<128 else "dire",team=str(teams[int(r["player_slot"]>=128)]),opponent=str(teams[1-int(r["player_slot"]>=128)]),hero_opponent=str(r["hero_id"])+"|"+str(teams[1-int(r["player_slot"]>=128)]),**{k:r[k] for k in M}) for r in a]
        rows.extend(batch);series[(x["leagueid"],x["series_id"])].append((x,batch))
    ordered=[];groups=0
    for k,gs in series.items():
        gs.sort(key=lambda z:z[0]["start_time"]);xs=[x for x,_ in gs]
        if len(gs) not in (2,3,4,5) or len({x["series_type"] for x in xs})!=1 or len({tuple(sorted((x["radiant_team_id"],x["dire_team_id"]))) for x in xs})!=1 or any(xs[i-1]["start_time"]+xs[i-1]["duration"]>xs[i]["start_time"] for i in range(1,len(xs))):continue
        if len({tuple(sorted((r["player"],r["team"]) for r in b)) for _,b in gs})!=1 or len({b[0]["date"] for _,b in gs})!=1:continue
        groups+=1
        for i,(_,b) in enumerate(gs,1):ordered.extend({**r,"event":str(k[0])+":"+str(k[1])+"|"+str(i)} for r in b)
    return rows,ordered,groups,dict(ex)
def main():
    try:
        req=urllib.request.Request("https://api.opendota.com/api/explorer?"+urllib.parse.urlencode({"sql":SQL}),headers={"User-Agent":"EsportsHistoricalResearch/1.0"})
        with urllib.request.urlopen(req,timeout=60) as r:raw=r.read(24_000_001)
        if len(raw)>24_000_000:raise ValueError("bound")
        a,b,g,ex=parse(json.loads(raw)["rows"])
        report={"status":"read","sha256":hashlib.sha256(raw).hexdigest(),"rows":len(a),"completeGames":len(a)//10,"chronologicalCandidateGroups":g,"excluded":ex,"singleGame":context(a,M,["hero","side","opponent","hero_opponent"]),"candidateScopes":[scope(b,M,ix) for ix in ((1,2),(1,2,3))]}
    except Exception as e:report={"status":"unavailable","reason":type(e).__name__}
    print(json.dumps({"kind":"dota_native_series_model_research_v1",**report,"independentMapOrdinalVerified":False,"positionVerified":False,"actualPropLines":0,"paidRequests":0,"rawRowsPublished":0,"modelPromoted":False}))
if __name__=="__main__":main()

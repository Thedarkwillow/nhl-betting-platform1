"""Private source-local archive history audit; no prop or settlement claims."""
import json,sys
from collections import Counter,defaultdict
from pathlib import Path
from datetime import date
from esports_scope_history import evaluate
from esports_context_models import evaluate as context
def audit(archives):
    games={};conflicts=set();pending=set()
    for a in archives:
        if a.get("kind")!="datasportsapi_restricted_game_archive_v1" or a.get("source")!="DataSportsAPI":continue
        for p in a.get("pendingLineups",[]):
            pending.add((str(p.get("fixture",{}).get("id")),str(p.get("game",{}).get("id"))))
        for g in a.get("rows",[]):
            key=(g.get("providerFixtureId"),g.get("providerGameId"))
            if g.get("providerCompleted") is not True or not all(isinstance(x,str) and x for x in key):continue
            if key in games and games[key]!=g:conflicts.add(key)
            else:games[key]=g
    rows=defaultdict(list);coverage=Counter();bad=Counter()
    for key,g in games.items():
        if key in conflicts:continue
        title=g.get("title");ps=g.get("players",[]);ordinal=g.get("mapOrdinal")
        if title not in ("CS2","LOL","DOTA2") or type(ordinal)is not int or ordinal<1 or len(ps)!=10 or len({p.get("providerPlayerId") for p in ps})!=10:continue
        day=str(g.get("fixtureStartsAt"))[:10]
        try:date.fromisoformat(day)
        except ValueError:continue
        if any(not p.get("providerPlayerId") or any(type(p.get(m))is not int or p[m]<0 for m in ("kills","deaths","assists")) for p in ps):continue
        for p in ps:
            row=dict(event=key[0]+"|"+str(ordinal),player=title+":"+p["providerPlayerId"],date=day,map=g.get("map"),**{m:p[m] for m in ("kills","deaths","assists")})
            for m in ("headshots","creep_score","last_hits"):
                if type(p.get(m))is int and p[m]>=0 and (m!="headshots" or p[m]<=p["kills"]):row[m]=p[m];coverage[title+":"+m]+=1
            rows[title].append(row)
    report={}
    for t,rs in rows.items():
        markets=("kills","deaths","assists")
        report[t]={"rows":len(rs),"dates":len({r["date"] for r in rs}),"players":len({r["player"] for r in rs}),"scopeTests":[evaluate(rs,markets,x) for x in ((1,),(2,),(1,2))],"headshots":evaluate(rs,("headshots",),(1,2)) if t=="CS2" else None}
    return {"kind":"datasportsapi_archive_model_readiness_v1","uniqueGameKeys":len(games),"conflictingGameKeys":len(conflicts),"pendingUnrecovered":len(pending-set(games)),"fieldCoverage":dict(coverage),"titles":report,"actualPropLines":0,"modelPromoted":False,"paidRequests":0,"rawRowsPublished":0}
if __name__=="__main__":
    root=Path(sys.argv[1]);docs=[]
    for p in sorted(root.glob("*.json"))[-60:]:
        if p.stat().st_size>8_000_000:raise ValueError("archive_size")
        docs.append(json.loads(p.read_text()))
    print(json.dumps(audit(docs)))

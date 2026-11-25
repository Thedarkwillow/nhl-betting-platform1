"""Bounded exact-ID and independent full-map historical overlap; no raw output.
HLTV directory and static export share lineage; Ektarr full score/KD is an
independent dataset representation, not an authoritative identity declaration.
"""
import json,sys
from collections import defaultdict,Counter
from pathlib import Path
from cs2_static_hltv_research import FILES,read,parse,fingerprints,norm
from cs2_ektarr_wide_history import load_pinned_history
from esports_context_models import evaluate

def target_backtest(rows,targets):
    selected=[r for r in rows if r['player'] in targets]
    # Prior dates only, fixed last-5/last-20/blend, with retrospective team/opponent context.
    # Target cohort was selected later, so this is NOT untouched future performance.
    report=evaluate(selected,('kills','deaths'),('team','opponent'))
    return {**report,'cohortSelectedRetrospectively':True,'identityNamespace':'hltv','actualOriginalLines':0,'prospectiveApproved':False}
def audit(review,static,other):
    target={str(x["components"][0]["hltvPlayerId"]) for x in review["playerEventCandidates"] if x["subjectType"]=="individual" and len(x["components"])==1}
    if len(target)>100:raise ValueError("target bound")
    targets={"hltv:"+x for x in target}
    direct=Counter(r["player"] for r in static if r["player"] in targets)
    sx,ox=fingerprints(static),fingerprints(other)
    pairs=defaultdict(set);reverse=defaultdict(set);series=defaultdict(set);conflicts=set()
    for k,aa in sx.items():
        bb=ox.get(k,[])
        if len(aa)!=1 or len(bb)!=1:continue
        for p in aa[0]:
            sig=lambda r:(r["teamScore"],r["kills"],r["deaths"])
            matches=[q for q in bb[0] if sig(q)==sig(p)]
            if len(matches)!=1 or sum(sig(q)==sig(p) for q in aa[0])!=1:continue
            q=matches[0];a,b=p["player"],q["player"];pairs[a].add(b);reverse[b].add(a)
            if not norm(p["alias"]) or norm(p["alias"])!=norm(q["alias"]):conflicts.add((a,b));continue
            series[a,b].add((p["event"].split("|")[0],q["event"].split("|")[0]))
    good={(a,b) for (a,b),v in series.items() if a in targets and (a,b) not in conflicts and len(pairs[a])==len(reverse[b])==1}
    repeated={(a,b) for a,b in good if min(len({x[0] for x in series[a,b]}),len({x[1] for x in series[a,b]}))>=2}
    return {"kind":"restricted_cs2_target_history_overlap_v1","targets":len(targets),"targetIdsWithStaticMapHistory":len(direct),"targetStaticMapRows":sum(direct.values()),"targetsWithAtLeast12StaticMaps":sum(v>=12 for v in direct.values()),"independentDatasetOneToOneCandidates":len({a for a,b in good}),"distinctSeriesCorroboratedCandidates":len({a for a,b in repeated}),"targetHistoricalBacktest":target_backtest(static,targets),"independentCandidateBacktest":{**evaluate([r for r in other if r["player"] in {b for a,b in repeated}],("kills","deaths"),("team","opponent")),"identityNamespace":"ektarr","candidateOnly":True,"actualOriginalLines":0},"authoritativeSteamLinksAdded":0,"modelPromoted":False,"rawRowsPublished":0,"paidRequests":0}
def main():
    review=json.loads(Path(sys.argv[1]).read_text())
    if review.get("kind")!="restricted_kashrock_hltv_identity_and_projection_candidate_review_v1":raise ValueError("review contract")
    data={n:read(n) for n in FILES};static,_=parse(data);other,_=load_pinned_history()
    print(json.dumps(audit(review,static,other)),flush=True)
if __name__=="__main__":main()

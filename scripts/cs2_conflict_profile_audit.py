"""Resolve conflict review inputs without equating aliases to identities.
Private candidate review only; no automatic registry mutation.
"""
import json,sys,re
from collections import defaultdict,Counter
from pathlib import Path
from cs2_ektarr_wide_history import load_pinned_history
def norm(x):return re.sub(r"[^a-z0-9]","",str(x or "").casefold())
def audit(registry,profiles,history):
    if registry.get("kind")!="esports_identity_registry_v1" or profiles.get("kind")!="restricted_hltv_steam_secondary_profile_review_v2":raise ValueError("source contract")
    aliases=defaultdict(set);teams=defaultdict(set)
    for r in history:
        if str(r.get("player","")).startswith("ektarr:"):
            pid=r["player"].split(":",1)[1];aliases[pid].add(r["alias"]);teams[pid].add(r.get("teamLabel",""))
    prof=defaultdict(list)
    for x in profiles["candidates"]:
        if norm(x.get("alias")):prof[norm(x["alias"])].append(x)
    review=[];counts=Counter()
    for l in registry["links"]:
        if l.get("status")!="conflict":continue
        a,b=l["left"],l["right"]
        if a[:2]!=["CS2","ektarr"] or b[:2]!=["CS2","steam64"]:raise ValueError("namespace")
        hits={x["hltvPlayerId"]:x for n in aliases[a[2]] for x in prof[norm(n)]}
        status="no_target_profile_alias_match"
        if len(hits)>1:status="ambiguous_target_profile_alias"
        if len(hits)==1:
            h=next(iter(hits.values()))
            status="profile_candidate_agrees" if h["steamIdCandidate"]==b[2] else "profile_candidate_disagrees"
        counts[status]+=1
        review.append({"ektarrId":a[2],"steam64Candidate":b[2],"historyAliases":sorted(aliases[a[2]]),"historyTeamLabels":sorted(teams[a[2]]-{""}),"registryEvidenceIds":l["evidenceIds"],"profileCandidates":[{"hltvId":h["hltvPlayerId"],"steam64Candidate":h["steamIdCandidate"],"source":h["secondaryProfile"]} for h in hits.values()],"reviewStatus":status,"authoritativeVerified":False})
    return {"kind":"restricted_cs2_conflict_profile_audit_v1","counts":dict(counts),"conflictsReviewed":len(review),"conflictsWithHistoryAlias":sum(bool(r["historyAliases"]) for r in review),"authoritativeConflictsResolved":0,"review":review,"rawRowsPublished":0,"modelPromoted":False}
def main():
    r,p,out=sys.argv[1:4];registry=json.loads(Path(r).read_text());profiles=json.loads(Path(p).read_text());history,_=load_pinned_history()
    result=audit(registry,profiles,history)
    with open(out,"x") as f:json.dump(result,f)
    print(json.dumps({k:v for k,v in result.items() if k!="review"}))
if __name__=="__main__":main()

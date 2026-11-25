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
def review_claims(registry,profiles,target,corroboration):
    # Verify coverage, stable IDs and exact existing evidence links; source reviews
    # are not automatically authoritative and do not certify the external pages.
    if target.get("kind")!="restricted_kashrock_hltv_identity_and_projection_candidate_review_v1" or corroboration.get("kind")!="restricted_cs2_conflict_public_account_review_v1":raise ValueError("review contract")
    targets={str(x["components"][0]["hltvPlayerId"]) for x in target["playerEventCandidates"] if x["subjectType"]=="individual" and len(x["components"])==1}
    candidates=profiles["candidates"]
    ids=[str(x["hltvPlayerId"]) for x in candidates]
    steam=[x["steamIdCandidate"] for x in candidates]
    if len(ids)!=len(set(ids)) or set(ids)!=targets or len(steam)!=len(set(steam)) or not all(re.fullmatch(r"7656119\d{10}",s) for s in steam):raise ValueError("profile uniqueness or scope")
    for x in candidates:
        if x.get("authoritativeLinkVerified") is not False or x.get("eligibleForHistoricalJoin") is not False or not str(x.get("secondaryProfile","")).startswith("https://"):raise ValueError("candidate provenance")
        if not str(x.get("hltvProfile","")).startswith("https://www.hltv.org/player/"+str(x["hltvPlayerId"])+"/"):raise ValueError("HLTV source mismatch")
    conflicts={(l["left"][2],l["right"][2]):l for l in registry["links"] if l["status"]=="conflict"}
    claims=corroboration["rows"];seen=set();counts=Counter()
    for x in claims:
        key=(x["ektarrId"],x["steam64Candidate"])
        if key in seen or key not in conflicts or x["sourceReportedSteam64"]!=key[1] or set(x["registryEvidenceIds"])!=set(conflicts[key]["evidenceIds"]):raise ValueError("conflict evidence mismatch")
        if x.get("authoritativeVerified") is not False or x.get("productionEligible") is not False or not str(x.get("sourceUrl","")).startswith("https://"):raise ValueError("conflict provenance")
        if x["reviewStatus"] not in ("professional_profile_account_agreement","nickname_account_agreement_only"):raise ValueError("claim status")
        seen.add(key);counts[x["reviewStatus"]]+=1
    if seen!=set(conflicts):raise ValueError("missing conflict claims")
    return {"targetProfileCoverage":len(targets),"distinctSteamCandidates":len(set(steam)),"conflictsWithArchivedAccountClaims":len(seen),"claimCounts":dict(counts),"authoritativeLinksAdded":0,"productionEligible":False}
def main():
    r,p,out=sys.argv[1:4];registry=json.loads(Path(r).read_text());profiles=json.loads(Path(p).read_text());history,_=load_pinned_history()
    result=audit(registry,profiles,history)
    if len(sys.argv)==6:
        target,corroboration=(json.loads(Path(p).read_text()) for p in sys.argv[4:6])
        result["archivedClaimValidation"]=review_claims(registry,profiles,target,corroboration)
    with open(out,"x") as f:json.dump(result,f)
    print(json.dumps({k:v for k,v in result.items() if k!="review"}))
if __name__=="__main__":main()

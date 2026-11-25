"""Restricted esports crosswalk and historical readiness audit.

No network, paid requests, raw logging or prediction publication. The manual
review is later than the original observation; it never retroactively verifies
an originally frozen forecast. Provider IDs are immutable and may remain null.
"""
import re
from collections import Counter,defaultdict
from datetime import datetime
GAMES={"CS":"CS2","CS2":"CS2","VAL":"VALORANT","VALORANT":"VALORANT","LOL":"LOL","DOTA":"DOTA2","DOTA2":"DOTA2","COD":"COD","CDL":"COD"}
def norm(v):return v.strip().casefold() if isinstance(v,str) else ""
def clock(v):
    try:
        t=datetime.fromisoformat(v.replace("Z","+00:00"))
        return t if t.tzinfo is not None else None
    except (ValueError,TypeError,AttributeError):return None
def scope(r,sport):
    from esports_result_contract import RULES
    if sport not in RULES or (GAMES.get(r.get("league")) or GAMES.get(r.get("sport")))!=sport:return None
    # Only explicit numbered units are scope candidates. Do not interpret a bare
    # full_game label as a complete series. Other titles still need real schema validation.
    market=r.get("market") or {}
    m=re.fullmatch(r"(kills|deaths|assists|headshots|creep_score|last_hits)_on_(map|maps|game|games)_([1-5](?:_[1-5])*)",norm(market.get("stat")))
    if not m or m[1] not in RULES[sport]:return None
    unit=m[2];maps=[int(x) for x in m[3].split("_")]
    if len(maps)!=len(set(maps)) or maps!=list(range(maps[0],maps[-1]+1)):return None
    if (unit in ("map","game"))!=(len(maps)==1):return None
    if sport in ("CS2","VALORANT","COD") and unit.startswith("game"):return None
    label=("map" if unit.startswith("map") else "game")+("s" if len(maps)>1 else "")+" "+("-".join(map(str,(maps[0],maps[-1]))) if len(maps)>1 else str(maps[0]))
    period=norm(market.get("period"))
    if period not in ("full_game",label):return None
    return m[1],maps
def resolve(r,fixtures):
    sport=GAMES.get(r.get("league")) or GAMES.get(r.get("sport"))
    p=r.get("player") or {};e=r.get("event") or {}
    start=clock(e.get("starts_at"));obs=clock(r.get("observed_at"))
    if not sport or start is None or obs is None or obs>=start or r.get("is_demo") is not False or r.get("source")!="underdog" or r.get("status")!="active":return []
    team,opponent,alias=map(norm,(p.get("team"),e.get("opponent"),p.get("name")))
    if not team or not opponent or team==opponent or not alias:return []
    return [f for f in fixtures if f.get("sport")==sport and clock(f.get("startsAt"))==start and set(map(norm,f.get("teams",[])))=={team,opponent} and alias in set(map(norm,f.get("rosterAliases",[]))) and f.get("matchEvidenceId") and all(str(f.get(k,"")).startswith("https://") for k in ("scheduleRef","rosterRef","matchRef"))]
def audit(archive,review,history=()):
    if archive.get("kind")!="restricted_independent_esports_research_v1" or review.get("kind")!="restricted_esports_manual_crosswalk_review_v1" or not archive.get("sourceDocumentSha256") or archive["sourceDocumentSha256"]!=review.get("sourceDocumentSha256"):raise ValueError("capture evidence mismatch")
    rows=archive.get("quarantinedSourceObservations",[])
    if len(rows)>5:raise ValueError("bounded review only")
    counts=Counter();reasons=Counter();samples=defaultdict(dict);duplicates=set();replays=[]
    for h in history:
        try:
            match,idx=h["event"].rsplit("|",1);key=(h["player"],match);i=int(idx)
            if i in samples[key]:duplicates.add(key)
            samples[key][i]=h
        except (KeyError,ValueError,AttributeError):continue
    for r in rows:
        counts["received"]+=1
        matches=resolve(r,review.get("matchEvidence",[]))
        if len(matches)!=1:reasons["missing_or_ambiguous_fixture"]+=1;continue
        f=matches[0];counts["fixtureRosterMatches"]+=1
        s=scope(r,f["sport"])
        if not s or max(s[1])>f.get("bestOf",0):reasons["unknown_or_invalid_scope"]+=1;continue
        counts["scopeCandidates"]+=1
        links=[x for x in review.get("playerEventLinks",[]) if x.get("sourceOfferId")==r.get("id") and x.get("providerPlayerId")==r.get("player",{}).get("id") and x.get("matchEvidenceId")==f["matchEvidenceId"] and norm(x.get("alias"))==norm(r.get("player",{}).get("name")) and x.get("market")==s[0] and x.get("maps")==s[1]]
        if len(links)!=1 or not re.fullmatch(r"\d{17}",str(links[0].get("steamIdCandidate",""))):reasons["missing_or_conflicting_player_link"]+=1;continue
        counts["steamCandidates"]+=1
        p=links[0]["steamIdCandidate"];prior=clock(r["observed_at"]).date().isoformat()
        prior_values=[]
        for key,maps in samples.items():
            if key[0]!=p or key in duplicates or not all(i in maps for i in s[1]):continue
            if all(isinstance(maps[i].get("date"),str) and maps[i]["date"]<prior and type(maps[i].get(s[0])) is int and maps[i][s[0]]>=0 for i in s[1]):prior_values.append((max(maps[i]["date"] for i in s[1]),key[1],sum(maps[i][s[0]] for i in s[1])))
        if len(prior_values)>=10:
            counts["candidateHistorySufficient"]+=1
            if links[0].get("steamIdIndependentlyVerified") is True:
                from esports_result_contract import threshold_replay
                replay=threshold_replay([v for _,_,v in sorted(prior_values)],r.get("line"))
                if replay:
                    counts["retrospectiveThresholdEvaluated"]+=1
                    replays.append(replay)
        if links[0].get("steamIdIndependentlyVerified") is not True:reasons["steam_identity_not_corroborated"]+=1
        else:reasons["late_review_not_original_freeze"]+=1
    return {"kind":"restricted_esports_crosswalk_audit_v1","counts":dict(counts),"excluded":dict(reasons),"aggregateHistoricalThresholdComparisons":{"higher":sum(x["historicalHigherCount"] for x in replays),"lower":sum(x["historicalLowerCount"] for x in replays),"ties":sum(x["historicalTieCount"] for x in replays),"notIndependentObservations":True,"calibratedProbability":None},"qualified":0,"originalForecastFrozen":False,"officialSettlementVerified":False,"rawRowsPublished":0,"paidRequests":0,"modelPromoted":False}

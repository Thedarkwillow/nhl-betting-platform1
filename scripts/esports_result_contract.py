"""Offline result-contract evaluation; no wagering, provider calls or publication.
Rules reference: https://help.underdogsports.com/en/articles/10905524-pick-em-scoring-esports
Only exact verified final statistics are evaluated. Platform settlement remains unknown.
"""
from collections import Counter
from math import isfinite
from statistics import mean
RULES={
 "CS2": {"kills","deaths","assists","headshots"},
 "VALORANT":{"kills","deaths","assists","headshots"},
 "LOL":{"kills","deaths","assists","creep_score"},
 "DOTA2":{"kills","deaths","assists","last_hits"},
 "COD":{"kills","deaths"},
}
def result(offer,final):
    sport=offer.get("sport");stat=offer.get("stat");maps=offer.get("maps")
    def pending(reason):return {"status":"pending","reason":reason,"platformSettlementVerified":False}
    if sport not in RULES or stat not in RULES[sport] or not isinstance(maps,list) or not maps or any(type(i)is not int or i<1 for i in maps) or len(set(maps))!=len(maps):return pending("scope")
    if not all(offer.get(k) for k in ("matchEvidenceId","verifiedPlayerId")) or offer.get("identityVerified") is not True or offer.get("scoringVerified") is not True:return pending("identity_or_scoring")
    if final.get("matchEvidenceId")!=offer["matchEvidenceId"] or final.get("sport")!=sport or final.get("sourceAuthorized") is not True or final.get("officialFinalVerified") is not True or not final.get("sourceRef"):return pending("final_evidence")
    if final.get("chronobreakResolved") is not True or final.get("scheduleDispositionVerified") is not True:return pending("special_rules")
    line=offer.get("line")
    if type(line) not in (int,float) or not isfinite(line):return pending("line")
    records=final.get("maps",[])
    if any(sum(r.get("index")==i for r in records)!=1 for i in maps):return pending("missing_or_duplicate_map")
    selected=[next(r for r in records if r.get("index")==i) for i in maps]
    if any(r.get("forfeit") is True for r in selected):return {"status":"void_candidate","reason":"forfeit","platformSettlementVerified":False}
    total=played=rounds=0
    for r in selected:
        if r.get("completed") is not True or r.get("forfeit") is not False:return pending("map_not_verified_complete")
        p=[p for p in r.get("players",[]) if p.get("id")==offer["verifiedPlayerId"]]
        if len(p)!=1:return pending("participation")
        p=p[0]
        if p.get("participationVerified") is not True:return pending("participation")
        if sport in ("CS2","VALORANT"):
            a,b=p.get("roundsPlayed"),r.get("roundsPlayed")
            if type(a)is not int or type(b)is not int or not 0<a<=b or r.get("overtimeIncluded") is not True:return pending("rounds_or_overtime")
            played+=a;rounds+=b
        elif p.get("playedFullMap") is not True:return pending("participation")
        v=p.get(stat)
        if type(v)is not int or v<0:return pending("missing_stat")
        total+=v
    if rounds and played*2<=rounds:return pending("participation_threshold")
    return {"status":"statistical_result","actual":total,"direction":"Higher" if total>line else "Lower" if total<line else "Tie","platformSettlementVerified":False}
def threshold_replay(values,line):
    if len(values)<10 or any(type(v)is not int or v<0 for v in values) or type(line) not in (int,float) or not isfinite(line):return None
    sample=values[-20:]
    n=len(sample)
    return {"n":n,"mean":mean(sample),"historicalHigherCount":sum(v>line for v in sample),"historicalLowerCount":sum(v<line for v in sample),"historicalTieCount":sum(v==line for v in sample),"calibratedProbability":None,"prospectiveForecast":False}

"""Offline CS2 identity, event and market gate. No network or raw output.

Crosswalks must be independently verified, dated before the observation, and
bound to both provider IDs. Names alone, approximate event matches and
observed future map choices do not establish identity or scope.
"""
from collections import Counter, defaultdict
from datetime import datetime, timezone
from statistics import mean
import re

MARKETS={"kills":"kills","deaths":"deaths","assists":"assists","headshots":"headshots"}
PERIODS={"map 1":(1,), "map 2":(2,), "maps 1-2":(1,2)}

def clock(v):
    try:
        t=datetime.fromisoformat(v.replace("Z","+00:00"))
        return t.astimezone(timezone.utc) if t.tzinfo is not None else None
    except (ValueError,TypeError,AttributeError):
        return None

def text(v):return isinstance(v,str) and bool(v.strip())

def evidence_at(r,cut):
    t=clock(r.get("verifiedAt"))
    return r.get("independentlyVerified") is True and text(r.get("evidenceRef")) and t is not None and t<=cut

def evaluate(archive,history,identity_links,event_links):
    if archive.get("kind")!="restricted_independent_esports_research_v1" or archive.get("publicRedistributionAllowed") is not False or archive.get("officialExportVerified") is not False:
        raise ValueError("restricted capture contract")
    missing=Counter();accepted=0;joined=0;market_counts=Counter()
    seen=Counter((r.get("provider"),r.get("providerOfferId"),r.get("providerRungId")) for r in archive["rows"])
    games=defaultdict(dict);bad=set()
    for h in history:
        try:
            match,index=h["event"].rsplit("|",1);idx=int(index)
            key=(h["player"],match)
            if idx in games[key]:bad.add(key)
            games[key][idx]=h
        except (KeyError,ValueError,AttributeError):continue
    for r in archive["rows"]:
        key=(r.get("provider"),r.get("providerOfferId"),r.get("providerRungId"))
        obs=clock(r.get("observedAt"));start=clock(r.get("startsAt"))
        if r.get("provider")!="UnderdogAPI" or r.get("sport")!="CS2" or r.get("productionEligible") is not False or r.get("officialExportVerified") is not False or seen[key]!=1 or obs is None or start is None or obs>=start:
            missing["capture_contract"]+=1;continue
        stat=MARKETS.get(str(r.get("stat","")).strip().casefold())
        scope=PERIODS.get(str(r.get("period","")).strip().casefold())
        if not stat or not scope or type(r.get("line")) not in (int,float) or not text(r.get("providerPlayerId")) or not text(r.get("providerEventId")):
            missing["market_scope_or_id"]+=1;continue
        p=[x for x in identity_links if x.get("provider")==r["provider"] and x.get("providerPlayerId")==r["providerPlayerId"] and evidence_at(x,obs) and re.fullmatch(r"\d{17}",str(x.get("steamId","")))]
        ids={x["steamId"] for x in p}
        if len(ids)!=1:missing["missing_or_conflicting_player_crosswalk"]+=1;continue
        steam=next(iter(ids))
        e=[x for x in event_links if x.get("provider")==r["provider"] and x.get("providerEventId")==r["providerEventId"] and evidence_at(x,obs) and x.get("startsAt")==r["startsAt"] and text(x.get("matchEvidenceId")) and x.get("scopeVerified") is True and x.get("maps")==list(scope)]
        if len(e)!=1 or steam not in e[0].get("verifiedSteamRoster",[]):missing["event_scope_or_roster_unverified"]+=1;continue
        accepted+=1
        samples=[]
        for (pid,match),maps in games.items():
            if pid!=steam or (pid,match) in bad or not all(i in maps for i in scope):continue
            cohort=[maps[i] for i in scope]
            if any(not text(h.get("date")) or h["date"]>=obs.date().isoformat() or type(h.get(stat)) is not int or h[stat]<0 for h in cohort):continue
            samples.append((max(h["date"] for h in cohort),match,sum(h[stat] for h in cohort)))
        samples.sort()
        if len(samples)<10:missing["insufficient_prior_complete_scope"]+=1;continue
        # Only aggregate evaluation readiness; no individual projection is published.
        estimate=mean([v for _,_,v in samples[-20:]])
        if estimate>=0:joined+=1;market_counts[stat]+=1
    return {"kind":"cs2_restricted_history_join_v1","received":len(archive["rows"]),"identity_event_scope_verified":accepted,"prior_history_ready":joined,"market_counts":dict(market_counts),"excluded":dict(missing),"minimum_prior_samples":10,"prior_dates_only":True,"actual_prop_outcomes_graded":0,"modelPromoted":False,"rawRowsPublished":0,"paidRequests":0}

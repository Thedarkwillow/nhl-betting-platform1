"""Conservative, prior-date-only team identity resolution for research."""
from collections import defaultdict,Counter
from datetime import date
def norm(x):return " ".join(x.strip().casefold().split()) if isinstance(x,str) else ""
def reconcile(rows):
    by_day=defaultdict(list);clusters=defaultdict(dict);counts=Counter();out=[]
    for r in rows:by_day[r["date"]].append(r)
    next_id=0
    for day in sorted(by_day):
        maps=defaultdict(list)
        for r in by_day[day]:maps[r["event"]].append(r)
        updates=[]
        for event,batch in sorted(maps.items()):
            sides=defaultdict(list)
            for r in batch:sides[r["team"]].append(r)
            if len(sides)!=2 or any(len(x)!=5 for x in sides.values()):counts["invalid_roster_map"]+=1;continue
            resolved={}
            for tid,ps in sorted(sides.items()):
                labels={norm(r.get("teamLabel")) for r in ps}
                label=next(iter(labels)) if len(labels)==1 else ""
                roster={p["player"] for p in ps}
                if not label or len(roster)!=5:
                    counts["missing_label_or_roster"]+=1;continue
                possible=[]
                for cid,(last_day,oldroster,oldids) in clusters[label].items():
                    age=(date.fromisoformat(day)-date.fromisoformat(last_day)).days
                    if 0<age<=90 and len(roster&oldroster)>=3:possible.append(cid)
                if len(possible)>1:
                    counts["ambiguous_roster_continuity"]+=1;continue
                if possible:
                    cid=possible[0];counts["prior_roster_links"]+=1
                    if tid not in clusters[label][cid][2]:counts["links_across_source_team_ids"]+=1
                else:
                    next_id+=1;cid="team_context:"+str(next_id);counts["new_roster_contexts"]+=1
                resolved[tid]=cid
                updates.append((label,cid,roster,tid))
            if len(resolved)!=2 or len(set(resolved.values()))!=2:counts["unresolved_map"]+=1;continue
            for r in batch:out.append({**r,"team":resolved[r["team"]],"opponent":resolved[r["opponent"]]})
        # Multiple observations of the same exact label/roster on one day are consolidated
        # only for future dates. No current-day data are used for predictions.
        grouped=defaultdict(list)
        for label,cid,roster,tid in updates:grouped[label,cid].append((roster,tid))
        for (label,cid),items in grouped.items():
            signatures={frozenset(r) for r,_ in items}
            if len(signatures)!=1:counts["conflicting_same_day_rosters"]+=1;continue
            prev=clusters[label].get(cid)
            ids=({tid for _,tid in items}|(prev[2] if prev else set()))
            clusters[label][cid]=(day,next(iter(signatures)),ids)
        # Consolidate new same-day identical roster clusters for future days only.
        for label,entries in clusters.items():
            same=defaultdict(list)
            for cid,(last,roster,ids) in entries.items():
                if last==day:same[roster].append(cid)
            for roster,cids in same.items():
                if len(cids)<2:continue
                keep=min(cids,key=lambda c:int(c.split(":")[-1]))
                ids=set().union(*(entries[c][2] for c in cids))
                entries[keep]=(day,roster,ids)
                for c in cids:
                    if c!=keep:del entries[c]
    return out,{"inputPlayerRows":len(rows),"resolvedContextRows":len(out),"counts":dict(counts),"sourceIdsOverwritten":False,"contextIdsOnly":True,"priorDatesOnly":True,"canonicalTeamIdsVerified":False}

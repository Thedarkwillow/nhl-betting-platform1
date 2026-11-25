"""Independent Steam demo/Kaggle overlap audit. Never manufacture identity links.
Only uniquely matched exact team KDA fingerprints are considered, with aliases
checked separately. No raw source rows or identity pairs are published.
"""
from collections import defaultdict,Counter
from cs2_cross_source_identity import norm,mapname,one_to_one
from cs2_ektarr_wide_history import load_pinned_history,SHA
import os,re,unicodedata,json
from pathlib import Path
from esports_identity_registry import build,write_exclusive
DEMO_REV='912a363098feec3f220e41d68634d2f71676c28b'
def compact_alias(s):return ''.join(c for c in unicodedata.normalize('NFKD',s).casefold() if c.isalnum())

MARKETS=("kills","deaths","assists")
def kda(r):
    vals=tuple(r.get(k) for k in MARKETS)
    return vals if all(type(x)is int and x>=0 for x in vals) else None

def group_maps(rows,demo):
    events=defaultdict(list)
    for r in rows:events[r["event"]].append(r)
    index=defaultdict(list);counts=Counter()
    for eid,rs in events.items():
        sides=defaultdict(list)
        for r in rs:sides[r.get("sourceTeamSlot") if demo else r.get("team")].append(r)
        if len(rs)!=10 or len(sides)!=2 or any(k is None or len(v)!=5 for k,v in sides.items()) or len({r["player"] for r in rs})!=10:continue
        if len({(r.get("date"),mapname(r.get("map")),r.get("rounds")) for r in rs})!=1:continue
        day,mp,n=rs[0].get("date"),mapname(rs[0].get("map")),rs[0].get("rounds")
        if not day or not mp or type(n)is not int:continue
        scores=rs[0].get("regulationScorePair") if demo else sorted(v[0].get("teamScore",-1) for v in sides.values())
        if not isinstance(scores,list) or len(scores)!=2 or any(type(x)is not int or x<0 for x in scores) or max(scores)!=13 or min(scores)>11 or sum(scores)!=n:continue
        sigs=[]
        for ps in sides.values():
            vals=[kda(p) for p in ps]
            if None in vals:break
            sigs.append((tuple(sorted(vals)),ps))
        if len(sigs)!=2:continue
        sigs.sort(key=lambda x:x[0])
        if sigs[0][0]==sigs[1][0]:
            counts["ambiguous_team_kda"]+=1;continue
        key=(day,mp,tuple(scores),tuple(s[0] for s in sigs))
        index[key].append((eid,sigs))
        counts["valid_regulation_maps"]+=1
    return index,counts

def audit(kaggle,demos,evidence_out=None):
    if evidence_out is None:evidence_out=[]
    ki,kc=group_maps(kaggle,False);di,dc=group_maps(demos,True)
    pairs=set();alias_pairs=set();links=defaultdict(set);counts=Counter();headshots=0
    # Date-free fingerprints diagnose timezone offsets only, never create links.
    from datetime import date
    datefree=defaultdict(list)
    demo_datefree=Counter(k[1:] for k,events in di.items() for _ in events)
    for k,events in ki.items():
        if len(events)==1:datefree[k[1:]].append(k)
    for key,events in di.items():
        if key in ki or len(events)!=1:continue
        adjacent=[k for k in datefree[key[1:]] if abs((date.fromisoformat(k[0])-date.fromisoformat(key[0])).days)==1]
        if len(adjacent)==1 and len(datefree[key[1:]])==1 and demo_datefree[key[1:]]==1:
            counts["unique_adjacent_date_boxscore_diagnostic"]+=1
            _,ha=ki[adjacent[0]][0];_,da=events[0]
            for (_,a),(_,b) in zip(ha,da):
                for p in a:
                    hits=[q for q in b if kda(q)==kda(p)]
                    if len(hits)!=1 or sum(kda(q)==kda(p) for q in a)!=1:continue
                    alias=norm(p.get("alias"));other=norm(hits[0].get("sourceAlias"))
                    counts["adjacent_date_exact_alias_candidates" if alias and alias==other else "adjacent_date_nonexact_alias_candidates"]+=1
        elif adjacent:counts["ambiguous_adjacent_date_boxscore_diagnostic"]+=1
    for key,ds in di.items():
        hs=ki.get(key,[])
        if len(ds)!=1 or len(hs)!=1:
            counts["ambiguous_or_absent_exact_map"]+=1;continue
        did,dr=ds[0];hid,hr=hs[0];counts["unique_full_boxscore_map_candidates"]+=1
        for (_,a),(_,b) in zip(hr,dr):
            by=defaultdict(list)
            for p in b:by[kda(p)].append(p)
            for p in a:
                hits=by[kda(p)]
                if len(hits)!=1 or sum(kda(q)==kda(p) for q in a)!=1:continue
                q=hits[0];pair=(p["player"],q["player"])
                alias=norm(p.get("alias"));other=norm(q.get("sourceAlias"))
                method="exact_demo_boxscore_alias" if alias and alias==other else "explicit_alias_conflict" if alias and other else "exact_demo_boxscore_missing_alias"
                if re.fullmatch(r"\d{17}",str(q["player"])) and p["player"].startswith("ektarr:"):
                    evidence_out.append({"left":{"sport":"CS2","namespace":"ektarr","id":p["player"].split(":",1)[1]},"right":{"sport":"CS2","namespace":"steam64","id":q["player"]},"method":method,"eventDate":key[0],"sourceEvents":[hid,did],"sourceRevisions":[SHA,DEMO_REV]})
                if method=="explicit_alias_conflict":
                    counts["explicit_alias_conflict"]+=1
                    if compact_alias(alias)==compact_alias(other):counts["format_only_conflict"]+=1
                    elif alias in other or other in alias:
                        counts["substring_conflict"]+=1
                        short,long=sorted((alias,other),key=len)
                        if len(short)>=3 and re.search(r"(?<![a-z0-9])"+re.escape(short)+r"(?![a-z0-9])",long):
                            counts["token_boundary_substring_conflict"]+=1
                            remainder=norm(long.replace(short,"",1));teams={norm(p.get("teamLabel")),norm(q.get("sourceTeamLabel"))}-{""}
                            if remainder and remainder in teams:counts["exact_team_label_affix_diagnostic"]+=1
                            else:counts["unexplained_token_affix_diagnostic"]+=1
                        else:counts["embedded_substring_conflict"]+=1
                    else:counts["distinct_alias_conflict"]+=1
                    continue
                pairs.add(pair);links[pair].add((hid,did))
                if alias and other and alias==other:alias_pairs.add(pair)
                if type(q.get("headshots"))is int and 0<=q["headshots"]<=q["kills"]:headshots+=1
    unique=one_to_one(pairs)
    return {"kind":"cs2_independent_steam_overlap_v1",
        "kaggleEligibleMaps":kc["valid_regulation_maps"],"demoEligibleMaps":dc["valid_regulation_maps"],
        "counts":dict(counts),"uniqueStatIdentityCandidates":len(unique),
        "exactAliasCorroboratedCandidates":len(unique&alias_pairs),
        "multipleIndependentMapCandidates":sum(len(links[p])>=2 for p in unique),
        "conflictingPairsExcluded":len(pairs-unique),"candidateHeadshotObservations":headshots,
        "verifiedAuthoritativeCrosswalk":False,"actualPropLines":0,"modelPromoted":False,"paidRequests":0,"rawRowsPublished":0}

def run(demos):
    import json
    rows,source_report=load_pinned_history()
    print(json.dumps({"kind":"cs2_native_namespace_audit_v1","directory":source_report.get("nativeDirectoryAudit",{}),"rawRowsPublished":0,"paidRequests":0}),flush=True)
    ev=[];report=audit(rows,demos,ev)
    print(json.dumps(report),flush=True)
    dest=os.environ.get("ESPORTS_IDENTITY_EVIDENCE_OUTPUT")
    if dest:
        p=Path(dest).resolve()
        if p.parent!=Path(os.environ["RUNNER_TEMP"]).resolve():raise ValueError("restricted_output")
        write_exclusive(p,{"kind":"esports_identity_evidence_v1","evidence":ev,"sourceRevisions":[SHA,DEMO_REV]})
        r=build([{"kind":"esports_identity_evidence_v1","evidence":ev}])
        print(json.dumps({k:v for k,v in r.items() if k!="links"}),flush=True)

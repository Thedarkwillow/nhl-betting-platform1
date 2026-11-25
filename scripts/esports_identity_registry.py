"""Append-only evidence registry. Candidates cannot become official identity links.
Names are labels, never global IDs; source namespace and sport are mandatory.
"""
import hashlib,json,re
from collections import defaultdict,Counter
from datetime import date,datetime,timezone
NAMESPACES={"CS2":{"ektarr","steam64","datasportsapi","underdog"},"LOL":{"chaincc","datasportsapi"},"DOTA2":{"opendota","datasportsapi"},"VALORANT":{"vct-reference"},"COD":{"cod-wiki"}}
METHODS={"exact_demo_boxscore_alias","exact_demo_boxscore_missing_alias","explicit_alias_conflict","source_native_observation"}
def key(v):
    if not isinstance(v,dict) or v.get("sport") not in NAMESPACES or v.get("namespace") not in NAMESPACES[v["sport"]]:raise ValueError("namespace")
    i=v.get("id")
    if not isinstance(i,str) or not i or len(i)>160 or any(ord(c)<32 for c in i):raise ValueError("source id")
    if v["namespace"]=="steam64" and not re.fullmatch(r"\d{17}",i):raise ValueError("steam64")
    return v["sport"],v["namespace"],i
def canonical(x):
    return json.dumps(x,sort_keys=True,separators=(",",":"),ensure_ascii=False,allow_nan=False)
def evidence(row):
    a,b=key(row["left"]),key(row["right"])
    if a[0]!=b[0] or a[1]==b[1]:raise ValueError("cross-sport or same namespace")
    method=row.get("method")
    if method not in METHODS:raise ValueError("method")
    day=row["eventDate"];date.fromisoformat(day)
    refs=row["sourceEvents"]
    if not isinstance(refs,list) or len(refs)!=2 or any(not isinstance(x,str) or not x or len(x)>256 for x in refs):raise ValueError("events")
    fingerprints=row["sourceRevisions"]
    if not isinstance(fingerprints,list) or len(fingerprints)!=2 or any(not isinstance(x,str) or not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}",x) for x in fingerprints):raise ValueError("provenance")
    x={k:row[k] for k in ("left","right","method","eventDate","sourceEvents","sourceRevisions")}
    # The same underlying event must not be counted twice simply because
    # a subsequent artifact or a subsequent run repeats it.
    return hashlib.sha256(canonical(x).encode()).hexdigest(),x
def build(documents):
    rows={};rejected=Counter()
    for doc in documents:
        if doc.get("kind")!="esports_identity_evidence_v1":continue
        for row in doc.get("evidence",[]):
            try:i,x=evidence(row);rows[i]=x
            except (ValueError,KeyError,TypeError):rejected["invalid_evidence"]+=1
    pairs=defaultdict(list);neighbors=defaultdict(set)
    for i,r in sorted(rows.items()):
        a,b=key(r["left"]),key(r["right"]);p=tuple(sorted((a,b)))
        pairs[p].append((i,r))
        if r["method"]!="explicit_alias_conflict":
            neighbors[a,b[1]].add(b);neighbors[b,a[1]].add(a)
    links=[];counts=Counter()
    for (a,b),rs in sorted(pairs.items()):
        agree=[(i,r) for i,r in rs if r["method"]=="exact_demo_boxscore_alias"]
        conflicts=[i for i,r in rs if r["method"]=="explicit_alias_conflict"]
        maps={tuple(r["sourceEvents"]) for i,r in agree}
        # Conservative: repeated map evidence still requires independent authoritative review.
        status="conflict" if conflicts or len(neighbors[a,b[1]])>1 or len(neighbors[b,a[1]])>1 else "multi_map_candidate" if len(maps)>=2 else "single_map_candidate" if maps else "stat_only_candidate"
        counts[status]+=1
        links.append({"left":list(a),"right":list(b),"status":status,"exactAliasMapCount":len(maps),"evidenceIds":[i for i,_ in rs],"authoritativeVerified":False,"productionEligible":False})
    return {"kind":"esports_identity_registry_v1","evidenceCount":len(rows),"counts":dict(counts),"rejected":dict(rejected),"links":links,"authoritativeLinks":0,"productionEligible":False,"rawRowsPublished":0}
def write_exclusive(path,doc):
    import os
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,"w") as f:f.write(canonical(doc)+"\n")

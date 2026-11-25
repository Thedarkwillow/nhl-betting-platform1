"""Verify existing NBA identity candidates against current primary ESPN rosters.
This is retrospective identity corroboration, never a dated availability proof.
"""
import json,sys,urllib.request,urllib.error,re,unicodedata
from pathlib import Path
from collections import Counter,defaultdict
def name(s):
    return re.sub(r"[^a-z0-9]","",unicodedata.normalize("NFKD",str(s)).encode("ascii","ignore").decode().casefold())
def get(team):
    url="https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/"+team.lower()+"/roster"
    req=urllib.request.Request(url,headers={"User-Agent":"NBAIdentityResearch/1.0","Accept":"application/json"})
    with urllib.request.urlopen(req,timeout=20) as f:raw=f.read(2_000_001)
    if len(raw)>2_000_000:raise ValueError("size")
    return json.loads(raw)
def players(doc,team):
    obj=doc.get("team",{})
    if str(obj.get("abbreviation","")).upper()!=team:return []
    out=[]
    def walk(x):
        if isinstance(x,list):
            for i in x:walk(i)
        elif isinstance(x,dict):
            if "id" in x and ("fullName" in x or "displayName" in x):
                out.append((str(x["id"]),name(x.get("fullName") or x.get("displayName"))))
            for key in ("items","athletes","athlete"):
                if key in x:walk(x[key])
    walk(doc.get("athletes",[]))
    return list(set(out))
def report(pending,candidates,fetch=get):
    if pending.get("kind")!="nba_reconstructed_pending_identity_review_v1" or candidates.get("kind")!="nba_reconstructed_manual_identity_candidates_v1":raise ValueError("archive contract")
    rows=pending.get("rows",[]);links=candidates.get("rows",[])
    byhash=defaultdict(list)
    for x in links:byhash[x["reconstructedIdentitySha256"]].append(x)
    pending_counts=Counter(x["reconstructedIdentitySha256"] for x in rows)
    native=defaultdict(set);reverse=defaultdict(set)
    for x in links:
        if x.get("nbaPlayerId") and x.get("espnAthleteId"):
            native[x["nbaPlayerId"]].add(x["espnAthleteId"])
            reverse[x["espnAthleteId"]].add(x["nbaPlayerId"])
    counts=Counter();cache={}
    for r in rows:
        h=r["reconstructedIdentitySha256"]
        if pending_counts[h]!=1 or len(byhash.get(h,[]))!=1:
            counts["duplicate_or_missing_identity_binding"]+=1;continue
        x=byhash[h][0]
        if not x.get("nbaPlayerId") or not x.get("espnAthleteId") or len(native[x["nbaPlayerId"]])!=1 or len(reverse[x["espnAthleteId"]])!=1:
            counts["cross_namespace_identity_conflict"]+=1;continue
        if not x or x.get("team")!=r.get("team") or x.get("nbaGameId")!=r.get("nbaGameId") or (r.get("nbaReportId") and r["nbaReportId"]!=x.get("nbaPlayerId")):counts["binding_mismatch"]+=1;continue
        team=r["team"]
        if team not in cache:
            try:cache[team]=players(fetch(team),team)
            except Exception:cache[team]=None
        roster=cache[team]
        if roster is None:counts["source_unavailable"]+=1;continue
        parts=[p.strip() for p in r["reportName"].split(",")]
        aliases={name(r["reportName"])}
        if len(parts)>1:
            aliases.add(name(parts[-1]+" "+" ".join(parts[:-1])))
            aliases.add(name(" ".join(parts[1:])+" "+parts[0]))
        matches=[(i,n) for i,n in roster if n in aliases]
        if len(matches)==1 and matches[0][0]==x.get("espnAthleteId"):counts["primary_espn_current_team_candidate_verified"]+=1
        elif len(matches)==1:counts["primary_id_conflict"]+=1
        else:counts["name_missing_or_ambiguous"]+=1
    return {"kind":"nba_pending_primary_identity_audit_v1","reconstructedPendingRows":len(rows),"candidateLinks":len(links),"counts":dict(counts),"freeRequests":len(cache),"originalImmutableRowsVerified":False,"originalPregameAvailabilityVerified":False,"freezeApproved":False,"paidRequests":0,"rawRowsPublished":0}
if __name__=="__main__":
    root=Path(sys.argv[1]);print(json.dumps(report(json.loads((root/"pending.json").read_text()),json.loads((root/"manual-identity-candidates.json").read_text()))))

"""Pinned upstream static export, aggregate research only.
https://github.com/OldFella/hltv_scraper (GPL code; underlying source-data rights
not independently established). Do not equate source-local IDs or names."""
import csv,hashlib,io,json,os,re,urllib.request
from collections import defaultdict,Counter
from datetime import date
from statistics import mean
from cs2_ektarr_wide_history import load_pinned_history,finished_score
from esports_opponent_strength import evaluate
REV="12a961fa6c684179c0551d2df7cca480f12fdbc7"
FILES={"matches.csv":(719433,"2d18722edb404991f78d77102fa4010162dd8f84"),"player_stats.csv":(9447555,"9c5394de262970ec4c26fe04cc87bd5f438482ac"),"players.csv":(20968,"7d286eef2fd28db996df670fd9f8049929d31cf1"),"teams.csv":(4586,"8c029a488035b8ea7252b11eae917b16b9119fd7"),"maps.csv":(78,"3466c1d481130af73eccbd7053e93f63dc70e5c8")}
MAP={"anb":"anubis","ovp":"overpass","anc":"ancient","d2":"dust2","mrg":"mirage","inf":"inferno","trn":"train","tcn":"cache","cbl":"cobblestone","nuke":"nuke","vtg":"vertigo"}
def norm(s):return re.sub("[^a-z0-9]","",str(s or "").lower())
def mp(s):return MAP.get(norm(s),norm(s).removeprefix("de"))
def read(n):
    size,sha=FILES[n];url=f"https://raw.githubusercontent.com/OldFella/hltv_scraper/{REV}/data/database/{n}"
    with urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"CS2HistoricalResearch/1.0"}),timeout=60) as f:raw=f.read(size+1)
    if len(raw)!=size or hashlib.sha1(("blob "+str(size)+"\0").encode()+raw).hexdigest()!=sha:raise ValueError("static blob mismatch")
    return list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
def parse(t):
    players={r["playerID"]:r["name"] for r in t["players.csv"]};teams={r["teamID"]:r["name"] for r in t["teams.csv"]};maps={r["mapID"]:mp(r["name"]) for r in t["maps.csv"]}
    m=defaultdict(list);p=defaultdict(list);ex=Counter();rows=[]
    for r in t["matches.csv"]:
        if r["mapID"]!="0" and r["sideID"]=="0":m[r["matchID"],r["mapID"]].append(r)
    for r in t["player_stats.csv"]:
        if r["mapID"]!="0" and r["sideID"]=="0":p[r["matchID"],r["mapID"]].append(r)
    for key,a in m.items():
        try:
            ps=p[key];day=a[0]["date"][:10];date.fromisoformat(day)
            if len(a)!=2 or len(ps)!=10 or len({r["playerID"] for r in ps})!=10 or len({r["date"] for r in a})!=1:raise ValueError()
            ids={r["teamID"] for r in a};scores={r["teamID"]:int(r["score"]) for r in a}
            if len(ids)!=2 or set(scores)!=ids or min(scores.values())<0 or not finished_score(*scores.values()) or Counter(x["teamID"] for x in ps)!=Counter({i:5 for i in ids}):raise ValueError()
            for r in ps:
                tid=r["teamID"];opp=next(x for x in ids if x!=tid);k,d=int(r["k"]),int(r["d"])
                if min(k,d)<0 or d>sum(scores.values()) or k>5*sum(scores.values()) or not players.get(r["playerID"]):raise ValueError()
            rows.extend(dict(event="|".join(key),matchId=key[0],player="hltv:"+r["playerID"],alias=players[r["playerID"]],date=day,map=maps[key[1]],team=r["teamID"],opponent=next(x for x in ids if x!=r["teamID"]),teamLabel=teams[r["teamID"]],teamScore=scores[r["teamID"]],rounds=sum(scores.values()),kills=int(r["k"]),deaths=int(r["d"])) for r in ps)
        except (KeyError,TypeError,ValueError):ex["invalid_or_incomplete_map"]+=1
    return rows,dict(ex)
def fingerprints(rows):
    g=defaultdict(list);ix=defaultdict(list)
    for r in rows:g[r["event"]].append(r)
    for eid,a in g.items():
        if len(a)!=10 or len({r["player"] for r in a})!=10:continue
        teams=defaultdict(list)
        for r in a:teams[r["team"]].append(r)
        if sorted(map(len,teams.values()))!=[5,5]:continue
        # Both complete team K/D distributions plus final score, same day and map.
        sig=tuple(sorted((rs[0]["teamScore"],tuple(sorted((x["kills"],x["deaths"]) for x in rs))) for rs in teams.values()))
        if sig[0]==sig[1]:continue
        ix[(a[0]["date"],mp(a[0]["map"]),sig)].append(a)
    return ix
def compare(a,b,require_hltv_id=False):
    x,y=fingerprints(a),fingerprints(b);agree=defaultdict(set);bad=set();c=Counter();links=defaultdict(set);rev=defaultdict(set)
    for k,aa in x.items():
        bb=y.get(k,[])
        if len(aa)!=1 or len(bb)!=1:continue
        if require_hltv_id and aa[0][0].get("matchId")!=bb[0][0].get("matchId"):continue
        c["exact_unique_full_map"]+=1
        for r in aa[0]:
            h=[q for q in bb[0] if q["teamScore"]==r["teamScore"] and q["kills"]==r["kills"] and q["deaths"]==r["deaths"]]
            if len(h)!=1 or sum(q["teamScore"]==r["teamScore"] and q["kills"]==r["kills"] and q["deaths"]==r["deaths"] for q in aa[0])!=1:continue
            q=h[0];p=(r["player"],q["player"]);links[p[0]].add(p[1]);rev[p[1]].add(p[0])
            if norm(r["alias"]) and norm(r["alias"])==norm(q["alias"]):agree[p].add((r["event"],q["event"]));c["exact_alias_kd_candidates"]+=1
            else:bad.add(p);c["alias_conflict_observations"]+=1
    good={p for p,v in agree.items() if p not in bad and len(links[p[0]])==len(rev[p[1]])==1}
    return {"mapMatches":c["exact_unique_full_map"],"aliasCandidateObservations":c["exact_alias_kd_candidates"],"aliasConflictObservations":c["alias_conflict_observations"],"oneToOneCandidates":len(good),"repeatedMapCandidates":sum(len(agree[p])>=2 for p in good),"authoritativeLinksAdded":0}
def run(demos=None):
    t={n:read(n) for n in FILES};rows,ex=parse(t);days=sorted({r["date"] for r in rows});a,_=load_pinned_history()
    # Demo teams have native slots, scores reconstructed separately. Exact
    # HLTV match-ID is checked as additional evidence; no alias-only promotion.
    d=[]
    for r in demos or []:
        slot=r.get("sourceTeamSlot");scores=r.get("regulationScorePair")
        # Cannot recover which slot owns each sorted score without unsorted score evidence.
        if type(r.get("teamScore")) is not int:continue
        d.append({**r,"matchId":r["event"].rsplit("|",1)[0],"team":str(slot),"alias":r.get("sourceAlias"),"teamScore":r["teamScore"]})
    out={"kind":"cs2_static_hltv_research_v1","sourceRevision":REV,"rows":len(rows),"completeMaps":len(rows)//10,"players":len({r["player"] for r in rows}),"dates":len(days),"dateMin":days[0] if days else None,"dateMax":days[-1] if days else None,"excluded":ex,"kaggleOverlap":compare(rows,a),"steamOverlap":compare(rows,d,require_hltv_id=True),"opponentRoundModel":evaluate(rows,("kills","deaths"),"rounds"),"headshotsAvailable":False,"mapOrdinalVerified":False,"sourceRightsIndependentlyVerified":False,"paidRequests":0,"rawRowsPublished":0,"modelPromoted":False}
    print(json.dumps(out),flush=True)
    return out
if __name__=="__main__":run()

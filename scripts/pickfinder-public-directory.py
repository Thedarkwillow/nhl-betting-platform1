"""Read-only, resumable crawl of linked public sporting pages; no paid endpoints."""
import os,sys,json,hashlib,time,re,runpy,urllib.request,urllib.error,subprocess
from pathlib import Path
from tempfile import TemporaryDirectory
from collections import defaultdict
from datetime import datetime,timezone
from urllib.parse import urlsplit,urljoin,parse_qs,urlencode
M=runpy.run_path(str(Path(__file__).with_name("pickfinder-free-research.py")))
BASE=M["BASE"]
SPORTS={"nba","nhl","nfl","cs2","valorant","dota-2","league-of-legends","lol","call-of-duty","cod"}
ALLOWLIST_VERSION=2
CLASSIC_ROUTES={"defense-vs-position","soft-spots","team-rankings"}
ADDITIONAL_RESEARCH={
    "college-basketball":CLASSIC_ROUTES, "college-football":CLASSIC_ROUTES, "wnba":CLASSIC_ROUTES,
    "soccer":{"defense-vs-position","goalie-saves","match-environment","players","prop-results","shot-ladder","tackles-and-fouls"},
    "tennis":{"ace-matchups","court-speed","market-beaters","players","prop-line-record","serve-return-map","total-games"},
}
ROLE_SPORTS={"dota-2","league-of-legends","lol"}
RESEARCH={"defense-vs-position","soft-spots","team-rankings","fragger-board","kill-environment","map-pool","map-pool-matrix","headshot-board","headshots","lan-lift","bloodiest-teams","champions","assist-board","assists","agents","first-bloods","heroes","map-and-mode-matrix","map-mode-matrix","mode-splits","players"}
def safe(href):
    u=urlsplit(urljoin(BASE,href))
    if u.scheme!="https" or u.netloc!=urlsplit(BASE).netloc or u.fragment:return None
    if u.path=="/free-research" and not u.query:return u.path
    p=u.path.strip("/").split("/")
    if len(p)<2 or p[0]!="leagues" or p[1] not in SPORTS and p[1] not in ADDITIONAL_RESEARCH or not all(re.fullmatch(r"[A-Za-z0-9_-]{1,160}",x) for x in p):return None
    allowed=ADDITIONAL_RESEARCH.get(p[1],RESEARCH)
    if p[1] in ROLE_SPORTS:allowed=allowed|{"defense-vs-role"}
    if len(p)==2 and not u.query:return u.path
    if len(p)==3 and not u.query and p[2] in allowed:return u.path
    if len(p)==3 and p[2]=="players" and "players" in allowed:
        q=parse_qs(u.query)
        if set(q)=={"page"} and len(q["page"])==1 and re.fullmatch(r"[1-9][0-9]{0,5}",q["page"][0]):return u.path+"?"+urlencode({"page":q["page"][0]})
    if len(p)==4 and p[2] in allowed and p[1] not in ADDITIONAL_RESEARCH and p[3] in ("all-events","top-tier") and not u.query:return u.path
    if len(p)==4 and p[2]=="players" and "players" in allowed and not u.query:return u.path
    return None
def priority(p):
    bits=p.split("?")[0].strip("/").split("/")
    return 0 if len(bits)<=2 else 1 if len(bits)==3 else 2
def league(p):
    return p.split("/")[2] if p.startswith("/leagues/") else "directory"

CORE_LEAGUES={"nba","nhl","nfl"}
PRIORITY_ESPORTS={"cs2","dota-2","valorant","league-of-legends","lol","call-of-duty","cod"}
def first_visit_rotation(pending,existing,attempt):
    # Keep every fourth request available for due refreshes. Use a distinct
    # one-in-eight slot for other linked leagues when they still have first visits.
    if (attempt+1)%8==6:
        return [p for p in pending if p not in existing and league(p) not in CORE_LEAGUES|PRIORITY_ESPORTS|{"directory"}]
    return []
def next_path(pending,existing,visited,attempt):
    if "/free-research" in pending:return "/free-research"
    # Reserve every fourth slot for due refreshes. If either lane is empty,
    # lend that slot to the other without increasing the request budget.
    refresh_turn=(attempt+1)%4==0
    lane=[p for p in pending if (p in existing)==refresh_turn] or pending
    rotation=first_visit_rotation(pending,existing,attempt)
    if rotation:return min(rotation,key=lambda p:(priority(p),visited.get(league(p),0),p))
    def rank(p):
        s=league(p)
        # Core and recently observed active boards first; round-robin within group.
        tier=0 if s=="directory" else 1 if s in CORE_LEAGUES else 2 if s in {"cs2","dota-2","valorant"} else 3
        return (priority(p),tier,visited.get(s,0),p)
    return min(lane,key=rank)
def extract(html,rel):
    p=M["parse"](html)
    # Explicit links only. No guessed URLs or account/action navigation.
    links=sorted({s for h in p.links if (s:=safe(h)) and s!=rel})
    return {"path":rel,"tables":p.tables,"playerDirectory":p.player_links,"links":links,"summary":M["summarize"](p)}
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*a,**kw):return None
def fetch(rel):
    if safe(rel)!=rel:raise ValueError("unsafe route")
    req=urllib.request.Request(BASE+rel,headers={"User-Agent":"Authorized PickFinder public research integration","Accept":"text/html"})
    with urllib.request.build_opener(NoRedirect()).open(req,timeout=20) as resp:
        if resp.status!=200 or resp.geturl()!=BASE+rel or "text/html" not in resp.headers.get("Content-Type",""):raise ValueError("response")
        raw=resp.read(8_000_001)
        if len(raw)>8_000_000:raise ValueError("size")
    return raw
def due_route(p,existing,now):
    if p not in existing:return True
    observed,doc=existing[p]
    # An expanded allowlist needs a fresh official root even inside the daily TTL.
    if p=="/free-research" and doc.get("routeAllowlistVersion")!=ALLOWLIST_VERSION:return True
    return (now-observed).total_seconds()>=(86400 if priority(p)<2 else 7*86400)

def main(root,budget=80):
    public=os.getenv('PICKFINDER_PUBLIC_DATA_AUTHORIZED')=='1'
    if public:
        if os.getenv('GITHUB_REPOSITORY')!='Thedarkwillow/nhl-betting-platform1' or subprocess.check_output(['git','-C',str(root),'remote','get-url','origin'],text=True).strip().rstrip('/') not in ('https://github.com/Thedarkwillow/nhl-betting-platform1','https://github.com/Thedarkwillow/nhl-betting-platform1.git'):raise ValueError('public destination')
    elif os.getenv('RESTRICTED_DESTINATION_VERIFIED')!='1' or not (root/'.git').exists():raise ValueError('restricted root')
    dest=root/'research'/('pickfinder-public-directory-v3' if public else 'pickfinder-public-directory-v2')
    if dest.is_symlink() or dest.parent.is_symlink():raise ValueError("symlink")
    dest.mkdir(parents=True,exist_ok=True)
    now=datetime.now(timezone.utc)
    existing,receipts,invalid=load_archive(dest)
    known=linked_routes(existing)
    first_observations=0
    refreshes=0
    rotation_attempts=0
    rotation_archived=0
    attempted=set();counts=defaultdict(lambda:{"pages":0,"tables":0,"rows":0,"playerLinks":0});failed=0;stopped=False;visited=defaultdict(int)
    def due(p):
        return due_route(p,existing,now)
    while len(attempted)<budget:
        pending=[p for p in known if p not in attempted and due(p)]
        if not pending:break
        rotation=first_visit_rotation(pending,existing,len(attempted))
        rel=next_path(pending,existing,visited,len(attempted))
        rotated=rel in rotation
        if rotated:rotation_attempts+=1
        visited[league(rel)]+=1
        attempted.add(rel)
        try:
            raw=fetch(rel);d=extract(raw.decode("utf-8"),rel)
            d.update(schema="pickfinder_public_directory_v2",routeAllowlistVersion=ALLOWLIST_VERSION,observedAt=datetime.now(timezone.utc).isoformat(),responseSha256=hashlib.sha256(raw).hexdigest(),modelInputsApproved=False)
            payload=json.dumps(d,sort_keys=True,separators=(",",":")).encode()
            if public and re.search(rb'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b(?:Bearer\s+\S+|github_pat_[A-Za-z0-9_]+|gh[pousr]_[A-Za-z0-9]+|eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)',payload,re.I):raise ValueError('sensitive text')
            with (dest/(hashlib.sha256(payload).hexdigest()+".json")).open("xb") as f:f.write(payload);f.flush();os.fsync(f.fileno())
            if rel in existing:refreshes+=1
            else:first_observations+=1
            if rotated:rotation_archived+=1
            known.update(d["links"]);existing[rel]=(datetime.fromisoformat(d["observedAt"]),d)
            sport=league(rel)
            a=counts[sport];a["pages"]+=1
            for key in ("tables","rows","playerLinks"):a[key]+=d["summary"][key]
        except urllib.error.HTTPError as e:
            failed+=1
            if e.code in (401,403,429):stopped=True;break
        except Exception:failed+=1
        time.sleep(1)
    print(json.dumps({"state":"public_directory_progress",**coverage(existing,receipts+first_observations+refreshes,invalid,now),
        "newlyArchivedPaths":first_observations,"refreshedPaths":refreshes,
        "rotationAttempts":rotation_attempts,"rotationArchived":rotation_archived,"attempted":len(attempted),
        "failures":failed,"stoppedOnRefusal":stopped,"bySport":dict(counts),"publicSportingPagesArchived":public}))

def load_archive(dest):
    existing={};receipts=0;invalid=0
    if dest.is_symlink() or dest.parent.is_symlink():raise ValueError("symlink")
    for f in sorted(dest.glob("*.json")):
        try:
            if f.is_symlink() or not f.is_file():raise ValueError("archive file")
            raw=f.read_bytes()
            if hashlib.sha256(raw).hexdigest()!=f.stem:raise ValueError("archive digest")
            d=json.loads(raw);p=d["path"];t=datetime.fromisoformat(d["observedAt"])
            if (d.get("schema")!="pickfinder_public_directory_v2" or d.get("modelInputsApproved") is not False
                or t.utcoffset() is None or safe(p)!=p or not isinstance(d.get("links"),list)
                or not all(isinstance(link,str) and safe(link)==link for link in d["links"])
                or not re.fullmatch(r"[a-f0-9]{64}",d.get("responseSha256",""))):
                raise ValueError("archive contract")
            receipts+=1
            if p not in existing or t>existing[p][0]:existing[p]=(t,d)
        except (OSError,ValueError,TypeError,KeyError):invalid+=1
    return existing,receipts,invalid

def linked_routes(existing):
    return {"/free-research"}.union(*(d["links"] for _,d in existing.values()))

def coverage(existing,receipts,invalid,now):
    known=linked_routes(existing)
    root_links=set(existing.get("/free-research",(None,{}))[1].get("links",[]))
    by_league=defaultdict(lambda:{"linked":0,"archived":0,"notYetArchived":0,"refreshDue":0})
    for p in sorted(known):
        a=by_league[league(p)];a["linked"]+=1
        if p not in existing:a["notYetArchived"]+=1
        else:
            a["archived"]+=1
            if due_route(p,existing,now):a["refreshDue"]+=1
    return {"knownPaths":len(known),"observedPaths":len(known & existing.keys()),
        "pendingOrRefreshDue":sum(due_route(p,existing,now) for p in known),
        "archivedDistinctPaths":len(existing),"unseenLinkedPaths":len(known-existing.keys()),
        "directIndexLinkedPaths":len(root_links),"directIndexArchivedPaths":len(root_links & existing.keys()),
        "archiveReceipts":receipts,"invalidArchiveReceipts":invalid,"coverageByLeague":dict(by_league),
        "allPagesCertified":False,"modelInputsApproved":False,"paidRequests":0,"rawHtmlPublished":False}

def audit(root):
    dest=root/"research"/"pickfinder-public-directory-v3"
    if not dest.is_dir():raise ValueError("archive unavailable")
    existing,receipts,invalid=load_archive(dest)
    print(json.dumps({"state":"public_directory_archive_readback",**coverage(existing,receipts,invalid,datetime.now(timezone.utc))}))
    if not receipts or invalid:raise ValueError("invalid or absent archive evidence")

def test():
    assert next_path(['/leagues/call-of-duty/players/a','/leagues/nhl/players/b'],{}, {},0)=='/leagues/nhl/players/b'
    assert next_path(['/leagues/nba/players/a','/leagues/nhl/players/b'],{}, {'nba':1},0)=='/leagues/nhl/players/b'
    assert safe("/leagues/cs2/players") == "/leagues/cs2/players"
    assert safe("/leagues/cs2/players/a?account=1") is None
    assert safe("/leagues/cs2/players?page=2")=="/leagues/cs2/players?page=2"
    assert safe("https://evil.example/leagues/cs2/players") is None
    assert safe("/leagues/cs2/headshots/all-events")=="/leagues/cs2/headshots/all-events"
    assert safe("/leagues/cs2/players/fixture")=="/leagues/cs2/players/fixture"
    index=json.loads((Path(__file__).resolve().parent.parent/"data"/"pickfinder-public-research-directory.json").read_text())
    assert index["kind"]=="pickfinder_public_research_directory_v1"
    assert all(safe(route)==route for route in index["researchRoutes"])
    assert safe("/leagues/nba/prop-line-record") is None
    assert safe("/leagues/college-football/players?foo=1") is None
    assert safe("/leagues/soccer/prop-results?token=1") is None
    assert safe("/leagues/tennis/players?page=2")=="/leagues/tennis/players?page=2"
    assert safe("/leagues/dota-2/defense-vs-role")=="/leagues/dota-2/defense-vs-role"
    now=datetime.now(timezone.utc)
    assert due_route("/free-research",{"/free-research":(now,{})},now)
    assert not due_route("/free-research",{"/free-research":(now,{"routeAllowlistVersion":ALLOWLIST_VERSION})},now)
    refresh="/leagues/nba/players"; new="/leagues/tennis/players/a"
    existing={refresh:(now,{"links":[new]})}
    assert next_path([refresh,new],existing,{},0)==new
    assert next_path([refresh,new],existing,{},3)==refresh
    assert next_path([new],existing,{},3)==new
    assert next_path([refresh],existing,{},0)==refresh
    assert next_path(["/free-research",new],existing,{},0)=="/free-research"
    cs="/leagues/cs2/players/a"; soccer="/leagues/soccer/players/a"
    both=[cs,soccer,new,refresh]
    assert next_path(both,existing,{},4)==cs
    assert next_path(both,existing,{"soccer":1},5)==new
    assert next_path(both,existing,{"tennis":1},5)==soccer
    assert next_path(both,existing,{},7)==refresh
    assert next_path([cs,refresh],existing,{},5)==cs
    assert next_path(["/free-research",*both],existing,{},5)=="/free-research"
    assert not first_visit_rotation(both,{**existing,new:(now,{}),soccer:(now,{})},5)
    report=coverage(existing,1,0,now)
    assert report["unseenLinkedPaths"]==2 and report["archivedDistinctPaths"]==1
    assert report["coverageByLeague"]["tennis"]["notYetArchived"]==1
    assert report["allPagesCertified"] is False and report["paidRequests"]==0
    with TemporaryDirectory() as temp:
        dest=Path(temp)
        d={"schema":"pickfinder_public_directory_v2","path":refresh,"observedAt":now.isoformat(),
           "responseSha256":"a"*64,"modelInputsApproved":False,"links":[new]}
        raw=json.dumps(d).encode()
        (dest/(hashlib.sha256(raw).hexdigest()+".json")).write_bytes(raw)
        (dest/("0"*64+".json")).write_bytes(raw)
        (dest/"symlink.json").symlink_to(dest/("0"*64+".json"))
        found,valid,invalid=load_archive(dest)
        assert valid==1 and invalid==2 and list(found)==[refresh]
    d=extract('<a href="/leagues/cs2/players/fixture">Player</a><a href="/account">Account</a><table><tr><th>Stat</th></tr><tr><td>2</td></tr></table>',"/leagues/cs2/players")
    assert d["links"]==["/leagues/cs2/players/fixture"] and d["summary"]["rows"]==2
if __name__=="__main__":
    try:
        if sys.argv[1]=="--test":test()
        elif sys.argv[1]=="--audit" and len(sys.argv)==3:audit(Path(sys.argv[2]).resolve())
        else:main(Path(sys.argv[1]).resolve())
    except Exception:print("Public directory crawl failed closed",file=sys.stderr);sys.exit(1)

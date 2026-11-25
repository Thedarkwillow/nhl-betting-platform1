"""Read-only, resumable crawl of linked public sporting pages; no paid endpoints."""
import os,sys,json,hashlib,time,re,runpy,urllib.request,urllib.error,subprocess
from pathlib import Path
from collections import deque,defaultdict
from datetime import datetime,timezone
from urllib.parse import urlsplit,urljoin,parse_qs,urlencode
M=runpy.run_path(str(Path(__file__).with_name("pickfinder-free-research.py")))
BASE=M["BASE"]
SPORTS={"nba","nhl","nfl","cs2","valorant","dota-2","league-of-legends","lol","call-of-duty","cod"}
RESEARCH={"defense-vs-position","soft-spots","team-rankings","fragger-board","kill-environment","map-pool","map-pool-matrix","headshot-board","headshots","lan-lift","bloodiest-teams","champions","assist-board","assists","agents","first-bloods","heroes","map-and-mode-matrix","map-mode-matrix","mode-splits","players"}
def safe(href):
    u=urlsplit(urljoin(BASE,href))
    if u.scheme!="https" or u.netloc!=urlsplit(BASE).netloc or u.fragment:return None
    if u.path=="/free-research" and not u.query:return u.path
    p=u.path.strip("/").split("/")
    if len(p)<2 or p[0]!="leagues" or p[1] not in SPORTS or not all(re.fullmatch(r"[A-Za-z0-9_-]{1,160}",x) for x in p):return None
    if len(p)==2 and not u.query:return u.path
    if len(p)==3 and not u.query and p[2] in RESEARCH:return u.path
    if len(p)==3 and p[2]=="players":
        q=parse_qs(u.query)
        if set(q)=={"page"} and len(q["page"])==1 and re.fullmatch(r"[1-9][0-9]{0,5}",q["page"][0]):return u.path+"?"+urlencode({"page":q["page"][0]})
    if len(p)==4 and p[2] in RESEARCH and p[3] in ("all-events","top-tier") and not u.query:return u.path
    if len(p)==4 and p[2]=="players" and not u.query:return u.path
    return None
def priority(p):
    bits=p.split("?")[0].strip("/").split("/")
    return 0 if len(bits)<=2 else 1 if len(bits)==3 else 2
def next_path(pending,existing,visited):
    core={"nba","nhl","nfl"}; observed_active={"cs2","dota-2","valorant"}
    def sport(p):return p.split("/")[2] if p.startswith("/leagues/") else "directory"
    def rank(p):
        s=sport(p)
        # Core and recently observed active boards first; round-robin within group.
        tier=0 if s=="directory" else 1 if s in core else 2 if s in observed_active else 3
        return (priority(p),tier,p in existing,visited.get(s,0),p)
    return min(pending,key=rank)
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
def main(root,budget=80):
    public=os.getenv('PICKFINDER_PUBLIC_DATA_AUTHORIZED')=='1'
    if public:
        if os.getenv('GITHUB_REPOSITORY')!='Thedarkwillow/nhl-betting-platform1' or subprocess.check_output(['git','-C',str(root),'remote','get-url','origin'],text=True).strip().rstrip('/') not in ('https://github.com/Thedarkwillow/nhl-betting-platform1','https://github.com/Thedarkwillow/nhl-betting-platform1.git'):raise ValueError('public destination')
    elif os.getenv('RESTRICTED_DESTINATION_VERIFIED')!='1' or not (root/'.git').exists():raise ValueError('restricted root')
    dest=root/'research'/('pickfinder-public-directory-v3' if public else 'pickfinder-public-directory-v2')
    if dest.is_symlink() or dest.parent.is_symlink():raise ValueError("symlink")
    dest.mkdir(parents=True,exist_ok=True)
    now=datetime.now(timezone.utc);existing={}
    for f in dest.glob("*.json"):
        try:
            raw=f.read_bytes()
            if f.is_symlink() or hashlib.sha256(raw).hexdigest()!=f.stem:continue
            d=json.loads(raw);p=d["path"];t=datetime.fromisoformat(d["observedAt"])
            if safe(p)==p and (p not in existing or t>existing[p][0]):existing[p]=(t,d)
        except Exception:continue
    known={"/free-research"}
    for _,d in existing.values():known.update(p for p in d.get("links",[]) if safe(p)==p)
    attempted=set();counts=defaultdict(lambda:{"pages":0,"tables":0,"rows":0,"playerLinks":0});failed=0;stopped=False;visited=defaultdict(int)
    def due(p):
        if p not in existing:return True
        # Directory and rankings refreshed daily, player details weekly. Resume unseen profiles first.
        age=(now-existing[p][0]).total_seconds()
        return age>=(86400 if priority(p)<2 else 7*86400)
    while len(attempted)<budget:
        pending=[p for p in known if p not in attempted and due(p)]
        if not pending:break
        rel=next_path(pending,existing,visited)
        visited[rel.split('/')[2] if rel.startswith('/leagues/') else 'directory']+=1
        attempted.add(rel)
        try:
            raw=fetch(rel);d=extract(raw.decode("utf-8"),rel)
            d.update(schema="pickfinder_public_directory_v2",observedAt=datetime.now(timezone.utc).isoformat(),responseSha256=hashlib.sha256(raw).hexdigest(),modelInputsApproved=False)
            payload=json.dumps(d,sort_keys=True,separators=(",",":")).encode()
            if public and re.search(rb'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b(?:Bearer\s+\S+|github_pat_[A-Za-z0-9_]+|gh[pousr]_[A-Za-z0-9]+|eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)',payload,re.I):raise ValueError('sensitive text')
            with (dest/(hashlib.sha256(payload).hexdigest()+".json")).open("xb") as f:f.write(payload);f.flush();os.fsync(f.fileno())
            known.update(d["links"]);existing[rel]=(datetime.fromisoformat(d["observedAt"]),d)
            sport=rel.split("/")[2] if rel.startswith("/leagues/") else "directory"
            a=counts[sport];a["pages"]+=1
            for key in ("tables","rows","playerLinks"):a[key]+=d["summary"][key]
        except urllib.error.HTTPError as e:
            failed+=1
            if e.code in (401,403,429):stopped=True;break
        except Exception:failed+=1
        time.sleep(1)
    pending=sum(due(p) for p in known)
    print(json.dumps({"state":"public_directory_progress","knownPaths":len(known),"observedPaths":sum(p in existing for p in known),"pendingOrRefreshDue":pending,"attempted":len(attempted),"failures":failed,"stoppedOnRefusal":stopped,"bySport":dict(counts),"allPagesCertified":False,"modelInputsApproved":False,"paidRequests":0,"publicSportingPagesArchived":public,"rawHtmlPublished":False}))
def test():
    assert next_path(['/leagues/call-of-duty/players/a','/leagues/nhl/players/b'],{}, {})=='/leagues/nhl/players/b'
    assert next_path(['/leagues/nba/players/a','/leagues/nhl/players/b'],{}, {'nba':1})=='/leagues/nhl/players/b'
    assert safe("/leagues/cs2/players") == "/leagues/cs2/players"
    assert safe("/leagues/cs2/players/a?account=1") is None
    assert safe("/leagues/cs2/players?page=2")=="/leagues/cs2/players?page=2"
    assert safe("https://evil.example/leagues/cs2/players") is None
    assert safe("/leagues/cs2/headshots/all-events")=="/leagues/cs2/headshots/all-events"
    assert safe("/leagues/cs2/players/fixture")=="/leagues/cs2/players/fixture"
    d=extract('<a href="/leagues/cs2/players/fixture">Player</a><a href="/account">Account</a><table><tr><th>Stat</th></tr><tr><td>2</td></tr></table>',"/leagues/cs2/players")
    assert d["links"]==["/leagues/cs2/players/fixture"] and d["summary"]["rows"]==2
if __name__=="__main__":
    try:
        if sys.argv[1]=="--test":test()
        else:main(Path(sys.argv[1]).resolve())
    except Exception:print("Public directory crawl failed closed",file=sys.stderr);sys.exit(1)

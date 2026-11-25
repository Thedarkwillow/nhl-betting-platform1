"""Read-only public research page contract. No credentials, bets or historical backdating."""
from html.parser import HTMLParser
from urllib.parse import urljoin,urlsplit
import json,sys,urllib.request,hashlib,os
from pathlib import Path
from datetime import datetime,timezone
BASE="https://www.pickfinder.app"
# Three verified examples; the directory discovers additional sport pages without guessing paths.
PILOT=["/leagues/nba/defense-vs-position","/leagues/cs2/fragger-board","/leagues/dota-2/heroes","/leagues/nhl/defense-vs-position","/leagues/nhl/soft-spots","/leagues/nhl/team-rankings"]
class Parser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.tables=[];self.table=None;self.row=None;self.cell=None;self.heading="";self.h=None;self.links=[]
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=="a" and attrs.get("href"):self.links.append(attrs["href"])
        if tag in ("h1","h2","h3"):self.h=[]
        if tag=="table" and self.table is None:self.table={"heading":self.heading,"rows":[]}
        if tag=="tr" and self.table is not None:self.row=[]
        if tag in ("td","th") and self.row is not None:self.cell={"kind":tag,"parts":[]}
    def handle_data(self,data):
        if self.h is not None:self.h.append(data)
        if self.cell is not None:self.cell["parts"].append(data)
    def handle_endtag(self,tag):
        if tag in ("h1","h2","h3") and self.h is not None:self.heading=" ".join(" ".join(self.h).split());self.h=None
        if tag in ("td","th") and self.cell is not None:
            self.row.append({"kind":self.cell["kind"],"value":" ".join(" ".join(self.cell["parts"]).split())});self.cell=None
        if tag=="tr" and self.row is not None:self.table["rows"].append(self.row);self.row=None
        if tag=="table" and self.table is not None:self.tables.append(self.table);self.table=None
def parse(html):
    p=Parser();p.feed(html);return p
def fetch(rel):
    u=urljoin(BASE,rel)
    if urlsplit(u).netloc!=urlsplit(BASE).netloc:raise ValueError("origin")
    req=urllib.request.Request(u,headers={"User-Agent":"PickFinder research integration (authorized read-only)"})
    with urllib.request.urlopen(req,timeout=20) as resp:
        if resp.geturl()!=u or resp.status!=200 or "text/html" not in resp.headers.get("Content-Type",""):raise ValueError("unexpected response")
        raw=resp.read(8_000_001)
        if len(raw)>8_000_000:raise ValueError("page size")
        return parse(raw.decode("utf-8"))
def summarize(p):
    return {"tables":len(p.tables),"rows":sum(len(t["rows"]) for t in p.tables),"headedTables":sum(bool(t["heading"]) for t in p.tables),"headerRows":sum(bool(t["rows"] and all(c["kind"]=="th" for c in t["rows"][0])) for t in p.tables)}
def main():
    if "--authorized" not in sys.argv:raise ValueError("authorization required")
    # Public pages only. Stop on refusal; no retries, no bypass and no paid API.
    directory=fetch("/free-research")
    listed={urlsplit(urljoin(BASE,l)).path for l in directory.links if urlsplit(urljoin(BASE,l)).netloc==urlsplit(BASE).netloc}
    out={}; snapshots=[]
    base=None
    if '--private-root' in sys.argv:
        root=Path(sys.argv[sys.argv.index('--private-root')+1]).resolve()
        if os.getenv('RESTRICTED_DESTINATION_VERIFIED')!='1' or not (root/'.git').exists():raise ValueError('private root')
        base=root/'research/pickfinder-free-research'
        if base.is_symlink() or base.parent.is_symlink():raise ValueError('symlink')
        base.mkdir(parents=True,exist_ok=True)
    # Discover listed sporting paths; never invent endpoints or attempt Pro-only routes.
    from collections import defaultdict,deque
    groups=defaultdict(deque)
    for rel in sorted(listed):
        bits=rel.strip("/").split("/")
        if len(bits)==3 and bits[0]=="leagues" and bits[1] in ("nba","nhl","nfl","cs2","dota-2","valorant","league-of-legends","lol","cod","mlb","wnba","college-football","college-basketball","soccer","tennis") and rel not in PILOT:groups[bits[1]].append(rel)
    additional=[]
    while groups:
        for sport in list(groups):
            if groups[sport]:additional.append(groups[sport].popleft())
            if not groups[sport]:del groups[sport]
    import time
    eligible=PILOT+additional
    for rel in eligible:
        if rel not in listed:out[rel]={"state":"not_listed"};continue
        p=fetch(rel);out[rel]={"state":"observed",**summarize(p)}
        time.sleep(0.5)
        record={"path":rel,"observedAt":datetime.now(timezone.utc).isoformat(),"tables":p.tables}
        snapshots.append(record)
        if base is not None:
            payload=json.dumps({'schema':'pickfinder_free_research_v1','snapshots':[record],'historicalFeaturesApproved':False},sort_keys=True).encode()
            with (base/(hashlib.sha256(payload).hexdigest()+'.json')).open('xb') as handle:
                handle.write(payload);handle.flush();os.fsync(handle.fileno())
    print(json.dumps({"kind":"pickfinder_public_research_probe","observedAt":datetime.now(timezone.utc).isoformat(),"pages":out,"discoveredLeagueResearchPaths":sum(1 for rel in listed if rel.startswith("/leagues/") and len(rel.strip("/").split("/"))==3),"historicalFeaturesApproved":False,"rawRowsPublished":0,"paidRequests":0}))
if __name__=="__main__":
    try:main()
    except Exception:print("Public research probe stopped without data disclosure",file=sys.stderr);sys.exit(1)

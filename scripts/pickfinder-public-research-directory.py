#!/usr/bin/env python3
"""Build a provenance-bearing route inventory from the official public research index.

Uses previously saved HTML for a single delivery snapshot. No authenticated
cookies, account elements, forecasts, lines, or published statistic values.
"""
from datetime import datetime
from hashlib import sha256
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit

ORIGIN = "https://www.pickfinder.app"
LEAGUE = re.compile(r"^/leagues/([a-z0-9-]+)(?:/[a-z0-9-]+)?/?$")
PLAYER = re.compile(r"^/leagues/([a-z0-9-]+)/players/([a-z0-9][a-z0-9-]{0,119})/?$")

class Links(HTMLParser):
    def __init__(self, body):
        super().__init__(convert_charrefs=True)
        self.links = set()
        self.title = ""
        self.in_title = False
        self.feed(body.decode("utf-8"))
    def handle_starttag(self, tag, attrs):
        if tag == "title":
            self.in_title = True
        if tag != "a":
            return
        u = urlsplit(dict(attrs).get("href") or "")
        if u.query or u.fragment or u.scheme and u.scheme != "https":
            return
        if u.netloc and u.netloc != "www.pickfinder.app":
            return
        if u.path.startswith("/leagues/"):
            self.links.add(u.path.rstrip("/"))
    def handle_data(self, data):
        if self.in_title:
            self.title += data
    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False

def inventory(directory, time):
    clock = datetime.fromisoformat(time.replace("Z", "+00:00"))
    if clock.utcoffset() is None:
        raise ValueError("observed clock requires timezone")
    source = (directory / "index.html").read_bytes()
    index = Links(source)
    if "Free Sports Betting Research" not in index.title:
        raise ValueError("not the public research index")
    routes = sorted(p for p in index.links if LEAGUE.fullmatch(p))
    directories = []
    for url in (p for p in routes if p.endswith("/players")):
        slug = url.split("/")[2]
        page = directory / (slug + ".html")
        item = {"league": slug, "sourceUrl": ORIGIN + url, "status": "not_read"}
        if page.is_file():
            body = page.read_bytes()
            listing = Links(body)
            count = re.search(r"\(([\d,]+) Players\)", listing.title)
            entries = sorted(p.removeprefix(url + "/") for p in listing.links
                             if (match := PLAYER.fullmatch(p)) and match[1] == slug)
            declared = int(count[1].replace(",", "")) if count else None
            status = ("listing_count_matches" if declared and declared == len(entries)
                      else "listed_routes_only" if entries else "listing_not_verified")
            item.update(status=status, declaredCount=declared, distinctPlayerLinks=len(entries),
                        sha256=sha256(body).hexdigest(), playerSlugs=entries)
        directories.append(item)
    return {"kind": "pickfinder_public_research_directory_v1", "observedAt": time,
            "sourceUrl": ORIGIN + "/free-research", "indexSha256": sha256(source).hexdigest(),
            "researchRoutes": routes, "directories": directories,
            "actualOfferIdentityVerified": False, "modelInputsApproved": False,
            "providerPublisherClaimsOnly": True, "paidApiRequests": 0}

if __name__ == "__main__":
    print(json.dumps(inventory(Path(sys.argv[1]), sys.argv[2]), separators=(",", ":")))

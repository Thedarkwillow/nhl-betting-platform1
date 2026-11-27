#!/usr/bin/env python3
"""Build scoped research-only context from index-linked PickFinder public tables."""
from hashlib import sha256
from html.parser import HTMLParser
from pathlib import Path
from datetime import datetime, timezone
import json
import re
import sys

class Tables(HTMLParser):
    def __init__(self, body):
        super().__init__(convert_charrefs=True)
        self.heading = self.tag = self.group = self.cell = self.row = self.table = None
        self.tables = []
        self.skipped = 0
        self.feed(body.decode("utf-8"))

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ("h1", "h2", "h3") and self.table is None:
            self.tag, self.heading = tag, []
        if tag == "table":
            if self.table is not None:
                self.table["valid"] = False
                return
            self.table = {"heading": " ".join("".join(self.heading or []).split()), "headers": [], "rows": [], "valid": True}
        elif self.table is not None:
            if tag in ("thead", "tbody", "tfoot"):
                self.group = tag
            if tag == "tr":
                self.row = []
            if tag in ("th", "td") and self.row is not None:
                if attrs.get("colspan", "1") != "1" or attrs.get("rowspan", "1") != "1":
                    self.table["valid"] = False
                self.cell = {"parts": [], "definition": attrs.get("title")}

    def handle_data(self, data):
        if self.cell is not None:
            self.cell["parts"].append(data)
        elif self.tag is not None:
            self.heading.append(data)

    def handle_endtag(self, tag):
        if tag == self.tag:
            self.tag = None
        if self.table is None:
            return
        if tag in ("th", "td") and self.cell is not None:
            value = " ".join("".join(self.cell["parts"]).split())
            self.row.append((value, self.cell["definition"]) if self.group == "thead" else value or None)
            if len(value) > 400 or re.search(r"(?:[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|<script|Bearer\s+)", value, re.I):
                self.table["valid"] = False
            self.cell = None
        if tag == "tr" and self.row is not None:
            if self.group == "thead":
                if self.table["headers"]:
                    self.table["valid"] = False
                self.table["headers"] = self.row
            elif self.group == "tbody":
                self.table["rows"].append(self.row)
            self.row = None
        if tag in ("thead", "tbody", "tfoot"):
            self.group = None
        if tag == "table":
            t, self.table = self.table, None
            heads = [x[0] for x in t["headers"]]
            if (t["valid"] and t["heading"] and len(heads) > 1 and all(heads) and
                t["rows"] and all(len(r) == len(heads) for r in t["rows"])):
                self.tables.append({"heading": t["heading"], "columns": heads,
                    "definitions": [x[1] for x in t["headers"]], "rows": t["rows"]})
            else:
                self.skipped += 1

def collect(index, inputs):
    if index["kind"] != "pickfinder_public_research_directory_v1":
        raise ValueError("unverified index")
    reports = []
    for path in index["researchRoutes"]:
        match = re.fullmatch(r"/leagues/([a-z0-9-]+)/([a-z0-9-]+)", path)
        if not match or match[2] == "players":
            continue
        file = inputs / ("_".join(match.groups()) + ".html")
        page = {"url": "https://www.pickfinder.app" + path, "league": match[1], "view": match[2],
                "status": "source_not_read", "tables": [], "tablesWithUnboundLayout": 0}
        if file.is_file():
            raw = file.read_bytes()
            result = Tables(raw)
            time = datetime.fromtimestamp(file.stat().st_mtime, tz=timezone.utc).isoformat(timespec="seconds")
            page.update(status="scoped_tables_observed" if result.tables else "no_structured_table",
                        observedAt=time, sourceSha256=sha256(raw).hexdigest(),
                        tables=result.tables, tablesWithUnboundLayout=result.skipped)
        reports.append(page)
    return {"kind": "pickfinder_public_research_tables_v1", "sourceIndexSha256": index["indexSha256"],
        "scope": "publisher_reference_tables_not_current_offer_evidence", "sources": reports,
        "exactModelInputsApproved": False, "independentPlayerIdentityVerified": False, "paidApiRequests": 0}

if __name__ == "__main__":
    print(json.dumps(collect(json.loads(Path(sys.argv[1]).read_text()), Path(sys.argv[2])), separators=(",", ":")))

#!/usr/bin/env python3
"""Build index.html and sw.js from src/ and missions/. Usage: python3 build.py"""
import glob, hashlib, json, os, sys
R = os.path.dirname(os.path.abspath(__file__))
rd = lambda p: open(os.path.join(R, p), encoding="utf-8").read()
safe = lambda s: s.replace("</", "<\\/")
reg = json.loads(rd("missions/regions.json"))
ms = []
for f in sorted(glob.glob(os.path.join(R, "missions", "*", "*.json"))):
    m = json.load(open(f, encoding="utf-8"))
    folder = os.path.basename(os.path.dirname(f))
    if m.get("region") != folder:
        sys.exit(f"{f}: region '{m.get('region')}' does not match folder '{folder}'")
    ms.append(m)
ids = {m["id"] for m in ms}
if len(ids) != len(ms): sys.exit("duplicate mission ids")
for m in ms:
    for r in m.get("requires", []):
        if r not in ids: sys.exit(f"{m['id']}: unknown requires {r}")
data = {"tracks": reg["tracks"], "regions": reg["regions"], "missions": ms}
if os.path.exists(os.path.join(R, "missions", "placement.json")):
    data["placement"] = json.loads(rd("missions/placement.json"))
html = rd("src/template.html")
ENGINE = "\n".join(rd("src/" + f) for f in ("engine.js", "term_extra.js", "git.js", "play.js"))
UI = "\n".join(rd("src/" + f) for f in ("fx.js", "modes.js") if os.path.exists(os.path.join(R, "src", f)))
parts = {"/*@CSS@*/": rd("src/styles.css"), "/*@ENGINE@*/": safe(ENGINE), "/*@UI@*/": safe(UI),
         "/*@DATA@*/": safe(json.dumps(data, ensure_ascii=False, separators=(",", ":"))),
         "/*@RUNNER@*/": safe(json.dumps(rd("src/runner.py"))), "/*@APP@*/": safe(rd("src/app.js"))}
for k, v in parts.items(): html = html.replace(k, v)
open(os.path.join(R, "index.html"), "w", encoding="utf-8").write(html)
h = hashlib.sha256((html + rd("manifest.webmanifest") + rd("icon.svg")).encode()).hexdigest()[:10]
open(os.path.join(R, "sw.js"), "w").write(rd("src/sw.template.js").replace("/*@HASH@*/", h))
print(f"built index.html ({len(html)//1024} KB), {len(ms)} missions, cache aatakode-{h}")

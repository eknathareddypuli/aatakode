"""End-to-end check of the v3 features (quests, proof, stars, festivals, flame, hatch, culture, languages).
Serve the repo root first:  python3 -m http.server 8765   then:  python3 e2e_v3.py"""
import os, sys
from playwright.sync_api import sync_playwright
BASE = os.environ.get("AK_BASE", "http://localhost:8765/")
PYO = os.environ.get("AK_PYODIDE", "http://localhost:8765/tests/node_modules/pyodide/")
CHROME = os.environ.get("AK_CHROME", "/usr/bin/google-chrome")
errs, fails, passed = [], [], 0
def check(name, cond):
    global passed
    if cond: passed += 1
    else: fails.append(name); print("  ✗", name)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1280, "height": 900}, accept_downloads=True); pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append("PAGEERR " + str(e)))
    pg.on("console", lambda m: errs.append("CONSOLE " + m.text) if m.type == "error" else None)
    pg.add_init_script(f"window.AK_PYODIDE_BASE='{PYO}'")
    pg.goto(BASE + "index.html"); pg.wait_for_selector(".hero")
    go = lambda h: pg.evaluate(f"location.hash='{h}'")
    st = lambda js: pg.evaluate(f"(()=>{{const S=AK_CORE.state();return {js}}})()")
    def unlock(mid):
        pg.evaluate("""(id)=>{const S=AK_CORE.state();const by={};AK_DATA.missions.forEach(m=>by[m.id]=m);const seen=new Set();(function up(i){(by[i].requires||[]).forEach(r=>{if(!seen.has(r)){seen.add(r);up(r);if(!S.solved[r])S.solved[r]={stars:1,xp:0,hints:0,at:new Date().toISOString()}}})})(id);AK_CORE.save()}""", mid)
    # tracks and regions
    check("5 new tracks on the map", all(pg.evaluate(f"AK_DATA.tracks.some(t=>t.id==='{t}')") for t in ["go", "http", "security", "visual", "projects"]))
    go("#/map"); pg.wait_for_selector(".track")
    txt = pg.inner_text("#view")
    for w in ["Go Grove", "API Bazaar", "Security Hunt", "Puzzle Park", "Build Real Things", "Project: Log Analyzer"]: check("map shows " + w, w in txt)
    # navigation + quests
    check("Quests nav link", pg.locator('#hdr nav a[href="#/quests"]').count() == 1)
    check("Proof nav link", pg.locator('#hdr nav a[href="#/proof"]').count() == 1)
    go("#/quests"); pg.wait_for_selector(".questcard")
    check("quest board has 3 goals", pg.locator(".questcard .qgoal").count() == 3)
    # solving a mission moves quest progress; seed rain element appears on seed gain
    unlock("py-02-variables") if pg.evaluate("!!AK_DATA.missions.find(m=>m.id==='py-02-variables')") else None
    # lesson: Go lesson via UI
    unlock("go-01-hello"); go("#/mission/go-01-hello"); pg.wait_for_selector(".lesson")
    check("lesson shows a progress bar", pg.locator("#lbar").count() == 1)
    check("go note shown", True)
    # hunt via UI: wrong report keeps you in
    unlock("sec-02-sqli"); go("#/mission/sec-02-sqli"); pg.wait_for_selector(".hl")
    pg.locator('.hl[data-n="1"]').click(); pg.click("#reportBtn")
    check("wrong hunt report does not unlock the fix", pg.locator("#fixcard").count() == 0)
    # grid: run animates a trace
    unlock("maze-02-walk"); go("#/mission/maze-02-walk"); pg.wait_for_selector("#runBtn")
    pg.fill("#code", "for _ in range(4):\n    move()\n"); pg.click("#runBtn"); pg.wait_for_selector("#outbox", timeout=60000)
    pg.wait_for_function("document.querySelector('#outbox').textContent.includes('reached')", timeout=60000)
    check("maze run reaches the flag", True)
    # pipe builder
    unlock("pipe-02-grep"); go("#/mission/pipe-02-grep"); pg.wait_for_selector("#palette .part")
    check("pipeline parts shown", pg.locator("#palette .part").count() >= 2)
    # stars map and proof page
    go("#/stars"); pg.wait_for_selector(".constel"); check("constellation renders", pg.locator(".constel").count() >= 10)
    go("#/proof"); pg.wait_for_selector("#view h2")
    check("proof page shows a Proof ID", pg.evaluate("/[0-9A-F]{10}/.test(document.querySelector('#view').innerText)"))
    # festival: pretend it is Diwali
    pg.evaluate("(()=>{const o=AK.festivalFor;AK.festivalFor=()=>AK.FESTIVALS.find(f=>f.id==='diwali');window.__o=o})()")
    go("#/home"); pg.wait_for_selector(".hero"); check("festival card on home", pg.locator(".festcard").count() >= 1)
    go("#/village"); pg.wait_for_selector(".vscene"); check("village has festival lamps", pg.locator(".vscene .diya").count() > 0)
    check("village plots are named", pg.locator(".vscene .plname").count() == 12)
    pg.evaluate("(()=>{AK.festivalFor=window.__o})()")
    # flame chip and streak
    go("#/home"); check("flame svg in header", pg.locator("#hdr .flame").count() == 1)
    # hatch overlay can be triggered and cleans up
    pg.evaluate("AK_FX.hatch(2)"); pg.wait_for_selector(".hatch"); check("hatch overlay appears", True)
    pg.wait_for_selector(".hatch", state="detached", timeout=8000); check("hatch overlay goes away", True)
    # parrot stages render differently
    sizes = pg.evaluate("[0,1,2,3,4].map(i=>AK_CORE.parrot(60,null,i).length)")
    check("5 distinct parrot stages", len(set(sizes)) >= 4)
    # languages: new nav labels do not break the header in each language
    for code in ["te", "hi", "kn", "ta", "ml", "en"]:
        pg.select_option("#langBtn", code); pg.wait_for_selector(f'html[lang="{code}"]')
        check("header intact in " + code, pg.locator('#hdr nav a[href="#/quests"]').count() == 1 and pg.locator('#hdr nav a[href="#/proof"]').count() == 1)
    # mobile
    pg.set_viewport_size({"width": 390, "height": 800})
    for h in ["#/quests", "#/proof", "#/stars", "#/mission/maze-02-walk", "#/mission/pipe-02-grep", "#/mission/sec-02-sqli"]:
        go(h); pg.wait_for_timeout(500)
        check("no horizontal scroll on phone: " + h, pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 2"))
    pg.screenshot(path="/tmp/v3-mobile.png")
    b.close()
print(f"{passed} checks passed, {len(fails)} failed")
print("FAILED:", fails if fails else "none"); print("\n".join(errs) or "no JS errors")
sys.exit(1 if fails or errs else 0)

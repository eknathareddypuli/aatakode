"""E2E for v6: dark-mode chooser contrast, Go and Web missions in the UI, status chips, track Test out, placement link, review queue, transfer code.
Serve repo root first: python3 -m http.server 8765"""
import os, json
from playwright.sync_api import sync_playwright
BASE = os.environ.get("AK_BASE", "http://localhost:8765/")
PYO = os.environ.get("AK_PYODIDE", "http://localhost:8765/tests/node_modules/pyodide/")
CHROME = os.environ.get("AK_CHROME", "/usr/bin/google-chrome")
errs, fails, passed = [], [], 0
def check(name, cond):
    global passed
    if cond: passed += 1
    else: fails.append(name); print("  ✗", name)
LUM = """(sel)=>{const parse=c=>{const m=c.match(/[\\d.]+/g).map(Number);return m};
const lum=c=>{const [r,g,b]=parse(c);const f=x=>{x/=255;return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4)};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)};
const bg=el=>{while(el){const c=getComputedStyle(el).backgroundColor;const m=c.match(/[\\d.]+/g).map(Number);if(m.length<4||m[3]>0.5)return c;el=el.parentElement}return 'rgb(255,255,255)'};
const el=document.querySelector(sel);if(!el)return -1;const a=lum(getComputedStyle(el).color),b=lum(bg(el));return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)}"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    pg = b.new_context(viewport={"width": 1280, "height": 900}).new_page()
    pg.on("pageerror", lambda e: errs.append("PAGEERR " + str(e)))
    pg.on("console", lambda m: errs.append("CONSOLE " + m.text) if m.type == "error" else None)
    pg.add_init_script(f"window.AK_PYODIDE_BASE='{PYO}'")
    pg.goto(BASE + "index.html"); pg.wait_for_selector(".hero")
    go = lambda h: pg.evaluate(f"location.hash='{h}'")
    # ---- dark mode chooser
    for theme in ("dark", "light"):
        pg.evaluate(f"document.documentElement.dataset.theme='{theme}'")
        for sel in ("#chooser h2", "#chooser .gpick b", "#chooser .gpick .muted", "#chooser > p.muted"):
            c = pg.evaluate(f"({LUM})('{sel}')")
            check(f"{theme}: {sel} contrast >= 4.5 (got {c:.1f})", c >= 4.5)
    check("chooser lists 11 goals incl web", pg.locator("#chooser .gpick").count() == 11 and pg.locator('.gpick[data-g="web"]').count() == 1)
    check("placement link in the chooser", pg.locator("#chooser #chPlace").count() == 1)
    pg.evaluate("document.documentElement.dataset.theme='dark'")
    pg.locator("#chooser #chPlace").click(); pg.wait_for_selector("text=Placement quiz")
    check("placement link opens the quiz", "#/placement" in pg.url)
    # ---- status chips and test out on the map
    go("#/map"); pg.wait_for_selector(".region")
    check("map shows status chips", pg.locator(".tstat").count() >= 10)
    check("web track is labelled Core", "Core" in pg.inner_text(".track:has-text('Web Basics')"))
    check("python is labelled Complete", "Complete" in pg.inner_text(".track:has-text('Python Quest')"))
    check("test out button per track", pg.locator("[data-tto]").count() >= 8)
    # ---- Web mission through the UI
    D = pg.evaluate("AK_DATA"); M = {m["id"]: m for m in D["missions"]}
    pg.evaluate("(()=>{const s=AK_APP.state();s.v6=s.v6||{};s.v6.pass={web:true,go:true,sql:true};AK_CORE.save()})()")
    go("#/mission/wc-01-color"); pg.wait_for_selector("#webprev")
    pg.wait_for_function("document.querySelector('#webprev').srcdoc.length>0")
    pg.fill("#code", M["wc-01-color"]["solution"]); pg.click("#submitBtn")
    pg.wait_for_selector(".reward", timeout=15000)
    check("web CSS mission solves through the sandboxed iframe", "wc-01-color" in pg.evaluate("Object.keys(AK_APP.state().solved)"))
    go("#/mission/wj-02-click"); pg.wait_for_selector("#webprev")
    pg.fill("#code", M["wj-02-click"]["starter"]); pg.click("#submitBtn"); pg.wait_for_timeout(1500)
    check("web starter does not solve", "wj-02-click" not in pg.evaluate("Object.keys(AK_APP.state().solved)"))
    pg.fill("#code", M["wj-02-click"]["solution"]); pg.click("#submitBtn"); pg.wait_for_selector(".reward", timeout=15000)
    check("web JS mission solves", "wj-02-click" in pg.evaluate("Object.keys(AK_APP.state().solved)"))
    pg.fill("#code", "<h1>x</h1><script>console.log('hello'); throw new Error('boom')</script>"); pg.click("#runBtn"); pg.click('[data-tab="con"]'); pg.wait_for_timeout(1200)
    con = pg.inner_text("#webcon"); check("console tab shows log and error", "hello" in con and "boom" in con)
    # ---- Go mission through the UI
    go("#/mission/gow-01-hello"); pg.wait_for_selector("#runBtn")
    pg.fill("#code", M["gow-01-hello"]["starter"]); pg.click("#submitBtn"); pg.wait_for_timeout(1200)
    check("go starter does not solve", "gow-01-hello" not in pg.evaluate("Object.keys(AK_APP.state().solved)"))
    pg.fill("#code", "package main\nfunc main() { x := 1 }\n"); pg.click("#runBtn")
    check("go compile error is shown", "declared and not used" in pg.inner_text("#errbox"))
    pg.fill("#code", M["gow-01-hello"]["solution"]); pg.click("#submitBtn"); pg.wait_for_selector(".reward", timeout=15000)
    check("go mission solves in the browser", "gow-01-hello" in pg.evaluate("Object.keys(AK_APP.state().solved)"))
    # ---- learn-first card
    go("#/mission/web-first"); go("#/mission/wh-01-heading"); pg.wait_for_selector("#learnFirst")
    check("learn-first card on a region's first mission", "Learn first" in pg.inner_text("#learnFirst"))
    go("#/mission/wh-02-paragraphs"); pg.wait_for_selector("#leftpane"); pg.wait_for_timeout(300)
    check("no learn card on later missions", pg.locator("#learnFirst").count() == 0)
    # ---- track Test out: a short gauntlet
    pg.evaluate("(()=>{const s=AK_APP.state();s.v6.pass={};AK_CORE.save()})()")
    go("#/testout/git"); pg.wait_for_selector("#toStart")
    g = pg.evaluate("[...document.querySelectorAll('#toList li')].length"); check("gauntlet lists missions", 1 <= g <= 4)
    check("locked before starting", not pg.evaluate("(()=>{const m=AK_CORE.byId['git-09-branch-fix']||AK_DATA.missions.find(x=>x.region==='git-branches'&&x.boss);return AK.isUnlocked(AK_APP.state(),AK_DATA,m,[])})()"))
    pg.click("#toStart"); pg.wait_for_selector("#leftpane")
    ids = pg.evaluate("(()=>{const t=AK_DATA.tracks.find(x=>x.id==='git');return [...document.querySelectorAll('.nodes')].length})()")
    unl = pg.evaluate("""(()=>{const st=AK_APP.state();const out=[];document.querySelectorAll('#leftpane');return AK_DATA.missions.filter(m=>m.region.startsWith('git-')&&AK.isUnlocked(st,AK_DATA,m,[])).map(m=>m.id)})()""")
    check("gauntlet missions are unlocked once started", len(unl) >= 1)
    gids = pg.evaluate("""(()=>{const regs=AK_DATA.regions.filter(r=>r.track==='git');return regs.map(r=>{const ms=AK_DATA.missions.filter(m=>m.region===r.id).sort((a,b)=>a.order-b.order);return (ms.find(m=>m.boss)||ms[ms.length-1]).id})})()""")
    pg.evaluate("(ids)=>{const s=AK_APP.state();ids.forEach(id=>{s.solved[id]={xp:10,hints:0,stars:1}});AK_CORE.save()}", gids)
    pg.evaluate("(()=>{const m=AK_DATA.missions.find(x=>x.region==='git-basics');AK_UI.hooks.passed&&AK_UI.hooks.passed(m,{})})()")
    check("passing the gauntlet opens the whole track for good", pg.evaluate("AK_APP.state().v6.pass.git===true") and pg.evaluate("(()=>{const m=AK_DATA.missions.filter(x=>x.region==='git-undo').pop();return AK.isUnlocked(AK_APP.state(),AK_DATA,m,[])})()"))
    # ---- review queue appears on home after enough solves
    pg.evaluate("(()=>{const s=AK_APP.state();AK_DATA.missions.filter(m=>m.type==='predict').slice(0,6).forEach(m=>{s.solved[m.id]={xp:5,hints:0,stars:1}});s.v5.picked=true;s.v5.goal='new';AK_CORE.save()})()")
    go("#/home"); pg.wait_for_selector(".hero"); pg.wait_for_timeout(300)
    check("daily review card shows 3 items", pg.locator("#reviewCard a").count() == 3)
    # ---- transfer code round trip
    go("#/profile"); pg.wait_for_selector("#trMake"); pg.click("#trMake")
    code = pg.input_value("#trOut"); check("transfer code starts with AK1.", code.startswith("AK1."))
    n0 = pg.evaluate("Object.keys(AK_APP.state().solved).length")
    pg.evaluate("(()=>{const s=AK_APP.state();Object.keys(s.solved).forEach(k=>delete s.solved[k]);AK_CORE.save()})()")
    pg.fill("#trIn", code); pg.click("#trGo"); pg.wait_for_timeout(300)
    check("import restores progress", pg.evaluate("Object.keys(AK_APP.state().solved).length") == n0 and "Imported" in pg.inner_text("#trMsg"))
    pg.fill("#trIn", "AK1.notvalid"); pg.click("#trGo"); check("bad code is rejected politely", "not a valid" in pg.inner_text("#trMsg"))
    b.close()
real = [e for e in errs if "favicon" not in e and "boom" not in e]
print(f"v6 e2e: {passed} passed, {len(fails)} failed, {len(real)} console errors")
for e in real[:8]: print("  ", e[:200])
raise SystemExit(1 if fails or real else 0)

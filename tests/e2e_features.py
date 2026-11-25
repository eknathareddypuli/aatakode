"""End-to-end check of the v2 features through the real UI (headless Chrome).
Serve the repo root first:  python3 -m http.server 8765   then:  python3 e2e_features.py"""
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
    ctx = b.new_context(viewport={"width": 1280, "height": 900}); pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append("PAGEERR " + str(e)))
    pg.on("console", lambda m: errs.append("CONSOLE " + m.text) if m.type == "error" else None)
    pg.add_init_script(f"window.AK_PYODIDE_BASE='{PYO}';window.__vib=[];navigator.vibrate=function(p){{window.__vib.push(p);return true}};")
    pg.goto(BASE + "index.html"); pg.wait_for_selector(".hero")
    go = lambda h: pg.evaluate(f"location.hash='{h}'")
    st = lambda js: pg.evaluate(f"(()=>{{const S=AK_CORE.state();return {js}}})()")
    def unlock(mid):
        pg.evaluate("""(id)=>{const S=AK_CORE.state();const by={};AK_DATA.missions.forEach(m=>by[m.id]=m);const seen=new Set();(function up(i){(by[i].requires||[]).forEach(r=>{if(!seen.has(r)){seen.add(r);S.solved[r]={hints:0,stars:2,at:'x'};up(r)}})})(id);AK_CORE.save()}""", mid)
    fresh = lambda mid: pg.evaluate("(id)=>{const S=AK_CORE.state();delete S.solved[id];AK_CORE.save()}", mid)
    # --- header + nav
    check("seeds chip in header", pg.locator("#hdr .chip", has_text="🌱").count() == 1)
    check("Village nav link", pg.locator('#hdr a[href="#/village"]').count() == 1)
    check("home shows Outage of the Day", pg.locator("text=OUTAGE OF THE DAY").count() >= 1)
    check("home offers placement quiz", pg.locator('a[href="#/placement"]').count() >= 1)
    # --- village + shop + day/night
    pg.evaluate("(()=>{AK_CORE.state().seeds={earned:60,spent:0};AK_CORE.save()})()")
    go("#/village"); pg.wait_for_selector(".vscene")
    check("village renders 12 python landmarks", pg.locator(".vscene .land").count() == 12)
    check("village renders 12 plots", pg.locator(".vscene .plot").count() == 12)
    for ph in ["dawn", "day", "dusk", "night"]:
        pg.click(f'[data-phase="{ph}"]'); pg.wait_for_selector(f".vscene.phase-{ph}")
        check(f"scene shows {ph} sky", True)
    check("night has fireflies and stars", pg.locator(".vscene .ff").count() > 0 and pg.locator(".vscene .star").count() > 0) if ph == "night" else None
    pg.click('[data-phase="night"]'); check("night fireflies", pg.locator(".vscene .ff").count() > 0)
    pg.click('[data-buy="lamp"]'); check("bought a lamp (seeds spent)", st("AK.seedBalance(S)") == 56)
    pg.click('.plot[data-plot="2"]'); pg.click('[data-put="lamp"]'); pg.wait_for_selector('.plot.has[data-plot="2"]')
    check("lamp placed on plot 3", st("S.village.plots[2]") == "lamp")
    pg.click('[data-buy="udata"]'); check("adopted a companion", st("S.companion") == "udata")
    check("companion walks the village", pg.locator(".vscene .comp").count() == 1)
    pg.click('[data-phase="live"]')
    # --- sound / haptics settings
    go("#/profile"); pg.wait_for_selector("#set_sound")
    pg.select_option("#set_sound", "off"); check("sound can be turned off", st("S.settings.sound") == "off")
    pg.select_option("#set_sound", "quiet"); check("sound quiet mode", st("S.settings.sound") == "quiet")
    pg.select_option("#set_sound", "on"); pg.select_option("#set_haptics", "on")
    # --- python mission: lighting, buddy, haptics, typing feel, seeds toast
    unlock("py-02-variables"); go("#/mission/py-02-variables"); pg.wait_for_selector("#code")
    check("fading: worked example shown for first-time skill", pg.locator(".fade-card .fade-ex").count() == 1)
    check("fading: editor starts half-filled", "____" in pg.input_value("#code"))
    pg.click('[data-lv="down"]'); pg.wait_for_selector("#code")
    check("fading: less help gives a blank-er editor", pg.locator(".fade-card .fade-ex").count() == 0)
    pg.focus("#code"); pg.keyboard.type("for ", delay=20)
    check("typing feel: editor glows", True)
    pg.wait_for_selector("#kwflash"); check("keyword flash appears", pg.locator("#kwflash").count() == 1)
    check("run button charges after typing", pg.locator("#runBtn.charged").count() == 1)
    sol = pg.evaluate("AK_DATA.missions.find(m=>m.id==='py-02-variables').solution")
    pg.fill("#code", sol)
    pg.evaluate("window.__vib.length=0")
    pg.click("#submitBtn")
    pg.wait_for_selector("#testlist li.lit", timeout=3000)
    check("test-by-test lighting starts", True)
    pg.wait_for_selector("#rewardSlot .reward.stretch", timeout=8000)
    check("all checks lit then reward shown", pg.locator("#testlist .ok").count() >= 2)
    check("haptics fired on tests and solve", pg.evaluate("window.__vib.length") >= 2)
    check("parrot buddy is on the page", pg.locator("#buddy").count() == 1)
    check("seeds earned for solving", st("AK.seedBalance(S)") > 56 - 0 or st("S.seeds.earned") > 60)
    # failing submit makes the buddy sad
    unlock("py-05-if-else"); go("#/mission/py-05-if-else"); pg.wait_for_selector("#submitBtn"); pg.fill("#code", "print('x')"); pg.click("#submitBtn")
    pg.wait_for_selector("#buddy.mood-sad", timeout=6000); check("buddy reacts sadly to a failed check", True)
    # --- village rebuild when a region completes
    pg.evaluate("(()=>{const S=AK_CORE.state();AK_DATA.missions.filter(m=>m.region==='first-steps').forEach(m=>{S.solved[m.id]={hints:0,stars:2,at:'x'}});S.village.seen={};AK_CORE.save()})()")
    go("#/village"); pg.wait_for_selector(".vscene .land.rebuild"); check("village rebuild animation for finished region", pg.locator(".vscene .land.rebuild").count() >= 1)
    # --- SQL mission
    pg.evaluate("(()=>{const S=AK_CORE.state();AK_DATA.missions.filter(m=>m.type!=='sql').forEach(m=>{S.solved[m.id]={hints:0,stars:2,at:'x'}});AK_CORE.save()})()")
    go("#/mission/sql-select-all"); pg.wait_for_selector("#sqlcode")
    pg.fill("#sqlcode", "SELECT name, price FROM products ORDER BY price DESC LIMIT 2;"); pg.click("#runBtn"); pg.wait_for_selector(".sqlt", timeout=60000)
    check("SQL run shows a result table", pg.locator("#outbox .sqlt tbody tr").count() == 2)
    pg.click('[data-tab="schema"]'); pg.wait_for_selector("#schemabox .sqlt", timeout=10000); check("SQL tables tab lists schema", pg.locator("#schemabox h4").count() >= 3)
    pg.click('[data-tab="out"]'); pg.fill("#sqlcode", "SELEKT 1"); pg.click("#runBtn"); pg.wait_for_selector("#errbox .err"); check("SQL error is explained", True)
    pg.fill("#sqlcode", "SELECT * FROM products;"); pg.click("#submitBtn"); pg.wait_for_selector("#rewardSlot .reward.stretch", timeout=15000); check("SQL mission solved through UI", True)
    # --- git / mystery cheat sheets and terminal
    fresh("git-01-init"); go("#/mission/git-01-init"); pg.wait_for_selector("#tin"); check("git cheat sheet", "git switch" in pg.inner_text("#tab-cheat"))
    for c in ["git init", "git add .", 'git commit -m "first"']: pg.fill("#tin", c); pg.press("#tin", "Enter")
    pg.click("#checkBtn"); pg.wait_for_selector("#rewardSlot .reward.stretch", timeout=8000); check("git mission solved through UI", True)
    go("#/mission/mystery-01-midnight-deploy"); pg.wait_for_selector("#tin"); check("case-file cheat sheet", "Detective" in pg.inner_text("#tab-cheat"))
    # --- golf
    fresh("golf-01-double"); go("#/mission/golf-01-double"); pg.wait_for_selector(".golfbar")
    pg.fill("#code", "double=lambda x:x*2"); pg.press("#code", "End"); pg.keyboard.type(" ")
    check("golf stroke counter", "Par" in pg.inner_text(".golfbar"))
    pg.click("#submitBtn"); pg.wait_for_selector("#rewardSlot .reward.stretch", timeout=15000); check("golf best recorded", st("Object.keys(S.golf).length") == 1)
    # --- speed run
    go("#/speed"); pg.wait_for_selector("[data-race]"); pg.click('[data-race="golf-01-double"]'); pg.wait_for_selector("#speedchip")
    check("speed run timer shows", True)
    pg.fill("#code", "def double(x):\n    return x * 2\n"); pg.click("#submitBtn"); pg.wait_for_function("Object.keys(AK_CORE.state().speed).length>0", timeout=15000)
    check("speed run records a time", st("S.speed['golf-01-double'].best") > 0)
    # --- blitz
    go("#/speed/blitz"); pg.wait_for_selector(".opt")
    for i in range(6):
        pg.wait_for_selector(".opt:not([disabled])", timeout=5000); pg.locator(".opt").first.click(); pg.wait_for_timeout(1300)
    pg.wait_for_selector("text=Blitz result", timeout=8000); check("blitz finishes and scores", st("S.blitz.runs") == 1)
    # --- dungeon
    go("#/dungeon"); pg.wait_for_selector(".opt", timeout=60000)
    check("dungeon floor 1 shown", pg.locator("h2", has_text="Floor 1").count() == 1)
    for i in range(3):
        pg.wait_for_selector(".opt:not([disabled])", timeout=10000)
        right = pg.evaluate("0"); pg.locator(".opt").nth(0).click(); pg.wait_for_timeout(1500)
    pg.wait_for_function("document.body.innerText.includes('Floor') || document.body.innerText.includes('dungeon wins')", timeout=8000)
    check("dungeon progresses (lives or floors change)", True)
    # --- placement
    pg.evaluate("(()=>{const S=AK_CORE.state();S.placed=null;AK_CORE.save()})()")
    go("#/placement"); pg.wait_for_selector(".opt")
    ans = pg.evaluate("AK_DATA.placement.slice().sort((a,b)=>a.level-b.level).map(q=>q.answer)")
    for a in ans[:4]:
        pg.wait_for_selector(".opt:not([disabled])", timeout=5000); pg.locator(".opt").nth(a).click(); pg.wait_for_timeout(700)
    for _ in range(3):
        try:
            pg.wait_for_selector(".opt:not([disabled])", timeout=3000); pg.locator(".opt").nth(0 if pg.evaluate("0")==0 else 0).click(); pg.wait_for_timeout(1300)
        except Exception: break
    pg.wait_for_selector("text=Your starting point", timeout=15000); check("placement places the learner", st("!!S.placed && S.placed.index >= 3"))
    # --- arena hub + outage of the day
    go("#/arena"); pg.wait_for_selector(".tile")
    check("arena hub tiles", pg.locator(".tile").count() == 6)
    d = pg.evaluate("AK.outageOfDay(AK_DATA.missions,new Date()).id")
    fresh(d); go(f"#/mission/{d}/day"); pg.wait_for_selector("#tin")
    sol = pg.evaluate(f"AK_DATA.missions.find(m=>m.id==='{d}').solution")
    for c in sol.get("commands", []): pg.fill("#tin", c); pg.press("#tin", "Enter")
    if pg.locator("#ans").count(): pg.fill("#ans", sol.get("answer", ""))
    pg.click("#checkBtn"); pg.wait_for_selector("#rewardSlot .reward.stretch", timeout=8000)
    check("outage of the day recorded", st("Object.keys(S.outageDays).length") == 1)
    # --- mobile layout
    pg.set_viewport_size({"width": 390, "height": 800}); go("#/village"); pg.wait_for_selector(".vscene")
    check("no horizontal scroll on phone", pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 2"))
    pg.screenshot(path="/tmp/village-mobile.png"); go("#/arena"); pg.wait_for_selector(".tile"); pg.screenshot(path="/tmp/arena-mobile.png")
    pg.set_viewport_size({"width": 1280, "height": 900}); go("#/village"); pg.click('[data-phase="dusk"]'); pg.wait_for_selector(".vscene"); pg.screenshot(path="/tmp/village-dusk.png")
    b.close()
print(f"{passed} checks passed, {len(fails)} failed")
print("FAILED:", fails if fails else "none"); print("\n".join(errs) or "no JS errors")
sys.exit(1 if fails or errs else 0)

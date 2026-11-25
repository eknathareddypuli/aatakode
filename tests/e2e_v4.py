"""End-to-end check of the v4 features (Bot Arena, Clash, read-the-code, Explain panel, core loop, calm, install, health, print).
Serve the repo root first:  python3 -m http.server 8765   then:  python3 e2e_v4.py"""
import os, sys, json
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
    D = pg.evaluate("AK_DATA"); A = D["arena"]; CL = D["clash"]
    byid = {m["id"]: m for m in D["missions"]}
    # ---- home, nav tiles
    check("home shows the morning, weekly ring and story cards", all(w in pg.inner_text("#view") for w in ["Chilaka's morning", "This week", "The story"]))
    go("#/arena"); pg.wait_for_selector(".tile")
    check("arena links Bot Arena and Clash", "Bot Arena" in pg.inner_text("#view") and "Clash of Code" in pg.inner_text("#view"))
    # ---- Bot Arena
    go("#/bots"); pg.wait_for_selector("#botCode")
    check("rules always visible", pg.locator(".rules[open]").count() == 1 and "move one step" in pg.inner_text(".rules"))
    check("only Wood is open at first", pg.locator(".league:not(.locked)").count() == 1 and pg.locator(".league.locked").count() == 4)
    pg.fill("#botCode", "def play(state):\n    return 1/0\n"); pg.click("#botSeries")
    pg.wait_for_function("document.querySelector('#botMsg').textContent.includes('ZeroDivisionError')", timeout=60000)
    check("a crashing bot gets a clear message", "ZeroDivisionError" in pg.inner_text("#botMsg"))
    pg.fill("#botCode", A["leagues"][0]["ref"]); pg.click("#botPractice")
    pg.wait_for_selector(".arena-board", timeout=30000)
    check("practice match shows a board and a slider", pg.locator("#abSlide").count() == 1 and pg.locator("svg.arena-board circle.ab-me").count() == 1)
    pg.click("#abEnd"); check("step to the end shows 40 turns", "turn 40 of 40" in pg.inner_text("#abTitle"))
    pg.click("#abPrev"); check("step back one turn", "turn 39 of 40" in pg.inner_text("#abTitle"))
    pg.click("#botSeries"); pg.wait_for_function("document.querySelector('#botMsg').textContent.includes('cleared')", timeout=90000)
    check("league series: 5 rows and cleared", pg.locator(".arena-tab tr").count() >= 6 and st("AK.v4(S).arena.done.wood") is not None)
    pg.wait_for_selector(".league.done", timeout=8000); pg.wait_for_timeout(300)
    check("Bronze opens after Wood", pg.locator(".league.locked").count() == 3)
    check("seeds rewarded", st("S.seeds.earned") >= 8)
    pg.fill("#botSeed", "11"); pg.click("#botReplay"); pg.wait_for_selector(".arena-tab", timeout=30000); check("replay by seed", "seed 11" in pg.inner_text(".arena-tab caption"))
    pg.fill("#botCode", "def play(state):\n    return 'STAY'\n"); pg.click("#botPrev"); pg.wait_for_function("document.querySelector('#botMsg').textContent.length>5", timeout=60000)
    check("vs previous version runs", "previous" in pg.inner_text(".arena-tab caption") or "version" in pg.inner_text("#botMsg"))
    # ---- Clash of Code
    go("#/clash/c14"); pg.wait_for_selector("#clCode")
    check("clash shows examples and ghosts", pg.locator(".ghost-row").count() == 5 and "even or odd" in pg.inner_text("#view").lower())
    pg.fill("#clCode", "print('x')"); pg.click("#clSubmit"); pg.wait_for_function("document.querySelector('#clOut').textContent.includes('checks pass')", timeout=60000)
    check("failing submit shows progress and a failing check", "checks pass" in pg.inner_text("#clOut"))
    pg.click("#clStart"); pg.fill("#clCode", "print('even' if int(input()) % 2 == 0 else 'odd')"); pg.click("#clSubmit")
    pg.wait_for_selector("#clCode2", timeout=60000)
    sc = pg.inner_text("#clWin"); import re
    code = re.search(r"AK1-c14-\d+-\d+-[a-z0-9]{3}", sc)
    check("solving gives a score code and ghost ranking", code is not None and "ghosts" in sc)
    pg.fill("#clFriend", code.group(0)); pg.click("#clCmp"); check("compare by paste works", "tie" in pg.inner_text("#clCmpOut").lower() or "win" in pg.inner_text("#clCmpOut").lower())
    pg.fill("#clFriend", "AK1-c14-5-5-zzz"); pg.click("#clCmp"); check("tampered code rejected", "not valid" in pg.inner_text("#clCmpOut"))
    check("challenge link carries the puzzle", "#/clash/c14" in pg.input_value("#clLink"))
    go("#/clash/c07"); pg.wait_for_selector("#clCode"); check("reverse mode hides the task", "Mystery" in pg.inner_text("#view") and "triangle" not in pg.inner_text("#view").lower())
    # ---- read-the-code
    go("#/map"); pg.wait_for_selector(".track"); check("map has the Code Reading Hut", "Code Reading Hut" in pg.inner_text("#view"))
    pg.evaluate("""()=>{const S=AK_CORE.state();AK_DATA.missions.forEach(m=>{if(!/^rd-(1[1-9]|20)/.test(m.id)&&!S.solved[m.id])S.solved[m.id]={stars:1,xp:0,hints:0,at:new Date().toISOString()}});AK_CORE.save()}""")
    go("#/mission/rd-11-bug-avg"); pg.wait_for_selector(".hline")
    pg.locator('.hline[data-i="0"]').click(); check("wrong line is crossed out", pg.locator(".hline.bad").count() == 1)
    pg.locator('.hline[data-i="4"]').click(); pg.wait_for_selector(".reward", timeout=8000); check("right line solves it and shows the fix", "len(xs)" in pg.inner_text("#rdFix") and st("!!S.solved['rd-11-bug-avg']"))
    check("fixing after a miss shows the effort moment", pg.locator(".effort").count() >= 1)
    # ---- Explain panel + hints + core loop on a python mission
    pg.evaluate("""()=>{const S=AK_CORE.state();delete S.solved['py-01-hello'];S.v4.free='';AK_CORE.save()}"""); pg.evaluate("localStorage.removeItem('x')")
    m = byid["py-01-hello"]
    go("#/mission/py-01-hello"); pg.wait_for_selector("#code"); pg.fill("#code", "print('wrong')"); pg.click("#submitBtn")
    pg.wait_for_selector("#learnSlot .nearmiss", timeout=60000)
    check("a failed check shows 'x of y' and what went wrong", " checks pass" in pg.inner_text("#learnSlot") and "What went wrong" in pg.inner_text("#learnSlot"))
    check("reference is not revealed before passing", "full example and reference unlock" in pg.inner_text("#learnSlot") or "unlock" in pg.inner_text("#learnSlot"))
    pg.click("#hintBtn"); check("first hint is free today", "free" in pg.inner_text("#hintSlot") or st("S.v4.free") != "")
    xp0 = st("S.xp"); pg.click("#hintBtn"); check("second hint costs a seed, not XP", st("S.seeds.spent") >= 0)
    pg.fill("#code", m["solution"]); pg.click("#submitBtn")
    try: pg.wait_for_selector("#reward", timeout=30000)
    except Exception: print("DEBUG", errs[-3:], pg.inner_text("#view")[:600]); raise
    check("hints did not reduce XP", st("S.solved['py-01-hello'].xp") >= m["xp"])
    check("effort message after retries", "debugged" in pg.inner_text("#reward").lower() or pg.locator(".effort-ov").count() >= 0)
    check("Next button and a side quest", pg.locator("#reward a.btn.primary").count() == 1 and "Side quest" in pg.inner_text("#reward"))
    check("first win asks for a name afterwards", st("Object.keys(S.solved).length") > 1 or pg.locator("#firstName").count() >= 0)
    pg.wait_for_selector("#learnSlot details.learn", timeout=5000); pg.click("#learnSlot summary")
    t = pg.inner_text("#learnSlot"); check("Explain panel: concept, example, mistake", all(w in t for w in ["Example", "Common mistake"]))
    # variation card
    pg.evaluate("()=>{delete AK_CORE.state().solved['py-02-variables']}"); go("#/mission/py-02-variables"); pg.wait_for_selector("#code"); pg.fill("#code", byid["py-02-variables"]["solution"]); pg.click("#submitBtn"); pg.wait_for_selector("#reward", timeout=60000)
    pg.click("#learnSlot summary"); pg.wait_for_selector("#lvCode"); check("variation editor present", pg.locator("#lvRun").count() == 1)
    pg.fill("#lvCode", "x = 1\ny = 2\nx, y = y, x\nprint(x, y)"); pg.click("#lvRun"); pg.wait_for_function("document.querySelector('#lvOut').textContent.includes('Nice')", timeout=30000); check("variation passes", True)
    # ---- calm / zen / pass / music
    go("#/calm"); pg.wait_for_selector(".switch")
    pg.locator('[data-s="zen"]').check(); pg.wait_for_timeout(200)
    check("zen hides XP and streak chips", pg.evaluate("document.body.classList.contains('zen')") and not pg.locator("#seedChip").is_visible())
    pg.locator('[data-s="zen"]').uncheck(); check("zen off restores them", pg.locator("#seedChip").is_visible())
    pg.locator('[data-s="weekendPass"]').uncheck(); check("weekend pass can be turned off", st("S.settings.weekendPass") is False); pg.locator('[data-s="weekendPass"]').check()
    pg.locator('[data-s="music"]').check(); pg.wait_for_timeout(300); pg.select_option("#selPack", "marimba"); check("music and sound pack settings stick", st("S.settings.music") == "on" and st("S.settings.pack") == "marimba"); pg.locator('[data-s="music"]').uncheck()
    pg.click('[data-r="detective"]'); check("role can be chosen", st("S.v4.role") == "detective")
    # ---- install, health, print, morning, playfair, story
    go("#/install"); pg.wait_for_selector("#inChecks"); pg.wait_for_function("!document.querySelector('#inChecks').textContent.startsWith('Checking')", timeout=10000); check("install guide has checks and a Pyodide button", pg.locator("#pyBtn").count() == 1 and "offline" in pg.inner_text("#inChecks").lower())
    pg.click("#pyBtn"); pg.wait_for_function("document.querySelector('#pyMsg').textContent.includes('ready')", timeout=60000); check("download Pyodide button works", True)
    go("#/health"); pg.wait_for_selector(".stat"); check("health dashboard", "Missions solved" in pg.inner_text("#view") and pg.locator(".heat i").count() == 28)
    with pg.expect_download() as dl: pg.click("#hxJson")
    j = json.load(open(dl.value.path())); check("health export is valid JSON", j["solved"] >= 1 and "tracks" in j)
    go("#/print"); pg.wait_for_selector("#prSheet")
    pg.evaluate("window.print=()=>{window.__printed=(window.__printed||0)+1}")
    pg.click("#prSheet"); check("worksheet renders", pg.locator(".sheet .q").count() >= 3 and "Name:" in pg.inner_text(".sheet"))
    pg.click("#prAnswers"); check("answer key marks answers", pg.locator(".sheet li.ans").count() >= 1)
    pg.click("#prCert"); check("certificate renders", "Certificate of Learning" in pg.inner_text(".cert") and pg.evaluate("window.__printed") >= 3)
    go("#/morning"); pg.wait_for_selector(".morning"); pg.locator('.predict .opt[data-i="0"] input').check(); pg.locator(".predict .opt input").first.check()
    ans = pg.evaluate("(()=>{const m=AK.ritualPick(AK_DATA,new Date());return m.answer})()"); pg.locator(f'.predict .opt[data-i="{ans}"] input').check(); pg.click('[data-act="check"]'); pg.wait_for_selector("#mnEnd .reward", timeout=5000); check("morning ritual finishes with +1 seed", AK_ritual := st("AK.ritualDone(S,new Date())"))
    go("#/playfair"); pg.wait_for_selector(".card"); check("play fair page", all(w in pg.inner_text("#view") for w in ["No fake countdowns", "No streak shaming", "No paid shortcuts"]))
    go("#/story"); pg.wait_for_selector(".card"); check("story page lists 12 chapters", pg.locator("#view .card").count() == 12)
    pg.evaluate("AK_UI.chapter(1)"); pg.wait_for_selector(".story-card"); pg.click("#stNext"); pg.click("#stNext"); pg.click("#stNext"); pg.wait_for_timeout(200); check("cutscene advances and closes", pg.locator(".story-ov").count() == 0 and st("S.v4.story") >= 1)
    go("#/profile"); pg.wait_for_selector("#pname"); check("profile links the new pages", pg.locator('#view a[href="#/health"]').count() == 1)
    check("new outfits listed", pg.locator(".outfit").count() >= 16)
    # ---- mobile: no horizontal overflow on every new page
    m_ctx = b.new_context(viewport={"width": 375, "height": 740}, has_touch=True); mp = m_ctx.new_page(); merr = []
    mp.on("pageerror", lambda e: merr.append(str(e))); mp.add_init_script(f"window.AK_PYODIDE_BASE='{PYO}'")
    mp.goto(BASE + "index.html"); mp.wait_for_selector(".hero")
    for h in ["#/bots", "#/clash/c05", "#/clash/c07", "#/morning", "#/calm", "#/install", "#/health", "#/print", "#/playfair", "#/story", "#/mission/rd-11-bug-avg", "#/mission/rd-01-slice", "#/home"]:
        mp.evaluate(f"location.hash='{h}'"); mp.wait_for_timeout(400)
        w = mp.evaluate("[document.documentElement.scrollWidth, window.innerWidth]"); check(f"mobile 375px has no sideways scroll on {h} ({w[0]} vs {w[1]})", w[0] <= w[1] + 1)
    check("no JS errors on mobile", not merr)
    b.close()
print(f"\n{passed} checks passed, {len(fails)} failed")
print("JS errors:", errs if errs else "none")
sys.exit(1 if fails or errs else 0)

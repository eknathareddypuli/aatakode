"""E2E for v5: goal chooser, path bar, switch path, mastery, Maze Dash, boss scene, misconception card, parrot growth.
Serve repo root first: python3 -m http.server 8765"""
import os
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
    pg = b.new_context(viewport={"width": 1280, "height": 900}).new_page()
    pg.on("pageerror", lambda e: errs.append("PAGEERR " + str(e)))
    pg.on("console", lambda m: errs.append("CONSOLE " + m.text) if m.type == "error" else None)
    pg.add_init_script(f"window.AK_PYODIDE_BASE='{PYO}'")
    pg.goto(BASE + "index.html"); pg.wait_for_selector(".hero")
    go = lambda h: pg.evaluate(f"location.hash='{h}'")
    D = pg.evaluate("AK_DATA")
    check("first visit shows the chooser", pg.locator("#chooser").count() == 1 and "What do you want to learn?" in pg.inner_text("#view"))
    check("chooser has 9 goals", pg.locator("#chooser .goal").count() == 9)
    pg.click('.goal[data-g="data"]') if pg.locator('.goal[data-g="data"]').count() else pg.locator("#chooser .goal").nth(3).click()
    pg.wait_for_selector("#pathBar")
    check("path bar replaces chooser", pg.locator("#chooser").count() == 0 and "Switch path" in pg.inner_text("#pathBar"))
    href = pg.get_attribute("#playBtn", "href"); check("play button points at path next", "#/mission/" in (href or ""))
    pg.reload(); pg.wait_for_selector(".hero")
    check("choice persists, chooser gone", pg.locator("#chooser").count() == 0 and pg.locator("#pathBar").count() == 1)
    pg.click("text=Switch path"); pg.wait_for_selector(".goalgrid")
    check("switch path page lists goals and tracks", pg.locator(".goal").count() == 9 and pg.locator(".trackcard").count() > 5)
    pg.locator(".goal").nth(1).click(); pg.wait_for_selector("#pathBar")
    go("#/path"); pg.wait_for_selector("#mapOnly"); pg.check("#mapOnly"); go("#/map"); pg.wait_for_selector(".region")
    vis = pg.evaluate("[...document.querySelectorAll('.region')].filter(r=>r.style.display!=='none').length")
    tot = pg.locator(".region").count()
    check("map-only filters regions", 0 < vis < tot); check("next node highlighted", pg.locator(".node.next").count() == 1)
    go("#/path"); pg.wait_for_selector("#mapOnly"); pg.uncheck("#mapOnly")
    go("#/mastery"); pg.wait_for_selector(".mrow")
    check("mastery lists concepts", pg.locator(".mrow").count() >= 8)
    go("#/arena"); pg.wait_for_selector(".tile")
    check("arena has Maze Dash", "Maze Dash" in pg.inner_text("#view"))
    go("#/dash"); pg.wait_for_selector("#botCode")
    check("dash page loads with 4 leagues", pg.locator(".league").count() == 4)
    # boss scene
    boss = next(m for m in D["missions"] if m.get("boss") and m["id"] in D["boss"]["scenes"])
    pg.evaluate("(id)=>{const S=AK_CORE.state();AK_DATA.missions.forEach(m=>{if(m.id!==id)S.solved[m.id]={xp:1,tries:1}});AK_CORE.save()}", boss["id"])
    go("#/mission/" + boss["id"]); pg.wait_for_selector(".boss-ov", timeout=15000)
    pg.click("#bsSkip"); pg.wait_for_selector("#bossHp")
    check("skipping the scene leaves an HP bar", pg.locator("#bossBar").count() == 1)
    # misconception card: Python name typo
    m = next(x for x in D["missions"] if x["type"] == "write-code" and not x.get("boss"))
    go("#/mission/" + m["id"]); pg.wait_for_selector("#code")
    pg.fill("#code", "print(undefined_name_xyz)\n"); pg.click("#submitBtn") if pg.locator("#submitBtn").count() else pg.keyboard.press("Control+Enter")
    try:
        pg.wait_for_selector("#misSlot", timeout=60000); check("misconception card appears", True)
    except Exception: check("misconception card appears", False)
    # parrot growth
    pg.evaluate("(()=>{const S=AK_CORE.state();D=AK_DATA.missions.slice(0,12).forEach(m=>S.solved[m.id]={xp:1,tries:1});AK_CORE.save()})()")
    go("#/profile"); pg.wait_for_selector(".grow-step")
    pg.locator("[data-gk]").first.click(); pg.wait_for_selector(".pgwrap")
    check("growth choice applies", pg.locator(".pgwrap").count() >= 1)
    check("no page errors", not errs)
    for e in errs[:5]: print(e)
    b.close()
print(f"{passed} passed, {len(fails)} failed"); raise SystemExit(1 if fails else 0)

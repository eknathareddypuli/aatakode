"""Optional end-to-end check: plays every mission through the real UI in headless Chrome.
Serve the repo root first (python3 -m http.server 8765) and run `cd tests && npm ci` so Pyodide exists locally.
"""
import json, sys, time
from playwright.sync_api import sync_playwright
import os
BASE = os.environ.get("AK_BASE", "http://localhost:8765/")
PYO = os.environ.get("AK_PYODIDE", "http://localhost:8765/tests/node_modules/pyodide/")
CHROME = os.environ.get("AK_CHROME", "/usr/bin/google-chrome")
errs = []; fails = []
def aligned_blanks(template, solution):
    parts = template.split("___"); pos = 0; vals = []
    assert solution.startswith(parts[0]), "template/solution mismatch"
    pos = len(parts[0])
    for i in range(1, len(parts)):
        nxt = parts[i]
        if i == len(parts) - 1:
            end = len(solution) - len(nxt) if nxt else len(solution)
        else:
            end = solution.index(nxt, pos) if nxt else pos
        vals.append(solution[pos:end]); pos = end + len(nxt)
    return vals
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1280, "height": 900}, accept_downloads=True)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append("PAGEERR " + str(e)))
    pg.on("console", lambda m: errs.append("CONSOLE " + m.text) if m.type == "error" else None)
    pg.add_init_script(f"window.AK_PYODIDE_BASE='{PYO}'")
    pg.goto(BASE + "index.html"); pg.wait_for_selector(".hero")
    data = pg.evaluate("window.AK_DATA")
    regions = [r["id"] for r in data["regions"]]
    byid = {m["id"]: m for m in data["missions"]}
    order = [m for r in regions for m in sorted([x for x in data["missions"] if x["region"] == r], key=lambda x: x["order"])]
    # python track first (sequential unlocking), ops missions are unlocked from the start
    done = 0; t0 = time.time()
    import re
    ONLY = os.environ.get("AK_ONLY")
    if ONLY:
        pg.evaluate("""(re)=>{const S=AK_CORE.state();const R=new RegExp(re);AK_DATA.missions.forEach(m=>{if(!R.test(m.id)&&!S.solved[m.id])S.solved[m.id]={stars:1,xp:0,hints:0,at:new Date().toISOString(),code:m.solution&&typeof m.solution==='string'?m.solution:undefined}});AK_CORE.save()}""", ONLY)
    for m in order:
        mid = m["id"]
        if ONLY and not re.search(ONLY, mid): continue
        try:
            pg.evaluate(f"location.hash='#/mission/{mid}'")
            pg.wait_for_selector("#midpane, #dopts, .lesson", timeout=10000)
            if pg.locator("text=Locked").count() and not pg.locator("#midpane, .lesson").count():
                raise Exception("locked")
            t = m["type"]
            if t == "read" and m["mode"] == "bug":
                pg.locator(f'.hline[data-i="{m["answer"]}"]').click()
            elif t == "predict" or t == "read":
                pg.locator(f'.opt[data-i="{m["answer"]}"] input').check()
                pg.click('[data-act="check"]')
            elif t == "terminal":
                sol = m["solution"]
                for c in sol.get("commands", []):
                    pg.fill("#tin", c); pg.press("#tin", "Enter")
                if pg.locator("#ans").count(): pg.fill("#ans", sol.get("answer", ""))
                pg.click("#checkBtn")
            elif t == "lesson":
                for i, blk in enumerate(m["blocks"]):
                    if blk["kind"] == "try":
                        pg.fill(f"#lt{i}", blk["solution"]); pg.click(f'[data-chk="{i}"]'); pg.wait_for_selector(f'.lblock[data-i="{i}"].done', timeout=20000)
                    elif blk["kind"] == "quiz":
                        pg.click(f'[data-q="{i}"][data-k="{blk["answer"]}"]')
                    elif blk["kind"] == "gofill":
                        for k, bl in enumerate(blk["blanks"]): pg.locator(f'[data-gf="{i}"][data-b="{k}"]').fill(bl["answers"][0])
                        pg.click(f'[data-gchk="{i}"]')
            elif t == "go":
                pg.wait_for_selector("#submitBtn", timeout=10000)
                if m["mode"] == "fill":
                    for i, bl in enumerate(m["blanks"]): pg.locator(".blank").nth(i).fill(bl["answers"][0])
                else:
                    target = m["orders"][0]
                    for k, line in enumerate(target):
                        cur = pg.evaluate("Array.from(document.querySelectorAll('.order code')).map(e=>e.textContent)")
                        j = cur.index(line, k)
                        for _ in range(j - k):
                            pg.locator(f'[data-up="{j}"]').click(); j -= 1
                pg.click("#submitBtn")
            elif t == "hunt":
                for n in m["bad"]: pg.locator(f'.hl[data-n="{n}"]').click()
                pg.click("#reportBtn"); pg.wait_for_selector("#fixcard", timeout=5000)
                pg.locator(f'.fixopt[data-k="{m["fix"]["answer"]}"]').click()
            elif t == "grid":
                pg.wait_for_selector("#submitBtn", timeout=10000); pg.fill("#code", m["solution"]); pg.click("#submitBtn")
            elif t == "pipe":
                pg.wait_for_selector("#submitBtn", timeout=10000)
                for i in m["answer_steps"]: pg.locator(f'[data-add="{i}"]').click()
                pg.click("#submitBtn")
            elif t == "sql":
                pg.wait_for_selector("#sqlcode", timeout=10000)
                pg.fill("#sqlcode", m["solution"]); pg.click("#submitBtn")
            else:
                if t == "pair":
                    pg.locator(f'.opt[data-i="{m["diagnose"]["answer"]}"]').click(); pg.click("#toFix")
                pg.wait_for_selector("#submitBtn", timeout=10000)
                if t in ("write-code", "fix-the-bug", "pair"):
                    pg.fill("#code", m["solution"])
                elif t == "fill":
                    for i, v in enumerate(aligned_blanks(m["starter"], m["solution"])):
                        pg.locator(".blank").nth(i).fill(v)
                elif t == "order":
                    target = [l for l in m["solution"].rstrip("\n").split("\n") if l.strip()]
                    for k, line in enumerate(target):
                        cur = pg.evaluate("Array.from(document.querySelectorAll('.order code')).map(e=>e.textContent)")
                        j = cur.index(line, k)
                        for _ in range(j - k):
                            pg.locator(f'[data-up="{j}"]').click(); j -= 1
                pg.click("#submitBtn")
            pg.wait_for_selector("#rewardSlot .reward", timeout=25000)
            done += 1
        except Exception as e:
            fails.append((mid, t, str(e).split("\n")[0][:120]))
            pg.screenshot(path=f"/tmp/fail-{mid}.png")
    print(f"played {done}/{len(order)} missions through the UI in {time.time()-t0:.0f}s")
    if ONLY:
        print("FAILS:", fails if fails else "none"); print("\n".join(errs) or "no JS errors"); b.close(); sys.exit(0)
    st = pg.evaluate("(()=>{const s=AK_APP.state();return {solved:Object.keys(s.solved).length,xp:s.xp,stars:AK.totalStars(s),badges:Object.keys(s.badges).length}})()")
    print("state:", st)
    pg.evaluate("location.hash='#/map'"); pg.wait_for_selector(".village"); pg.screenshot(path="/tmp/map-done.png", full_page=True)
    pg.evaluate("location.hash='#/profile'"); pg.wait_for_selector("#wardrobe")
    print("outfits unlocked:", pg.locator(".outfit:not([disabled])").count(), "/", pg.locator(".outfit").count())
    pg.locator('.outfit[data-o="crown"]').click(); pg.wait_for_selector("#wardrobe")
    with pg.expect_download() as d: pg.locator('[data-cert="__grad"]').click()
    print("certificate:", d.value.suggested_filename)
    with pg.expect_download() as d2: pg.locator('[data-cert="loops"]').click()
    print("certificate:", d2.value.suggested_filename)
    pg.screenshot(path="/tmp/profile.png", full_page=True)
    # daily quest
    pg.evaluate("location.hash='#/daily'"); pg.wait_for_selector(".predict")
    for i in range(3):
        ans = pg.evaluate(f"(()=>{{const t=document.querySelectorAll('.predict .pmsg');return 0}})()")
    set_ids = pg.evaluate("AK.dailySet(AK_APP.state(), AK_DATA, new Date()).map(m=>m.answer)")
    cards = pg.locator(".predict")
    for i, a in enumerate(set_ids):
        cards.nth(i).locator(f'.opt[data-i="{a}"] input').check(); cards.nth(i).locator('[data-act="check"]').click()
    pg.wait_for_selector("text=Daily Quest complete", timeout=5000)
    print("daily:", pg.evaluate("(()=>{const s=AK_APP.state();return {dailyXp:s.dailyXp,dailyDone:s.dailyDone}})()"))
    pg.screenshot(path="/tmp/daily.png")
    b.close()
print("FAILS:", fails if fails else "none")
print("\n".join(errs) or "no JS errors")

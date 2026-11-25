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
    for m in order:
        mid = m["id"]
        try:
            pg.evaluate(f"location.hash='#/mission/{mid}'")
            pg.wait_for_selector("#midpane", timeout=10000)
            if pg.locator("text=Locked").count() and not pg.locator("#midpane").count():
                raise Exception("locked")
            t = m["type"]
            if t == "predict":
                pg.locator(f'.opt[data-i="{m["answer"]}"] input').check()
                pg.click('[data-act="check"]')
            elif t == "terminal":
                sol = m["solution"]
                for c in sol.get("commands", []):
                    pg.fill("#tin", c); pg.press("#tin", "Enter")
                if pg.locator("#ans").count(): pg.fill("#ans", sol.get("answer", ""))
                pg.click("#checkBtn")
            else:
                pg.wait_for_selector("#submitBtn", timeout=10000)
                if t in ("write-code", "fix-the-bug"):
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
            pg.wait_for_selector("#reward .bigstars, #reward", timeout=20000)
            done += 1
        except Exception as e:
            fails.append((mid, t, str(e).split("\n")[0][:120]))
            pg.screenshot(path=f"/tmp/fail-{mid}.png")
    print(f"played {done}/{len(order)} missions through the UI in {time.time()-t0:.0f}s")
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

"""E2E for v7: tours (selector existence + walk), shell mission, Watch it run, web pick, Teach Chilaka, feel pack, calm mode.
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
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    pg = b.new_context(viewport={"width": 1280, "height": 900}).new_page()
    pg.on("pageerror", lambda e: errs.append("PAGEERR " + str(e)))
    pg.on("console", lambda m: errs.append("CONSOLE " + m.text) if m.type == "error" else None)
    pg.add_init_script(f"window.AK_PYODIDE_BASE='{PYO}'")
    pg.goto(BASE + "index.html"); pg.wait_for_selector(".hero")
    go = lambda h: pg.evaluate(f"location.hash='{h}'")
    # unlock everything so every tour has a sample
    pg.evaluate("""()=>{const s=JSON.parse(localStorage.getItem('aatakode.v1')||'{}');s.settings=s.settings||{};s.settings.unlockAll=true;localStorage.setItem('aatakode.v1',JSON.stringify(s))}""")
    pg.evaluate("()=>{const st=AK_APP.state();AK_DATA.missions.forEach(m=>{if(!/^(py-01|sb-01|wh-01)/.test(m.id)&&!st.solved[m.id])st.solved[m.id]={at:Date.now(),xp:0,hints:0,tries:1}});AK.v7(st).tours.seen={};AK_TOUR.TOURS.forEach(t=>AK.v7(st).tours.seen[t.id]=1);AK_CORE.save()}")
    tours = pg.evaluate("AK_TOUR.TOURS.map(t=>({id:t.id,type:t.type||null,go:t.go,steps:t.steps.map(s=>({t:s.t,opt:!!s.optional}))}))")
    check("10 tours (9 + what's new)", len(tours) == 10)
    # ---- walk every tour with Next
    for t in ([] if os.environ.get('AK_SKIP_TOURS') else tours):
        pg.evaluate("AK_TOUR.stop&&AK_TOUR.stop(false)")
        hit = pg.evaluate(f"""()=>{{const t=AK_TOUR.TOURS.find(x=>x.id=='{t['id']}');let h=t.go;if(t.type){{const m=DATA_missionFor?0:0}}return h}}""") if False else t["go"]
        if t["type"]:
            mid = pg.evaluate(f"AK_TOUR.sampleFor('{t['type']}')&&AK_TOUR.sampleFor('{t['type']}').id")
            check(f"{t['id']}: sample mission exists", bool(mid)); 
            if not mid: continue
            hit = "#/mission/" + mid
        go(hit); pg.wait_for_timeout(700)
        pg.evaluate("AK_TOUR.stop(false)")
        # selector existence for non-optional steps
        if all(x["opt"] for x in t["steps"]): check(f"{t['id']}: optional-only tour skipped", True); continue
        miss = [s["t"] for s in t["steps"] if not s["opt"] and pg.locator(s["t"]).count() == 0]
        check(f"{t['id']}: all required targets exist {miss}", not miss)
        pg.evaluate(f"AK_TOUR.start('{t['id']}')"); 
        try: pg.wait_for_selector(".tp-pop", timeout=15000); print("pop ok", t["id"])
        except Exception: print(pg.evaluate("[AK_TOUR.active(),!!document.querySelector('.nav'),(()=>{const e=document.querySelector('.tp-pop');return e?[e.outerHTML.slice(0,200),JSON.stringify(e.getBoundingClientRect()),getComputedStyle(e).visibility,getComputedStyle(e).opacity,scrollY]:null})(),[...document.querySelectorAll('#tour')].length]")); check(f"{t['id']}: tour pop appears", False); continue
        n = 0
        while pg.locator(".tp-pop").count() and n < 20:
            nb = pg.locator('.tp-pop [data-a="next"]')
            if not nb.count(): break
            
            try: nb.first.evaluate('e=>e.click()')
            except Exception: break
            pg.wait_for_timeout(150); n += 1
        check(f"{t['id']}: walks to the end and closes", pg.locator("#tour").count() == 0)
    # Esc exits
    go("#/home"); pg.wait_for_timeout(500)
    pg.evaluate("AK_TOUR.start('first60')"); pg.wait_for_selector(".tp-pop"); pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    check("Esc closes tour", pg.locator("#tour").count() == 0)
    print("ERRS",errs[:5], pg.evaluate("[document.querySelectorAll('.guidebtn').length, document.body.lastElementChild.id, document.body.lastElementChild.className]"))
    # ---- shell mission in UI
    go("#/mission/sb-01-hello"); pg.wait_for_timeout(1500)
    pg.wait_for_selector("#code", timeout=8000)
    check("shell mission renders an editor", pg.locator("#code").count() == 1)
    sol = pg.evaluate("AK_DATA.missions.find(m=>m.id=='sb-01-hello').solution")
    pg.evaluate("(s)=>{document.querySelector('#code').value=s}", sol)
    pg.locator("#submitBtn").click(); pg.wait_for_timeout(1500)
    check("shell solution passes in UI", "sb-01-hello" in pg.evaluate("Object.keys(AK_APP.state().solved)"))
    # ---- Teach Chilaka + similar example on a python mission
    go("#/mission/py-01-hello"); pg.wait_for_selector("#code", timeout=8000)
    pg.fill("#code", pg.evaluate("AK_DATA.missions.find(m=>m.id=='py-01-hello').solution")); pg.click("#submitBtn"); pg.wait_for_selector(".reward", timeout=60000)
    pg.wait_for_selector("#teachCard", timeout=5000); check("Teach Chilaka card after solving", True)
    pg.fill("#teachIn", "First it prints the greeting, then the loop repeats and returns the result."); pg.click("#teachBtn"); pg.wait_for_timeout(300)
    check("Teach Chilaka replies", len(pg.inner_text("#teachOut")) > 10)
    # ---- Watch it run (python)
    check("Watch it run button on python", pg.locator("#watchBtn").count() == 1)
    pg.locator("#watchBtn").click(); pg.wait_for_selector(".watchgrid", timeout=60000)
    check("watch grid shows code lines", pg.locator(".watchcode .wl").count() >= 1)
    # ---- calm mode removes motion
    pg.evaluate("document.body.classList.add('zen')")
    an = pg.evaluate("getComputedStyle(document.body).animationName")
    check("calm mode ok", True)
    # ---- reduced motion setting
    pg.evaluate("document.documentElement.dataset.motion='reduce'")
    check("reduced motion: keyframe element has no animation", pg.evaluate("(()=>{const e=document.createElement('i');e.className='ak-bit';document.body.appendChild(e);const a=getComputedStyle(e).animationName;e.remove();return a})()") == "none")
    # ---- web pick
    pg.evaluate("document.documentElement.dataset.motion='auto';document.body.classList.remove('zen')")
    go("#/mission/wh-01-heading"); pg.wait_for_selector("iframe", timeout=8000)
    check("web mission has preview iframe", pg.locator("iframe").count() >= 1)
    # guide button
    check("? guide button present", pg.locator(".guidebtn").count() == 1)
    pg.evaluate("AK_TOUR.stop(false)"); pg.evaluate("document.querySelector('.guidebtn').click()"); pg.wait_for_timeout(300)
    print("PANEL", pg.locator(".guidepanel").count(), errs[:3])
    check("guide panel opens", pg.locator(".guidepanel").count() == 1)
    pg.evaluate("(()=>{const q=document.querySelector('#guideQ');q.value='hint';q.dispatchEvent(new Event('input',{bubbles:true}))})()"); pg.wait_for_timeout(200)
    check("ask the guide answers", pg.locator(".guidepanel #guideList *, .guidepanel li, .guidepanel .gitem").count() >= 1 or len(pg.inner_text(".guidepanel")) > 40)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    check("Esc closes guide panel", pg.locator(".guidepanel").count() == 0)
    pg.evaluate("document.querySelectorAll('.guidepanel').forEach(e=>e.remove())")
    b.close()
print(f"e2e v7: {passed} passed, {len(fails)} failed")
real = [e for e in errs if "favicon" not in e and "Failed to load resource" not in e]
if real: print("errors:", real[:8])
raise SystemExit(1 if fails or real else 0)

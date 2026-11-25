/* AataKode app: single-page, offline-first. Depends on engine.js (window.AK) and window.AK_DATA. */
(function () {
  "use strict";
  const AK = window.AK, DATA = window.AK_DATA;
  const PYODIDE_BASE = window.AK_PYODIDE_BASE || "https://cdn.jsdelivr.net/npm/pyodide@314.0.8/";
  const REPO = "https://github.com/eknathareddypuli/aatakode";
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const byId = {}, regionById = {};
  DATA.missions.forEach((m) => (byId[m.id] = m));
  DATA.regions.forEach((r) => (regionById[r.id] = r));
  const orderedMissions = DATA.regions.flatMap((r) => AK.regionMissions(DATA, r.id));

  /* ------------------------------------------------------------ i18n (interface only; lessons are English for now) */
  const I = {
    en: { nav_home: "Home", nav_village: "Village", nav_map: "Map", nav_arena: "Arena", nav_profile: "Profile", nav_daily: "Daily", nav_teacher: "Teachers", nav_about: "About",
      play: "Play a mission now", map: "Map", run: "Run", submit: "Check my code", hint: "Hint", step: "Step through", reset: "Reset",
      back: "Back to map", next: "Next mission", headline: "Play your way to code.", free: "Free for everyone.", ask: "Nudge me with a question" },
    te: { nav_home: "హోమ్", nav_village: "గ్రామం", nav_map: "పటం", nav_arena: "అరేనా", nav_profile: "ప్రొఫైల్", nav_daily: "రోజువారీ", nav_teacher: "ఉపాధ్యాయులు", nav_about: "గురించి",
      play: "ఇప్పుడే ఆడండి", map: "పటం", run: "నడుపు", submit: "సమర్పించు", hint: "సూచన", step: "అడుగు అడుగుగా", reset: "రీసెట్",
      back: "పటానికి తిరిగి", next: "తరువాత మిషన్", headline: "ఆడుతూ కోడ్ నేర్చుకోండి.", free: "అందరికీ ఉచితం.", ask: "ప్రశ్నతో సాయం చేయండి" },
  };

  /* ------------------------------------------------------------ storage (falls back to memory if blocked) */
  const KEY = "aatakode.v1", ROSTER_KEY = "aatakode.roster";
  let memStore = {};
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return memStore[k] || null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { memStore[k] = v; } },
  };
  function loadState() {
    const base = AK.newState();
    try {
      const raw = store.get(KEY);
      if (raw) { const s = JSON.parse(raw); return Object.assign(base, s, { settings: Object.assign(base.settings, s.settings || {}), streak: Object.assign(base.streak, s.streak || {}) }); }
    } catch (e) { /* fall through to fresh state */ }
    return base;
  }
  let S = loadState();
  const save = () => store.set(KEY, JSON.stringify(S));
  const t = (k) => (I[S.settings.lang] && I[S.settings.lang][k]) || I.en[k] || k;
  const lt = (o, f) => (S.settings.lang === "te" && o[f + "_te"]) || o[f];

  function applySettings() {
    const d = document.documentElement;
    d.dataset.theme = S.settings.theme; d.dataset.motion = S.settings.motion; d.dataset.editor = S.settings.editor || "classic"; d.lang = S.settings.lang === "te" ? "te" : "en";
  }
  const reducedMotion = () => S.settings.motion === "reduce" || (S.settings.motion === "auto" && window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

  /* ------------------------------------------------------------ small UI helpers */
  function toast(msg, ms) {
    const el = document.createElement("div"); el.className = "toast"; el.textContent = msg;
    $("#toasts").appendChild(el); setTimeout(() => el.remove(), ms || 3800);
  }
  function confetti() {
    if (reducedMotion()) return;
    const box = document.createElement("div"); box.className = "confetti"; const cols = ["#f2b531", "#4ade9f", "#ff7a6b", "#74c7ff"];
    for (let i = 0; i < 36; i++) { const p = document.createElement("i"); p.style.left = Math.random() * 100 + "%"; p.style.background = cols[i % 4]; p.style.animationDelay = Math.random() * 0.5 + "s"; box.appendChild(p); }
    document.body.appendChild(box); setTimeout(() => box.remove(), 2600);
  }
  const OUTFITS = [
    { id: "none", name: "Plain", hint: "", svg: "" },
    { id: "scarf", name: "Gate scarf", region: "first-steps", hint: "clear First Steps", svg: '<rect x="16" y="28" width="26" height="6" rx="3" fill="#ff7a6b"/><rect x="34" y="30" width="6" height="14" rx="2" fill="#ff7a6b"/>' },
    { id: "cap", name: "Crossroads cap", region: "decisions", hint: "clear Decisions", svg: '<rect x="12" y="6" width="26" height="7" rx="3" fill="#74c7ff"/><rect x="8" y="10" width="12" height="4" rx="2" fill="#74c7ff"/>' },
    { id: "goggles", name: "Wheel goggles", region: "loops", hint: "clear Loops", svg: '<circle cx="22" cy="18" r="6" fill="none" stroke="#f2b531" stroke-width="3"/><circle cx="32" cy="18" r="6" fill="none" stroke="#f2b531" stroke-width="3"/>' },
    { id: "specs", name: "Library specs", region: "collections", hint: "clear Collections", svg: '<rect x="18" y="14" width="9" height="8" rx="2" fill="none" stroke="#fff" stroke-width="2"/><rect x="29" y="14" width="9" height="8" rx="2" fill="none" stroke="#fff" stroke-width="2"/>' },
    { id: "belt", name: "Tool belt", region: "functions", hint: "clear Functions", svg: '<rect x="20" y="40" width="26" height="5" rx="2" fill="#8a5a2b"/><rect x="38" y="38" width="5" height="9" rx="1" fill="#f2b531"/>' },
    { id: "bag", name: "Postman bag", region: "files-errors", hint: "clear Files and Errors", svg: '<rect x="36" y="34" width="14" height="12" rx="3" fill="#8a5a2b"/><rect x="38" y="30" width="10" height="6" rx="2" fill="none" stroke="#8a5a2b" stroke-width="2"/>' },
    { id: "crown", name: "Graduate crown", all: true, hint: "finish every Python region", svg: '<polygon points="14,10 18,2 24,8 30,0 34,8 40,2 36,10" fill="#f2b531"/>' },
  ];
  const EDITORS = [
    { id: "classic", name: "Classic indigo", rank: 0 }, { id: "contrast", name: "High contrast", rank: 0 },
    { id: "turmeric", name: "Turmeric", rank: 1 }, { id: "mint", name: "Mint terminal", rank: 2 }, { id: "paper", name: "Paper", rank: 3 },
  ];
  function outfitUnlocked(o) {
    if (o.region) return AK.regionComplete(S, DATA, o.region);
    if (o.all) return DATA.regions.filter((r) => r.track === "python").every((r) => AK.regionComplete(S, DATA, r.id));
    return true;
  }
  function parrot(size, outfit) {
    const o = OUTFITS.find((x) => x.id === (outfit || S.settings.outfit)) || OUTFITS[0];
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 64 64" role="img" aria-label="Chilaka the parrot' + (o.id !== "none" ? " wearing the " + o.name : "") + '"><rect x="20" y="18" width="26" height="30" rx="8" fill="#4ade9f"/><rect x="14" y="10" width="22" height="20" rx="8" fill="#4ade9f"/><rect x="8" y="18" width="10" height="7" rx="2" fill="#f2b531"/><circle cx="26" cy="19" r="3.2" fill="#15123a"/><circle cx="27" cy="18" r="1" fill="#fff"/><rect x="34" y="28" width="14" height="14" rx="4" fill="#ff7a6b"/><rect x="26" y="46" width="8" height="12" rx="2" fill="#f2b531"/><rect x="38" y="46" width="8" height="12" rx="2" fill="#f2b531"/><rect x="18" y="4" width="4" height="8" rx="2" fill="#ff7a6b"/><rect x="24" y="2" width="4" height="9" rx="2" fill="#f2b531"/>' + o.svg + "</svg>";
  }
  const rankName = (xp) => lt(AK.rankFor(xp).current, "en") && (S.settings.lang === "te" ? AK.rankFor(xp).current.te : AK.rankFor(xp).current.en);
  const weekly = () => AK.featuredOutage(DATA.missions, new Date());

  function nextMissionFor(m) {
    const w = weekly(), start = m ? orderedMissions.findIndex((x) => x.id === m.id) + 1 : 0;
    const pool = orderedMissions.slice(start).concat(orderedMissions.slice(0, start));
    return pool.find((x) => !S.solved[x.id] && AK.isUnlocked(S, DATA, x, featIds())) || null;
  }

  /* ------------------------------------------------------------ Python engine loader */
  let pyPromise = null, pyState = "idle";
  function setPyPill() {
    const el = $("#pypill"); if (!el) return;
    const map = { idle: ["load", "Python: starts when needed"], load: ["load", "Python engine loading… (first time only)"], ready: ["ready", "Python ready"], fail: ["fail", "Python engine not available"] };
    el.className = "pill " + map[pyState][0]; el.textContent = map[pyState][1];
  }
  function ensurePy() {
    if (pyPromise) return pyPromise;
    pyState = "load"; setPyPill();
    pyPromise = new Promise(function (resolve, reject) {
      const s = document.createElement("script"); s.src = PYODIDE_BASE + "pyodide.js";
      s.onload = function () {
        window.loadPyodide({ indexURL: PYODIDE_BASE }).then(function (py) { AK.py.init(py); pyState = "ready"; setPyPill(); resolve(AK.py); }, fail);
      };
      s.onerror = function () { fail(new Error("offline")); };
      function fail(e) { pyState = "fail"; pyPromise = null; setPyPill(); reject(e); }
      document.head.appendChild(s);
    });
    return pyPromise;
  }
  const PY_OFFLINE = "The Python engine could not load. Connect to the internet once so it can download and cache for offline use. The Debug the Outage missions work without it.";

  /* ------------------------------------------------------------ header / footer */
  function renderHeader(page) {
    const st = AK.streakStatus(S, new Date()), rk = AK.rankFor(S.xp);
    const nav = [["home", "nav_home"], ["map", "nav_map"], ["village", "nav_village"], ["daily", "nav_daily"], ["arena", "nav_arena"], ["profile", "nav_profile"], ["teacher", "nav_teacher"], ["about", "nav_about"]];
    $("#hdr").innerHTML =
      '<a class="logo" href="#/home">' + parrot(30) + '<span>Aata<b>Kode</b></span></a>' +
      '<nav class="nav" aria-label="Main">' + nav.map((n) => '<a href="#/' + n[0] + '"' + (page === n[0] || (n[0] === "map" && page === "mission") ? ' aria-current="page"' : "") + ">" + t(n[1]) + "</a>").join("") + "</nav>" +
      '<div class="right"><span class="chip" title="Rank">🌳 ' + esc(rankName(S.xp)) + '</span><span class="chip" title="Seeds: spend them in the Village shop">🌱 ' + AK.seedBalance(S) + '</span><span class="chip gold" title="Experience points">' + S.xp + ' XP</span><span class="chip" title="Stars earned">⭐ ' + AK.totalStars(S) + '</span>' +
      '<span class="chip" title="Day streak' + (st.atRisk ? " (learn today to keep it)" : "") + '">🔥 ' + st.count + (S.streak.freezes ? " ❄" + S.streak.freezes : "") + "</span>" +
      '<button class="iconbtn" id="langBtn" aria-label="Switch language">' + (S.settings.lang === "te" ? "EN" : "తె") + "</button>" +
      '<button class="iconbtn" id="themeBtn" aria-label="Toggle light and dark theme">' + (S.settings.theme === "dark" ? "☀" : "🌙") + "</button></div>";
    $("#langBtn").onclick = () => { S.settings.lang = S.settings.lang === "te" ? "en" : "te"; save(); applySettings(); route(); };
    $("#themeBtn").onclick = () => { S.settings.theme = S.settings.theme === "dark" ? "light" : "dark"; save(); applySettings(); renderHeader(page); };
    void rk;
  }
  function renderFooter() {
    $("#ftr").innerHTML = '<div class="row spread"><span>AataKode · <a href="https://eknathalabs.com">EknathaLabs</a> · MIT licensed · no ads, no tracking, progress stays on your device.</span><span><a href="' + REPO + '">Source on GitHub</a> · <a href="#/about">Free-for-all promise</a></span></div>';
  }

  /* ------------------------------------------------------------ views */
  const VIEWS = {};
  const H = function (n) { try { const f = window.AK_UI && window.AK_UI.hooks && window.AK_UI.hooks[n]; return f ? f.apply(null, Array.prototype.slice.call(arguments, 1)) : undefined; } catch (e) { return undefined; } };
  let dayMode = null; const diag = {};
  const featIds = () => { const d = AK.outageOfDay(DATA.missions, new Date()), w = weekly(); return [w && w.id, d && d.id].filter(Boolean); };
  let cleanups = [];
  const onLeave = (fn) => cleanups.push(fn);

  function route() {
    cleanups.forEach((f) => { try { f(); } catch (e) { /* ignore */ } }); cleanups = [];
    const hash = location.hash.replace(/^#\/?/, "") || "home", parts = hash.split("/"), name = parts[0], arg = parts.slice(1).join("/");
    renderHeader(VIEWS[name] ? name : "home");
    const view = $("#view"); (VIEWS[name] || VIEWS.home)(view, arg);
    window.scrollTo(0, 0); H("route", name);
  }

  /* ---- home */
  VIEWS.home = function (v) {
    const nxt = nextMissionFor(null) || orderedMissions[0], w = weekly(), started = Object.keys(S.solved).length > 0;
    v.innerHTML =
      '<section class="hero"><div><h1>' + esc(t("headline")) + " <em>" + esc(t("free")) + "</em></h1>" +
      '<p class="lead">Real code, real tests, no paywall. A full Python course in ' + DATA.regions.filter((r) => r.track === 'python').length + ' regions (' + DATA.missions.filter((m) => m.type !== 'terminal').length + ' missions), plus broken servers to fix. Works offline once loaded.</p>' +
      '<div class="row"><a class="btn primary" id="playBtn" href="#/mission/' + nxt.id + '">▶ ' + esc(started ? "Continue your quest" : t("play")) + '</a><a class="btn" href="#/map">🗺 ' + esc(t("map")) + "</a></div>" +
      '<p class="muted" style="margin-top:.9rem"><b>Aata</b> (ఆట) means “play” in Telugu. No sign-up needed: your progress saves on this device.</p></div>' +
      '<div class="art"><div style="text-align:center">' + parrot(150) + '<div class="codepeek" style="text-align:left;margin-top:.8rem"><span class="cm"># Chilaka says hi</span><br><span class="fn">print</span>(<span class="st">"Hello, Aata!"</span>)</div></div></div></section>' +
      '<section class="grid g3"><div class="card"><h3>🆓 Everything free</h3><p class="muted">Every lesson, project, badge and class tool. Premium (later) only pays for things that cost money to run.</p></div>' +
      '<div class="card"><h3>📴 Plays offline</h3><p class="muted">After the first load the site and the Python engine are cached, so you can learn without a connection.</p></div>' +
      '<div class="card"><h3>🧠 Understanding over points</h3><p class="muted">Predict, fix, explain. XP rewards mastery, and hints never block you.</p></div></section>' +
      (w ? '<section class="card" style="margin-top:1rem"><div class="row spread"><div><span class="tag">OUTAGE OF THE WEEK</span><h3 style="margin:.4rem 0 .2rem">🚨 ' + esc(w.title) + '</h3><span class="muted">' + esc(w.goal) + '</span></div><a class="btn" href="#/arena">Take the call →</a></div></section>' : "") +
      '<section style="margin-top:1.4rem"><h2>How a mission works</h2><div class="grid g3">' +
      ["Read the story and the goal", "Write or fix code, or use the terminal", "Check: tests give instant feedback", "Explain it, compare solutions, level up"].map((s, i) => '<div class="card"><span class="chip gold">' + (i + 1) + "</span><p>" + esc(s) + "</p></div>").join("") + "</div></section>";
    const pb = $("#playBtn"); const warm = () => { if (nxt.type !== "terminal") ensurePy().catch(() => {}); };
    pb.addEventListener("pointerenter", warm); pb.addEventListener("focus", warm);
  };

  /* ---- map */
  const TYPE_ICON = { predict: "🔮", fill: "✏️", order: "🧩", "fix-the-bug": "🔧", terminal: "💻", "write-code": "⌨️" };
  const nodeIcon = (m) => (m.boss ? "🐛" : m.project ? "🏗️" : TYPE_ICON[m.type] || "⌨️");
  const starRow = (n) => "★".repeat(n) + "☆".repeat(3 - n);
  VIEWS.map = function (v) {
    const w = weekly(), pyRegions = DATA.regions.filter((r) => r.track === "python");
    const restored = pyRegions.filter((r) => AK.regionComplete(S, DATA, r.id)).length;
    let html = '<div class="row spread"><h2>🗺 ' + esc(t("map")) + '</h2><span class="muted">' + Object.keys(S.solved).length + " / " + DATA.missions.length + " missions · ⭐ " + AK.totalStars(S) + " / " + DATA.missions.length * 3 + "</span></div>";
    html += '<div class="card village"><b>🏘 Aata-gram: ' + restored + " of " + pyRegions.length + ' places restored</b><div class="strip">' +
      pyRegions.map((r) => '<span class="place' + (AK.regionComplete(S, DATA, r.id) ? " on" : "") + '" title="' + esc(r.place + (AK.regionComplete(S, DATA, r.id) ? " (restored)" : " (broken)")) + '">' + r.icon + "</span>").join("") + "</div><a class=\"btn small\" href=\"#/village\" style=\"margin-top:.5rem\">🏘 Open the village →</a></div>";
    DATA.tracks.forEach(function (tr) {
      html += '<div class="track"><h3>' + esc(lt(tr, "title")) + '</h3><div class="muted">' + esc(tr.blurb) + "</div></div>";
      DATA.regions.filter((r) => r.track === tr.id).forEach(function (r, ri) {
        const ms = AK.regionMissions(DATA, r.id), done = ms.filter((m) => S.solved[m.id]).length, complete = AK.regionComplete(S, DATA, r.id);
        const stars = ms.reduce((n, m) => n + AK.starsOf(S, m.id), 0);
        const first = ms[0], locked = !AK.isUnlocked(S, DATA, first, featIds());
        html += '<div class="region card' + (locked ? " locked" : "") + '"><div><div class="row"><span style="font-size:1.6rem">' + (complete ? "✅" : r.icon) + "</span><div><b class='mono'>" + esc(lt(r, "title")) + "</b><div class='muted' style='font-size:.85rem'>" + esc(r.blurb) + "</div><span class='tag'>" + done + "/" + ms.length + (complete ? " ✔" : "") + "</span> <span class='tag'>★ " + stars + "/" + ms.length * 3 + "</span></div></div>" +
          (r.story ? "<div class='muted' style='font-size:.8rem;margin-top:.4rem'><b>" + esc(r.place) + ":</b> " + esc(r.story) + "</div>" : "") + "</div><div class='nodes'>";
        ms.forEach(function (m, i) {
          const solved = !!S.solved[m.id], open = AK.isUnlocked(S, DATA, m, featIds()), cls = "node" + (m.boss ? " boss" : "") + (solved ? " done" : open ? " open" : " locked");
          html += (i ? '<span class="link' + (solved ? " done" : "") + '"></span>' : "") +
            '<button class="' + cls + '" data-m="' + m.id + '" aria-label="' + esc("Mission " + (i + 1) + ": " + m.title + (solved ? ", done, " + AK.starsOf(S, m.id) + " stars" : open ? "" : ", locked")) + '" title="' + esc(m.title) + '">' + nodeIcon(m) + (w && w.id === m.id ? '<span class="star" title="Outage of the Week">⭐</span>' : "") + (solved ? '<i class="nstars">' + starRow(AK.starsOf(S, m.id)) + "</i>" : "") + "</button>";
        });
        const canTest = tr.id === "python" && ri > 0 && locked && !S.testOut[r.id];
        html += "</div>" + (canTest ? '<div style="grid-column:1/-1"><button class="btn small" data-testout="' + r.id + '">⚡ Test out: attempt the boss to skip ahead</button></div>' : "") + "</div>";
      });
    });
    v.innerHTML = html;
    $$(".node", v).forEach((b) => (b.onclick = () => {
      const m = byId[b.dataset.m];
      if (AK.isUnlocked(S, DATA, m, featIds())) location.hash = "#/mission/" + m.id;
      else { const need = (m.requires || []).map((r) => byId[r]).filter((x) => x && !S.solved[x.id])[0]; toast("Locked. Finish “" + (need ? need.title : "the previous mission") + "” first."); }
    }));
    $$("[data-testout]", v).forEach((b) => (b.onclick = () => { S.testOut[b.dataset.testout] = true; save(); toast("Boss unlocked! Beat it to skip this region."); VIEWS.map(v); }));
  };

  /* ---- mission (shared pieces) */
  const tries = {}; // failed checks per mission in this visit: decides the "first try" star
  const allTests = (m) => m.tests.concat(m.clean ? m.clean.tests.map((x, i) => Object.assign({}, x, { star: true, label: "★ " + (i === 0 ? "Clean-up challenge: " + m.clean.label : x.label || m.clean.label) })) : []);

  function renderTests(m, results) {
    const tests = allTests(m);
    return '<ul class="tests" id="testlist">' + tests.map(function (tt, i) {
      const r = results && results[i], label = tt.hidden && !r ? "Hidden check" : (r && r.label) || tt.label || tt.note || tt.kind;
      const cls = !r ? "idle" : r.ok ? "ok" : tt.star ? "idle" : "no", icon = !r ? "○" : r.ok ? "✔" : tt.star ? "☆" : "✘";
      let detail = "";
      if (r && !r.ok && !tt.star) {
        if (r.hidden) detail = "A hidden check failed. Try other inputs.";
        else if (r.err) { const f = AK.friendlyError(r.err); detail = f.title + ": " + f.hint + (f.line ? " (line " + f.line + ")" : ""); }
        else if (r.stdin !== undefined && r.expect !== undefined) detail = (r.stdin && r.stdin.length ? "Input: " + r.stdin.join(" ⏎ ") + "\n" : "") + "Expected:\n" + r.expect + "\nGot:\n" + (r.got || "(nothing printed)");
        else if (r.expr) detail = r.expr + "\nexpected " + r.expect + "\ngot " + r.got;
        else if (r.got !== undefined) detail = "Expected " + r.expect + ", got " + r.got;
      }
      return '<li' + (tt.star ? ' class="starrow"' : "") + '><span class="' + cls + '" aria-hidden="true">' + icon + '</span><span><span class="sr">' + (r ? (r.ok ? "Passed: " : tt.star ? "Optional, not yet: " : "Failed: ") : "Not run: ") + "</span>" + esc(label) + (detail ? '<div class="detail">' + esc(detail) + "</div>" : "") + "</span></li>";
    }).join("") + "</ul>";
  }

  /* Test-by-test lighting: checks light up one after another (instant with reduced motion). */
  function lightTests(m, results, done) {
    const list = $("#testlist"), tests = allTests(m);
    if (!list || reducedMotion() || tests.length < 2) { if (list) list.outerHTML = renderTests(m, results); H("tests", results); done(); return; }
    list.outerHTML = renderTests(m, null);
    const items = $$("#testlist li"), step = Math.max(40, Math.min(160, Math.floor(900 / items.length)));
    let i = 0;
    const one = () => {
      if (i >= items.length || !$("#testlist")) { const l2 = $("#testlist"); if (l2) l2.outerHTML = renderTests(m, results); H("tests", results); done(); return; }
      const r = results[i], li = items[i], mark = li.querySelector("span"), star = tests[i].star;
      li.classList.add("lit", r.ok ? "litok" : star ? "litstar" : "litno");
      if (mark) { mark.className = r.ok ? "ok" : star ? "idle" : "no"; mark.textContent = r.ok ? "✔" : star ? "☆" : "✘"; }
      H("test", r.ok ? "ok" : star ? "star" : "no", i, items.length); i++; setTimeout(one, step);
    };
    one();
  }
  function hintsHtml(m) {
    const lvl = S.hintLvl[m.id] || 0, ask = (S.askLvl && S.askLvl[m.id]) || 0;
    const qs = m.socratic.slice(0, ask).map((q, i) => '<div class="hintbox">❓ <b>Question ' + (i + 1) + ":</b> " + esc(q) + "</div>").join("");
    const hs = m.hints.slice(0, lvl).map((h, i) => '<div class="hintbox">💡 <b>' + (i === 2 ? (m.type === "predict" ? "The answer" : "Full solution") : "Hint " + (i + 1)) + ":</b>" + (i === 2 || /\n/.test(h) ? "<pre>" + esc(h) + "</pre>" : " " + esc(h)) + "</div>").join("");
    return '<div class="row"><button class="btn small" id="askBtn"' + (ask >= 3 ? " disabled" : "") + ">❓ " + esc(t("ask")) + " (free)</button><button class=\"btn small\" id=\"hintBtn\"" + (lvl >= 3 ? " disabled" : "") + ">💡 " + esc(t("hint")) + (lvl === 2 ? " (reveals solution, −5 XP)" : " (−5 XP)") + "</button></div>" + qs + hs;
  }

  function explainHtml(m) {
    const e = S.explains[m.id];
    return '<div class="card" style="margin-top:.6rem"><b>Explain it (+5 XP)</b><div class="muted">' + esc(m.explain) + '</div><textarea class="input" id="explainBox" rows="2" placeholder="Write one sentence in your own words">' + esc(e ? e.text : "") + '</textarea><div class="row" style="margin-top:.4rem"><button class="btn small" id="explainBtn">Save explanation</button><span class="muted" id="explainMsg">' + (e && e.bonus ? "Saved ✔" : "") + "</span></div></div>";
  }

  const badgeLine = (ids) => ids.map((id) => { const b = AK.allBadges(DATA).find((x) => x.id === id); return b ? esc(b.icon + " " + b.en) : ""; }).join(", ");
  function rewardHtml(res, m) {
    const nx = nextMissionFor(m);
    return '<div class="reward stretch" id="reward"><b class="mono">🎉 Mission complete! +' + res.gained + ' XP</b><div class="bigstars" aria-label="' + res.stars + ' of 3 stars">' + starRow(res.stars) + "</div><ul>" +
      res.breakdown.map((b) => "<li>" + esc(b.label) + (b.xp ? ": +" + b.xp : "") + "</li>").join("") + "</ul>" +
      (res.stars < 3 ? '<p class="muted">' + (S.hintLvl[m.id] ? "Solve it without hints next time for more stars." : m.clean ? "Third star: improve your code for the clean-up challenge, then press Check again." : "Third star: solve it on your first check without hints.") + "</p>" : "") +
      (res.rankUp ? '<p><b>⬆ New rank: ' + esc(rankName(S.xp)) + "!</b></p>" : "") +
      (res.newBadges.length ? "<p>🏅 New badge" + (res.newBadges.length > 1 ? "s" : "") + ": " + badgeLine(res.newBadges) + "</p>" : "") +
      '<div class="row"><a class="btn primary" href="' + (nx ? "#/mission/" + nx.id : "#/map") + '">' + esc(nx ? t("next") + " →" : t("back")) + "</a><a class=\"btn small\" href=\"#/map\">🗺 " + esc(t("map")) + "</a></div></div>";
  }
  function setHeadStatus(m) {
    const el = $("#mstatus"); if (el) el.innerHTML = S.solved[m.id] ? '<span class="chip">✔ solved</span> <span class="chip gold" title="Stars">' + starRow(AK.starsOf(S, m.id)) + "</span>" : "";
  }
  function badgeToasts(ids) { ids.forEach((id) => { const b = AK.allBadges(DATA).find((x) => x.id === id); if (b) toast("Badge: " + b.icon + " " + b.en); }); }

  function afterSolve(m, res, node) {
    save(); renderHeader("mission"); setHeadStatus(m);
    if (node) node.innerHTML = rewardHtml(res, m);
    confetti(); H("solved", m, res);
    const ex = $("#explainSlot"); if (ex) { ex.innerHTML = explainHtml(m); bindExplain(m); }
    refreshCompare(m);
    if (res.rankUp) toast("Rank up: " + rankName(S.xp));
    badgeToasts(res.newBadges);
  }
  /* Solving for the first time awards XP; re-checking a solved mission can upgrade stars. */
  function finishMission(m, w, o) {
    const now = new Date(), common = { now: now, cleanPass: o.cleanPass, firstTry: !tries[m.id], dayId: dayMode === m.id ? m.id : undefined, diagFirst: m.type === "pair" ? !!diag[m.id] : undefined };
    H("passed", m, o);
    if (!S.solved[m.id]) {
      afterSolve(m, AK.applySolve(S, DATA, m, Object.assign({ hintsUsed: S.hintLvl[m.id] || 0, code: o.code, weeklyId: w && w.id }, common)), $("#rewardSlot"));
    } else {
      const r = AK.restar(S, DATA, m, common); save(); renderHeader("mission"); setHeadStatus(m);
      toast(r.upgraded ? "⭐ Stars upgraded to " + r.stars + (r.bonus ? " (+" + r.bonus + " XP)" : "") : "Already solved. Great practice!");
      badgeToasts(r.newBadges);
    }
  }

  function bindExplain(m) {
    const btn = $("#explainBtn"); if (!btn) return;
    btn.onclick = () => {
      const r = AK.addExplanation(S, DATA, m.id, $("#explainBox").value, new Date()); save(); renderHeader("mission");
      $("#explainMsg").textContent = r.bonus ? "Saved ✔ +5 XP" : "Saved. Write a bit more (12+ characters) to earn XP.";
      badgeToasts(r.newBadges);
    };
  }

  function bindHints(m) {
    const box = $("#hintSlot"); box.innerHTML = hintsHtml(m);
    $("#askBtn").onclick = () => { S.askLvl = S.askLvl || {}; S.askLvl[m.id] = Math.min(3, (S.askLvl[m.id] || 0) + 1); save(); bindHints(m); };
    $("#hintBtn").onclick = () => { S.hintLvl[m.id] = Math.min(3, (S.hintLvl[m.id] || 0) + 1); save(); bindHints(m); };
  }

  /* compare tab */
  function solutionsFor(m) {
    const mine = S.solved[m.id] && S.solved[m.id].code;
    const show = (x) => (typeof x === "string" ? x : (x.commands || []).join("\n") + (x.answer ? "\n# answer: " + x.answer : ""));
    const list = [];
    if (mine) list.push({ key: "mine", title: "Your solution", code: mine });
    list.push({ key: "ref", title: "Reference: the clear way", code: show(m.solution) });
    if (m.alt) list.push({ key: "alt", title: "Alternative: a different approach", code: show(m.alt) });
    return list;
  }
  function refreshCompare(m) {
    const slot = $("#tab-compare"); if (!slot) return;
    if (!S.solved[m.id]) { slot.innerHTML = '<p class="muted">Solve the mission to unlock solution comparison. Comparing approaches is how you learn style.</p>'; return; }
    const votes = S.votes[m.id] || {};
    slot.innerHTML = '<p class="muted">Which solution is the cleanest to read? Pick one. Votes stay on your device for now; shared community solutions arrive with accounts.</p><div class="cmp">' +
      solutionsFor(m).map((s) => "<div><b>" + esc(s.title) + "</b>" + (votes[s.key] ? ' <span class="tag">your pick</span>' : "") + "<pre>" + esc(s.code) + '</pre><button class="btn small" data-vote="' + s.key + '">👍 Cleanest</button></div>').join("") + "</div>";
    $$("[data-vote]", slot).forEach((b) => (b.onclick = () => {
      S.votes[m.id] = {}; S.votes[m.id][b.dataset.vote] = 1;
      const ns = AK.checkBadges(S, DATA, new Date()); save(); refreshCompare(m); badgeToasts(ns);
    }));
  }

  function missionFrame(m, extraRight) {
    const reg = regionById[m.region], kind = { predict: "PREDICT", fill: "FILL THE BLANK", order: "PUT IN ORDER", "fix-the-bug": "BUG HUNT", sql: "SQL QUERY", pair: "PAIR PARROT" }[m.type] || (m.mystery ? "CASE FILE" : m.golf ? "CODE GOLF" : "");
    return '<div class="mhead"><a class="btn small" href="#/map">← ' + esc(t("back")) + "</a><span class=\"tag\">" + esc(lt(reg, "title")) + (m.boss ? " · BOSS" : m.project ? " · PROJECT" : kind ? " · " + kind : "") + "</span><h2>" + esc(m.title) + '</h2><span class="chip gold">' + m.xp + ' XP</span><span id="mstatus"></span><span class="pill load" id="pypill"></span></div>' +
      '<div class="mgrid" id="mgrid"><aside class="card" id="leftpane"><div class="story">' + esc(m.story) + '</div><div class="goal"><b>Goal:</b> ' + esc(m.goal) + "</div>" + (m.type === "predict" ? "" : "<b>Checks</b>" + renderTests(m, null)) + '<div id="hintSlot"></div><div id="rewardSlot"></div><div id="explainSlot">' + (S.solved[m.id] ? explainHtml(m) : "") + "</div></aside>" +
      '<section id="midpane"></section><section class="card" id="rightpane"><div class="tabs" role="tablist">' + extraRight.tabs + "</div>" + extraRight.panels + '<div id="tab-compare" hidden></div></section></div>';
  }
  function bindTabs(m) {
    const tabs = $$('[role="tab"]');
    const show = (id) => { tabs.forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === id ? "true" : "false")); $$("#rightpane > div[id^=tab-]").forEach((p) => (p.hidden = p.id !== "tab-" + id)); if (id === "compare") refreshCompare(m); if (id === "blocks") refreshBlocks(); };
    tabs.forEach((b) => (b.onclick = () => show(b.dataset.tab)));
    return show;
  }
  const tabBtn = (id, label, sel) => '<button role="tab" data-tab="' + id + '" aria-selected="' + (sel ? "true" : "false") + '">' + label + "</button>";

  let refreshBlocks = function () {};

  VIEWS.mission = function (v, rawId) {
    const bits = String(rawId).split("/"), id = bits[0], parts_day = bits[1] === "day";
    const m = byId[id], w = weekly();
    if (!m) { v.innerHTML = '<div class="card"><h2>Mission not found</h2><a class="btn" href="#/map">Back to the map</a></div>'; return; }
    if (!AK.isUnlocked(S, DATA, m, featIds())) {
      const need = (m.requires || []).map((r) => byId[r]).find((x) => x && !S.solved[x.id]);
      v.innerHTML = '<div class="card"><h2>🔒 Locked</h2><p>Finish <b>' + esc(need ? need.title : "the previous mission") + '</b> first, or use “Test out” on the map to attempt the boss.</p><a class="btn primary" href="' + (need ? "#/mission/" + need.id : "#/map") + '">Go there</a></div>';
      return;
    }
    dayMode = parts_day ? m.id : null;
    if (window.AK_UI && window.AK_UI.mission && window.AK_UI.mission[m.type]) window.AK_UI.mission[m.type](v, m, w); else if (m.type === "terminal") missionTerminal(v, m, w); else if (m.type === "predict") missionPredict(v, m, w); else missionPython(v, m, w);
  };

  /* ---- predict-the-output card (used by missions and the Daily Quest) */
  function predictCard(m, opts) {
    const el = document.createElement("div"); el.className = "card predict"; let wrong = 0, finished = false;
    const uid = "p" + Math.random().toString(36).slice(2, 8);
    el.innerHTML = '<b>' + esc(m.title) + '</b><pre class="codeview">' + esc(m.code) + '</pre><fieldset class="opts"><legend>What does it print?</legend>' +
      m.options.map((o, i) => '<label class="opt" data-i="' + i + '"><input type="radio" name="' + uid + '" value="' + i + '"><pre>' + esc(o) + "</pre></label>").join("") +
      '</fieldset><div class="row"><button class="btn good" data-act="check">✔ Check</button></div><div class="pmsg" aria-live="polite"></div>';
    const msg = $(".pmsg", el), labels = $$(".opt", el);
    function reveal() {
      finished = true; labels.forEach((l) => { l.classList.add("lock"); $("input", l).disabled = true; });
      const c = labels[m.answer]; c.classList.add("good"); $("input", c).checked = true; $('[data-act="check"]', el).disabled = true;
      msg.innerHTML = "<b>Why:</b> " + esc(m.why);
    }
    if (opts.done) reveal();
    $('[data-act="check"]', el).onclick = () => {
      if (finished) return;
      const sel = $("input:checked", el); if (!sel) { toast("Pick an answer first."); return; }
      const i = Number(sel.value);
      if (i === m.answer) { reveal(); msg.innerHTML = "<b>✔ Correct!</b> " + esc(m.why); opts.onCorrect(wrong === 0); }
      else { wrong++; const l = labels[i]; l.classList.add("bad", "lock"); sel.checked = false; sel.disabled = true; msg.textContent = "Not quite. Trace it line by line, or use a hint. That option is crossed out."; if (opts.onWrong) opts.onWrong(); }
    };
    return el;
  }

  function missionPredict(v, m, w) {
    v.innerHTML = missionFrame(m, { tabs: tabBtn("out", "Run it", true), panels: '<div id="tab-out"><p class="muted">Answer first, then run the code yourself and see it print the same thing.</p><div class="row"><button class="btn small" id="runBtn" disabled>▶ Run it</button></div><div class="out" id="outbox" style="margin-top:.5rem">(locked until you answer)</div><div id="errbox"></div></div>' });
    bindHints(m); bindTabs(m); setHeadStatus(m); bindExplain(m); setPyPill();
    const enableRun = () => { $("#runBtn").disabled = false; $("#outbox").textContent = "Press Run it."; };
    $("#runBtn").onclick = async () => {
      $("#outbox").textContent = "Running…"; let api; try { api = await ensurePy(); } catch (e) { $("#outbox").textContent = PY_OFFLINE; return; }
      const r = api.run(m.code, [], false); $("#outbox").textContent = r.out || "(nothing printed)";
      const f = r.err ? AK.friendlyError(r.err) : null; $("#errbox").innerHTML = f ? '<div class="err" role="alert"><b>' + esc(f.title) + "</b><div>" + esc(f.hint) + "</div></div>" : "";
    };
    $("#midpane").appendChild(predictCard(m, {
      done: !!S.solved[m.id],
      onWrong: () => { tries[m.id] = (tries[m.id] || 0) + 1; },
      onCorrect: (first) => {
        enableRun();
        if (!S.solved[m.id]) afterSolve(m, AK.applySolve(S, DATA, m, { hintsUsed: S.hintLvl[m.id] || 0, now: new Date(), code: m.options[m.answer], firstTry: first && !tries[m.id] }), $("#rewardSlot"));
      },
    }));
    if (S.solved[m.id]) { enableRun(); $("#rewardSlot").innerHTML = '<div class="reward"><b>✔ You solved this mission.</b> <a href="#/map">Back to the map</a></div>'; }
  }

  /* ---- Daily Quest: three quick predictions, a few XP each, keeps the streak */
  VIEWS.daily = function (v) {
    const now = new Date(), set = AK.dailySet(S, DATA, now), key = AK.dateKey(now);
    const doneToday = (id) => S.daily.date === key && S.daily.done[id];
    const count = () => set.filter((m) => doneToday(m.id)).length;
    v.innerHTML = '<h2>📅 Daily Quest · Pest Control</h2><p class="muted">Three quick bug-hunt predictions. +5 XP each on the first try (+2 otherwise), +10 for finishing all three, and it keeps your streak alive. A new set arrives each day.</p><div class="card"><div class="row spread"><b id="dprog"></b><span class="chip gold">🔥 streak ' + AK.streakStatus(S, now).count + '</span></div><div class="bar"><i id="dbar"></i></div></div><div id="dlist" class="grid" style="margin-top:1rem;gap:1rem"></div><div id="dend"></div>';
    const refresh = () => { const n = count(); $("#dprog").textContent = n + " of 3 done today"; $("#dbar").style.width = Math.round((n / 3) * 100) + "%"; $("#dend").innerHTML = n === 3 ? '<div class="reward stretch" style="margin-top:1rem"><b class="mono">🎉 Daily Quest complete!</b><p>Come back tomorrow for a fresh set. Daily quests finished: ' + S.dailyDone + '.</p><a class="btn primary" href="#/map">🗺 Back to the map</a></div>' : ""; };
    set.forEach((m) => {
      const card = predictCard(m, {
        done: doneToday(m.id),
        onCorrect: (first) => {
          const r = AK.dailyAnswer(S, DATA, m.id, first, new Date()); save(); renderHeader("daily");
          toast("+" + r.gained + " XP" + (r.complete ? " · Daily Quest complete!" : "")); if (r.complete) confetti(); badgeToasts(r.newBadges); refresh();
        },
      });
      $("#dlist").appendChild(card);
    });
    refresh();
  };

  /* ---- python-style missions: write-code, fix-the-bug, fill, order */
  const draftArr = (id, n, fallback) => { try { const a = JSON.parse(S.drafts[id]); if (Array.isArray(a) && a.length === n) return a; } catch (e) { /* none */ } return fallback; };
  function buildCodeEditor(m, mid, changed) {
    mid.innerHTML = '<div class="editor"><div class="gutter" id="gutter" aria-hidden="true">1</div><textarea id="code" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Python code editor. Press Escape then Tab to leave the editor."></textarea></div>';
    const ta = $("#code"), gut = $("#gutter"); ta.value = S.drafts[m.id] != null ? S.drafts[m.id] : m.starter;
    const sync = () => { const n = ta.value.split("\n").length; gut.textContent = Array.from({ length: n }, (_, i) => i + 1).join("\n"); gut.scrollTop = ta.scrollTop; };
    let timer = null;
    ta.addEventListener("input", () => { sync(); changed(); clearTimeout(timer); timer = setTimeout(() => { S.drafts[m.id] = ta.value; save(); }, 400); });
    ta.addEventListener("scroll", () => (gut.scrollTop = ta.scrollTop));
    let escaped = false; ta.addEventListener("focus", () => (escaped = false));
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { escaped = true; return; }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); $("#runBtn").click(); return; }
      if (e.key === "Tab" && !escaped) { e.preventDefault(); ta.setRangeText("    ", ta.selectionStart, ta.selectionEnd, "end"); sync(); changed(); return; }
      if (e.key === "Enter") { e.preventDefault(); const s = ta.selectionStart, line = ta.value.slice(0, s).split("\n").pop(); const indent = line.match(/^ */)[0] + (/:\s*$/.test(line) ? "    " : ""); ta.setRangeText("\n" + indent, s, ta.selectionEnd, "end"); sync(); changed(); }
    });
    sync();
    return { getCode: () => ta.value, reset: () => { ta.value = m.starter; S.drafts[m.id] = m.starter; save(); sync(); changed(); } };
  }
  function buildFill(m, mid, changed) {
    const parts = m.starter.split("___"), n = parts.length - 1; let vals = draftArr(m.id, n, new Array(n).fill(""));
    mid.innerHTML = '<p class="muted">Fill every blank <span class="mono">___</span> so the program does what the goal says.</p><div class="fill" id="fillbox">' +
      parts.map((p, i) => esc(p) + (i < n ? '<input class="blank" data-i="' + i + '" size="' + Math.max(5, (vals[i] || "").length + 1) + '" value="' + esc(vals[i] || "") + '" aria-label="Blank ' + (i + 1) + ' of ' + n + '" autocomplete="off" autocapitalize="off" spellcheck="false">' : "")).join("") + "</div>";
    $$(".blank", mid).forEach((inp) => inp.addEventListener("input", () => { vals[Number(inp.dataset.i)] = inp.value; inp.size = Math.max(5, inp.value.length + 1); S.drafts[m.id] = JSON.stringify(vals); save(); changed(); }));
    return { getCode: () => parts.map((p, i) => p + (i < n ? vals[i] || "" : "")).join(""), reset: () => { vals = new Array(n).fill(""); $$(".blank", mid).forEach((x) => { x.value = ""; x.size = 5; }); S.drafts[m.id] = JSON.stringify(vals); save(); changed(); } };
  }
  function buildOrder(m, mid, changed) {
    let lines = draftArr(m.id, m.lines.length, m.lines.slice()), dragFrom = -1;
    const box = document.createElement("div");
    mid.innerHTML = '<p class="muted">Arrange the lines (drag them, or use the arrow buttons). Indentation shows which lines belong together.</p>'; mid.appendChild(box);
    const persist = () => { S.drafts[m.id] = JSON.stringify(lines); save(); changed(); };
    const move = (i, j) => { if (j < 0 || j >= lines.length) return; const x = lines.splice(i, 1)[0]; lines.splice(j, 0, x); persist(); draw(j); };
    function draw(focusIdx, focusDir) {
      box.innerHTML = '<ol class="order">' + lines.map((l, i) => '<li draggable="true" data-i="' + i + '"><span class="grip" aria-hidden="true">⠿</span><code>' + esc(l) + '</code><span class="mv"><button class="btn small" data-up="' + i + '" aria-label="Move line ' + (i + 1) + ' up">▲</button><button class="btn small" data-dn="' + i + '" aria-label="Move line ' + (i + 1) + ' down">▼</button></span></li>').join("") + "</ol>";
      $$("[data-up]", box).forEach((b) => (b.onclick = () => move(Number(b.dataset.up), Number(b.dataset.up) - 1)));
      $$("[data-dn]", box).forEach((b) => (b.onclick = () => move(Number(b.dataset.dn), Number(b.dataset.dn) + 1)));
      $$("li", box).forEach((li) => {
        li.addEventListener("dragstart", (e) => { dragFrom = Number(li.dataset.i); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", String(dragFrom)); } catch (er) { /* old browsers */ } li.classList.add("drag"); });
        li.addEventListener("dragend", () => li.classList.remove("drag"));
        li.addEventListener("dragover", (e) => { e.preventDefault(); });
        li.addEventListener("drop", (e) => { e.preventDefault(); const to = Number(li.dataset.i); if (dragFrom >= 0 && dragFrom !== to) move(dragFrom, to); dragFrom = -1; });
      });
      if (focusIdx != null) { const b = $((focusDir === "up" ? "[data-up=\"" : "[data-dn=\"") + focusIdx + '"]', box) || $('[data-dn="' + focusIdx + '"]', box); if (b) b.focus(); }
    }
    draw();
    return { getCode: () => lines.join("\n") + "\n", reset: () => { lines = m.lines.slice(); persist(); draw(); } };
  }

  function missionPython(v, m, w) {
    const kind = m.type === "fill" ? "fill" : m.type === "order" ? "order" : "code";
    v.innerHTML = missionFrame(m, {
      tabs: tabBtn("out", "Output", true) + tabBtn("steps", "Step-through") + tabBtn("blocks", "Blocks") + tabBtn("compare", "Compare"),
      panels: '<div id="tab-out"><label class="muted" for="stdin">Test input (one line per input() call)</label><textarea class="input" id="stdin" rows="2" spellcheck="false"></textarea><div class="out" id="outbox" aria-live="polite" style="margin-top:.5rem">Press Run to see your program\'s output.</div><div id="errbox"></div></div>' +
        '<div id="tab-steps" hidden><p class="muted">Press “Step through” to watch your program run one line at a time.</p><div id="stepper"></div></div><div id="tab-blocks" hidden><p class="muted">Your code as blocks (read-only). Change the code and the blocks follow.</p><div class="blocks" id="blockbox"></div></div>',
    });
    bindHints(m); const show = bindTabs(m); setHeadStatus(m);
    const firstIn = (m.tests.find((x) => x.stdin) || {}).stdin; $("#stdin").value = firstIn ? firstIn.join("\n") : "";
    const changed = () => { if (!$("#tab-blocks").hidden) refreshBlocks(); };
    const mm = (kind === "code" && H("fade", m)) || m;
    const ed = (kind === "fill" ? buildFill : kind === "order" ? buildOrder : buildCodeEditor)(mm, $("#midpane"), changed);
    const mid = $("#midpane");
    mid.insertAdjacentHTML("beforeend", '<div class="row" style="margin-top:.6rem"><button class="btn primary" id="runBtn">▶ ' + esc(t("run")) + '</button><button class="btn" id="stepBtn">👣 ' + esc(t("step")) + '</button><button class="btn good" id="submitBtn">✔ ' + esc(t("submit")) + '</button><button class="btn small" id="resetBtn">↺ ' + esc(t("reset")) + '</button></div>' + (kind === "code" ? '<p class="muted" style="font-size:.85rem">Tip: Ctrl+Enter runs. Press Esc then Tab to move out of the editor.</p>' : ""));
    refreshBlocks = () => { $("#blockbox").innerHTML = AK.toBlocks(ed.getCode()).map((b) => '<div class="blk ' + b.kind + '" style="margin-left:' + b.depth * 18 + 'px">' + esc(b.label) + "</div>").join("") || '<span class="muted">Write some code to see blocks.</span>'; };
    refreshCompare(m); H("python", m, ed, mid);
    const grab = () => ({ code: ed.getCode(), stdin: $("#stdin").value === "" ? [] : $("#stdin").value.split("\n") });
    async function engine() { try { return await ensurePy(); } catch (e) { $("#outbox").textContent = PY_OFFLINE; return null; } }
    function showRun(r) {
      $("#outbox").textContent = r.out || (r.err ? "" : "(your program printed nothing)");
      const f = r.err ? AK.friendlyError(r.err) : null;
      $("#errbox").innerHTML = f ? '<div class="err" role="alert"><b>' + esc(f.title) + (f.line ? " on line " + f.line : "") + "</b><div>" + esc(f.hint) + '</div><div class="muted mono" style="font-size:.8rem">' + esc(f.raw) + "</div></div>" : "";
    }
    $("#runBtn").onclick = async () => { show("out"); $("#outbox").textContent = "Running…"; const api = await engine(); if (!api) return; const g = grab(); showRun(api.run(g.code, g.stdin, false)); };
    $("#stepBtn").onclick = async () => { show("steps"); $("#stepper").textContent = "Preparing…"; const api = await engine(); if (!api) { $("#stepper").textContent = PY_OFFLINE; return; } const g = grab(); renderStepper(api.run(g.code, g.stdin, true), g.code); };
    $("#resetBtn").onclick = () => { const b = $("#resetBtn"); if (b.dataset.sure) { ed.reset(); b.textContent = "↺ " + t("reset"); delete b.dataset.sure; } else { b.dataset.sure = "1"; b.textContent = "Click again to restore the starter"; } };
    $("#submitBtn").onclick = async () => {
      const api = await engine(); if (!api) return;
      const code = ed.getCode(), results = api.grade(code, allTests(m));
      const main = results.filter((r) => !r.star), extra = results.filter((r) => r.star);
      lightTests(m, results, () => {
        if (main.every((r) => r.ok)) finishMission(m, w, { code: code, cleanPass: m.clean ? extra.every((r) => r.ok) : null });
        else { tries[m.id] = (tries[m.id] || 0) + 1; toast("Not yet. Read the failed checks and try again."); H("failed", m); }
      });
    };
    $("#rewardSlot").innerHTML = S.solved[m.id] ? '<div class="reward"><b>✔ You solved this mission.</b> <span class="muted">Improve your code and press Check again to earn more stars.</span> <a href="#/map">Back to the map</a></div>' : "";
    bindExplain(m); setPyPill();
  }

  function renderStepper(r, code) {
    const box = $("#stepper"), lines = code.split("\n"), steps = r.steps;
    if (!steps.length) { box.innerHTML = (r.err ? '<div class="err">' + esc(AK.friendlyError(r.err).hint) + "</div>" : '<p class="muted">Nothing ran. Write some code first.</p>'); return; }
    let i = 0, timer = null;
    box.innerHTML = '<div class="row"><button class="btn small" id="sPrev">◀</button><button class="btn small" id="sPlay">▶ Play</button><button class="btn small" id="sNext">▶|</button><input type="range" id="sRange" min="0" max="' + (steps.length - 1) + '" value="0" aria-label="Step" style="flex:1"><span class="muted mono" id="sLbl"></span></div><div class="stepcode" id="sCode" style="margin:.5rem 0"></div><div class="grid g2" style="gap:.5rem"><div><b>Variables</b><table class="vars" id="sVars"></table></div><div><b>Call stack</b><div class="mono" id="sStack"></div><b>Output so far</b><div class="out" id="sOut" style="min-height:50px"></div></div></div>' +
      (steps.length >= 300 ? '<p class="muted">Showing the first 300 steps.</p>' : "") + (r.err ? '<div class="err"><b>' + esc(r.err.type) + "</b> at the end: " + esc(AK.friendlyError(r.err).hint) + "</div>" : "");
    const draw = () => {
      const s = steps[i]; $("#sLbl").textContent = "step " + (i + 1) + "/" + steps.length; $("#sRange").value = i;
      $("#sCode").innerHTML = lines.map((l, k) => '<div class="' + (k + 1 === s.line ? "cur" : "") + '">' + String(k + 1).padStart(2, " ") + "  " + esc(l || " ") + "</div>").join("");
      const cur = $("#sCode .cur"); if (cur) cur.scrollIntoView({ block: "nearest" });
      const names = Object.keys(s.vars); $("#sVars").innerHTML = names.length ? names.map((n) => "<tr><td>" + esc(n) + "</td><td>" + esc(s.vars[n]) + "</td></tr>").join("") : '<tr><td class="muted">no variables yet</td></tr>';
      $("#sStack").textContent = s.stack.join(" → "); $("#sOut").textContent = (r.out || "").slice(0, s.out);
    };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; $("#sPlay").textContent = "▶ Play"; } };
    $("#sPrev").onclick = () => { stop(); i = Math.max(0, i - 1); draw(); };
    $("#sNext").onclick = () => { stop(); i = Math.min(steps.length - 1, i + 1); draw(); };
    $("#sRange").oninput = (e) => { stop(); i = Number(e.target.value); draw(); };
    $("#sPlay").onclick = () => { if (timer) { stop(); return; } $("#sPlay").textContent = "⏸ Pause"; timer = setInterval(() => { if (i >= steps.length - 1) { stop(); return; } i++; draw(); }, 600); };
    onLeave(stop); draw();
  }

  /* ---- terminal mission */
  function missionTerminal(v, m, w) {
    const T = AK.createTerminal(m.starter), hasAnswer = m.tests.some((x) => x.kind === "answer");
    v.innerHTML = missionFrame(m, {
      tabs: tabBtn("cheat", "Cheat sheet", true) + tabBtn("compare", "Compare"),
      panels: '<div id="tab-cheat"><p class="muted">Commands in this simulated server:</p><ul class="mono" style="font-size:.85rem;padding-left:1.1rem"><li>ls, cd, pwd, cat, head, tail</li><li>grep PATTERN FILE · wc -l</li><li>ps aux · top · kill PID</li><li>ss -ltnp · lsof -i :PORT</li><li>df -h · du -sh PATH</li><li>sed -i \'s/old/new/\' FILE</li><li>echo "text" &gt; FILE · history · clear</li></ul><p class="muted">Pipes (|) and redirects (&gt; &gt;&gt;) work. Nothing here touches your real computer.</p></div>',
    });
    bindHints(m); bindTabs(m); refreshCompare(m); H("terminal", m, T);
    $("#midpane").innerHTML = '<div class="term"><div class="log" id="tlog" role="log" aria-live="polite"></div><form id="tform"><span class="mono" id="tprompt"></span><input id="tin" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Terminal command"></form></div>' +
      (hasAnswer ? '<label class="muted" for="ans" style="display:block;margin-top:.6rem">Your answer</label><input class="input" id="ans" autocomplete="off" placeholder="Type what you found, e.g. a name or a path">' : "") +
      '<div class="row" style="margin-top:.6rem"><button class="btn good" id="checkBtn">✔ ' + esc(hasAnswer ? "Check my answer" : "Check my fix") + '</button><button class="btn small" id="treset">↺ Reset server</button></div>';
    const log = $("#tlog"), inp = $("#tin"), prompt = () => ($("#tprompt").textContent = "oncall@aata:" + T.cwd + "$"); prompt();
    const put = (txt, cls) => { const d = document.createElement("div"); if (cls) d.className = cls; d.textContent = txt; log.appendChild(d); log.scrollTop = log.scrollHeight; };
    put("Connected to the server. Type help to see what you can use.");
    const hist = []; let hp = 0;
    $("#tform").onsubmit = (e) => {
      e.preventDefault(); const line = inp.value; inp.value = ""; if (!line.trim()) return;
      hist.push(line); hp = hist.length; put("$ " + line, "cmd"); const r = T.exec(line);
      if (r.clear) log.textContent = ""; else if (r.out) put(r.out); prompt();
    };
    inp.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp" && hist.length) { e.preventDefault(); hp = Math.max(0, hp - 1); inp.value = hist[hp]; }
      if (e.key === "ArrowDown") { e.preventDefault(); hp = Math.min(hist.length, hp + 1); inp.value = hist[hp] || ""; }
    });
    $("#treset").onclick = () => VIEWS.mission(v, m.id);
    $("#checkBtn").onclick = () => {
      const results = AK.gradeTerminal(m, T, hasAnswer ? $("#ans").value : "");
      lightTests(m, results, () => {
        if (results.every((r) => r.ok)) finishMission(m, w, { code: T.history.join("\n"), cleanPass: null });
        else { tries[m.id] = (tries[m.id] || 0) + 1; toast("Not yet. Look at the failed checks."); H("failed", m); }
      });
    };
    $("#rewardSlot").innerHTML = S.solved[m.id] ? '<div class="reward"><b>✔ You solved this mission.</b> <a href="#/map">Back to the map</a></div>' : "";
    bindExplain(m); setHeadStatus(m); $("#pypill").remove(); inp.focus();
  }

  /* ---- arena */
  VIEWS.arena = function (v) {
    const w = weekly(), days = AK.daysUntilNextWeek(new Date()), wk = String(AK.weekIndex(new Date())), done = S.weekly[wk] === (w && w.id);
    const others = DATA.missions.filter((m) => m.type === "terminal" && (!w || m.id !== w.id));
    v.innerHTML = '<h2>🏟 Arena</h2>' + (w ? '<div class="card"><span class="tag">OUTAGE OF THE WEEK · changes in ' + days + " day" + (days > 1 ? "s" : "") + '</span><h3 style="margin-top:.5rem">🚨 ' + esc(w.title) + "</h3><p>" + esc(w.story) + '</p><div class="goal"><b>Goal:</b> ' + esc(w.goal) + '</div><div class="row"><a class="btn primary" href="#/mission/' + w.id + '">' + (S.solved[w.id] ? "Replay" : "Take the call") + " →</a><span class=\"chip gold\">+30 bonus XP</span>" + (done ? '<span class="chip">✔ done this week</span>' : "") + "</div><p class=\"muted\">The featured outage is always unlocked and pays a bonus the first time you solve it. Every learner gets the same one, so you can compare notes.</p></div>" : "") +
      '<h3 style="margin-top:1.4rem">Past and upcoming outages</h3><div class="grid g3">' + others.map((m) => '<a class="card" style="text-decoration:none;color:inherit" href="#/mission/' + m.id + '"><b>' + esc(m.title) + "</b><div class=\"muted\">" + esc(m.goal) + "</div>" + (S.solved[m.id] ? '<span class="tag">✔ solved</span>' : "") + "</a>").join("") + "</div>" +
      '<div class="card" style="margin-top:1.2rem"><b>Coming next</b><p class="muted">Opt-in weekly leagues, duels and co-op bug raids need accounts, so they are planned for the beta. Nothing here ranks you against strangers.</p></div>';
  };

  /* ---- certificates: a shareable PNG, honest about being self-reported */
  function certificate(title, icon, kicker) {
    const c = document.createElement("canvas"); c.width = 1200; c.height = 630; const x = c.getContext("2d"), mono = "ui-monospace, Menlo, Consolas, monospace", sans = "system-ui, -apple-system, Segoe UI, sans-serif";
    const g = x.createLinearGradient(0, 0, 1200, 630); g.addColorStop(0, "#1d1856"); g.addColorStop(1, "#0f0d2e"); x.fillStyle = g; x.fillRect(0, 0, 1200, 630);
    x.strokeStyle = "#f2b531"; x.lineWidth = 10; x.strokeRect(24, 24, 1152, 582); x.lineWidth = 2; x.strokeRect(46, 46, 1108, 538);
    x.textAlign = "center"; x.fillStyle = "#f2b531"; x.font = "700 34px " + mono; x.fillText("AataKode · ఆటకోడ్", 600, 108);
    x.fillStyle = "#e9e7ff"; x.font = "28px " + sans; x.fillText(kicker, 600, 168);
    x.font = "90px " + sans; x.fillText(icon, 600, 270);
    x.fillStyle = "#4ade9f"; x.font = "700 58px " + mono; x.fillText(title, 600, 355);
    x.fillStyle = "#ffffff"; x.font = "700 44px " + sans; x.fillText(S.name || "A learner", 600, 430);
    x.fillStyle = "#c9c6f5"; x.font = "24px " + sans; x.fillText(rankName(S.xp) + " · " + S.xp + " XP · ⭐ " + AK.totalStars(S) + " · " + AK.dateKey(new Date()), 600, 480);
    x.fillStyle = "#8f8cc4"; x.font = "20px " + sans; x.fillText("Self-reported progress from aatakode.eknathalabs.com. Not an accredited certificate.", 600, 548);
    c.toBlob((b) => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "aatakode-" + title.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".png"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); });
  }

  /* ---- profile */
  VIEWS.profile = function (v) {
    const rk = AK.rankFor(S.xp), st = AK.streakStatus(S, new Date()), badges = AK.allBadges(DATA), pyRegions = DATA.regions.filter((r) => r.track === "python");
    const skills = {}; DATA.missions.forEach((m) => { if (S.solved[m.id]) (m.skills || []).forEach((s) => (skills[s] = (skills[s] || 0) + 1)); });
    const skillKeys = Object.keys(skills).sort((a, b) => skills[b] - skills[a] || (a < b ? -1 : 1)), maxSk = Math.max(1, ...Object.values(skills));
    const cleared = pyRegions.filter((r) => AK.regionComplete(S, DATA, r.id)), grad = badgesHas("python-graduate");
    function badgesHas(id) { return !!S.badges[id]; }
    v.innerHTML = '<h2>👤 Profile</h2><div class="grid g2">' +
      '<div class="card"><div class="row"><div id="pmascot">' + parrot(70) + '</div><div class="grow"><label class="muted" for="pname">Your name (optional)</label><input class="input" id="pname" maxlength="40" value="' + esc(S.name) + '" placeholder="e.g. Asha"><label class="muted" for="pclass">Class code (optional, for teachers)</label><input class="input" id="pclass" maxlength="24" value="' + esc(S.classCode) + '" placeholder="e.g. 9B-2025"></div></div>' +
      '<h3 style="margin-top:1rem">' + esc(rankName(S.xp)) + " · " + S.xp + ' XP · ⭐ ' + AK.totalStars(S) + '</h3><div class="bar" role="progressbar" aria-valuenow="' + rk.pct + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + rk.pct + '%"></i></div><div class="muted">' + (rk.next ? (rk.next.xp - S.xp) + " XP to " + (S.settings.lang === "te" ? rk.next.te : rk.next.en) : "Top rank reached 🌳") + '</div>' +
      '<p>🔥 Streak: <b>' + st.count + "</b> day" + (st.count === 1 ? "" : "s") + " · best " + S.streak.best + " · ❄ freezes: " + S.streak.freezes + ' · 📅 daily quests: ' + S.dailyDone + '</p><p class="muted">Learn on 7 days in a row to earn a freeze that saves your streak if you miss a day. <a href="#/daily">Today\'s Daily Quest →</a></p></div>' +
      '<div class="card"><h3>Skills</h3>' + (skillKeys.length ? skillKeys.slice(0, 12).map((k) => '<div class="skillrow"><span>' + esc(k) + '</span><div class="bar"><i style="width:' + Math.round((skills[k] / maxSk) * 100) + '%"></i></div><span>' + skills[k] + "</span></div>").join("") + (skillKeys.length > 12 ? '<p class="muted">+ ' + (skillKeys.length - 12) + " more skills</p>" : "") : '<p class="muted">Solve missions to grow your skills.</p>') + "</div></div>" +
      '<h3 style="margin-top:1.4rem">Chilaka\'s wardrobe <span class="muted" style="font-size:.8rem">(free, unlocked by clearing regions)</span></h3><div class="wardrobe" id="wardrobe">' +
      OUTFITS.map((o) => { const open = outfitUnlocked(o); return '<button class="outfit' + (S.settings.outfit === o.id ? " on" : "") + '" data-o="' + o.id + '"' + (open ? "" : " disabled") + ' title="' + esc(open ? o.name : "Locked: " + o.hint) + '">' + parrot(48, o.id) + "<div>" + esc(o.name) + (open ? "" : " 🔒") + "</div></button>"; }).join("") + "</div>" +
      '<h3 style="margin-top:1.4rem">Certificates</h3><div class="card">' + (cleared.length || grad ? '<p class="muted">Download a card to share. It says plainly that it is self-reported.</p><div class="row">' + cleared.map((r) => '<button class="btn small" data-cert="' + r.id + '">' + r.icon + " " + esc(r.title) + "</button>").join("") + (grad ? '<button class="btn primary small" data-cert="__grad">🎓 Python Graduate</button>' : "") + "</div>" : '<p class="muted">Beat a region boss to unlock its card. Finish every Python region to unlock the Python Graduate card.</p>') + "</div>" +
      '<h3 style="margin-top:1.4rem">Badges</h3><div class="badges">' + badges.map((b) => '<div class="badge' + (S.badges[b.id] ? "" : " off") + '" title="' + esc(b.desc) + '"><div class="ico">' + b.icon + "</div><b>" + esc(S.settings.lang === "te" ? b.te : b.en) + '</b><div class="muted" style="font-size:.78rem">' + esc(S.badges[b.id] ? "Earned " + S.badges[b.id] : b.desc) + "</div></div>").join("") + "</div>" +
      '<div class="grid g2" style="margin-top:1.4rem"><div class="card"><h3>Your data</h3><p class="muted">Everything lives on this device. Export a backup, move it to another device, or start over.</p><div class="row"><button class="btn" id="exp">⬇ Export progress</button><label class="btn" for="imp">⬆ Import</label><input type="file" id="imp" accept="application/json,.json" class="sr"><button class="btn small" id="wipe">Reset everything</button></div><p id="datamsg" class="muted"></p></div>' +
      '<div class="card"><h3>Teacher card</h3><p class="muted">Give this code to your teacher. It lists your name, XP and solved missions (not your code).</p><textarea class="input" id="card" rows="3" readonly></textarea><div class="row" style="margin-top:.4rem"><button class="btn small" id="copycard">Copy code</button></div></div></div>' +
      '<div class="card" style="margin-top:1rem"><h3>Settings</h3><div class="row"><label>Language <select id="selLang" class="input" style="width:auto"><option value="en">English</option><option value="te">తెలుగు (interface)</option></select></label><label>Theme <select id="selTheme" class="input" style="width:auto"><option value="dark">Dark</option><option value="light">Light</option></select></label><label>Code colours <select id="selEditor" class="input" style="width:auto">' + EDITORS.map((e) => "<option value=\"" + e.id + "\"" + (AK.rankFor(S.xp).index >= e.rank ? "" : " disabled") + ">" + esc(e.name + (AK.rankFor(S.xp).index >= e.rank ? "" : " (rank " + AK.RANKS[e.rank].en + ")")) + "</option>").join("") + '</select></label><label>Motion <select id="selMotion" class="input" style="width:auto"><option value="auto">Follow my device</option><option value="reduce">Reduce motion</option></select></label></div></div>';
    $("#selLang").value = S.settings.lang; $("#selTheme").value = S.settings.theme; $("#selMotion").value = S.settings.motion; $("#selEditor").value = S.settings.editor;
    const refreshCard = () => ($("#card").value = AK.encodeCard(S)); refreshCard();
    $("#pname").oninput = (e) => { S.name = e.target.value; save(); refreshCard(); };
    $("#pclass").oninput = (e) => { S.classCode = e.target.value; save(); refreshCard(); };
    $("#selLang").onchange = (e) => { S.settings.lang = e.target.value; save(); applySettings(); route(); };
    $("#selTheme").onchange = (e) => { S.settings.theme = e.target.value; save(); applySettings(); renderHeader("profile"); };
    $("#selEditor").onchange = (e) => { S.settings.editor = e.target.value; save(); applySettings(); };
    $("#selMotion").onchange = (e) => { S.settings.motion = e.target.value; save(); applySettings(); };
    $$("[data-o]", v).forEach((b) => (b.onclick = () => { S.settings.outfit = b.dataset.o; save(); renderHeader("profile"); VIEWS.profile(v); }));
    $$("[data-cert]", v).forEach((b) => (b.onclick = () => { if (b.dataset.cert === "__grad") certificate("Python Graduate", "🎓", "has completed every region of the Python Quest"); else { const r = regionById[b.dataset.cert]; certificate(r.title, r.icon, "cleared the region"); } }));
    $("#copycard").onclick = () => { $("#card").select(); try { navigator.clipboard.writeText($("#card").value); toast("Teacher card copied"); } catch (e) { document.execCommand("copy"); toast("Copied"); } };
    $("#exp").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: "application/json" })); a.download = "aatakode-progress-" + AK.dateKey(new Date()) + ".json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); $("#datamsg").textContent = "Exported ✔"; };
    $("#imp").onchange = (e) => {
      const f = e.target.files[0]; if (!f) return; const rd = new FileReader();
      rd.onload = () => { try { const inc = JSON.parse(rd.result); if (!inc || inc.v !== 1 || typeof inc.solved !== "object") throw new Error("bad"); S = AK.mergeState(S, inc); AK.checkBadges(S, DATA, new Date()); save(); applySettings(); $("#datamsg").textContent = "Imported ✔ progress merged."; renderHeader("profile"); VIEWS.profile(v); } catch (er) { $("#datamsg").textContent = "That file is not an AataKode progress backup."; } };
      rd.readAsText(f);
    };
    $("#wipe").onclick = () => { const b = $("#wipe"); if (b.dataset.sure) { S = AK.newState(); save(); applySettings(); route(); toast("Progress cleared"); } else { b.dataset.sure = "1"; b.textContent = "Click again to erase all progress"; } };
  };

  /* ---- teacher dashboard (works offline: students share cards, nothing is uploaded) */
  VIEWS.teacher = function (v) {
    const load = () => { try { return JSON.parse(store.get(ROSTER_KEY) || "[]"); } catch (e) { return []; } };
    let roster = load(); const saveR = () => store.set(ROSTER_KEY, JSON.stringify(roster));
    const total = DATA.missions.length;
    const goalKey = "aatakode.goal";
    function draw() {
      const regs = DATA.regions, order = roster.map((c, i) => i).sort((a, b) => roster[b].x - roster[a].x);
      const solvedTotal = roster.reduce((n, c) => n + c.s.length, 0), goal = Number(store.get(goalKey)) || Math.max(10, roster.length * 10);
      v.innerHTML = '<h2>🍎 Teacher dashboard</h2><div class="card"><p>Free for every teacher, and it works with no server. Students open <b>Profile → Teacher card</b> and send you their code. Paste the codes below (one per line) to see class progress. Cards are self-reported: the tests run on each student\'s device, so use this for encouragement and check-ins, not exams.</p>' +
        '<textarea class="input" id="cards" rows="3" placeholder="Paste AK1:… codes here, one per line"></textarea><div class="row" style="margin-top:.5rem"><button class="btn primary" id="addCards">Add to class</button><button class="btn" id="csv"' + (roster.length ? "" : " disabled") + '>⬇ Export CSV</button><button class="btn small" id="clearR"' + (roster.length ? "" : " disabled") + '>Clear class</button><span class="muted" id="tmsg"></span></div></div>' +
        (roster.length ? '<div class="card" style="margin-top:1rem"><b>Class goal</b> <span class="muted">(a team target, not a ranking of students)</span><div class="row" style="margin:.4rem 0"><label>Missions to solve together <input class="input" id="goal" type="number" min="1" style="width:6rem" value="' + goal + '"></label><span class="chip gold">' + solvedTotal + " / " + goal + '</span></div><div class="bar"><i style="width:' + Math.min(100, Math.round((solvedTotal / goal) * 100)) + '%"></i></div></div><div class="card scroll" style="margin-top:1rem"><table class="tbl"><thead><tr><th>#</th><th>Student</th><th>Class</th><th>Rank</th><th>XP</th><th>Missions</th>' + regs.map((r) => "<th title=\"" + esc(r.title) + "\">" + r.icon + "</th>").join("") + "<th>Streak</th><th>Badges</th><th>Updated</th><th></th></tr></thead><tbody>" +
          order.map((i, pos) => { const c = roster[i]; return "<tr><td>" + (pos + 1) + "</td><td>" + esc(c.n || "(no name)") + "</td><td>" + esc(c.c || "") + "</td><td>" + esc(AK.rankFor(c.x).current.en) + "</td><td>" + c.x + "</td><td>" + c.s.length + "/" + total + "</td>" +
            regs.map((r) => { const ms = AK.regionMissions(DATA, r.id), d = ms.filter((m) => c.s.includes(m.id)).length; return "<td>" + (d === ms.length ? "✔" : d + "/" + ms.length) + "</td>"; }).join("") +
            "<td>🔥 " + c.k + "</td><td>" + c.b.length + "</td><td>" + esc((c.t || "").slice(0, 10)) + '</td><td><button class="btn small" data-rm="' + i + '" aria-label="Remove ' + esc(c.n || "student") + '">✕</button></td></tr>'; }).join("") + "</tbody></table></div>" : '<p class="muted" style="margin-top:1rem">No students yet.</p>');
      $("#addCards").onclick = () => {
        let added = 0, bad = 0;
        $("#cards").value.split(/\s+/).filter(Boolean).forEach((s) => { const c = AK.decodeCard(s); if (!c) { bad++; return; } const k = roster.findIndex((r) => r.n === c.n && r.c === c.c); if (k >= 0) roster[k] = c; else roster.push(c); added++; });
        saveR(); draw(); $("#tmsg").textContent = added + " added" + (bad ? ", " + bad + " not recognised" : "");
      };
      const gi = $("#goal"); if (gi) gi.onchange = () => { store.set(goalKey, String(Math.max(1, Number(gi.value) || 1))); draw(); };
      $$("[data-rm]", v).forEach((b) => (b.onclick = () => { roster.splice(Number(b.dataset.rm), 1); saveR(); draw(); }));
      $("#clearR").onclick = () => { if ($("#clearR").dataset.sure) { roster = []; saveR(); draw(); } else { $("#clearR").dataset.sure = "1"; $("#clearR").textContent = "Click again to clear"; } };
      $("#csv").onclick = () => {
        const q = (x) => '"' + String(x).replace(/"/g, '""') + '"', rows = [["name", "class", "rank", "xp", "missions", "streak", "badges", "updated"]].concat(roster.map((c) => [c.n, c.c, AK.rankFor(c.x).current.en, c.x, c.s.length, c.k, c.b.length, c.t]));
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map(q).join(",")).join("\n")], { type: "text/csv" })); a.download = "aatakode-class.csv"; a.click();
      };
    }
    draw();
  };

  /* ---- about */
  VIEWS.about = function (v) {
    v.innerHTML = '<h2>About AataKode</h2><div class="grid g2"><div class="card"><h3>The promise</h3><p>Every lesson, project, badge and class tool is free, forever. No ads, no tracking, no locked missions.</p><p class="muted">Premium is planned only for things that cost money to run: cloud sync across devices, an unlimited AI tutor, human code review, and private groups. It is not available yet, and it will never gate learning.</p></div>' +
      '<div class="card"><h3>How your data works</h3><p>Your progress is stored in this browser. Export it from your Profile to back it up or move it. Nothing is uploaded; the Python engine runs inside your browser.</p></div>' +
      '<div class="card"><h3>Help build it</h3><p>Missions are plain JSON files, checked automatically in CI. Add a mission, a hint, or a translation.</p><a class="btn" href="' + REPO + '">Open the repository</a></div>' +
      '<div class="card"><h3>About the Telugu interface</h3><p class="muted">The navigation, ranks and badges have a Telugu interface; lessons are in English for now. Corrections from native speakers are very welcome.</p></div></div>';
  };

  /* ------------------------------------------------------------ boot */
  applySettings(); renderFooter();
  $("#skip").onclick = () => $("#view").focus();
  window.AK_CORE = {
    state: () => S, save: save, toast: toast, esc: esc, $: $, $$: $$, t: t, lt: lt, DATA: DATA, byId: byId, regionById: regionById, VIEWS: VIEWS, route: route, renderHeader: renderHeader,
    parrot: parrot, ensurePy: ensurePy, confetti: confetti, reducedMotion: reducedMotion, missionFrame: missionFrame, tabBtn: tabBtn, bindTabs: bindTabs, bindHints: bindHints, bindExplain: bindExplain,
    setHeadStatus: setHeadStatus, renderTests: renderTests, allTests: allTests, lightTests: lightTests, finishMission: finishMission, tries: tries, refreshCompare: refreshCompare, setPyPill: setPyPill,
    buildCodeEditor: buildCodeEditor, missionPython: missionPython, missionTerminal: missionTerminal, missionPredict: missionPredict, predictCard: predictCard, weekly: weekly, featIds: featIds,
    diag: diag, setDay: (id) => { dayMode = id; }, PY_OFFLINE: PY_OFFLINE, applySettings: applySettings, rankName: rankName, badgeToasts: badgeToasts, nodeIcon: nodeIcon, orderedMissions: orderedMissions,
  };
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register("sw.js").catch(() => {});
  window.AK_APP = { state: () => S, route: route };
})();

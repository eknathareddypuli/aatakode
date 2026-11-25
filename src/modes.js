/* AataKode modes: Village + shop, SQL, Pair Parrot, Speed Run + Blitz, Code Golf, Endless Dungeon, Placement quiz,
   Outage of the Day, worked-example fading, git/linux cheat sheets. Plugs into the core through AK_CORE and AK_UI.hooks. */
(function () {
  "use strict";
  var C = window.AK_CORE, AK = window.AK, FX = window.AK_FX, UI = window.AK_UI;
  if (!C || !UI) return;
  var $ = C.$, $$ = C.$$, esc = C.esc, DATA = C.DATA, VIEWS = C.VIEWS, H = UI.hooks;
  var S = function () { return C.state(); };
  var sfx = function (n, a) { if (FX) FX.sound(n, a); };
  var buzz = function (p) { if (FX) FX.buzz(p); };
  var shuffle = function (a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
  var codeBox = function (c) { return '<pre class="codepeek mono" style="white-space:pre-wrap;margin:.5rem 0">' + esc(c) + "</pre>"; };
  var refresh = function () { C.renderHeader(location.hash.replace(/^#\/?/, "").split("/")[0] || "home"); };

  /* ---------------------------------------------------------------- Village + shop */
  var previewPhase = null, selPlot = null;
  VIEWS.village = function (v) {
    var st = S(), phase = previewPhase || FX.phase(), pend = FX.pendingRebuilds().map(function (r) { return r.id; });
    var bal = AK.seedBalance(st), sh = AK.SHOP;
    var byKind = function (k) { return sh.filter(function (x) { return x.kind === k; }); };
    var item = function (it) {
      var own = AK.ownedCount(st, it.id), can = bal >= it.cost, comp = it.kind === "companion";
      var btn = comp && own ? (st.companion === it.id ? '<span class="tag">with you</span>' : '<button class="btn small" data-pick="' + it.id + '">Choose</button>') : '<button class="btn small' + (can ? " primary" : "") + '" data-buy="' + it.id + '"' + (can ? "" : " disabled") + ">🌱 " + it.cost + "</button>";
      return '<div class="shopitem"><span class="shico">' + it.icon + '</span><div class="grow"><b>' + esc(C.state().settings.lang === "te" && it.te ? it.te : it.en) + "</b><div class=\"muted\" style=\"font-size:.8rem\">" + esc(it.desc) + (!comp && own ? " · owned " + own : "") + "</div></div>" + btn + "</div>";
    };
    v.innerHTML = '<div class="row spread"><h2>🏘 Aata-gram</h2><div class="row"><span class="chip">🌱 ' + bal + ' seeds</span>' +
      ["live", "dawn", "day", "dusk", "night"].map(function (p) { return '<button class="btn small' + ((p === "live" ? !previewPhase : previewPhase === p) ? " primary" : "") + '" data-phase="' + p + '">' + (p === "live" ? "Now" : p[0].toUpperCase() + p.slice(1)) + "</button>"; }).join("") + "</div></div>" +
      '<div class="card" style="padding:.4rem"><div id="scene">' + FX.villageSvg(st, phase, { rebuild: pend }) + '</div></div>' +
      '<p class="muted" style="margin:.4rem 0">Top row: the ' + DATA.regions.filter(function (r) { return r.track === "python"; }).length + ' Python places. Finish a region to rebuild its place. Bottom row: your plots. Tap a plot to build.</p><div id="plotPanel" class="card" hidden></div>' +
      '<div class="grid g2" style="margin-top:1rem"><div class="card"><h3>🏗 Buildings</h3>' + byKind("building").map(item).join("") + '</div><div><div class="card"><h3>🐾 Companions</h3>' + byKind("companion").map(item).join("") + '</div><div class="card" style="margin-top:1rem"><h3>🎒 Boosts</h3>' + byKind("freeze").map(item).join("") + '<p class="muted" style="font-size:.8rem">Earn seeds by solving missions, the Daily Quest, streaks, speed runs, golf and the dungeon.</p></div></div></div>';
    if (pend.length) { pend.forEach(function (id) { st.village.seen[id] = 1; }); C.save(); sfx("build"); buzz([20, 30, 20, 30, 60]); }
    $$("[data-phase]", v).forEach(function (b) { b.onclick = function () { previewPhase = b.dataset.phase === "live" ? null : b.dataset.phase; sfx("click"); VIEWS.village(v); }; });
    $$("[data-buy]", v).forEach(function (b) { b.onclick = function () { var r = AK.buy(st, b.dataset.buy, new Date()); if (!r.ok) { C.toast(r.reason); return; } C.save(); sfx("coin"); buzz(15); C.toast("Bought! 🌱"); (r.newBadges || []).length && C.badgeToasts(r.newBadges); refresh(); VIEWS.village(v); }; });
    $$("[data-pick]", v).forEach(function (b) { b.onclick = function () { AK.setCompanion(st, b.dataset.pick); C.save(); sfx("click"); FX.buddy("happy", "Hello, friend!"); VIEWS.village(v); }; });
    var panel = $("#plotPanel", v);
    function openPlot(p) {
      selPlot = p; var cur = (st.village.plots || [])[p], own = AK.SHOP.filter(function (x) { return x.kind === "building" && AK.stockLeft(st, x.id) > 0; });
      panel.hidden = false;
      panel.innerHTML = "<b>Plot " + (p + 1) + "</b> " + (cur ? "holds " + AK.shopItem(cur).icon + ' <button class="btn small" id="rmB">Take it down</button>' : "is empty.") + '<div class="row" style="margin-top:.5rem">' +
        (own.length ? own.map(function (x) { return '<button class="btn small" data-put="' + x.id + '">' + x.icon + " " + esc(x.en) + " ×" + AK.stockLeft(st, x.id) + "</button>"; }).join("") : '<span class="muted">Nothing in stock. Buy a building below with seeds.</span>') + "</div>";
      $$("[data-put]", panel).forEach(function (b) { b.onclick = function () { var r = AK.placeBuilding(st, p, b.dataset.put); if (!r.ok) { C.toast(r.reason); return; } C.save(); sfx("build"); buzz(25); var bad = AK.checkBadges(st, DATA, new Date()); bad.length && C.badgeToasts(bad); C.save(); VIEWS.village(v); openPlot(p); }; });
      var rm = $("#rmB", panel); if (rm) rm.onclick = function () { AK.removeBuilding(st, p); C.save(); VIEWS.village(v); openPlot(p); };
    }
    $$(".plot", v).forEach(function (g) { var go = function () { openPlot(Number(g.dataset.plot)); sfx("click"); }; g.onclick = go; g.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } }; });
    if (selPlot !== null) openPlot(selPlot);
  };

  /* ---------------------------------------------------------------- SQL missions */
  function sqlTable(cols, rows) {
    if (!cols || !cols.length) return "";
    return '<div class="tablewrap"><table class="sqlt"><thead><tr>' + cols.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      rows.map(function (r) { return "<tr>" + r.map(function (x) { return "<td>" + (x === null ? '<i class="muted">NULL</i>' : esc(x)) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
  }
  UI.mission.sql = function (v, m, w) {
    v.innerHTML = C.missionFrame(m, {
      tabs: C.tabBtn("out", "Result", true) + C.tabBtn("schema", "Tables") + C.tabBtn("compare", "Compare"),
      panels: '<div id="tab-out"><div class="out" id="outbox" aria-live="polite">Press Run to see what your query returns.</div><div id="errbox"></div></div><div id="tab-schema" hidden><div id="schemabox" class="muted">Loading tables…</div></div>',
    });
    C.bindHints(m); var show = C.bindTabs(m); C.setHeadStatus(m); C.refreshCompare(m);
    var ed = C.buildCodeEditor(m, $("#midpane"), function () {}); var ta = $("#code"); ta.id = "sqlcode"; ta.setAttribute("aria-label", "SQL editor. Press Escape then Tab to leave the editor.");
    $("#midpane").insertAdjacentHTML("beforeend", '<div class="row" style="margin-top:.6rem"><button class="btn primary" id="runBtn">▶ Run</button><button class="btn good" id="submitBtn">✔ Check my query</button><button class="btn small" id="resetBtn">↺ Reset</button></div><p class="muted" style="font-size:.85rem">Tip: Ctrl+Enter runs. Several statements can be separated by semicolons.</p>');
    async function engine() { try { return await C.ensurePy(); } catch (e) { $("#outbox").textContent = C.PY_OFFLINE; return null; } }
    engine().then(function (api) { if (!api) return; try { var sch = api.sqlSchema(m.setup); $("#schemabox").innerHTML = sch.map(function (t) { return "<h4 class=\"mono\" style=\"margin:.6rem 0 .2rem\">" + esc(t.name) + ' <span class="muted" style="font-weight:400">(' + t.total + " rows)</span></h4>" + sqlTable(t.cols.map(function (c) { return c.name + (c.pk ? " 🔑" : "") + " " + c.type; }), t.rows); }).join("") || "No tables yet: this mission starts with an empty database."; } catch (e) { $("#schemabox").textContent = "Could not read the tables."; } });
    $("#runBtn").onclick = async function () {
      show("out"); $("#outbox").textContent = "Running…"; var api = await engine(); if (!api) return;
      var r = api.sqlRun(ta.value, m.setup);
      if (r.err) { $("#outbox").textContent = ""; $("#errbox").innerHTML = '<div class="err" role="alert"><b>SQL error</b><div>' + esc(r.err.msg || r.err) + "</div></div>"; return; }
      $("#errbox").innerHTML = "";
      if (r.hasRows) $("#outbox").innerHTML = sqlTable(r.cols, r.rows) + '<div class="muted" style="margin-top:.3rem">' + r.count + " row" + (r.count === 1 ? "" : "s") + (r.count > r.rows.length ? " (showing " + r.rows.length + ")" : "") + "</div>";
      else {
        var sch = api.sqlSchema(m.setup), names = sch.map(function (t) { return t.name; }); var html = '<div class="muted">Statements ran. Here is the data afterwards:</div>';
        var tabs = [];
        try { var after = api.sqlRun(ta.value + "\n;SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;", m.setup); (after.rows || []).forEach(function (x) { tabs.push(x[0]); }); } catch (e) { /* ignore */ }
        (tabs.length ? tabs : names).slice(0, 3).forEach(function (n) { var q = api.sqlRun(ta.value + "\n;SELECT * FROM " + n + ";", m.setup); if (q.hasRows) html += '<h4 class="mono" style="margin:.5rem 0 .2rem">' + esc(n) + "</h4>" + sqlTable(q.cols, q.rows); });
        $("#outbox").innerHTML = html;
      }
    };
    $("#resetBtn").onclick = function () { var b = $("#resetBtn"); if (b.dataset.sure) { ed.reset(); b.textContent = "↺ Reset"; delete b.dataset.sure; } else { b.dataset.sure = "1"; b.textContent = "Click again to restore the starter"; } };
    $("#submitBtn").onclick = async function () {
      var api = await engine(); if (!api) return; var code = ta.value, results = api.sqlGrade(code, m.setup, C.allTests(m));
      C.lightTests(m, results, function () {
        if (results.every(function (r) { return r.ok; })) C.finishMission(m, w, { code: code, cleanPass: null });
        else { C.tries[m.id] = (C.tries[m.id] || 0) + 1; C.toast("Not yet. Read the failed checks and try again."); H.failed(m); }
      });
    };
    $("#rewardSlot").innerHTML = S().solved[m.id] ? '<div class="reward"><b>✔ You solved this mission.</b> <a href="#/map">Back to the map</a></div>' : "";
    C.bindExplain(m); C.setPyPill();
  };

  /* ---------------------------------------------------------------- Pair Parrot */
  var pairDone = {};
  UI.mission.pair = function (v, m, w) {
    if (S().solved[m.id] || pairDone[m.id]) { C.missionPython(v, m, w); return; }
    var d = m.diagnose, first = true;
    v.innerHTML = '<div class="mhead"><a class="btn small" href="#/map">← Back</a><span class="tag">' + esc(C.lt(C.regionById[m.region], "title")) + ' · PAIR PARROT</span><h2>' + esc(m.title) + '</h2><span class="chip gold">' + m.xp + ' XP</span></div>' +
      '<div class="card"><div class="row" style="align-items:flex-start"><div>' + C.parrot(80) + '</div><div class="grow"><div class="story">' + esc(m.story) + '</div><div class="bubble pairsay">🦜 ' + esc(m.parrot.says) + '</div></div></div>' +
      '<h3 style="margin-top:1rem">Parrot\'s code</h3>' + codeBox(m.starter) + '<h3>Step 1: Diagnose</h3><p>' + esc(d.question) + '</p><div class="opts" id="dopts">' + d.options.map(function (o, i) { return '<button class="btn opt" data-i="' + i + '">' + esc(o) + "</button>"; }).join("") + '</div><div id="dres"></div></div>';
    $$(".opt", v).forEach(function (b) { b.onclick = function () {
      var i = Number(b.dataset.i);
      if (i === d.answer) {
        sfx("ok"); buzz(10); $$(".opt", v).forEach(function (x) { x.disabled = true; }); b.classList.add("right"); C.diag[m.id] = first; pairDone[m.id] = true;
        $("#dres").innerHTML = '<div class="reward"><b>' + (first ? "Spot on! " : "Got it. ") + "</b>" + esc(d.why) + '<div style="margin-top:.6rem"><button class="btn primary" id="toFix">Step 2: Fix the code →</button></div></div>';
        $("#toFix").onclick = function () { C.missionPython(v, m, w); };
      } else { first = false; b.classList.add("wrong"); b.disabled = true; sfx("no"); buzz([30, 40, 30]); C.toast("Not that one. Look at what the code does."); }
    }; });
  };

  /* ---------------------------------------------------------------- hooks: worked-example fading, golf, speed, cheat sheets */
  H.fade = function (m) {
    if (!m.fade) return null; var lv = AK.scaffoldLevel(S(), DATA, m);
    if (lv >= 2 && (S().drafts || {})[m.id] == null) return Object.assign({}, m, { starter: m.fade.partial });
    return null;
  };
  var speedRun = { id: null, t0: 0 };
  H.python = function (m, ed, mid) {
    if (m.fade) {
      var lv = AK.scaffoldLevel(S(), DATA, m), names = { 3: "Worked example + half-filled code", 2: "Half-filled code", 1: "Blank editor" };
      var box = document.createElement("div"); box.className = "card fade-card";
      box.innerHTML = '<div class="row spread"><b>🪜 Guided help: ' + names[lv] + '</b><span class="row"><button class="btn small" data-lv="up">More help</button><button class="btn small" data-lv="down">Less help</button></span></div>' +
        (lv >= 3 ? '<div class="fade-ex"><b>' + esc(m.fade.example.title) + "</b>" + codeBox(m.fade.example.code) + '<div class="muted">' + esc(m.fade.example.note) + "</div></div>" : "") + (lv >= 2 ? '<div class="muted" style="font-size:.85rem">Fill in the <code>____</code> in the editor.</div>' : '<div class="muted" style="font-size:.85rem">No scaffolding: you have this skill. Write it yourself.</div>');
      mid.parentNode.insertBefore(box, mid);
      $$("[data-lv]", box).forEach(function (b) { b.onclick = function () { AK.setScaffold(S(), m.id, lv + (b.dataset.lv === "up" ? 1 : -1)); delete S().drafts[m.id]; C.save(); C.missionPython($("#view"), m, C.weekly()); }; });
    }
    if (m.golf) {
      var g = m.golf, bar = document.createElement("div"); bar.className = "golfbar"; mid.appendChild(bar);
      var upd = function () { var n = AK.golfStrokes(ed.getCode()), rk = AK.golfRank(n, g.par), rec = (S().golf || {})[m.id]; bar.innerHTML = '<span class="chip">⛳ Strokes <b>' + n + '</b></span><span class="chip">Par ' + g.par + '</span><span class="chip">' + esc(rk.label) + '</span>' + (rec ? '<span class="chip gold">Your best ' + rec.best + "</span>" : "") + '<span class="muted" style="font-size:.8rem">Comments and blank lines are free.</span>'; };
      upd(); var ta = $("#code"); if (ta) ta.addEventListener("input", upd);
    }
    if (speedRun.id === m.id) {
      speedRun.t0 = Date.now(); var chip = document.createElement("span"); chip.className = "chip gold"; chip.id = "speedchip"; chip.textContent = "⏱ 0.0s"; var hd = $(".mhead"); if (hd) hd.appendChild(chip);
      var iv = setInterval(function () { var c = $("#speedchip"); if (!c || speedRun.id !== m.id) { clearInterval(iv); return; } c.textContent = "⏱ " + AK.fmtMs(Date.now() - speedRun.t0); }, 200);
    }
  };
  H.passed = function (m, o) {
    var st = S();
    if (m.golf && o && o.code) {
      var r = AK.golfRecord(st, DATA, m, AK.golfStrokes(o.code), new Date()); C.save();
      setTimeout(function () { C.toast("⛳ " + r.rank.label + " · " + AK.golfStrokes(o.code) + " strokes" + (r.improved ? " · new best!" : "")); (r.newBadges || []).length && C.badgeToasts(r.newBadges); }, 700);
    }
    if (speedRun.id === m.id && speedRun.t0 && st.solved[m.id]) {
      var ms = Date.now() - speedRun.t0, r2 = AK.speedRecord(st, DATA, m.id, ms, new Date()); speedRun = { id: null, t0: 0 }; C.save();
      setTimeout(function () { C.toast("⏱ " + AK.fmtMs(ms) + (r2.pb ? " · personal best! +" + r2.seeds + " 🌱" : " · best " + AK.fmtMs(r2.best))); (r2.newBadges || []).length && C.badgeToasts(r2.newBadges); }, 700);
    }
  };
  var GIT_SHEET = '<p class="muted">Commands in this simulated repository:</p><ul class="mono" style="font-size:.85rem;padding-left:1.1rem"><li>git status · git diff · git diff --staged</li><li>git add FILE · git commit -m "msg"</li><li>git log --oneline · git blame FILE</li><li>git switch -c NAME · git switch NAME</li><li>git merge NAME · git branch -d NAME</li><li>git restore FILE · git restore --staged FILE</li><li>git commit --amend -m "msg" · git revert HEAD</li><li>git reset --hard HEAD~1 · git reflog</li><li>git stash · git stash pop · git tag NAME</li></ul><p class="muted">Edit a file with <code>echo "text" &gt; file</code>. Nothing touches your real computer.</p>';
  var CASE_SHEET = '<p class="muted">Detective toolkit:</p><ul class="mono" style="font-size:.85rem;padding-left:1.1rem"><li>ls /case · cat FILE</li><li>grep PATTERN FILES · grep -r PATTERN DIR</li><li>grep -l PATTERN FILES (names only)</li><li>cut -d\' \' -f1 FILE · sort · uniq -c · sort -rn</li><li>diff FILE1 FILE2 · wc -l</li></ul><p class="muted">Cross-check at least two witnesses before you answer.</p>';
  var OPS_SHEET = '<p class="muted">Commands in this simulated server:</p><ul class="mono" style="font-size:.85rem;padding-left:1.1rem"><li>ls -l · cat · head · tail · grep · wc · sort · uniq · cut · awk</li><li>ps · top · kill PID · pgrep · pkill</li><li>systemctl status|start|restart NAME · journalctl -u NAME</li><li>chmod 755 FILE · chown USER FILE · sudo CMD</li><li>df -h · du -a · free -h · uptime</li><li>curl URL · curl -I URL</li><li>sed -i \'s/old/new/\' FILE · echo "x" &gt;&gt; FILE · rm · cp · mv · touch</li><li>crontab -l · diff A B · find</li></ul><p class="muted">Pipes (|), chaining (; &amp;&amp;) and redirects (&gt; &gt;&gt;) work.</p>';
  H.terminal = function (m) { var p = $("#tab-cheat"); if (!p) return; p.innerHTML = m.tool === "git" ? GIT_SHEET : m.mystery ? CASE_SHEET : OPS_SHEET; };

  /* ---------------------------------------------------------------- Outage of the Day + Arena hub */
  function outageDay() { return AK.outageOfDay(DATA.missions, new Date()); }
  function dayCard() {
    var d = outageDay(); if (!d) return "";
    var done = (S().outageDays || {})[AK.dateKey(new Date())] === d.id;
    return '<div class="card" style="margin-top:1rem"><span class="tag">OUTAGE OF THE DAY</span><h3 style="margin:.4rem 0 .2rem">📟 ' + esc(d.title) + '</h3><p class="muted">' + esc(d.goal) + '</p><div class="row"><a class="btn ' + (done ? "" : "primary") + '" href="#/mission/' + d.id + '/day">' + (done ? "Replay" : "Take today\'s call →") + '</a><span class="chip gold">+15 bonus XP · +5 🌱</span>' + (done ? '<span class="tag">✔ done today</span>' : "") + "</div></div>";
  }
  var oldArena = VIEWS.arena;
  VIEWS.arena = function (v) {
    var st = S(), golf = DATA.missions.filter(function (m) { return m.golf; }), gdone = golf.filter(function (m) { return (st.golf || {})[m.id]; }).length;
    var tile = function (href, ico, title, sub) { return '<a class="card tile" href="' + href + '"><span class="tico">' + ico + "</span><b>" + title + '</b><span class="muted">' + sub + "</span></a>"; };
    oldArena(v);
    var hub = '<div class="grid g3" style="margin:1rem 0">' +
      tile("#/speed", "⏱", "Speed Run", "Race solved missions. Best: " + (Object.keys(st.speed || {}).length || "none yet")) +
      tile("#/speed/blitz", "⚡", "Predict Blitz", "6 questions, beat the clock. Best " + ((st.blitz || {}).best || 0)) +
      tile("#/golf", "⛳", "Code Golf Shrine", gdone + " of " + golf.length + " holes played") +
      tile("#/dungeon", "🕳", "Endless Dungeon", "Best floor: " + ((st.dungeon || {}).best || 0)) +
      tile("#/placement", "🎯", "Placement Quiz", st.placed ? "Placed at " + esc(st.placed.region) : "Skip what you already know") +
      tile("#/pair", "🦜", "Pair Parrot", "Debug with Chilaka") + "</div>";
    var h2 = $("h2", v); h2.insertAdjacentHTML("afterend", hub + dayCard());
  };
  VIEWS.pair = function () { var m = DATA.missions.filter(function (x) { return x.type === "pair"; })[0]; location.hash = "#/mission/" + (DATA.missions.filter(function (x) { return x.type === "pair" && !S().solved[x.id]; })[0] || m).id; };
  var oldHome = VIEWS.home;
  VIEWS.home = function (v) {
    oldHome(v); var st = S(), extra = dayCard();
    if (!st.placed && Object.keys(st.solved).length < 3) extra += '<div class="card" style="margin-top:1rem"><div class="row spread"><div><b>🎯 Already know some Python?</b><div class="muted">Take the 10-question placement quiz and skip ahead.</div></div><a class="btn" href="#/placement">Take the quiz</a></div></div>';
    var sec = $(".grid.g3", v); if (sec) sec.insertAdjacentHTML("afterend", extra);
  };

  /* ---------------------------------------------------------------- Speed Run + Blitz */
  VIEWS.speed = function (v, arg) {
    if (arg === "blitz") return blitz(v);
    var st = S(), list = DATA.missions.filter(function (m) { return st.solved[m.id] && (m.type === "write-code" || m.type === "fix-the-bug" || m.type === "pair"); });
    v.innerHTML = '<h2>⏱ Speed Run</h2><p class="muted">Replay a solved mission against the clock. Your personal best earns seeds. The timer starts when the editor opens.</p>' +
      (list.length ? '<div class="grid g3">' + list.map(function (m) { var r = (st.speed || {})[m.id]; return '<div class="card"><b>' + esc(m.title) + '</b><div class="muted" style="font-size:.85rem">' + (r ? "Best " + AK.fmtMs(r.best) + " · " + r.runs + " runs" : "Not raced yet") + '</div><button class="btn small primary" data-race="' + m.id + '" style="margin-top:.5rem">▶ Race</button></div>'; }).join("") + "</div>" : '<div class="card">Solve a coding mission first. Then you can race it here.</div>') +
      '<p style="margin-top:1rem"><a class="btn" href="#/speed/blitz">⚡ Predict Blitz</a></p>';
    $$("[data-race]", v).forEach(function (b) { b.onclick = function () { speedRun = { id: b.dataset.race, t0: 0 }; location.hash = "#/mission/" + b.dataset.race; }; });
  };
  function blitz(v) {
    var qs = shuffle(DATA.missions.filter(function (m) { return m.type === "predict" && !m.stdin; })).slice(0, 6), i = 0, ok = 0, bad = 0, t0 = Date.now();
    function ask() {
      if (i >= qs.length) { var ms = Date.now() - t0, r = AK.blitzRecord(S(), DATA, ok, bad, qs.length, ms, new Date()); C.save(); sfx("solved"); refresh();
        v.innerHTML = '<h2>⚡ Blitz result</h2><div class="card"><div style="font-size:2rem">' + r.score + ' points' + (r.pb ? " 🏆 new best!" : "") + '</div><p>' + ok + " right, " + bad + " wrong, " + AK.fmtMs(ms) + ' · +' + r.seeds + ' 🌱</p><div class="row"><button class="btn primary" id="again">Again</button><a class="btn" href="#/arena">Arena</a></div></div>'; (r.newBadges || []).length && C.badgeToasts(r.newBadges); $("#again").onclick = function () { blitz(v); }; return; }
      var m = qs[i]; v.innerHTML = '<div class="row spread"><h2>⚡ Predict Blitz</h2><span class="chip">' + (i + 1) + " / " + qs.length + '</span></div><div class="card">' + codeBox(m.code) + '<div class="opts">' + m.options.map(function (o, k) { return '<button class="btn opt" data-k="' + k + '"><pre class="mono" style="margin:0;white-space:pre-wrap">' + esc(o) + "</pre></button>"; }).join("") + "</div></div>";
      $$(".opt", v).forEach(function (b) { b.onclick = function () { var k = Number(b.dataset.k), right = k === m.answer; $$(".opt", v).forEach(function (x) { x.disabled = true; }); b.classList.add(right ? "right" : "wrong"); if (!right) $$(".opt", v)[m.answer].classList.add("right"); right ? ok++ : bad++; sfx(right ? "ok" : "no"); buzz(right ? 10 : [30, 40, 30]); i++; setTimeout(ask, right ? 450 : 1100); }; });
    }
    ask();
  }

  /* ---------------------------------------------------------------- Code Golf Shrine */
  VIEWS.golf = function (v) {
    var st = S(), gs = DATA.missions.filter(function (m) { return m.golf; });
    v.innerHTML = '<h2>⛳ Code Golf Shrine</h2><p class="muted">Solve the hole, then shrink your code. Strokes are counted in characters (comments and blank lines are free). Beat par for a birdie.</p><div class="grid g3">' +
      gs.map(function (m) { var r = (st.golf || {})[m.id]; return '<a class="card" style="text-decoration:none;color:inherit" href="#/mission/' + m.id + '"><b>' + esc(m.title) + '</b><div class="muted" style="font-size:.85rem">Par ' + m.golf.par + (r ? " · your best " + r.best + " · " + esc(AK.golfRank(r.best, m.golf.par).label) : " · not played") + "</div></a>"; }).join("") + "</div>";
  };

  /* ---------------------------------------------------------------- Endless Dungeon */
  VIEWS.dungeon = function (v) {
    var run = { seed: Math.floor(Math.random() * 1e6) + 1, floor: 1, lives: 3, cleared: 0 };
    v.innerHTML = '<h2>🕳 Endless Dungeon</h2><div class="card">Loading the Python engine…</div>';
    C.ensurePy().then(function (api) { floor(); function floor() {
      var def = AK.dungeonFloor(run.seed, run.floor), b = AK.dungeonBuild(def, function (c) { return api.run(c, [], false); });
      if (!b) { run.floor++; floor(); return; }
      v.innerHTML = '<div class="row spread"><h2>🕳 Floor ' + run.floor + '</h2><span class="chip">' + "❤".repeat(run.lives) + "🖤".repeat(3 - run.lives) + '</span><span class="chip gold">Best ' + ((S().dungeon || {}).best || 0) + '</span></div><div class="card"><p class="muted">' + esc(b.title) + " · predict the output</p>" + codeBox(b.code) + '<div class="opts">' + b.options.map(function (o, k) { return '<button class="btn opt" data-k="' + k + '"><pre class="mono" style="margin:0;white-space:pre-wrap">' + esc(o) + "</pre></button>"; }).join("") + '</div><div id="dmsg"></div></div>';
      $$(".opt", v).forEach(function (btn) { btn.onclick = function () {
        var k = Number(btn.dataset.k), right = k === b.answer; $$(".opt", v).forEach(function (x) { x.disabled = true; }); btn.classList.add(right ? "right" : "wrong"); if (!right) $$(".opt", v)[b.answer].classList.add("right");
        if (right) { var n = AK.dungeonCleared(S(), run.floor); run.cleared++; C.save(); sfx("ok"); buzz(10); $("#dmsg").innerHTML = '<p class="muted">Cleared! +' + n + " 🌱</p>"; run.floor++; refresh(); setTimeout(floor, 800); }
        else { run.lives--; sfx("no"); buzz([30, 40, 30]); if (run.lives <= 0) { var r = AK.dungeonEnd(S(), DATA, run.cleared, new Date()); C.save(); refresh(); setTimeout(function () { v.innerHTML = '<h2>🕳 The dungeon wins this time</h2><div class="card"><div style="font-size:2rem">' + run.cleared + ' floors cleared' + (r.pb ? " 🏆 new best!" : "") + '</div><p class="muted">Best: ' + r.best + '</p><div class="row"><button class="btn primary" id="again">Descend again</button><a class="btn" href="#/arena">Arena</a></div></div>'; (r.newBadges || []).length && C.badgeToasts(r.newBadges); $("#again").onclick = function () { VIEWS.dungeon(v); }; }, 1200); }
          else { $("#dmsg").innerHTML = '<p class="muted">Not quite. ' + run.lives + " lives left.</p>"; run.floor++; setTimeout(floor, 1300); } }
      }; });
    } }, function () { v.innerHTML = '<div class="card">' + esc(C.PY_OFFLINE) + "</div>"; });
  };

  /* ---------------------------------------------------------------- Placement quiz */
  VIEWS.placement = function (v) {
    var qs = (DATA.placement || []).slice().sort(function (a, b) { return a.level - b.level; }), i = 0, okMap = {}, miss = 0;
    if (!qs.length) { v.innerHTML = '<div class="card">No placement quiz in this build.</div>'; return; }
    function ask() {
      if (i >= qs.length || miss >= 2) {
        var res = AK.applyPlacement(S(), DATA, okMap, new Date()); C.save(); refresh(); sfx("solved");
        v.innerHTML = '<h2>🎯 Your starting point</h2><div class="card"><div style="font-size:1.6rem">' + res.region.icon + " " + esc(res.region.title) + '</div><p>You got ' + S().placed.score + " of " + S().placed.total + ' right. Earlier regions are open and you start here.</p><div class="row"><a class="btn primary" href="#/map">Open the map</a></div></div>'; (res.newBadges || []).length && C.badgeToasts(res.newBadges); return;
      }
      var q = qs[i]; v.innerHTML = '<div class="row spread"><h2>🎯 Placement quiz</h2><span class="chip">' + (i + 1) + " / " + qs.length + '</span></div><p class="muted">Predict the output. It stops early after two misses, so a wrong answer is fine.</p><div class="card">' + codeBox(q.code) + '<div class="opts">' + q.options.map(function (o, k) { return '<button class="btn opt" data-k="' + k + '"><pre class="mono" style="margin:0;white-space:pre-wrap">' + esc(o) + "</pre></button>"; }).join("") + '</div></div><p><button class="btn small" id="skipq">I am not sure</button></p>';
      var next = function (right, k) { okMap[q.id] = right; if (!right) miss++; $$(".opt", v).forEach(function (x) { x.disabled = true; }); if (k !== null) { $$(".opt", v)[k].classList.add(right ? "right" : "wrong"); } if (!right) $$(".opt", v)[q.answer].classList.add("right"); sfx(right ? "ok" : "no"); i++; setTimeout(ask, right ? 500 : 1100); };
      $$(".opt", v).forEach(function (b) { b.onclick = function () { var k = Number(b.dataset.k); next(k === q.answer, k); }; });
      $("#skipq").onclick = function () { next(false, null); };
    }
    ask();
  };

  /* ---------------------------------------------------------------- settings card on the profile page */
  var oldProfile = VIEWS.profile;
  VIEWS.profile = function (v) {
    oldProfile(v); var st = S(), cfg = function (k) { return st.settings[k] || "on"; };
    var sel = function (id, label, opts) { return '<label class="muted" for="' + id + '">' + label + '</label><select class="input" id="' + id + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (cfg(id.replace("set_", "")) === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>"; };
    var card = document.createElement("div"); card.className = "card"; card.style.marginTop = "1rem";
    card.innerHTML = "<h3>🎛 Feel</h3><div class=\"grid g3\"><div>" + sel("set_sound", "Sound", [["on", "On"], ["quiet", "Quiet"], ["off", "Off"]]) + "</div><div>" + sel("set_haptics", "Vibration (phones)", [["on", "On"], ["off", "Off"]]) + "</div><div>" + sel("set_buddy", "Parrot buddy", [["on", "On"], ["off", "Off"]]) + '</div></div><p class="muted" style="font-size:.85rem">Sounds are generated in your browser. Nothing is downloaded and nothing is recorded.</p><button class="btn small" id="testSound">🔊 Test</button>';
    v.appendChild(card);
    ["sound", "haptics", "buddy"].forEach(function (k) { $("#set_" + k).onchange = function (e) { st.settings[k] = e.target.value; C.save(); if (k === "buddy" && e.target.value === "off") FX.buddyOff(); }; });
    $("#testSound").onclick = function () { sfx("solved"); buzz([20, 40, 20]); };
  };

  UI.start = function () { window.addEventListener("hashchange", C.route); C.route(); };
})();

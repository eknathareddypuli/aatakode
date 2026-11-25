/* AataKode v3 screens: lessons that mix reading and practice, Go practice, Security/Compiler Hunt, Robot Maze, Pipeline Plumber,
   project carry-over, Quest Board, Proof page and the constellation map. Plugs into AK_CORE and AK_UI like modes.js. */
(function () {
  "use strict";
  var C = window.AK_CORE, AK = window.AK, FX = window.AK_FX, UI = window.AK_UI;
  if (!C || !UI) return;
  var $ = C.$, $$ = C.$$, esc = C.esc, DATA = C.DATA, VIEWS = C.VIEWS, H = UI.hooks;
  var S = function () { return C.state(); };
  var sfx = function (n, a) { if (FX) FX.sound(n, a); };
  var buzz = function (p) { if (FX) FX.buzz(p); };
  AK._data = DATA;

  /* tiny markdown: **bold**, `code`, blank line = paragraph */
  function md(t) {
    return String(t).split(/\n\n+/).map(function (p) {
      return "<p>" + esc(p).replace(/`([^`]+)`/g, '<code class="mono">$1</code>').replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>") + "</p>";
    }).join("");
  }
  var codeBox = function (c, cls) { return '<pre class="codepeek mono' + (cls ? " " + cls : "") + '" style="white-space:pre-wrap;margin:.5rem 0">' + esc(c) + "</pre>"; };
  var head = function (m, label) {
    return '<div class="mhead"><a class="btn small" href="#/map">← ' + esc(C.t("back")) + '</a><span class="tag">' + esc(C.lt(C.regionById[m.region], "title")) + (label ? " · " + label : "") + "</span><h2>" + esc(m.title) + '</h2><span class="chip gold">' + m.xp + ' XP</span><span id="mstatus"></span></div>';
  };
  /* Shared finish path for graders that need no Python: light the checks, then award or nudge. */
  function judge(m, w, results, code) {
    C.lightTests(m, results, function () {
      if (results.every(function (r) { return r.ok; })) { sfx("solved"); C.finishMission(m, w, { code: code, cleanPass: null }); }
      else { C.tries[m.id] = (C.tries[m.id] || 0) + 1; sfx("no"); buzz([30, 40, 30]); C.toast("Not yet. Read the failed checks and try again."); if (H.failed) H.failed(m); }
    });
  }
  var solvedNote = function (m) { $("#rewardSlot").innerHTML = S().solved[m.id] ? '<div class="reward"><b>✔ You solved this mission.</b> <a href="#/map">Back to the map</a></div>' : ""; };
  var NOTE_GO = '<p class="muted" style="font-size:.85rem">🐹 Go missions are checked by reading your answer. A browser cannot run the Go compiler, so every answer here was verified against real <span class="mono">go</span> before shipping.</p>';

  /* ---------------------------------------------------------------- Lessons: read a little, try it right there */
  UI.mission.lesson = function (v, m, w) {
    var st = S(); st.lessons = st.lessons || {}; var prog = st.lessons[m.id] = st.lessons[m.id] || {};
    var need = AK.lessonNeed(m), solved = !!st.solved[m.id];
    var html = head(m, "LESSON") + '<div class="card lesson"><div class="story">' + esc(m.story) + '</div><div class="goal"><b>Goal:</b> ' + esc(m.goal) + '</div><div class="bar" aria-label="Lesson progress"><i id="lbar" style="width:0%"></i></div></div><div id="lblocks">';
    m.blocks.forEach(function (b, i) { html += '<div class="card lblock" data-i="' + i + '">' + blockHtml(b, i) + "</div>"; });
    v.innerHTML = html + '</div><div id="rewardSlot"></div><div id="explainSlot">' + "</div>";
    function blockHtml(b, i) {
      if (b.kind === "text") return md(b.text);
      if (b.kind === "code") return (b.title ? "<b>" + esc(b.title) + "</b>" : "") + codeBox(b.code) + (b.output !== undefined ? '<div class="out" style="margin:0">' + esc(b.output) + "</div>" : "") + (b.run ? '<button class="btn small" data-run="' + i + '">▶ Run it</button><div class="out" id="lrun' + i + '" hidden></div>' : "");
      if (b.kind === "try") return '<span class="tag">TRY IT</span> ' + md(b.prompt) + '<div class="editor mini"><textarea class="ltxt" id="lt' + i + '" rows="' + Math.max(3, b.starter.split("\n").length + 1) + '" spellcheck="false" aria-label="Your code">' + esc((st.drafts["L" + m.id + i] != null ? st.drafts["L" + m.id + i] : b.starter)) + '</textarea></div><div class="row"><button class="btn small" data-runtry="' + i + '">▶ Run</button><button class="btn good small" data-chk="' + i + '">✔ Check</button><button class="btn small" data-show="' + i + '">💡 Show an answer</button></div><div class="out" id="lo' + i + '" hidden></div><div id="lres' + i + '"></div>';
      if (b.kind === "quiz") return '<span class="tag">QUICK CHECK</span> ' + md(b.q) + '<div class="opts" id="lq' + i + '">' + b.options.map(function (o, k) { return '<button class="btn opt" data-q="' + i + '" data-k="' + k + '">' + esc(o) + "</button>"; }).join("") + '</div><div id="lqm' + i + '" class="muted"></div>';
      if (b.kind === "gofill") { var parts = b.template.split("___"); return '<span class="tag">TRY IT · GO</span> ' + md(b.prompt) + '<pre class="codepeek mono fillgo">' + parts.map(function (p, k) { return esc(p) + (k < parts.length - 1 ? '<input class="blank" data-gf="' + i + '" data-b="' + k + '" size="8" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Blank ' + (k + 1) + '">' : ""); }).join("") + '</pre>' + (b.expect ? '<div class="muted">It prints: <span class="mono">' + esc(b.expect) + "</span></div>" : "") + '<div class="row"><button class="btn good small" data-gchk="' + i + '">✔ Check</button></div><div id="lres' + i + '"></div>'; }
      return "";
    }
    function mark(i) { prog[i] = true; $('.lblock[data-i="' + i + '"]', v).classList.add("done"); update(); }
    function update() {
      var n = need.filter(function (i) { return prog[i]; }).length, pct = need.length ? Math.round(100 * n / need.length) : 100; $("#lbar").style.width = pct + "%";
      C.save();
      if (n === need.length && !st.solved[m.id]) { sfx("solved"); C.finishMission(m, w, { code: "lesson", cleanPass: null }); }
    }
    need.forEach(function (i) { if (prog[i]) $('.lblock[data-i="' + i + '"]', v).classList.add("done"); });
    $("#lbar").style.width = (need.length ? Math.round(100 * need.filter(function (i) { return prog[i]; }).length / need.length) : 100) + "%";
    var ensure = function () { return C.ensurePy().then(function (api) { return api; }, function () { return null; }); };
    $$("[data-run]", v).forEach(function (b) { b.onclick = function () { var i = Number(b.dataset.run), box = $("#lrun" + i); box.hidden = false; box.textContent = "Running…"; ensure().then(function (api) { if (!api) { box.textContent = C.PY_OFFLINE; return; } var r = api.run(m.blocks[i].code, [], false); box.textContent = r.out || "(nothing printed)"; if (r.err) box.textContent += "\n" + AK.friendlyError(r.err).title; }); }; });
    $$("[data-runtry]", v).forEach(function (b) { b.onclick = function () { var i = Number(b.dataset.runtry), box = $("#lo" + i); box.hidden = false; box.textContent = "Running…"; ensure().then(function (api) { if (!api) { box.textContent = C.PY_OFFLINE; return; } var r = api.run($("#lt" + i).value, (m.blocks[i].stdin || []), false); box.textContent = r.out || "(nothing printed)"; if (r.err) { var f = AK.friendlyError(r.err); box.textContent += "\n" + f.title + ": " + f.hint; } }); }; });
    $$(".ltxt", v).forEach(function (ta) { ta.addEventListener("input", function () { st.drafts["L" + m.id + ta.id.slice(2)] = ta.value; }); ta.addEventListener("keydown", function (e) { if (e.key === "Tab") { e.preventDefault(); ta.setRangeText("    ", ta.selectionStart, ta.selectionEnd, "end"); } }); });
    $$("[data-show]", v).forEach(function (b) { b.onclick = function () { var i = Number(b.dataset.show); $("#lt" + i).value = m.blocks[i].solution; }; });
    $$("[data-chk]", v).forEach(function (b) { b.onclick = function () {
      var i = Number(b.dataset.chk), blk = m.blocks[i]; ensure().then(function (api) {
        if (!api) { C.toast(C.PY_OFFLINE); return; }
        var res = api.grade($("#lt" + i).value, blk.tests), all = res.every(function (r) { return r.ok; });
        $("#lres" + i).innerHTML = '<ul class="tests">' + res.map(function (r, k) { return '<li><span class="' + (r.ok ? "ok" : "no") + '">' + (r.ok ? "✔" : "✘") + "</span><span>" + esc(blk.tests[k].label || r.label) + (!r.ok && !r.hidden && r.got !== undefined ? '<div class="detail">Expected ' + esc(r.expect) + ", got " + esc(r.got) + "</div>" : "") + "</span></li>"; }).join("") + "</ul>";
        if (all) { sfx("ok"); buzz(10); mark(i); } else { sfx("no"); }
      });
    }; });
    $$("[data-q]", v).forEach(function (b) { b.onclick = function () {
      var i = Number(b.dataset.q), k = Number(b.dataset.k), blk = m.blocks[i];
      if (k === blk.answer) { $$("[data-q='" + i + "']", v).forEach(function (x) { x.disabled = true; }); b.classList.add("right"); $("#lqm" + i).innerHTML = "<b>✔</b> " + esc(blk.why); sfx("ok"); mark(i); }
      else { b.classList.add("wrong"); b.disabled = true; sfx("no"); $("#lqm" + i).textContent = "Not that one. Try again."; }
    }; });
    $$("[data-gchk]", v).forEach(function (b) { b.onclick = function () {
      var i = Number(b.dataset.gchk), blk = m.blocks[i], vals = $$("[data-gf='" + i + "']", v).map(function (x) { return x.value; }), ok = AK.goFillCheck(blk, vals);
      $$("[data-gf='" + i + "']", v).forEach(function (x, k) { x.classList.toggle("bad", !ok[k]); x.classList.toggle("okb", ok[k]); });
      $("#lres" + i).innerHTML = ok.every(Boolean) ? '<div class="muted"><b>✔</b> ' + esc(blk.why || "Right.") + "</div>" : '<div class="muted">Check the highlighted blanks.</div>';
      if (ok.every(Boolean)) { sfx("ok"); mark(i); } else sfx("no");
    }; });
    C.setHeadStatus(m); solvedNote(m);
  };

  /* ---------------------------------------------------------------- Go practice: fill, order */
  UI.mission.go = function (v, m, w) {
    var fillMode = m.mode === "fill", st = S();
    v.innerHTML = C.missionFrame(m, {
      tabs: C.tabBtn("out", "Program output", true) + (m.cheat ? C.tabBtn("cheat", "Cheat sheet") : "") + C.tabBtn("compare", "Compare"),
      panels: '<div id="tab-out"><p class="muted">What this program prints when it is right:</p><div class="out mono" id="goexp">' + esc(m.expect || "") + "</div>" + NOTE_GO + '</div>' + (m.cheat ? '<div id="tab-cheat" hidden>' + md(m.cheat) + "</div>" : ""),
    });
    C.bindHints(m); C.bindTabs(m); C.setHeadStatus(m); C.refreshCompare(m); C.bindExplain(m);
    var mid = $("#midpane"), getCode;
    if (fillMode) {
      var parts = m.template.split("___"), n = parts.length - 1, draft = []; try { draft = JSON.parse(st.drafts[m.id] || "[]"); } catch (e) { draft = []; }
      mid.innerHTML = '<p class="muted">Fill every blank <span class="mono">___</span> so the Go program does what the goal says.</p><pre class="codepeek mono fillgo" id="gobox">' +
        parts.map(function (p, k) { return esc(p) + (k < n ? '<input class="blank" data-b="' + k + '" size="' + Math.max(6, (draft[k] || "").length + 1) + '" value="' + esc(draft[k] || "") + '" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Blank ' + (k + 1) + ' of ' + n + '">' : ""); }).join("") + "</pre>";
      var vals = function () { return $$(".blank", mid).map(function (x) { return x.value; }); };
      $$(".blank", mid).forEach(function (x) { x.addEventListener("input", function () { x.size = Math.max(6, x.value.length + 1); st.drafts[m.id] = JSON.stringify(vals()); C.save(); }); });
      getCode = function () { return AK.goFillCode(m, vals()); };
    } else {
      var lines = m.lines.slice(); try { var d = JSON.parse(st.drafts[m.id] || "null"); if (Array.isArray(d) && d.length === lines.length) lines = d; } catch (e) { /* use shuffled */ }
      var drag = -1, box = document.createElement("div"); mid.innerHTML = '<p class="muted">Put the Go lines in an order that compiles and does what the goal says. Drag, or use the arrows.</p>'; mid.appendChild(box);
      var persist = function () { st.drafts[m.id] = JSON.stringify(lines); C.save(); };
      var move = function (i, j) { if (j < 0 || j >= lines.length) return; var x = lines.splice(i, 1)[0]; lines.splice(j, 0, x); persist(); draw(); };
      var draw = function () {
        box.innerHTML = '<ol class="order">' + lines.map(function (l, i) { return '<li draggable="true" data-i="' + i + '"><span class="grip" aria-hidden="true">⠿</span><code>' + esc(l) + '</code><span class="mv"><button class="btn small" data-up="' + i + '" aria-label="Move line ' + (i + 1) + ' up">▲</button><button class="btn small" data-dn="' + i + '" aria-label="Move line ' + (i + 1) + ' down">▼</button></span></li>'; }).join("") + "</ol>";
        $$("[data-up]", box).forEach(function (b) { b.onclick = function () { move(Number(b.dataset.up), Number(b.dataset.up) - 1); }; });
        $$("[data-dn]", box).forEach(function (b) { b.onclick = function () { move(Number(b.dataset.dn), Number(b.dataset.dn) + 1); }; });
        $$("li", box).forEach(function (li) {
          li.addEventListener("dragstart", function (e) { drag = Number(li.dataset.i); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", String(drag)); } catch (er) { /* ignore */ } });
          li.addEventListener("dragover", function (e) { e.preventDefault(); });
          li.addEventListener("drop", function (e) { e.preventDefault(); var to = Number(li.dataset.i); if (drag >= 0 && drag !== to) move(drag, to); drag = -1; });
        });
      };
      draw(); getCode = function () { return lines.join("\n") + "\n"; };
    }
    mid.insertAdjacentHTML("beforeend", '<div class="row" style="margin-top:.6rem"><button class="btn good" id="submitBtn">✔ ' + esc(C.t("submit")) + '</button><button class="btn small" id="resetBtn">↺ ' + esc(C.t("reset")) + "</button></div>");
    $("#resetBtn").onclick = function () { delete st.drafts[m.id]; C.save(); UI.mission.go(v, m, w); };
    $("#submitBtn").onclick = function () {
      var code = getCode(), results;
      if (fillMode) { var ok = AK.goFillCheck(m, $$(".blank", mid).map(function (x) { return x.value; })); $$(".blank", mid).forEach(function (x, k) { x.classList.toggle("bad", !ok[k]); x.classList.toggle("okb", ok[k]); }); results = ok.map(function (b, k) { return { ok: b, label: "Blank " + (k + 1) }; }); }
      else results = [{ ok: AK.goOrderOk(m, code.replace(/\n$/, "").split("\n")), label: "Lines in a working order" }];
      judge(m, w, results, code);
    };
    solvedNote(m);
  };

  /* ---------------------------------------------------------------- Security Hunt and Compiler Hunt */
  UI.mission.hunt = function (v, m, w) {
    var lines = m.code.replace(/\n$/, "").split("\n"), picked = {}, spotted = !!S().solved[m.id], isGo = m.lang === "go";
    v.innerHTML = C.missionFrame(m, {
      tabs: C.tabBtn("out", "Briefing", true) + C.tabBtn("compare", "Compare"),
      panels: '<div id="tab-out"><p class="muted">' + (isGo ? "Go refuses to compile code with these mistakes. Find the lines it would complain about." : "Read like an attacker. Which lines would let someone in?") + '</p><div id="huntmsg" aria-live="polite" class="muted"></div>' + (isGo ? NOTE_GO : "") + "</div>",
    });
    C.bindHints(m); C.bindTabs(m); C.setHeadStatus(m); C.refreshCompare(m); C.bindExplain(m);
    var mid = $("#midpane");
    function draw() {
      mid.innerHTML = '<div class="card hunt"><b>Step 1: ' + (isGo ? "Tap the lines the compiler would reject" : "Tap every risky line") + '</b><div class="huntcode" role="group" aria-label="Code lines">' + lines.map(function (l, i) {
        var n = i + 1, on = picked[n], bad = spotted && m.bad.indexOf(n) >= 0;
        return '<button class="hl' + (on ? " on" : "") + (bad ? " found" : "") + '" data-n="' + n + '" aria-pressed="' + (on ? "true" : "false") + '"' + (spotted ? " disabled" : "") + '><span class="ln">' + n + '</span><code>' + esc(l || " ") + "</code></button>";
      }).join("") + '</div><div class="row" style="margin-top:.6rem">' + (spotted ? "" : '<button class="btn primary" id="reportBtn">🚩 Report these lines</button>') + "</div>" +
        (spotted ? '<div class="why">' + m.bad.map(function (n) { return "<p><b>Line " + n + ":</b> " + esc(m.why_lines[n] || m.why_lines[String(n)]) + "</p>"; }).join("") + "</div>" : "") + "</div>" +
        (spotted ? '<div class="card" id="fixcard" style="margin-top:.8rem"><b>Step 2: ' + esc(m.fix.question) + '</b><div class="opts">' + m.fix.options.map(function (o, k) { return '<button class="btn opt fixopt" data-k="' + k + '"><pre style="margin:0;text-align:left">' + esc(o) + "</pre></button>"; }).join("") + '</div><div id="fixmsg" class="muted" aria-live="polite"></div></div>' : "");
      $$(".hl", mid).forEach(function (b) { b.onclick = function () { var n = Number(b.dataset.n); picked[n] = !picked[n]; sfx("click"); draw(); }; });
      var rb = $("#reportBtn"); if (rb) rb.onclick = function () {
        var sel = Object.keys(picked).filter(function (k) { return picked[k]; }).map(Number), r = AK.huntCheck(m, sel);
        if (r.ok) { spotted = true; sfx("ok"); buzz(15); if (FX && FX.pulse) FX.pulse("good"); $("#huntmsg").textContent = ""; draw(); var fc = $("#fixcard"); if (fc) fc.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
        else { C.tries[m.id] = (C.tries[m.id] || 0) + 1; sfx("no"); buzz([30, 40, 30]); if (FX && FX.flinch) FX.flinch(); $("#huntmsg").textContent = (sel.length ? r.wrong.length + " of your lines " + (r.wrong.length === 1 ? "is" : "are") + " fine. " : "") + (r.missed.length ? "You have not found all of them yet (" + r.missed.length + " still hiding)." : "Check again."); }
      };
      $$(".fixopt", mid).forEach(function (b) { b.onclick = function () {
        var k = Number(b.dataset.k);
        if (k === m.fix.answer) { $$(".fixopt", mid).forEach(function (x) { x.disabled = true; }); b.classList.add("right"); $("#fixmsg").innerHTML = "<b>✔</b> " + esc(m.fix.why); judge(m, w, [{ ok: true, label: "Spotted every risky line" }, { ok: true, label: "Chose the safe fix" }], m.solution); }
        else { b.classList.add("wrong"); b.disabled = true; C.tries[m.id] = (C.tries[m.id] || 0) + 1; sfx("no"); $("#fixmsg").textContent = "That does not close the hole. Think about what the attacker controls."; }
      }; });
    }
    draw(); solvedNote(m);
    if (S().solved[m.id]) { var fc = $("#fixcard"); if (fc) { $$(".fixopt", mid).forEach(function (x, k) { x.disabled = true; if (k === m.fix.answer) x.classList.add("right"); }); } }
  };

  /* ---------------------------------------------------------------- Robot Maze */
  var CELL = 44, ARROW = ["▲", "▶", "▼", "◀"];
  function mazeSvg(g, state) {
    var P = AK.gridParse(g), W = P.W * CELL, Hh = P.H * CELL, s = '<svg class="maze" viewBox="0 0 ' + W + " " + Hh + '" role="img" aria-label="Maze map, ' + P.W + " by " + P.H + '">';
    for (var y = 0; y < P.H; y++) for (var x = 0; x < P.W; x++) s += '<rect x="' + x * CELL + '" y="' + y * CELL + '" width="' + CELL + '" height="' + CELL + '" class="' + (g.rows[y][x] === "#" ? "mwall" : "mfloor") + '"/>';
    s += '<text x="' + (P.goal[0] * CELL + CELL / 2) + '" y="' + (P.goal[1] * CELL + CELL * 0.68) + '" class="mg" font-size="26" text-anchor="middle">🏁</text>';
    P.coins.forEach(function (c, i) { s += '<text class="mcoin" data-c="' + c[0] + "," + c[1] + '" x="' + (c[0] * CELL + CELL / 2) + '" y="' + (c[1] * CELL + CELL * 0.68) + '" font-size="22" text-anchor="middle">🪙</text>'; });
    s += '<g id="bot" transform="translate(' + (P.start[0] * CELL + CELL / 2) + "," + (P.start[1] * CELL + CELL / 2) + ')"><g id="botrot" style="transform:rotate(' + ["0", "90", "180", "270"][{ N: 0, E: 1, S: 2, W: 3 }[P.facing]] + 'deg)"><text font-size="26" text-anchor="middle" y="9">🦜</text><text font-size="12" text-anchor="middle" y="-14" fill="#ffd84a">▲</text></g></g></svg>';
    return s;
  }
  UI.mission.grid = function (v, m, w) {
    v.innerHTML = C.missionFrame(m, {
      tabs: C.tabBtn("out", "Run result", true) + C.tabBtn("api", "Robot guide") + C.tabBtn("compare", "Compare"),
      panels: '<div id="tab-out"><div class="out" id="outbox" aria-live="polite">Press Run to watch the parrot follow your code.</div><div id="errbox"></div></div><div id="tab-api" hidden><p class="muted">Commands for the parrot:</p><ul class="mono" style="font-size:.88rem;padding-left:1.1rem"><li>move() · one step forward</li><li>turn_left() · turn_right()</li><li>front_clear() · is the way ahead open?</li><li>left_clear() · right_clear()</li><li>at_goal() · standing on 🏁?</li><li>coin_here() · pick_coin()</li></ul><p class="muted">Walking into a wall is an error, so check front_clear() when unsure.</p></div>',
    });
    C.bindHints(m); var show = C.bindTabs(m); C.setHeadStatus(m); C.refreshCompare(m); C.bindExplain(m); C.setPyPill();
    var mid = $("#midpane"), timer = null;
    var ed = C.buildCodeEditor(m, mid, function () {});
    mid.insertAdjacentHTML("afterbegin", '<div class="card mazecard" id="mazebox">' + mazeSvg(m.grid) + "</div>");
    mid.insertAdjacentHTML("beforeend", '<div class="row" style="margin-top:.6rem"><button class="btn primary" id="runBtn">▶ ' + esc(C.t("run")) + '</button><button class="btn good" id="submitBtn">✔ ' + esc(C.t("submit")) + '</button><button class="btn small" id="resetBtn">↺ ' + esc(C.t("reset")) + "</button></div>");
    var eng = function () { return C.ensurePy().then(function (a) { return a; }, function () { $("#outbox").textContent = C.PY_OFFLINE; return null; }); };
    function animate(tr) {
      clearTimeout(timer); var box = $("#mazebox"); if (!box) return; box.innerHTML = mazeSvg(m.grid); var P = AK.gridParse(m.grid), i = 0, bot = $("#bot"), rot = $("#botrot"), fast = C.reducedMotion();
      var place = function (a) { bot.setAttribute("transform", "translate(" + (a.x * CELL + CELL / 2) + "," + (a.y * CELL + CELL / 2) + ")"); rot.style.transform = "rotate(" + a.d * 90 + "deg)"; };
      var step = function () {
        if (!$("#bot")) return;
        if (i >= tr.acts.length) { done(); return; }
        var a = tr.acts[i++]; place(a); if (a.a === "coin") { var c = $('[data-c="' + a.x + "," + a.y + '"]', box); if (c) { c.classList.add("got"); sfx("coin"); } } else if (a.a === "move") sfx("tick");
        timer = setTimeout(step, fast ? 0 : 130);
      };
      var done = function () {
        if (!$("#outbox")) return;
        var msg = tr.err ? "" : tr.reached ? "🏁 The parrot reached the flag" + (tr.total ? " with " + tr.coins + " of " + tr.total + " coins." : ".") : "The parrot stopped before the flag.";
        if (tr.err) { var f = AK.friendlyError(tr.err); $("#errbox").innerHTML = '<div class="err" role="alert"><b>' + esc(tr.err.type === "RobotError" ? "The parrot says" : f.title) + (f.line ? " on line " + f.line : "") + "</b><div>" + esc(tr.err.type === "RobotError" ? tr.err.msg : f.hint) + "</div></div>"; if (FX && FX.flinch) FX.flinch(); } else $("#errbox").innerHTML = "";
        $("#outbox").textContent = msg + (tr.out ? "\n" + tr.out : "");
      };
      void P; step();
    }
    $("#runBtn").onclick = function () { show("out"); $("#outbox").textContent = "Running…"; eng().then(function (api) { if (!api) return; animate(api.gridRun(ed.getCode(), m.grid)); }); };
    $("#resetBtn").onclick = function () { var b = $("#resetBtn"); if (b.dataset.sure) { ed.reset(); b.textContent = "↺ " + C.t("reset"); delete b.dataset.sure; } else { b.dataset.sure = "1"; b.textContent = "Click again to restore the starter"; } };
    $("#submitBtn").onclick = function () {
      eng().then(function (api) {
        if (!api) return; var code = ed.getCode(), res = AK.gridGrade(m, code); if (res.traces && res.traces[0]) animate(res.traces[0]);
        judge(m, w, res, code);
      });
    };
    solvedNote(m);
  };

  /* ---------------------------------------------------------------- Pipeline Plumber */
  UI.mission.pipe = function (v, m, w) {
    var st = S(), steps = []; try { steps = JSON.parse(st.drafts[m.id] || "[]"); } catch (e) { steps = []; } steps = steps.filter(function (i) { return m.blocks[i]; });
    v.innerHTML = C.missionFrame(m, { tabs: C.tabBtn("out", "Target", true) + C.tabBtn("compare", "Compare"), panels: '<div id="tab-out"><p class="muted">Your pipeline must produce exactly this:</p><pre class="out mono" id="target">' + esc(m.target) + '</pre><p class="muted">It is also tested on hidden data, so build the idea, not a trick.</p></div>' });
    C.bindHints(m); C.bindTabs(m); C.setHeadStatus(m); C.refreshCompare(m); C.bindExplain(m);
    var mid = $("#midpane"); mid.innerHTML = '<div class="card"><b>📥 Input</b><pre class="out mono pipein" id="pin">' + esc(m.input) + '</pre></div><div class="card" style="margin-top:.6rem"><b>🧰 Parts</b><div class="row" id="palette"></div></div><div class="card" style="margin-top:.6rem"><b>🔧 Your pipeline</b><div id="plist"></div></div><div class="row" style="margin-top:.6rem"><button class="btn good" id="submitBtn">✔ ' + esc(C.t("submit")) + '</button><button class="btn small" id="clearBtn">Clear</button></div>';
    var persist = function () { st.drafts[m.id] = JSON.stringify(steps); C.save(); };
    var asSteps = function () { return steps.map(function (i) { return m.blocks[i]; }); };
    function draw() {
      $("#palette").innerHTML = m.blocks.map(function (b, i) { return '<button class="btn small part" data-add="' + i + '"><span class="mono">' + esc(AK.pipeLabel(b)) + "</span></button>"; }).join("");
      var run = AK.pipeRun(m.input, asSteps());
      $("#plist").innerHTML = steps.length ? '<ol class="pipeline">' + steps.map(function (bi, k) { var out = run.stages[k].out, ls = out === "" ? [] : out.split("\n"); return '<li><div class="row"><span class="mono grow">| ' + esc(AK.pipeLabel(m.blocks[bi])) + '</span><button class="btn small" data-up="' + k + '" aria-label="Move up">▲</button><button class="btn small" data-dn="' + k + '" aria-label="Move down">▼</button><button class="btn small" data-rm="' + k + '" aria-label="Remove">✕</button></div><pre class="out mono stage">' + esc(ls.slice(0, 6).join("\n") + (ls.length > 6 ? "\n… " + (ls.length - 6) + " more" : "") || "(empty)") + "</pre></li>"; }).join("") + "</ol>" : '<p class="muted">Tap parts above to build the pipeline. Data flows from the input, top to bottom.</p>';
      $$("[data-add]", mid).forEach(function (b) { b.onclick = function () { steps.push(Number(b.dataset.add)); sfx("click"); persist(); draw(); }; });
      $$("[data-rm]", mid).forEach(function (b) { b.onclick = function () { steps.splice(Number(b.dataset.rm), 1); persist(); draw(); }; });
      $$("[data-up]", mid).forEach(function (b) { b.onclick = function () { var k = Number(b.dataset.up); if (k > 0) { var x = steps.splice(k, 1)[0]; steps.splice(k - 1, 0, x); persist(); draw(); } }; });
      $$("[data-dn]", mid).forEach(function (b) { b.onclick = function () { var k = Number(b.dataset.dn); if (k < steps.length - 1) { var x = steps.splice(k, 1)[0]; steps.splice(k + 1, 0, x); persist(); draw(); } }; });
    }
    draw();
    $("#clearBtn").onclick = function () { steps = []; persist(); draw(); };
    $("#submitBtn").onclick = function () { var res = AK.pipeGrade(m, asSteps()); judge(m, w, res, asSteps().map(AK.pipeLabel).join(" | ")); };
    solvedNote(m);
  };

  /* ---------------------------------------------------------------- project steps: your last checkpoint is loaded */
  var prevFade = H.fade;
  H.fade = function (m) {
    if (m.carry && S().drafts[m.id] == null) {
      var prev = C.byId[m.carry.from], rec = S().solved[prev.id], base = (rec && rec.code && rec.code !== "lesson" ? rec.code : prev.solution).replace(/\s+$/, "");
      return Object.assign({}, m, { starter: base + "\n\n" + m.carry.stub.replace(/\s+$/, "") + "\n" });
    }
    return prevFade ? prevFade(m) : null;
  };
  var prevPy = H.python;
  H.python = function (m, ed, mid) {
    if (prevPy) prevPy(m, ed, mid);
    if (m.project_step) {
      var reg = DATA.regions.find(function (r) { return r.id === m.region; }), all = AK.regionMissions(DATA, m.region), idx = all.findIndex(function (x) { return x.id === m.id; }), box = document.createElement("div");
      box.className = "card projbar"; box.innerHTML = '<b>🏗 ' + esc(reg.title) + "</b> · checkpoint " + (idx + 1) + " of " + all.length + '<div class="bar" style="margin-top:.3rem"><i style="width:' + Math.round(100 * idx / all.length) + '%"></i></div><div class="muted" style="font-size:.85rem">' + (m.carry ? "Your code from the last checkpoint is already in the editor. Earlier checks still run, so nothing may break." : "You are starting a real project. Each checkpoint adds to the same file.") + "</div>";
      mid.parentNode.insertBefore(box, mid);
    }
  };

  /* ---------------------------------------------------------------- Quest Board */
  function questLink(g) {
    var open = function (pred) { var m = C.orderedMissions.find(function (x) { return !S().solved[x.id] && AK.isUnlocked(S(), DATA, x, C.featIds()) && pred(x); }); return m ? "#/mission/" + m.id : "#/map"; };
    var trackOf = function (m) { var r = C.regionById[m.region]; return r ? r.track : ""; };
    if (g.ev === "solve" || g.ev === "nohint" || g.ev === "star3" || g.ev === "explain") return open(function () { return true; });
    if (g.ev === "predict_ok" || g.ev === "daily_card") return "#/daily";
    if (g.ev === "outage_day") { var d = AK.outageOfDay(DATA.missions, new Date()); return d ? "#/mission/" + d.id + "/day" : "#/arena"; }
    if (g.ev === "speed") return "#/speed"; if (g.ev === "blitz") return "#/speed/blitz"; if (g.ev === "floor") return "#/dungeon"; if (g.ev === "golf") return "#/golf";
    if (g.ev === "project") return open(function (x) { return x.project_step; });
    if (g.ev.indexOf("type:") === 0) return open(function (x) { return x.type === g.ev.slice(5); });
    if (g.ev.indexOf("track:") === 0) return open(function (x) { return trackOf(x) === g.ev.slice(6); });
    return "#/map";
  }
  UI.questChip = function () {
    var q = AK.questsFor(S(), DATA, new Date()), n = q.goals.filter(function (g) { return g.done; }).length;
    return '<a class="chip' + (q.chest ? " gold" : "") + '" href="#/quests" title="Daily quests: ' + n + " of " + q.goals.length + ' done" style="text-decoration:none;color:inherit">🎯 ' + n + "/" + q.goals.length + "</a>";
  };
  function questCard(compact) {
    var q = AK.questsFor(S(), DATA, new Date());
    return '<div class="card questcard' + (q.chest ? " opened" : "") + '"><div class="row spread"><b>🎯 Daily Quests</b><span class="chip' + (q.chest ? " gold" : "") + '">' + (q.chest ? "🎁 Chest opened" : "🎁 Chest: +10 🌱 +20 XP") + '</span></div><div class="qgoals">' +
      q.goals.map(function (g) {
        return '<a class="qgoal' + (g.done ? " done" : "") + '" href="' + (g.done ? "#/quests" : questLink(g)) + '"><span class="qico">' + (g.done ? "✔" : g.ico) + '</span><span class="grow"><span>' + esc(g.text) + '</span><span class="bar"><i style="width:' + Math.round(100 * g.have / g.need) + '%"></i></span></span><span class="muted mono">' + g.have + "/" + g.need + "</span></a>";
      }).join("") + "</div>" + (compact ? '<div class="muted" style="font-size:.85rem;margin-top:.4rem"><a href="#/quests">Open the quest board →</a></div>' : "") + "</div>";
  }
  VIEWS.quests = function (v) {
    var st = S(), done = st.questsDone || 0, log = Object.keys(st.questLog || {}).sort().slice(-14), days = [];
    for (var i = 13; i >= 0; i--) { var d = new Date(); d.setDate(d.getDate() - i); var k = AK.dateKey(d); days.push('<span class="qday' + ((st.questLog || {})[k] ? " on" : "") + '" title="' + k + '"></span>'); }
    v.innerHTML = '<h2>🎯 Quest Board</h2><p class="muted">Three goals every day, picked from what you can actually do right now. Finish all three to open the chest. Missing a day never costs you anything.</p>' + questCard(false) +
      '<div class="card" style="margin-top:1rem"><b>Last 14 days</b><div class="qdays">' + days.join("") + '</div><p class="muted">Chests opened so far: <b>' + done + "</b>" + (log.length ? "" : ". Your first one is waiting.") + "</p></div>" +
      (FX && FX.festivalCard ? FX.festivalCard() : "");
  };

  /* ---------------------------------------------------------------- Proof: share cards and a portfolio */
  function drawCard(o) {
    var c = document.createElement("canvas"); c.width = 1200; c.height = 630; var x = c.getContext("2d"), mono = "ui-monospace, Menlo, Consolas, monospace", sans = "system-ui, -apple-system, Segoe UI, sans-serif";
    var g = x.createLinearGradient(0, 0, 1200, 630); g.addColorStop(0, "#1d1856"); g.addColorStop(1, "#0f0d2e"); x.fillStyle = g; x.fillRect(0, 0, 1200, 630);
    x.strokeStyle = "#f2b531"; x.lineWidth = 10; x.strokeRect(24, 24, 1152, 582); x.lineWidth = 2; x.strokeRect(46, 46, 1108, 538);
    x.textAlign = "center"; x.fillStyle = "#f2b531"; x.font = "700 34px " + mono; x.fillText("AataKode · ఆటకోడ్", 600, 100);
    x.fillStyle = "#e9e7ff"; x.font = "28px " + sans; x.fillText(o.kicker, 600, 150);
    if (o.code) {
      x.font = "90px " + sans; x.fillText(o.icon, 140, 250); x.textAlign = "left"; x.fillStyle = "#4ade9f"; x.font = "700 46px " + mono; x.fillText(o.title, 220, 250);
      x.fillStyle = "#100e2e"; x.fillRect(80, 290, 1040, 190); x.fillStyle = "#cfe9ff"; x.font = "20px " + mono; o.code.split("\n").slice(0, 7).forEach(function (l, i) { x.fillText(l.slice(0, 78), 100, 322 + i * 25); });
      x.textAlign = "center";
    } else { x.font = "90px " + sans; x.fillText(o.icon, 600, 250); x.fillStyle = "#4ade9f"; x.font = "700 54px " + mono; x.fillText(o.title, 600, 335); }
    x.fillStyle = "#ffffff"; x.font = "700 40px " + sans; x.fillText(S().name || "A learner", 600, o.code ? 530 : 410);
    x.fillStyle = "#c9c6f5"; x.font = "24px " + sans; x.fillText(o.sub, 600, o.code ? 565 : 458);
    x.fillStyle = "#8f8cc4"; x.font = "19px " + sans; x.fillText("Proof ID " + AK.proofId(S()) + " · self-reported progress from aatakode.eknathalabs.com · not an accredited certificate", 600, 598);
    return c;
  }
  function deliver(canvas, name) {
    canvas.toBlob(function (b) {
      var file; try { file = new File([b], name, { type: "image/png" }); } catch (e) { file = null; }
      if (file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) { navigator.share({ files: [file], title: "My AataKode progress" }).catch(function () {}); return; }
      var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
    });
  }
  function download(text, name, type) { var b = new Blob([text], { type: type || "text/plain" }), a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000); }
  VIEWS.proof = function (v) {
    var st = S(), sm = AK.proofSummary(st, DATA), cleared = DATA.regions.filter(function (r) { return AK.regionComplete(st, DATA, r.id); }), caps = DATA.regions.filter(function (r) { return r.capstone; });
    var stage = C.STAGE_NAMES[C.parrotStage()];
    v.innerHTML = '<h2>🏅 Proof of work</h2><p class="muted">Share cards and a portfolio that show what you built. They are self-reported and say so on the card. Teachers can verify with your teacher card.</p>' +
      '<div class="card"><div class="row spread"><div><b class="mono">' + esc(st.name || "A learner") + '</b> · Chilaka the ' + stage + '<div class="muted">Proof ID <span class="mono">' + sm.id + "</span> · " + sm.xp + " XP · ⭐ " + sm.stars + '</div></div><div class="row"><button class="btn" id="pfMd">⬇ Portfolio (.md)</button><button class="btn" id="pfCopy">📋 Copy a post</button><button class="btn" id="pfTeach">🎓 Copy teacher card</button></div></div>' +
      '<div class="grid g3" style="margin-top:.8rem">' + sm.tracks.map(function (t) { return '<div class="card"><b>' + esc(t.title) + '</b><div class="bar" style="margin:.4rem 0"><i style="width:' + Math.round(100 * t.done / Math.max(1, t.total)) + '%"></i></div><span class="muted">' + t.done + " of " + t.total + " missions · " + t.cleared.length + " of " + t.regions + " regions</span></div>"; }).join("") + "</div></div>" +
      '<h3 style="margin-top:1.2rem">🧱 Projects</h3>' + (caps.length ? '<div class="grid g3">' + caps.map(function (r) { var p = sm.projects.find(function (x) { return x.id === r.id; }); return '<div class="card"><b>' + r.icon + " " + esc(r.title) + '</b><div class="muted">' + p.done + " of " + p.total + " checkpoints</div>" + (p.complete ? '<button class="btn small primary" data-proj="' + r.id + '">⬇ Share card</button>' : '<span class="tag">finish all checkpoints</span>') + "</div>"; }).join("") + "</div>" : '<p class="muted">No projects in this build.</p>') +
      '<h3 style="margin-top:1.2rem">🎓 Regions you cleared</h3>' + (cleared.length ? '<div class="grid g3">' + cleared.map(function (r) { return '<div class="card"><b>' + r.icon + " " + esc(C.lt(r, "title")) + '</b><div class="muted">' + esc(C.regionById[r.id].track) + '</div><button class="btn small" data-reg="' + r.id + '">⬇ Share card</button></div>'; }).join("") + "</div>" : '<p class="muted">Clear a region and its share card appears here.</p>');
    var count = DATA.missions.filter(function (m) { return st.solved[m.id]; }).length;
    $$("[data-reg]", v).forEach(function (b) { b.onclick = function () { var r = C.regionById[b.dataset.reg], tr = DATA.tracks.find(function (t) { return t.id === r.track; }); deliver(drawCard({ icon: r.icon, title: r.title, kicker: "Region cleared · " + tr.title, sub: C.rankName(st.xp) + " · " + st.xp + " XP · ⭐ " + AK.totalStars(st) + " · " + AK.dateKey(new Date()) }), "aatakode-" + r.id + ".png"); sfx("coin"); }; });
    $$("[data-proj]", v).forEach(function (b) { b.onclick = function () { var r = C.regionById[b.dataset.proj], ms = AK.regionMissions(DATA, r.id), last = ms[ms.length - 1], rec = st.solved[last.id]; deliver(drawCard({ icon: r.icon, title: r.title, kicker: "Project finished · " + ms.length + " checkpoints", code: (rec && rec.code) || last.solution, sub: C.rankName(st.xp) + " · " + AK.dateKey(new Date()) }), "aatakode-project-" + r.id + ".png"); sfx("coin"); }; });
    $("#pfMd").onclick = function () { download(AK.portfolioMarkdown(st, DATA), "aatakode-portfolio.md", "text/markdown"); };
    var copy = function (t, msg) { var done = function () { C.toast(msg); }; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, function () { C.toast("Copy blocked by the browser. Select the text instead."); }); else C.toast("Copy is not available here."); };
    $("#pfCopy").onclick = function () { copy("I solved " + count + " coding missions on AataKode (free, offline-first) and my parrot is now a " + stage + ". Proof ID " + sm.id + ". https://aatakode.eknathalabs.com", "Post text copied"); };
    $("#pfTeach").onclick = function () { copy(AK.encodeCard(st), "Teacher card copied. Paste it in the Teachers page."); };
  };

  /* ---------------------------------------------------------------- constellation map */
  var lastLit = null;
  VIEWS.stars = function (v) {
    var st = S(), today = AK.dateKey(new Date()), html = '<div class="row spread"><h2>✨ Star map</h2><a class="btn small" href="#/map">🗺 Classic map</a></div><p class="muted">Every mission is a star. Solve it and its star lights up, and the lines between them glow.</p>';
    DATA.tracks.forEach(function (tr) {
      var regs = DATA.regions.filter(function (r) { return r.track === tr.id; }); if (!regs.length) return;
      html += '<div class="track"><h3>' + esc(C.lt(tr, "title")) + "</h3></div>";
      regs.forEach(function (r, ri) {
        var ms = AK.regionMissions(DATA, r.id), W = 1000, Hh = 150, pad = 50, step = ms.length > 1 ? (W - pad * 2) / (ms.length - 1) : 0, pts = ms.map(function (m, i) { var h = 0; for (var k = 0; k < m.id.length; k++) h = (h * 31 + m.id.charCodeAt(k)) >>> 0; return [pad + i * step, 50 + ((h % 5) * 11) + (i % 2 ? 16 : 0)]; });
        var s = '<svg class="constel" viewBox="0 0 ' + W + " " + Hh + '" role="group" aria-label="' + esc(C.lt(r, "title")) + ' constellation">';
        for (var i = 1; i < pts.length; i++) { var lit = st.solved[ms[i - 1].id] && st.solved[ms[i].id]; s += '<path d="M' + pts[i - 1][0] + " " + pts[i - 1][1] + " L" + pts[i][0] + " " + pts[i][1] + '" pathLength="1" class="cline' + (lit ? " lit" : "") + '" style="animation-delay:' + (i * 0.06) + 's"/>'; }
        ms.forEach(function (m, i) {
          var solved = !!st.solved[m.id], open = AK.isUnlocked(st, DATA, m, C.featIds()), fresh = solved && (st.solved[m.id].at === today), rad = m.boss || m.project ? 11 : 7;
          s += '<g class="cstar ' + (solved ? "done" : open ? "open" : "locked") + (fresh || lastLit === m.id ? " fresh" : "") + '" data-m="' + m.id + '" transform="translate(' + pts[i][0] + "," + pts[i][1] + ')" tabindex="0" role="link" aria-label="' + esc(m.title + (solved ? ", solved" : open ? "" : ", locked")) + '"><title>' + esc(m.title) + '</title><circle r="' + (rad + 8) + '" class="halo"/><circle r="' + rad + '" class="core"/>' + (m.boss || m.project ? '<circle r="' + (rad + 4) + '" class="ring"/>' : "") + "</g>";
        });
        v.insertAdjacentHTML("beforeend", "");
        html += '<div class="card constelcard"><div class="row spread"><b>' + r.icon + " " + esc(C.lt(r, "title")) + '</b><span class="tag">' + ms.filter(function (m) { return st.solved[m.id]; }).length + "/" + ms.length + "</span></div>" + s + "</svg></div>";
        void ri;
      });
    });
    v.innerHTML = html;
    var go = function (g) { var m = C.byId[g.dataset.m]; if (AK.isUnlocked(st, DATA, m, C.featIds())) location.hash = "#/mission/" + m.id; else C.toast("Locked. Finish the star before it first."); };
    $$(".cstar", v).forEach(function (g) { g.onclick = function () { go(g); }; g.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(g); } }; });
  };
  H.solved = (function (prev) { return function (m, res) { lastLit = m.id; if (prev) return prev(m, res); }; })(H.solved);

  /* ---------------------------------------------------------------- home and map additions */
  var homeV2 = VIEWS.home;
  VIEWS.home = function (v) {
    homeV2(v); var card = document.createElement("div"); card.innerHTML = questCard(true) + (FX && FX.festivalCard ? FX.festivalCard() : ""); var sec = $(".grid.g3", v);
    if (sec) sec.insertAdjacentHTML("afterend", card.innerHTML); else v.insertAdjacentHTML("beforeend", card.innerHTML);
  };
  var mapV2 = VIEWS.map;
  VIEWS.map = function (v) { mapV2(v); var h = $("h2", v); if (h) h.insertAdjacentHTML("afterend", '<div class="row" style="margin:.3rem 0"><a class="btn small" href="#/stars">✨ Star map</a><a class="btn small" href="#/quests">🎯 Quests</a><a class="btn small" href="#/proof">🏅 Proof</a></div>'); };
  var profV2 = VIEWS.profile;
  VIEWS.profile = function (v) { profV2(v); var card = document.createElement("div"); card.className = "card"; card.style.marginTop = "1rem"; card.innerHTML = '<div class="row spread"><div><b>🏅 Proof of work</b><div class="muted">Share cards, a project portfolio and your Proof ID.</div></div><a class="btn" href="#/proof">Open →</a></div>' + (FX && FX.muggu ? '<div class="muggu-wrap">' + FX.muggu() + "</div>" : ""); v.appendChild(card); };
  window.AK_EXT = { drawCard: drawCard, questCard: questCard };
})();

/* AataKode v4 screens, part 1: Bot Arena, Clash of Code, read-the-code missions, the Explain panel, and the
   reward extras (effort, side quest, adaptive offers). Plugs into AK_CORE and AK_UI like ext.js. */
(function () {
  "use strict";
  var C = window.AK_CORE, AK = window.AK, FX = window.AK_FX, UI = window.AK_UI;
  if (!C || !UI || !AK.v4) return;
  var $ = C.$, $$ = C.$$, esc = C.esc, DATA = C.DATA, VIEWS = C.VIEWS, H = UI.hooks;
  var Q = function (sel) { return $(sel) || { style: {}, classList: { add: function () {}, remove: function () {} }, value: "", insertAdjacentHTML: function () {} }; }; /* views may be left while async work finishes */
  var S = function () { return C.state(); };
  var sfx = function (n, a) { if (FX) FX.sound(n, a); };
  var A = DATA.arena, CL = DATA.clash;
  var code = function (c, cls) { return '<pre class="codepeek mono' + (cls ? " " + cls : "") + '" style="white-space:pre-wrap;margin:.4rem 0">' + esc(c) + "</pre>"; };
  var tabKey = function (ta) { ta.addEventListener("keydown", function (e) { if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); var s = ta.selectionStart; ta.value = ta.value.slice(0, s) + "    " + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = s + 4; ta.dispatchEvent(new Event("input")); } }); };
  var reduced = function () { return C.reducedMotion(); };
  var engine = function () { return C.ensurePy().catch(function () { C.toast(C.PY_OFFLINE); return null; }); };

  /* ---------------------------------------------------------------- generic hook chaining */
  function chain(name, fn) { var prev = H[name]; H[name] = function () { var a = arguments, r; try { fn.apply(null, a); } catch (e) { /* polish never breaks play */ } return prev ? prev.apply(null, a) : r; }; }

  /* ---------------------------------------------------------------- Bot Arena */
  function board(frame, walls, size, opts) {
    var u = 26, W = size * u, svg = '<svg class="arena-board" viewBox="0 0 ' + W + " " + W + '" role="img" aria-label="Seed Grab board">';
    svg += '<rect width="' + W + '" height="' + W + '" rx="8" class="ab-floor"/>';
    for (var i = 1; i < size; i++) svg += '<path d="M' + i * u + " 0V" + W + "M0 " + i * u + "H" + W + '" class="ab-grid"/>';
    walls.forEach(function (w) { svg += '<rect x="' + (w[0] * u + 2) + '" y="' + (w[1] * u + 2) + '" width="' + (u - 4) + '" height="' + (u - 4) + '" rx="4" class="ab-wall"/>'; });
    frame.seeds.forEach(function (s) { svg += '<circle cx="' + (s[0] * u + u / 2) + '" cy="' + (s[1] * u + u / 2) + '" r="6" class="ab-seed"/>'; });
    svg += '<circle cx="' + (frame.pos[1][0] * u + u / 2) + '" cy="' + (frame.pos[1][1] * u + u / 2) + '" r="10" class="ab-foe"/><text x="' + (frame.pos[1][0] * u + u / 2) + '" y="' + (frame.pos[1][1] * u + u / 2 + 4) + '" class="ab-t">B</text>';
    svg += '<circle cx="' + (frame.pos[0][0] * u + u / 2) + '" cy="' + (frame.pos[0][1] * u + u / 2) + '" r="10" class="ab-me"/><text x="' + (frame.pos[0][0] * u + u / 2) + '" y="' + (frame.pos[0][1] * u + u / 2 + 4) + '" class="ab-t">A</text>';
    return svg + "</svg>";
  }
  function viewer(host, m, label) {
    var frames = m.frames, i = 0, timer = null;
    host.innerHTML = '<div class="arena-view"><div id="abBoard"></div><div class="grow"><div class="row spread"><b id="abTitle"></b><span class="chip" id="abScore"></span></div><input type="range" id="abSlide" min="0" max="' + (frames.length - 1) + '" value="0" aria-label="Turn"><div class="row" style="margin:.4rem 0"><button class="btn small" id="abPrev" aria-label="Previous turn">◀</button><button class="btn small primary" id="abPlay">▶ Play</button><button class="btn small" id="abNext" aria-label="Next turn">▶|</button><button class="btn small" id="abEnd">⏭ End</button></div><div class="muted mono" id="abMoves" style="font-size:.85rem"></div></div></div>';
    function draw() {
      var f = frames[i]; Q("#abBoard").innerHTML = board(f, m.walls, m.size);
      Q("#abTitle").textContent = (label || "Match") + " · turn " + f.t + " of " + (frames.length - 1); Q("#abScore").textContent = "You (A) " + f.score[0] + " : " + f.score[1] + " (B)";
      Q("#abMoves").textContent = i ? "Moves: A " + f.mv[0] + "  ·  B " + f.mv[1] : "Both bots wait at their start squares."; Q("#abSlide").value = i;
    }
    function stop() { clearInterval(timer); timer = null; Q("#abPlay").textContent = "▶ Play"; }
    function go(n) { i = Math.max(0, Math.min(frames.length - 1, n)); draw(); }
    Q("#abSlide").oninput = function (e) { stop(); go(+e.target.value); };
    Q("#abPrev").onclick = function () { stop(); go(i - 1); }; Q("#abNext").onclick = function () { stop(); go(i + 1); }; Q("#abEnd").onclick = function () { stop(); go(frames.length - 1); };
    Q("#abPlay").onclick = function () { if (timer) { stop(); return; } if (i >= frames.length - 1) i = 0; Q("#abPlay").textContent = "⏸ Pause"; timer = setInterval(function () { if (i >= frames.length - 1) { stop(); return; } go(i + 1); }, 260); };
    C_onLeave(stop); go(reduced() ? frames.length - 1 : 0);
  }
  var leaveFns = [];
  function C_onLeave(fn) { leaveFns.push({ h: location.hash, fn: fn }); }
  window.addEventListener("hashchange", function () { leaveFns = leaveFns.filter(function (x) { if (x.h === location.hash) return true; try { x.fn(); } catch (e) { /* ignore */ } return false; }); });

  VIEWS.bots = function (v, arg) {
    var st = S(), a = AK.v4(st).arena, cur = Math.max(0, A.leagues.findIndex(function (l) { return l.id === arg; }));
    if (!arg) cur = AK.arenaLeagueIndex(st, A);
    var L = A.leagues[cur], busy = false;
    v.innerHTML = '<div class="mhead"><a class="btn small" href="#/arena">← Arena</a><span class="tag">BOT ARENA · LOCAL AND OFFLINE</span><h2>🤖 Seed Grab</h2></div>' +
      '<p class="muted">Write <span class="mono">play(state)</span> in Python. Your bot and the opponent move at the same time on a shared board. The rules never change and are all here. Everything runs on your device.</p>' +
      '<div class="league-row" role="tablist" aria-label="Leagues">' + A.leagues.map(function (l, i) { var open = AK.arenaOpen(st, A, l.id), done = a.done[l.id]; return '<button role="tab" class="league' + (i === cur ? " on" : "") + (done ? " done" : "") + (open ? "" : " locked") + '" data-l="' + l.id + '"' + (open ? "" : " disabled") + ' aria-selected="' + (i === cur) + '">' + (done ? "✅ " : open ? "" : "🔒 ") + esc(l.name) + "</button>"; }).join("") + "</div>" +
      '<div class="grid g2" style="margin-top:.8rem;align-items:start"><div class="card"><div class="row spread"><b>' + esc(L.name) + " league: " + esc(L.opp) + "</b><span class=\"chip gold\">" + (a.wins[L.id] || 0) + "/" + A.leagues[cur].seeds.length + " best</span></div><p class=\"muted\">" + esc(L.blurb) + "</p><p class=\"muted\" style=\"font-size:.85rem\">Win <b>" + L.need + " of " + L.seeds.length + "</b> fixed matches to clear this league." + (L.walls ? " Walls on the board: " + L.walls * 2 + " squares." : "") + "</p>" +
      '<details class="rules" open><summary><b>Rules (always visible)</b></summary><ul>' + A.rules.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + '</ul><p class="mono" style="font-size:.85rem">state = {"me": [x, y], "foe": [x, y], "seeds": [[x, y], …], "walls": [[x, y], …], "size": 11, "turn": 1, "turns": 40, "score": [mine, theirs]}<br>return "N", "E", "S", "W" or "STAY"   (N is up, y grows downward)</p></details>' +
      '<textarea id="botCode" class="input mono" rows="16" spellcheck="false" aria-label="Your bot code"></textarea><div class="row" style="margin-top:.5rem"><button class="btn good" id="botSeries">🏁 Run the league series (5 matches)</button><button class="btn" id="botPractice">🎲 Practice match</button><button class="btn" id="botPrev" title="Plays the version you ran in the previous league series">⏪ vs my previous version</button></div>' +
      '<div class="row" style="margin-top:.4rem"><label class="muted" for="botSeed">Replay by seed</label><input id="botSeed" class="input" type="number" min="1" style="width:6rem" placeholder="seed"><button class="btn small" id="botReplay">▶ Replay</button><button class="btn small" id="botStarter">↺ Starter</button><button class="btn small" id="botRef"' + (a.done[L.id] ? "" : " disabled") + ' title="Unlocks after you clear this league">👀 Reference bot</button></div><div id="botMsg" class="muted" aria-live="polite" style="margin-top:.5rem"></div></div>' +
      '<div class="card"><div id="botView"><p class="muted">Run a match to watch it here. Step through every turn, or drag the slider.</p></div><div id="botTable"></div></div></div>' +
      (a.done[L.id] ? '<details class="card" style="margin-top:1rem"><summary><b>Read the opponent\'s code</b> (unlocked: you cleared this league)</summary>' + code(L.opp_code) + "</details>" : "");
    var ta = Q("#botCode"); ta.value = a.code || A.starter; tabKey(ta); ta.oninput = function () { a.code = ta.value; };
    $$(".league", v).forEach(function (b) { b.onclick = function () { location.hash = "#/bots/" + b.dataset.l; }; });
    function msg(t) { Q("#botMsg").textContent = t; }
    function fail(err) { msg("⚠ " + err.type + ": " + err.msg + (err.line ? " (line " + err.line + ")" : "")); sfx("no"); }
    async function withApi(fn) { if (busy) return; busy = true; msg("Warming up the Python engine…"); try { var api = await engine(); if (api) await fn(api); } finally { busy = false; } }
    function table(series, label) {
      Q("#botTable").innerHTML = '<table class="arena-tab"><caption class="muted">' + esc(label) + '</caption><tr><th>Seed</th><th>Score</th><th>Result</th><th></th></tr>' + series.results.map(function (r, i) { return "<tr><td>" + r.seed + "</td><td>" + (r.score ? r.score[0] + " : " + r.score[1] : "–") + "</td><td>" + (r.winner === 0 ? "🏆 win" : r.winner === 1 ? "loss" : "draw") + '</td><td><button class="btn small" data-w="' + i + '">Watch</button></td></tr>'; }).join("") + "</table>";
      $$("[data-w]", v).forEach(function (b) { b.onclick = function () { var r = series.results[+b.dataset.w]; viewer(Q("#botView"), r, "Seed " + r.seed); }; });
      var first = series.results.find(function (r) { return r.frames && r.frames.length; }); if (first) viewer(Q("#botView"), first, "Seed " + first.seed);
    }
    Q("#botSeries").onclick = function () { withApi(async function (api) {
      var src = ta.value, ser = AK.arenaSeries(A, L, src, function (c, o, g) { return api.arenaRun(c, o, g); });
      if (ser.err) { fail(ser.err); return; }
      var rec = AK.arenaRecord(st, L, ser, src, new Date()); C.save(); C.renderHeader("bots");
      table(ser, "League series vs " + L.opp);
      msg(ser.passed ? "🏆 " + ser.wins + " of 5 won. " + L.name + " league cleared!" + (rec.promoted ? " +" + rec.seeds + " seeds" : "") : ser.wins + " of 5 won. You need " + L.need + ". Watch a lost match to see why.");
      if (ser.passed) { sfx("league", cur); C.confetti(); if (rec.promoted && A.leagues[cur + 1]) C.toast("Next league unlocked: " + A.leagues[cur + 1].name); var nt = AK.newTitles(st, DATA); nt.forEach(function (t) { C.toast("Title: " + t.icon + " " + t.en); }); C.save(); if (rec.promoted) setTimeout(function () { VIEWS.bots(v, L.id); }, 1800); } else sfx("no");
    }); };
    function single(seed, opp, label) { return withApi(async function (api) { var m = api.arenaRun(ta.value, opp, AK.arenaCfg(A, L, seed)); if (m.err) { fail(m.err); return; } a.code = ta.value; C.save(); table({ results: [Object.assign({ seed: seed }, m)] }, label + " · seed " + seed); msg((m.winner === 0 ? "You won " : m.winner === 1 ? "You lost " : "Draw ") + m.score[0] + " to " + m.score[1] + ". Seed " + seed + " replays exactly."); }); }
    Q("#botPractice").onclick = function () { single(1 + Math.floor(Math.random() * 9000), L.opp_code, "Practice vs " + L.opp); };
    Q("#botReplay").onclick = function () { var s = parseInt(Q("#botSeed").value, 10); if (!(s > 0)) { msg("Type a seed number first."); return; } single(s, L.opp_code, "Replay vs " + L.opp); };
    Q("#botPrev").onclick = function () { if (!a.prev) { msg("No earlier version yet. Change your bot and run a league series: the version before it is kept here."); return; } withApi(async function (api) { var ser = AK.arenaSeries(A, L, ta.value, function (c, o, g) { return api.arenaRun(c, o, g); }, a.prev); if (ser.err) { fail(ser.err); return; } table(ser, "Now vs my previous saved version"); if (ser.wins >= 3 && ser.wins > 0) { a.beatPrev += 1; C.save(); } msg(ser.wins >= 3 ? "📈 Better than your last version: " + ser.wins + " of 5 matches won." : "Your last version is as good or better: you won " + ser.wins + " of 5."); }); };
    Q("#botStarter").onclick = function () { ta.value = A.starter; a.code = ta.value; };
    Q("#botRef").onclick = function () { ta.value = L.ref; msg("Reference bot loaded. Compare it with yours, then change something and test."); };
  };

  /* ---------------------------------------------------------------- Clash of Code (solo, sync-free) */
  VIEWS.clash = function (v, arg) {
    var st = S(), cs = AK.v4(st).clash, now = new Date();
    var p = CL.puzzles.find(function (x) { return x.id === arg; }) || AK.clashDaily(CL, now);
    var rev = p.mode === "reverse", started = null, elapsed = 0, tick = null, practice = false, over = false;
    var link = location.origin + location.pathname + "#/clash/" + p.id;
    v.innerHTML = '<div class="mhead"><a class="btn small" href="#/arena">← Arena</a><span class="tag">CLASH OF CODE · SOLO · NO ACCOUNT</span><h2>⚡ ' + (rev ? "Mystery puzzle" : esc(p.title)) + '</h2><span class="chip">' + esc(p.mode) + "</span></div>" +
      '<div class="row" style="margin-bottom:.6rem">' + CL.puzzles.map(function (x) { return '<a class="btn small' + (x.id === p.id ? " primary" : "") + '" href="#/clash/' + x.id + '" title="' + esc(x.mode) + '">' + (cs.solved[x.id] ? "✔ " : "") + x.id.slice(1) + "</a>"; }).join("") + "</div>" +
      '<div class="grid g2" style="align-items:start"><div class="card"><p>' + (rev ? "<b>Reverse mode:</b> the task is hidden. Infer the rule from the examples, then write the code. The task is revealed when you solve it." : esc(p.spec)) + '</p><b>Examples</b>' + p.examples.map(function (e) { return code("input: " + e.stdin.join(" ⏎ ") + "\noutput: " + e.out); }).join("") +
      '<p class="muted" style="font-size:.85rem">Read from <span class="mono">input()</span>, answer with <span class="mono">print()</span>. ' + (p.mode === "shortest" ? "Goal: the shortest code that passes." : p.mode === "fastest" ? "Goal: pass the hidden checks as fast as you can." : "Goal: work out the rule, then pass the hidden checks.") + '</p>' +
      '<div class="row"><b class="mono" id="clTime">5:00</b><button class="btn good" id="clStart">▶ Start the 5 minute clock</button><label class="muted"><input type="checkbox" id="clPractice"> practice, no clock</label></div><div class="bar"><i id="clBar"></i></div>' +
      '<textarea id="clCode" class="input mono" rows="9" spellcheck="false" aria-label="Your solution"></textarea><div class="row" style="margin-top:.4rem"><button class="btn primary" id="clSubmit">✔ Submit</button><button class="btn" id="clRun">▶ Run examples</button><span class="muted" id="clChars"></span></div><div id="clOut" class="muted" aria-live="polite"></div></div>' +
      '<div class="card"><h3>👻 Ghosts</h3><p class="muted">Recorded solve times from other learners (shipped with the app, no network).</p><div id="clGhost"></div><div id="clWin" style="margin-top:.8rem"></div>' +
      '<h3 style="margin-top:1rem">🔗 Challenge a friend</h3><p class="muted">No server needed. Send the link, then compare score codes by pasting.</p><div class="row"><input class="input mono grow" id="clLink" readonly value="' + esc(link) + '"><button class="btn small" id="clCopy">Copy link</button></div>' +
      '<div class="row" style="margin-top:.5rem"><input class="input mono grow" id="clFriend" placeholder="paste your friend\'s score code (AK1-…)"><button class="btn small" id="clCmp">Compare</button></div><div id="clCmpOut" class="muted" style="margin-top:.3rem"></div></div></div>';
    var ta = Q("#clCode"); ta.value = S().drafts["clash:" + p.id] || ""; tabKey(ta);
    function chars() { return ta.value.replace(/\s+$/, "").length; }
    ta.oninput = function () { S().drafts["clash:" + p.id] = ta.value; Q("#clChars").textContent = chars() + " characters"; };
    ta.oninput();
    function fmt(ms) { var s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
    function ghosts(ms) { var g = p.ghosts.slice().sort(function (a, b) { return a - b; }); Q("#clGhost").innerHTML = g.map(function (x, i) { var done = ms != null && ms / 1000 >= x; return '<div class="ghost-row"><span>👻 Ghost ' + (i + 1) + '</span><span class="mono">' + fmt(x * 1000) + '</span><span class="muted">' + (ms == null ? "" : done ? "finished" : "still going") + "</span></div>"; }).join(""); }
    ghosts(null);
    function clock() { elapsed = Date.now() - started; var left = CL.limit * 1000 - elapsed; Q("#clTime").textContent = fmt(left); Q("#clBar").style.width = Math.min(100, (elapsed / (CL.limit * 1000)) * 100) + "%"; ghosts(elapsed); if (left <= 0) { clearInterval(tick); over = true; Q("#clOut").textContent = "Time is up. You can keep going in practice mode: no pressure, nothing is lost."; } }
    Q("#clStart").onclick = function () { if (practice) return; started = Date.now(); over = false; clearInterval(tick); tick = setInterval(clock, 500); C_onLeave(function () { clearInterval(tick); }); Q("#clStart").textContent = "⏱ Running"; ta.focus(); };
    Q("#clPractice").onchange = function (e) { practice = e.target.checked; if (practice) { clearInterval(tick); started = null; Q("#clTime").textContent = "∞"; Q("#clStart").disabled = true; } else { Q("#clStart").disabled = false; Q("#clTime").textContent = "5:00"; } };
    function tests(list, hide) { return list.map(function (t) { return { kind: "stdout", stdin: t.stdin, expect: t.out, hidden: !!hide, label: "input " + t.stdin.join(" ⏎ ") }; }); }
    Q("#clRun").onclick = async function () { var api = await engine(); if (!api) return; var r = api.grade(ta.value, tests(p.examples)); Q("#clOut").innerHTML = r.map(function (x, i) { return (x.ok ? "✔ " : "✘ ") + "example " + (i + 1) + (x.ok ? "" : ": expected " + esc(x.expect) + ", got " + esc(x.got || (x.err ? x.err.type + ": " + x.err.msg : "nothing"))); }).join("<br>"); };
    Q("#clSubmit").onclick = async function () {
      var api = await engine(); if (!api) return; var r = api.grade(ta.value, tests(p.examples.concat(p.tests), false)), ok = r.every(function (x) { return x.ok; });
      if (!ok) { var bad = r.filter(function (x) { return !x.ok; }); sfx("no"); Q("#clOut").innerHTML = "<b>" + (r.length - bad.length) + " of " + r.length + " checks pass.</b> " + (rev ? "Look at the failing ones and infer the rule:<br>" : "Next failing check:<br>") + bad.slice(0, 2).map(function (x) { return '<span class="mono">' + esc(x.label) + " → expected " + esc(x.expect) + ", got " + esc(x.got || (x.err ? x.err.type : "nothing")) + "</span>"; }).join("<br>"); return; }
      clearInterval(tick); var ms = started && !practice ? Date.now() - started : null, cc = chars(), res = AK.clashRecord(st, p, ms == null ? 0 : ms, cc);
      if (!practice && started && Date.now() - started > CL.limit * 1000) ms = null;
      C.save(); C.renderHeader("clash"); sfx("solved"); C.confetti(); AK.newTitles(st, DATA).forEach(function (t) { C.toast("Title: " + t.icon + " " + t.en); }); C.save();
      var gh = ms != null ? AK.clashGhost(p, ms) : null, codeStr = AK.clashCode(p.id, ms == null ? 0 : ms, cc);
      Q("#clOut").innerHTML = "<b>✔ All checks pass!</b>" + (rev ? " The task was: <i>" + esc(p.spec.replace(/^\(Reverse mode\).*$/, "") || "") + "</i>" : "");
      if (rev) Q("#clOut").innerHTML += "<br><b>The rule:</b> " + esc(reveal(p));
      Q("#clWin").innerHTML = '<div class="reward"><b>' + (ms == null ? "Practice solved" : "Time " + fmt(ms)) + " · " + cc + " characters</b>" + (gh ? "<p>You beat " + gh.beaten + " of " + gh.of + " ghosts.</p>" : "") + (res.first ? "<p>🌱 +2 seeds for a new puzzle.</p>" : "") + '<p>Your score code: <span class="mono">' + esc(codeStr) + '</span></p><div class="row"><button class="btn small" id="clCode2">Copy score code</button>' + (p.mode === "shortest" ? '<span class="muted">Par for this puzzle is ' + p.par + " characters.</span>" : "") + "</div></div>";
      Q("#clCode2").onclick = function () { copy(codeStr); };
    };
    function reveal(pz) { return { c01: "add the two numbers", c02: "reverse the word", c03: "count the vowels", c04: "Fizz/Buzz rule", c05: "palindrome check", c06: "sum of the digits", c07: "triangle numbers: 1 + 2 + … + n", c08: "capitalise each word", c09: "largest number", c10: "factorial", c11: "a triangle of n rows of stars", c12: "count the words", c13: "sort the letters", c14: "even or odd" }[pz.id] || pz.title; }
    function copy(t) { try { navigator.clipboard.writeText(t); C.toast("Copied"); } catch (e) { C.toast("Select and copy it by hand."); } }
    Q("#clCopy").onclick = function () { copy(link); };
    Q("#clCmp").onclick = function () {
      var th = AK.clashParse(Q("#clFriend").value), mine = cs.best[p.id]; if (!th) { Q("#clCmpOut").textContent = "That score code is not valid. Ask your friend to copy it again."; return; }
      if (!mine) { Q("#clCmpOut").textContent = "Solve this puzzle first, then compare."; return; }
      Q("#clCmpOut").textContent = AK.clashCompare({ id: p.id, sec: Math.round(mine.ms / 1000), chars: mine.chars }, th, p.mode) + " (you: " + fmt(mine.ms) + ", " + mine.chars + " chars · friend: " + fmt(th.sec * 1000) + ", " + th.chars + " chars)";
    };
  };

  /* ---------------------------------------------------------------- read-the-code missions */
  UI.mission.read = function (v, m, w) {
    if (m.mode !== "bug") { var mm = Object.assign({}, m, { code: m.mode === "purpose" ? m.code + "\n" + m.demo : m.code }); C.missionPython_read = true; C.missionPredict(v, mm, w); return; }
    var lines = m.code.split("\n"), st = S(), solved = !!st.solved[m.id], wrong = 0;
    v.innerHTML = C.missionFrame(m, { tabs: C.tabBtn("out", "Notes", true), panels: '<div id="tab-out"><p class="muted">Click the line you think holds the bug. A wrong click just crosses it out.</p><div id="rdFix"></div></div>' });
    C.bindHints(m); C.bindTabs(m); C.setHeadStatus(m); C.bindExplain(m); C.setPyPill();
    var mid = Q("#midpane"); mid.innerHTML = '<div class="card"><b>' + esc(m.title) + '</b><div class="huntcode" role="group" aria-label="Code lines">' + lines.map(function (l, i) { return '<button class="hline" data-i="' + i + '"><span class="ln">' + (i + 1) + '</span><span class="mono">' + esc(l || " ") + "</span></button>"; }).join("") + '</div><div class="pmsg" id="rdMsg" aria-live="polite"></div></div>';
    function revealBug() { var b = $$(".hline", mid)[m.answer]; b.classList.add("good"); $$(".hline", mid).forEach(function (x) { x.disabled = true; }); Q("#rdFix").innerHTML = "<b>The fix for line " + m.bugline + ":</b>" + code(m.fixed_line) + '<p class="muted">With the fix it prints:</p>' + code(m.expect); Q("#rdMsg").innerHTML = "<b>Why:</b> " + esc(m.why); }
    if (solved) revealBug();
    $$(".hline", mid).forEach(function (b) { b.onclick = function () {
      var i = +b.dataset.i;
      if (i === m.answer) { revealBug(); sfx("ok"); if (!st.solved[m.id]) C.afterSolve(m, AK.applySolve(st, DATA, m, { hintsUsed: st.hintLvl[m.id] || 0, now: new Date(), code: "Line " + m.bugline, firstTry: !wrong }), Q("#rewardSlot")); }
      else { wrong++; b.classList.add("bad"); b.disabled = true; AK.noteFail(st, m); sfx("no"); Q("#rdMsg").textContent = "Not that line. Run the code in your head again and see where the result first goes wrong."; if (H.failed) H.failed(m); }
    }; });
    if (solved) Q("#rewardSlot").innerHTML = '<div class="reward"><b>✔ You solved this mission.</b> <a href="#/map">Back to the map</a></div>';
  };

  /* ---------------------------------------------------------------- Explain panel */
  function learnBody(m, learn, passed, results, mine) {
    var near = results ? AK.nearMiss(results) : null, h = "";
    h += "<p>" + esc(learn.concept) + "</p>";
    if (passed) {
      h += "<b>Example</b>" + code(learn.example.code) + '<div class="muted">Prints:</div>' + code(learn.example.output || "(nothing)") + "<p class=\"muted\">" + esc(learn.example.note) + "</p>";
      h += "<b>Common mistake</b>" + code(learn.mistake.broken) + '<div class="err" style="margin:.3rem 0"><span class="mono">' + esc(learn.mistake.symptom) + "</span></div><p>" + esc(learn.mistake.fix) + "</p>";
      var ref = typeof m.solution === "string" ? m.solution : null;
      if (ref && mine && mine.trim() !== ref.trim()) h += "<b>Your code and the reference</b>" + '<pre class="diff mono">' + AK.diffLines(mine, ref).map(function (d) { return '<span class="d-' + d.t + '">' + (d.t === "add" ? "+ " : d.t === "del" ? "− " : "  ") + esc(d.s) + "</span>"; }).join("\n") + '</pre><p class="muted" style="font-size:.85rem">− is yours, + is the reference. Different is fine when both pass: compare the style.</p>';
      if (learn.variation) h += '<b>Try a variation</b><p>' + esc(learn.variation.prompt) + '</p><textarea class="input mono" id="lvCode" rows="5" spellcheck="false">' + esc(learn.variation.starter) + '</textarea><div class="row" style="margin-top:.3rem"><button class="btn small good" id="lvRun">✔ Check</button></div><div id="lvOut" class="muted" aria-live="polite"></div>';
    } else {
      h += "<p class=\"muted\">A common slip with this idea: <span class=\"mono\">" + esc(learn.mistake.symptom) + "</span></p>";
      if ((C.state().hintLvl[m.id] || 0) >= 3 && typeof m.solution === "string" && mine) h += "<b>Difference from the reference</b>" + '<pre class="diff mono">' + AK.diffLines(mine, m.solution).map(function (d) { return '<span class="d-' + d.t + '">' + (d.t === "add" ? "+ " : d.t === "del" ? "− " : "  ") + esc(d.s) + "</span>"; }).join("\n") + "</pre>";
      else h += '<p class="muted" style="font-size:.85rem">The full example and reference unlock when you pass, or after the third hint.</p>';
    }
    return h;
  }
  function showLearn(m, passed, results) {
    var slot = Q("#learnSlot"), st = S(); if (!slot) return;
    var learn = AK.learnOf(m, DATA), near = results ? AK.nearMiss(results) : null, mine = (st.solved[m.id] && st.solved[m.id].code) || st.drafts[m.id] || "";
    if (!passed && near && near.total > 1) { slot.innerHTML = '<div class="card nearmiss"><b>' + near.ok + " of " + near.total + " checks pass</b>" + (near.close ? " · so close" : "") + '<div class="bar"><i style="width:' + Math.round((near.ok / near.total) * 100) + '%"></i></div>' + (learn ? '<details open class="learn"><summary><b>💡 What went wrong</b></summary>' + learnBody(m, learn, false, results, mine) + "</details>" : "") + "</div>"; return; }
    if (!learn) { slot.innerHTML = ""; return; }
    slot.innerHTML = '<details class="card learn"' + (passed ? "" : " open") + '><summary><b>💡 Explain: ' + esc(m.title) + "</b></summary>" + learnBody(m, learn, passed, results, mine) + "</details>";
    if (passed) AK.v4(st).stats.explains += 0;
    var d = $(".learn", slot); if (d && passed) d.addEventListener("toggle", function () { if (d.open && !AK.v4(st).learnSeen[m.id]) { AK.v4(st).learnSeen[m.id] = 1; AK.v4(st).stats.explains += 1; C.save(); } });
    var b = Q("#lvRun"); if (b) b.onclick = async function () { var api = await engine(); if (!api) return; var vr = learn.variation, r = api.grade(Q("#lvCode").value, vr.tests), ok = r.every(function (x) { return x.ok; }); Q("#lvOut").innerHTML = r.map(function (x) { return (x.ok ? "✔ " : "✘ ") + esc(x.label); }).join("<br>") + (ok ? "<br><b>Nice, that is the idea.</b>" : ""); if (ok) { sfx("ok"); var sv = AK.v4(st); if (!sv.learnSeen["v:" + m.id]) { sv.learnSeen["v:" + m.id] = 1; AK.v4(st); st.seeds.earned += 1; C.save(); C.renderHeader("mission"); C.toast("🌱 +1 seed for the variation"); } } };
  }
  chain("tests", function (results, m) { if (!m || !results) return; var ok = results.filter(function (r) { return !r.star; }).every(function (r) { return r.ok; }); if (!ok) showLearn(m, false, results); });
  chain("solved", function (m) { showLearn(m, true, null); });
  chain("failed", function (m) { if (m && S().drafts) AK.noteFail(S(), m); });
  chain("passed", function (m) { var st = S(); if (st.solved[m.id]) showLearn(m, true, null); });

  /* ---------------------------------------------------------------- reward extras: effort, side quest, adaptive offers */
  UI.rewardExtra = function (res, m, nx) {
    var st = S(), h = "", v = AK.v4(st);
    if (res.effort) h += '<div class="effort" role="status"><b>🛠 You debugged it!</b> It took ' + res.effort.tries + ' tries, and that is exactly how real programmers work. The effort counts.</div>';
    if (res.golden) h += "<p>🌟 Golden mission! +4 seeds.</p>";
    if (res.packet) h += '<p>🎁 Mystery seed packet: +' + res.packet + ' seeds. <span class="muted">(Every 7th mission gives 1 to 5 seeds. Nothing to buy, nothing to miss.)</span></p>';
    if (res.weeklyGoal) h += "<p>🎯 Weekly goal reached! +5 seeds. A calm week counts too.</p>";
    if (res.recovery) h += "<p>🌿 " + (res.recovery.restored ? "Streak restored to " + res.recovery.restored + ". Welcome back." : "Comeback quest: " + res.recovery.progress + " of " + res.recovery.need + " today.") + "</p>";
    (res.titles || []).forEach(function (t) { h += "<p>🏷 New title: <b>" + t.icon + " " + esc(t.en) + "</b>: " + esc(t.desc) + "</p>"; });
    if (res.chapter) h += '<p><button class="btn small" id="chapBtn" data-n="' + res.chapter + '">📜 Read chapter ' + res.chapter + " of the story</button></p>";
    var offer = AK.flowOffer(st, DATA, m);
    if (offer && offer.kind === "skip") h += '<p class="muted">You solved the last few cleanly. <a href="#/mission/' + offer.mission.id + '">Skip ahead to “' + esc(offer.mission.title) + '”</a> if you like, or stay and enjoy the practice.</p>';
    var learn = AK.learnOf(m, DATA), side = learn && learn.variation ? '<a class="btn small" href="#" onclick="var d=document.querySelector(\'#learnSlot details\');if(d){d.open=true;d.scrollIntoView({behavior:\'smooth\'});}return false;">🎒 Side quest: try a variation</a>' : '<a class="btn small" href="#/clash/' + AK.clashDaily(CL, new Date()).id + '">🎒 Side quest: today\'s Clash puzzle</a>';
    h += '<div class="row" style="margin:.4rem 0">' + side + "</div>";
    if (Object.keys(st.solved).length === 1 && !st.name) h += '<div class="card" style="margin:.5rem 0"><b>Your first win! 🎉</b><div class="muted">What should Chilaka call you? (optional, stays on this device)</div><input class="input" id="firstName" maxlength="30" placeholder="Your name"></div>';
    setTimeout(function () { var b = Q("#chapBtn"); if (b) b.onclick = function () { UI.chapter(+b.dataset.n); }; var f = Q("#firstName"); if (f) f.oninput = function () { st.name = f.value; C.save(); }; }, 0);
    void v; void nx;
    return h;
  };
  chain("route", function (name, arg) {
    if (name !== "mission") return; var st = S(), m = C.byId[String(arg).split("/")[0]]; if (!m || st.solved[m.id]) return;
    setTimeout(function () { var off = AK.flowOffer(st, DATA, m), slot = Q("#learnSlot"); if (off && off.kind === "easier" && slot) slot.insertAdjacentHTML("beforebegin", '<div class="card calm-offer" role="status"><b>Stuck for a while?</b><div class="muted">That is normal. Warm up with an easier one first: <a href="#/mission/' + off.mission.id + '">' + esc(off.mission.title) + "</a>. Your place here is saved.</div></div>"); }, 50);
  });
})();

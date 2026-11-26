/* AataKode v7 learning layer: the Shell Scripting mission screen, worked -> faded -> solo scaffolds on the first
   missions of every region, a free "show me a similar example" hint and the "Teach Chilaka" explain-it mode.
   Plugs into AK_CORE and AK_UI like ext5.js. */
(function () {
  "use strict";
  var C = window.AK_CORE, AK = window.AK, FX = window.AK_FX, UI = window.AK_UI;
  if (!C || !UI || !UI.x5) return;
  var X = UI.x5, $ = C.$, $$ = C.$$, esc = C.esc, DATA = C.DATA, VIEWS = C.VIEWS, H = UI.hooks;
  var S = function () { return C.state(); }, Q = X.Q, chain = X.chain;

  /* ---------------------------------------------------------------- v7 state */
  AK.v7 = function (st) { var v = st.v7 || (st.v7 = {}); if (!v.taught) v.taught = {}; if (!v.similar) v.similar = {}; if (!v.tours) v.tours = { seen: {}, done: {} }; if (!v.tours.seen) v.tours.seen = {}; if (!v.tours.done) v.tours.done = {}; if (!v.rewards) v.rewards = {}; return v; };
  var baseMerge = AK.mergeState;
  AK.mergeState = function (cur, inc) {
    var out = baseMerge(cur, inc), a = AK.v7({ v7: cur.v7 }), b = AK.v7({ v7: inc.v7 }), o = AK.v7(out);
    ["taught", "similar", "rewards"].forEach(function (k) { o[k] = Object.assign({}, b[k], a[k]); });
    o.tours.seen = Object.assign({}, b.tours.seen, a.tours.seen); o.tours.done = Object.assign({}, b.tours.done, a.tours.done);
    return out;
  };

  /* ---------------------------------------------------------------- Shell Scripting mission */
  UI.mission.shell = function (v, m, w) {
    var base = m.files || {}, names = Object.keys(base);
    v.innerHTML = C.missionFrame(m, {
      tabs: C.tabBtn("out", "Output", true) + C.tabBtn("files", "Files (" + names.length + ")") + C.tabBtn("compare", "Compare"),
      panels: '<div id="tab-out"><div class="row" style="gap:.5rem;flex-wrap:wrap;margin-bottom:.5rem"><label class="muted" style="font-size:.82rem">Arguments <input class="input mono" id="shArgs" placeholder="e.g. Asha 3" style="width:12rem" aria-label="Script arguments"></label><label class="muted" style="font-size:.82rem">Standard input <textarea class="input mono" id="shIn" rows="2" placeholder="one line per row" style="width:14rem;vertical-align:top" aria-label="Standard input"></textarea></label></div>' +
        '<div class="out mono" id="outbox" aria-live="polite">Press Run to run your script.</div><div id="errbox"></div><p class="muted" style="font-size:.82rem;margin-top:.6rem">📜 This is a bash subset that runs in your browser: no network, no real files. Scripts see only the files on the Files tab.</p></div>' +
        '<div id="tab-files" hidden>' + (names.length ? names.map(function (n) { return "<b class=\"mono\">" + esc(n) + "</b>" + X.codeBox(base[n]); }).join("") : '<p class="muted">This mission has no starting files.</p>') + "</div>"
    });
    C.bindHints(m); var show = C.bindTabs(m); C.setHeadStatus(m); C.refreshCompare(m); C.bindExplain(m);
    var ed = C.buildCodeEditor(m, $("#midpane"), function () {}), ta = $("#code");
    ta.setAttribute("aria-label", "Bash editor. Press Escape then Tab to leave the editor.");
    $("#midpane").insertAdjacentHTML("beforeend", X.btnRow());
    function words(s) { var out = [], re = /"([^"]*)"|'([^']*)'|(\S+)/g, k; while ((k = re.exec(s))) out.push(k[1] != null ? k[1] : k[2] != null ? k[2] : k[3]); return out; }
    function run() {
      show("out"); var sin = ($("#shIn").value || ""), r;
      var bad = AK.shCheck(ta.value);
      if (bad) { $("#outbox").textContent = ""; $("#errbox").innerHTML = '<div class="err" role="alert"><b>Syntax error</b><pre class="mono" style="white-space:pre-wrap;margin:.3rem 0 0">line ' + esc(String(bad.line || "?")) + ": " + esc(bad.msg) + "</pre></div>"; return null; }
      r = AK.shRun(ta.value, { files: base, args: words($("#shArgs").value || ""), stdin: sin ? sin.replace(/\n*$/, "\n") : "" });
      $("#outbox").textContent = r.out || (r.err ? "" : "(the script printed nothing)");
      $("#errbox").innerHTML = (r.err ? '<div class="err" role="alert"><b>stderr</b><pre class="mono" style="white-space:pre-wrap;margin:.3rem 0 0">' + esc(r.err) + "</pre></div>" : "") + '<p class="muted mono" style="margin:.3rem 0 0">exit status ' + r.code + "</p>";
      return r;
    }
    $("#runBtn").onclick = run;
    $("#resetBtn").onclick = function () { ed.reset(); $("#outbox").textContent = "Press Run to run your script."; $("#errbox").innerHTML = ""; };
    $("#submitBtn").onclick = function () { run(); X.judge(m, w, AK.shGrade(ta.value, m.tests, m), ta.value); };
    X.solvedNote(m);
  };
  /* the shared test renderer shows `expect/got`; for shell tests add the inputs so the learner can reproduce a failure */

  /* ---------------------------------------------------------------- worked -> faded -> solo scaffolds */
  var CODE_TYPES = { "write-code": 1, gocode: 1, shell: 1, web: 1 };
  var LEARNREG = null;
  function regionExample(m) {
    var lr = AK.learnOf ? AK.learnOf(m, DATA) : null;
    if (lr && lr.example) return { title: "Worked example: " + (lr.title || m.skills[0]), code: lr.example.code, note: lr.example.note || lr.concept || "" };
    var L = UI.x5.LEARN && UI.x5.LEARN[m.region];
    if (L) return { title: "Worked example", code: L.code, note: (L.out ? "Output: " + L.out + ". " : "") + (L.note || "") };
    return null;
  }
  function partialOf(sol) {
    var lines = String(sol).replace(/\s+$/, "").split("\n"), keep = Math.max(1, Math.floor(lines.length / 2));
    if (lines.length <= 1) return "# Your turn: write the line that solves it.\n";
    return lines.slice(0, keep).join("\n") + "\n# Your turn: finish the rest.\n";
  }
  function synthFades() {
    DATA.missions.forEach(function (m) {
      if (m.fade || m.carry || m.project_step || m.boss || m.mystery || m.golf || !CODE_TYPES[m.type] || typeof m.solution !== "string") return;
      if (m.order > 3) return;
      var ex = regionExample(m); if (!ex) return;
      m.fade = { partial: partialOf(m.solution), example: ex, auto: true };
    });
  }
  synthFades();
  /* Go, Shell and Web editors are built by ext5/ext6 renderers; give them the same scaffold card and partial starter */
  function withFade(type) {
    var base = UI.mission[type]; if (!base) return;
    UI.mission[type] = function (v, m, w) {
      var lv = m.fade ? AK.scaffoldLevel(S(), DATA, m) : 0, mm = m;
      if (lv >= 2 && (S().drafts || {})[m.id] == null) mm = Object.assign({}, m, { starter: m.fade.partial });
      base(v, mm, w);
      if (!m.fade) return;
      var names = { 3: "Worked example + half-filled code", 2: "Half-filled code", 1: "Solo: blank editor" };
      var box = document.createElement("div"); box.className = "card fade-card";
      box.innerHTML = '<div class="row spread"><b>🪜 Guided help: ' + names[lv] + '</b><span class="row"><button class="btn small" data-lv="up">More help</button><button class="btn small" data-lv="down">Less help</button></span></div>' +
        (lv >= 3 ? '<div class="fade-ex"><b>' + esc(m.fade.example.title) + "</b>" + X.codeBox(m.fade.example.code) + '<div class="muted">' + esc(m.fade.example.note) + "</div></div>" : "") +
        '<div class="muted" style="font-size:.85rem">' + (lv >= 2 ? "Fill in the <code class=\"mono\">Your turn</code> part." : "No scaffold. You have got this.") + "</div>";
      var mid = $("#midpane"); if (mid && mid.parentNode) mid.parentNode.insertBefore(box, mid);
      $$("[data-lv]", box).forEach(function (b) { b.onclick = function () { AK.setScaffold(S(), m.id, lv + (b.dataset.lv === "up" ? 1 : -1)); delete S().drafts[m.id]; C.save(); UI.mission[type](v, m, w); }; });
    };
  }
  ["gocode", "shell", "web"].forEach(withFade);

  /* ---------------------------------------------------------------- free "show me a similar example" */
  function similarFor(m) {
    var ex = regionExample(m); if (ex) return ex;
    if (m.fade && m.fade.example) return m.fade.example;
    return null;
  }
  var obs = null;
  function addSimilar(m) {
    var slot = Q("#hintSlot"); if (!slot || Q("#simBtn", slot)) return;
    var ex = similarFor(m); if (!ex) return;
    var row = Q(".row", slot) || slot;
    var b = document.createElement("button"); b.className = "btn small"; b.id = "simBtn"; b.textContent = "🔎 Show me a similar example (free)";
    b.onclick = function () {
      AK.v7(S()).similar[m.id] = 1; C.save();
      var box = Q("#simBox"); if (box) { box.remove(); return; }
      box = document.createElement("div"); box.id = "simBox"; box.className = "hintbox";
      box.innerHTML = "🔎 <b>" + esc(ex.title) + "</b> (a different problem, not your answer)" + X.codeBox(ex.code) + '<div class="muted">' + esc(ex.note || "") + "</div>";
      slot.appendChild(box);
    };
    row.appendChild(b);
  }
  chain("route", function (name, arg) {
    if (obs) { obs.disconnect(); obs = null; }
    if (name !== "mission") return;
    setTimeout(function () {
      var slot = Q("#hintSlot"); if (!slot) return;
      var m = C.byId[arg]; if (!m) return;
      addSimilar(m);
      obs = new MutationObserver(function () { if (!Q("#simBtn", slot)) { obs.disconnect(); addSimilar(m); obs.observe(slot, { childList: true }); } });
      obs.observe(slot, { childList: true });
    }, 60);
  });

  /* ---------------------------------------------------------------- Teach Chilaka */
  var STOP = /^(the|a|an|and|or|to|of|is|it|in|on|for|then|if|so|that|this|with|as|at|by|be|i|my|we|you|are|was|do|does|not|no|yes|use|uses|using|print|prints|echo|line|lines)$/;
  function keyTerms(m) {
    var set = {}, sol = typeof m.solution === "string" ? m.solution : JSON.stringify(m.solution || "");
    (sol.match(/[A-Za-z_][A-Za-z0-9_]{2,}/g) || []).forEach(function (w) { w = w.toLowerCase(); if (!STOP.test(w)) set[w] = (set[w] || 0) + 1; });
    (m.skills || []).forEach(function (s) { String(s).split(/[-_ ]/).forEach(function (w) { if (w.length > 2) set[w.toLowerCase()] = (set[w.toLowerCase()] || 0) + 2; }); });
    return Object.keys(set).sort(function (a, b) { return set[b] - set[a]; }).slice(0, 14);
  }
  AK.teachScore = function (m, text) {
    var terms = keyTerms(m), low = " " + String(text).toLowerCase() + " ", hit = terms.filter(function (t) { return low.indexOf(t) >= 0; });
    var words = String(text).trim().split(/\s+/).filter(Boolean).length;
    return { hit: hit, missing: terms.filter(function (t) { return hit.indexOf(t) < 0; }), words: words, ok: words >= 6 && hit.length >= 2 };
  };
  function teachCard(m) {
    var slot = Q("#rewardSlot"); if (!slot || Q("#teachCard")) return;
    var done = AK.v7(S()).taught[m.id], card = document.createElement("section"); card.id = "teachCard"; card.className = "card teachcard"; card.setAttribute("aria-label", "Teach Chilaka");
    card.innerHTML = '<div class="row spread"><b>🦜 Teach Chilaka</b><span class="muted" style="font-size:.82rem">optional · +5 seeds the first time</span></div>' +
      '<p class="muted" style="margin:.3rem 0">Chilaka is a parrot who has never seen this code. Explain how your solution works in your own words.</p>' +
      '<textarea class="input" id="teachIn" rows="3" placeholder="First it reads... then it..." aria-label="Explain your solution to Chilaka">' + esc(done ? done.text : "") + '</textarea><div class="row" style="margin-top:.4rem"><button class="btn small primary" id="teachBtn">Teach</button></div><div id="teachOut" aria-live="polite" style="margin-top:.5rem"></div>';
    slot.appendChild(card);
    Q("#teachBtn").onclick = function () {
      var t = Q("#teachIn").value, sc = AK.teachScore(m, t), out = Q("#teachOut"), q;
      if (!t.trim()) { out.innerHTML = '<div class="hintbox">🦜 I am listening. Tell me what the code does first.</div>'; return; }
      if (sc.ok) {
        q = (m.socratic || [])[Math.min(2, sc.hit.length % 3)] || "What would change if the input were empty?";
        out.innerHTML = '<div class="hintbox">🦜 <b>Chirp! I think I understand.</b> You told me about <b>' + sc.hit.slice(0, 3).map(esc).join(", ") + "</b>. One question: " + esc(q) + "</div>";
        var v7 = AK.v7(S()); if (!v7.taught[m.id]) { v7.taught[m.id] = { text: t, at: Date.now() }; var sd = S().seeds || (S().seeds = { earned: 0, spent: 0 }); sd.earned += 5; C.save(); C.renderHeader && C.renderHeader("mission"); C.toast("🦜 Chilaka learned something. +5 seeds"); } else { v7.taught[m.id].text = t; C.save(); }
      } else {
        var miss = sc.missing.slice(0, 2).map(esc).join(" or ");
        out.innerHTML = '<div class="hintbox">🦜 <b>Hmm, I am still confused.</b> ' + (sc.words < 6 ? "Can you say a little more? " : "") + (miss ? "What does <b>" + miss + "</b> do in your code?" : "Walk me through it step by step.") + "</div>";
      }
    };
  }
  chain("passed", function (m) { setTimeout(function () { teachCard(m); }, 350); });
  chain("route", function (name, arg) { if (name === "mission") setTimeout(function () { var m = C.byId[arg]; if (m && S().solved[m.id]) teachCard(m); }, 120); });

  UI.x6 = { regionExample: regionExample, partialOf: partialOf, keyTerms: keyTerms };
})();

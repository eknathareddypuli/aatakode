/* AataKode v5 screens: "What do you want to learn?" goal chooser and path bar, Switch path page, map filter, mastery map,
   Maze Dash (second Arena game), story boss battles, parrot growth with choices, and the misconception card.
   Plugs into AK_CORE and AK_UI like ext3.js. */
(function () {
  "use strict";
  var C = window.AK_CORE, AK = window.AK, FX = window.AK_FX, UI = window.AK_UI;
  if (!C || !UI || !AK.v5) return;
  var $ = C.$, $$ = C.$$, esc = C.esc, DATA = C.DATA, VIEWS = C.VIEWS, H = UI.hooks;
  var Q = function (sel) { return $(sel) || { style: {}, classList: { add: function () {}, remove: function () {} }, value: "", insertAdjacentHTML: function () {}, setAttribute: function () {} }; };
  var S = function () { return C.state(); };
  var sfx = function (n, a) { if (FX) FX.sound(n, a); };
  var code = function (c) { return '<pre class="codepeek mono" style="white-space:pre-wrap;margin:.4rem 0">' + esc(c) + "</pre>"; };
  var D = { regions: DATA.regions, missions: DATA.missions, tracks: DATA.tracks };
  var BOSS = DATA.boss || { scenes: {}, choice: { options: [] } }, MIS = (DATA.misconceptions || { rules: [] }).rules, A2 = DATA.arena2;
  function chain(name, fn) { var prev = H[name]; H[name] = function () { var a = arguments, r; try { fn.apply(null, a); } catch (e) { /* polish never breaks play */ } return prev ? prev.apply(null, a) : r; }; }
  var goHome = function () { var h = location.hash.replace(/^#\/?/, ""); if (h === "" || h === "home") VIEWS.home($("#view")); else location.hash = "#/home"; };
  var shortT = function (m) { return m ? m.title : ""; };

  /* ---------------------------------------------------------------- goal chooser */
  function goalCards(cur) {
    return '<div class="goalgrid" role="group" aria-label="What do you want to learn?">' + AK.GOALS.map(function (g) {
      return '<button class="gpick' + (cur === g.id ? " on" : "") + '" data-g="' + g.id + '" aria-pressed="' + (cur === g.id) + '"><span class="gi" aria-hidden="true">' + g.icon + "</span><b>" + esc(g.en) + '</b><span class="muted">' + esc(g.line) + "</span></button>";
    }).join("") + "</div>";
  }
  function bindGoals(root, after) {
    $$(".gpick", root).forEach(function (b) { b.onclick = function () {
      var st = S(), g = AK.chooseGoal(st, b.dataset.g, new Date()); if (!g) return; C.save(); sfx("click");
      var nx = AK.pathNext(st, D); C.toast("Path set: " + g.icon + " " + g.en + (nx ? ". Next: " + nx.title : "") + ". You can switch any time.");
      if (after) after(g); else goHome();
    }; });
  }
  function chooserCard() {
    return '<section class="card chooser" id="chooser"><h2 style="margin-top:0">What do you want to learn?</h2><p class="muted">Pick a goal, not a language. Each goal is an ordered path through the tracks. Nothing is locked: you can switch any time and your progress stays.</p>' + goalCards("") +
      '<p style="margin:.8rem 0 0"><button class="btn small" id="chSkip">Skip: just show me everything</button> <a class="btn small" href="#/map">🗺 Open the map</a></p></section>';
  }
  function pathBar(st) {
    var v5 = AK.v5(st), g = AK.goalById(v5.goal), pr = AK.pathProgress(st, D), nx = AK.pathNext(st, D), pm = AK.primerOffer(st, D);
    if (!g || !pr) return "";
    var stages = pr.stages.map(function (s) { return '<span class="chip' + (s.done ? " gold" : "") + '" title="' + s.solved + " of " + s.total + '">' + (s.done ? "✔ " : "") + esc(s.label) + " " + s.solved + "/" + s.total + "</span>"; }).join(" ");
    return '<section class="card pathbar" id="pathBar" aria-label="Your learning path"><div class="row spread"><div><span class="tag">YOUR PATH</span><h3 style="margin:.3rem 0 .1rem">' + g.icon + " " + esc(g.en) + '</h3><span class="muted">' + esc(g.line) + '</span></div><div class="row"><a class="btn small" href="#/path">🎯 Switch path</a><a class="btn small" href="#/mastery">🌳 Mastery map</a></div></div>' +
      '<div class="bar" style="margin:.6rem 0" role="progressbar" aria-valuenow="' + pr.pct + '" aria-valuemin="0" aria-valuemax="100" aria-label="Path progress"><i style="width:' + pr.pct + '%"></i></div><div class="row" style="flex-wrap:wrap;gap:.35rem">' + stages + "</div>" +
      (pm ? '<div class="calm-offer card" style="margin:.7rem 0 0"><b>New to coding?</b> <span class="muted">A short Python primer (' + pm.missions + ' missions, about an hour) makes Go much easier.</span><div class="row" style="margin-top:.4rem"><button class="btn small good" id="pmYes">Start with the primer</button><button class="btn small" id="pmNo">I already code: straight to Go</button></div></div>' : "") +
      (nx ? '<p style="margin:.7rem 0 0"><a class="btn primary" id="pathGo" href="#/mission/' + nx.id + '">▶ Next on your path: ' + esc(nx.title) + "</a></p>" : '<p style="margin:.7rem 0 0"><b>🎉 Path complete.</b> <span class="muted">Pick another goal, or keep exploring the map.</span></p>') + "</section>";
  }
  function growCard(st) {
    var p = AK.growPending(st); if (!p) return "";
    return '<section class="card grow-card" id="growCard"><div class="row spread"><b>🦜 Chilaka is ready to grow</b><span class="muted">Your choice, and you can change it later.</span></div><p>' + esc(p.q) + '</p><div class="row" style="flex-wrap:wrap">' + p.opts.map(function (o) { return '<button class="btn small" data-gk="' + p.key + '" data-go="' + o.id + '" title="' + esc(o.desc) + '">' + o.icon + " " + esc(o.en) + "</button>"; }).join("") + "</div></section>";
  }
  var baseHome = VIEWS.home;
  VIEWS.home = function (v, arg) {
    baseHome(v, arg); var st = S(), v5 = AK.v5(st), hero = $(".hero", v); if (!hero) return;
    var lead = $(".lead", v); if (lead) lead.textContent = "Real code, real tests, no paywall. Learn Python, Go, SQL, Git, HTTP and security, build small games and do real-world jobs. Works offline once loaded.";
    var chooser = AK.needsChooser(st);
    if (chooser) hero.insertAdjacentHTML("beforebegin", chooserCard());
    else if (v5.goal) hero.insertAdjacentHTML("afterend", pathBar(st));
    else hero.insertAdjacentHTML("afterend", '<section class="card pathbar"><div class="row spread"><div><b>🎯 Choose what to learn</b><div class="muted">Pick a goal and Chilaka lines up your next missions.</div></div><a class="btn small primary" href="#/path">What do you want to learn?</a></div></section>');
    var pbar = $("#pathBar", v), nx = v5.goal ? AK.pathNext(st, D) : null, pb = $("#playBtn", v);
    if (pb && nx && !chooser) { pb.setAttribute("href", "#/mission/" + nx.id); pb.textContent = "▶ " + (Object.keys(st.solved).length ? "Continue your path" : "Start your path"); }
    var g = hero.nextElementSibling; void g;
    if (!chooser) { var anchor = pbar || hero; anchor.insertAdjacentHTML("afterend", growCard(st)); }
    var sk = $("#chSkip", v); if (sk) sk.onclick = function () { AK.skipGoal(st); C.save(); goHome(); };
    bindGoals(v);
    var yes = $("#pmYes", v), no = $("#pmNo", v);
    if (yes) yes.onclick = function () { AK.v5(st).primer = true; C.save(); goHome(); };
    if (no) no.onclick = function () { AK.v5(st).primer = true; AK.v5(st).primer = false; AK.v5(st).primerSkip = true; C.save(); C.toast("Straight to Go. The primer stays on the map if you want it later."); goHome(); };
    $$("[data-gk]", v).forEach(function (b) { b.onclick = function () { if (AK.growPick(st, b.dataset.gk, b.dataset.go)) { C.save(); sfx("ok"); C.toast("Chilaka is growing! 🦜"); goHome(); } }; });
    /* the parrot wears its path */
    var svg = $(".hero .art svg.chilaka", v), look = AK.growLook(st);
    if (svg && (look.path || look.trait || look.crest)) { var w = document.createElement("span"); w.className = "pgwrap " + look.cls; svg.parentNode.insertBefore(w, svg); w.appendChild(svg); if (look.badge) w.insertAdjacentHTML("beforeend", '<span class="pgbadge" aria-hidden="true">' + look.badge + "</span>"); }
    var tiles = $(".home4", v); if (tiles) tiles.insertAdjacentHTML("beforeend", '<a class="card tile" href="#/mastery"><b>🌳 Mastery map</b><div class="muted">See which ideas are strong and which need a little more practice.</div></a>');
  };
  /* "No primer" must not nag again: remember the answer. */
  var basePrimer = AK.primerOffer; AK.primerOffer = function (S0, data, g) { if (AK.v5(S0).primerSkip) return null; return basePrimer(S0, data, g); };

  /* ---------------------------------------------------------------- Switch path page */
  VIEWS.path = function (v) {
    var st = S(), v5 = AK.v5(st), pr = v5.goal ? AK.pathProgress(st, D) : null, cards = AK.trackCards(st, D);
    v.innerHTML = '<div class="mhead"><a class="btn small" href="#/home">← Home</a><span class="tag">YOUR PATH</span><h2>What do you want to learn?</h2></div>' +
      '<p class="muted">Pick the goal closest to what you want. It sets the order of your next missions. Nothing is ever locked out, and your progress, streak and seeds stay when you switch.</p>' + goalCards(v5.goal) +
      (pr ? '<section class="card" style="margin-top:1rem"><h3>' + esc(pr.path.goal.icon + " " + pr.path.goal.en) + ": " + pr.pct + '% done</h3><ol class="pathlist">' + pr.stages.map(function (s) { return "<li" + (s.done ? ' class="done"' : "") + "><b>" + esc(s.label) + "</b> <span class=\"muted\">" + s.solved + " of " + s.total + " missions</span></li>"; }).join("") + '</ol><label class="switch-row"><input type="checkbox" id="mapOnly"' + (v5.mapOnly ? " checked" : "") + '> Show only my path on the map</label> <button class="btn small" id="pathClear">Clear my choice</button></section>' : "") +
      '<section style="margin-top:1.2rem"><h3>Or browse every track</h3><div class="grid g3">' + cards.map(function (c) { return '<div class="card trackcard"><b>' + esc(c.title) + '</b><div class="muted" style="font-size:.88rem">' + esc(c.blurb) + '</div><div class="bar" style="margin:.5rem 0"><i style="width:' + c.pct + '%"></i></div><div class="row spread"><span class="muted">' + c.solved + " of " + c.total + " · about " + c.mins + ' min</span>' + (c.next ? '<a class="btn small" href="#/mission/' + c.next.id + '">' + (c.solved ? "Continue" : "Start") + "</a>" : '<span class="chip gold">✔ Done</span>') + "</div></div>"; }).join("") + "</div></section>";
    bindGoals(v);
    var mo = $("#mapOnly", v); if (mo) mo.onchange = function () { v5.mapOnly = mo.checked; C.save(); };
    var cl = $("#pathClear", v); if (cl) cl.onclick = function () { AK.skipGoal(st); C.save(); C.toast("Choice cleared. The whole map is open."); VIEWS.path(v); };
  };

  /* ---------------------------------------------------------------- map: mark and optionally filter by path */
  var baseMap = VIEWS.map;
  VIEWS.map = function (v, arg) {
    baseMap(v, arg); var st = S(), v5 = AK.v5(st), p = v5.goal ? AK.pathOf(st, D) : null; if (!p) return;
    var nx = AK.pathNext(st, D), kids = Array.prototype.slice.call(v.children), curTrack = null, any = false;
    kids.forEach(function (k) {
      if (k.classList.contains("track")) { if (curTrack && !any && v5.mapOnly) curTrack.style.display = "none"; curTrack = k; any = false; }
      else if (k.classList.contains("region")) {
        var n = k.querySelector(".node"), id = n && C.byId[n.dataset.m] ? C.byId[n.dataset.m].region : "", on = !!p.set[id];
        if (on) { k.classList.add("onpath"); any = true; } if (v5.mapOnly && !on) k.style.display = "none"; else if (on) any = true;
      }
    });
    if (curTrack && !any && v5.mapOnly) curTrack.style.display = "none";
    if (v5.mapOnly) { var vil = $(".village", v); if (vil) vil.style.display = "none"; }
    if (nx) { var nb = $('.node[data-m="' + nx.id + '"]', v); if (nb) nb.classList.add("next"); }
    var head = v.firstElementChild; if (head) head.insertAdjacentHTML("afterend", '<div class="card pathmini"><span>🎯 <b>' + esc(p.goal.en) + "</b>" + (v5.mapOnly ? " · showing only your path" : "") + '</span> <a class="btn small" href="#/path">Switch path</a>' + (nx ? ' <a class="btn small primary" href="#/mission/' + nx.id + '">▶ ' + esc(nx.title) + "</a>" : "") + "</div>");
  };

  /* ---------------------------------------------------------------- mastery map */
  VIEWS.mastery = function (v) {
    var st = S(), list = AK.mastery(st, D), focus = AK.masteryFocus(st, D), total = list.reduce(function (n, x) { return n + x.solved; }, 0);
    v.innerHTML = '<div class="mhead"><a class="btn small" href="#/profile">← Profile</a><span class="tag">MASTERY MAP</span><h2>🌳 What you understand</h2></div>' +
      '<p class="muted">Each idea grows as you solve missions that use it. A first-try solve counts fully; solving after retries or hints still counts, a little less, and a revisit makes it stronger. There are no penalties here, only a picture of where to practise next.</p>' +
      (focus ? '<div class="card focus"><b>' + (focus.kind === "revisit" ? "🔁 A gentle revisit" : "➡ Keep growing") + "</b><div>" + esc(focus.concept.icon + " " + focus.concept.en) + ": " + (focus.kind === "revisit" ? "“" + esc(shortT(focus.mission)) + "” was a struggle. Another go makes this idea stronger." : "next up is “" + esc(shortT(focus.mission)) + "”.") + '</div><a class="btn small primary" style="margin-top:.4rem" href="#/mission/' + focus.mission.id + '">Open it</a></div>' : "") +
      '<div class="grid g2 mastery" style="margin-top:1rem">' + list.map(function (x) {
        var lv = AK.LEVELS[x.level];
        return '<div class="card mrow"><div class="row spread"><b>' + x.icon + " " + esc(x.en) + '</b><span class="chip' + (x.level >= 4 ? " gold" : "") + '">' + lv.icon + " " + lv.en + '</span></div><div class="bar" style="margin:.5rem 0" role="progressbar" aria-valuenow="' + x.pct + '" aria-valuemin="0" aria-valuemax="100" aria-label="' + esc(x.en) + ' mastery"><i style="width:' + x.pct + '%"></i></div><div class="row spread"><span class="muted">' + x.solved + " of " + x.total + " missions" + (x.solved ? " · " + Math.round(x.quality * 100) + "% smooth" : "") + "</span>" +
          (x.shaky.length ? '<a class="btn small" href="#/mission/' + x.shaky[0].id + '" title="Retry ' + esc(x.shaky[0].title) + '">🔁 Revisit</a>' : x.next ? '<a class="btn small" href="#/mission/' + x.next.id + '">' + (x.solved ? "Continue" : "Start") + "</a>" : '<span class="muted">✔ complete</span>') + "</div></div>";
      }).join("") + "</div>" + (total ? "" : '<p class="muted" style="margin-top:1rem">Solve your first mission and the map starts to grow.</p>');
  };

  /* ---------------------------------------------------------------- Maze Dash */
  var DASH = A2 && { A: A2, name: "Maze Dash", icon: "🧭", route: "dash", flag: true, rec: function (st) { return AK.v5(st).dash; }, index: function (st, X) { return AK.dashLeagueIndex(st, X); }, open: function (st, X, id) { return AK.dashOpen(st, X, id); }, record: function (st, L, ser, src, now) { return AK.dashRecord(st, L, ser, src, now); },
    doc: 'state = {"me": [x, y], "foe": [x, y], "seeds": [[x, y]]  (the one flag), "walls": [[x, y], …], "size": 11, "turn": 1, "turns": 80, "score": [mine, theirs]}' };
  if (DASH && UI.botsView) VIEWS.dash = function (v, arg) { UI.botsView(v, arg, DASH); };
  var baseArena = VIEWS.arena;
  VIEWS.arena = function (v, arg) {
    baseArena(v, arg); if (!DASH) return; var d = AK.v5(S()).dash, g = $(".grid.g3", v);
    var tile = '<a class="card tile" href="#/dash"><b>🧭 Maze Dash</b><div class="muted">Race a rival to the flag through a maze. ' + Object.keys(d.done).length + " of 4 leagues cleared. Local and offline.</div></a>";
    if (g) g.insertAdjacentHTML("beforeend", tile); else v.insertAdjacentHTML("afterbegin", '<section class="grid g3" style="margin-bottom:1rem">' + tile + "</section>");
  };

  /* ---------------------------------------------------------------- boss battles */
  function overlay(label) { var o = document.createElement("div"); o.className = "story-ov boss-ov"; o.setAttribute("role", "dialog"); o.setAttribute("aria-modal", "true"); o.setAttribute("aria-label", label); document.body.appendChild(o); return o; }
  UI.bossIntro = function (m) {
    var sc = AK.bossScene(BOSS, m.id); if (!sc) return; var st = S(), i = 0, o = overlay("Boss: " + sc.foe), lines = sc.intro, stage = "lines", reply = "";
    function close(perk) { AK.bossChoose(st, m, perk || "none"); C.save(); o.remove(); mount(m); }
    function draw() {
      var last = i >= lines.length - 1, body = '<div class="boss-top"><span class="boss-face" aria-hidden="true">' + sc.emoji + "</span><div><div class=\"muted\">BOSS</div><h2 style=\"margin:0\">" + esc(sc.foe) + "</h2></div></div>";
      if (stage === "lines") body += '<div class="story-line" aria-live="polite">' + lines.slice(0, i + 1).map(function (l, k) { return '<p class="' + (k === i ? "new" : "") + '">' + esc(l) + "</p>"; }).join("") + '</div><div class="row"><button class="btn primary" id="bsNext">' + (last ? "Face it ▶" : "Next ▶") + '</button><button class="btn small" id="bsSkip">Skip the scene</button></div>';
      else if (stage === "choice") body += "<p><b>" + esc(BOSS.choice.q) + '</b></p><div class="boss-choices">' + BOSS.choice.options.map(function (o2) { return '<button class="btn" data-p="' + o2.perk + '">' + esc(o2.t) + "</button>"; }).join("") + "</div>";
      else body += "<p>" + esc(reply) + "</p>" + (stage === "patient" ? '<ol class="muted">' + (m.socratic || []).map(function (q) { return "<li>" + esc(q) + "</li>"; }).join("") + "</ol>" : "") + '<div class="row"><button class="btn primary" id="bsGo">⚔ Fight!</button></div>';
      o.innerHTML = '<div class="story-card boss-card">' + body + "</div>";
      var nx = Q("#bsNext"), sk = Q("#bsSkip"), go = Q("#bsGo");
      nx.onclick = function () { sfx("click"); if (last) { stage = "choice"; } else i++; draw(); }; sk.onclick = function () { close("none"); };
      $$("[data-p]", o).forEach(function (b) { b.onclick = function () { var op = BOSS.choice.options.find(function (x) { return x.perk === b.dataset.p; }); reply = op.reply; stage = op.perk; AK.bossChoose(st, m, op.perk); C.save(); sfx("ok"); draw(); }; });
      go.onclick = function () { o.remove(); mount(m); };
      var f = $("button", o); if (f) f.focus();
    }
    draw();
  };
  UI.bossWin = function (m, res) {
    var sc = AK.bossScene(BOSS, m.id); if (!sc) return; var o = overlay("Victory: " + sc.foe), perk = AK.v5(S()).bossPerk[m.id];
    o.innerHTML = '<div class="story-card boss-card"><div class="boss-top"><span class="boss-face down" aria-hidden="true">' + sc.emoji + '</span><div><div class="muted">VICTORY</div><h2 style="margin:0">' + esc(sc.foe) + " is defeated</h2></div></div><div class=\"story-line\">" + sc.win.map(function (l) { return "<p>" + esc(l) + "</p>"; }).join("") + (res && res.bold ? "<p>🌱 You charged in alone and won: +3 seeds.</p>" : perk === "scout" ? "<p class=\"muted\">Chilaka's scouting paid off.</p>" : "") + '</div><div class="row"><button class="btn primary" id="bwOk">Continue</button></div></div>';
    Q("#bwOk").onclick = function () { o.remove(); }; var b = $("#bwOk"); if (b) b.focus(); sfx("league", 2);
  };
  function mount(m) {
    var sc = AK.bossScene(BOSS, m.id), slot = $("#learnSlot"); if (!sc || !slot || $("#bossHp")) return;
    slot.insertAdjacentHTML("beforebegin", '<div class="card boss-hp" id="bossHp"><div class="row spread"><b>' + sc.emoji + " " + esc(sc.foe) + '</b><span class="muted" id="bossTxt">Full health. Each passing check lands a hit.</span></div><div class="bar hpbar" role="progressbar" aria-valuenow="100" aria-valuemin="0" aria-valuemax="100" aria-label="' + esc(sc.foe) + ' health"><i id="bossBar" style="width:100%"></i></div></div>');
  }
  chain("route", function (name, arg) {
    if (name !== "mission") return; var st = S(), m = C.byId[String(arg || "").split("/")[0]]; if (!m || !m.boss) return;
    setTimeout(function () { if (!$("#leftpane")) return; if (AK.bossNeedsIntro(st, BOSS, m)) UI.bossIntro(m); else mount(m); }, 60);
  });
  chain("tests", function (results, m) {
    if (!m || !m.boss || !results) return; mount(m); var hp = AK.bossHp(results), bar = $("#bossBar"), txt = $("#bossTxt"); if (!bar) return;
    bar.style.width = hp.pct + "%"; bar.parentNode.setAttribute("aria-valuenow", hp.pct);
    txt.textContent = hp.down ? "Down! Every check lands." : hp.hit + " of " + hp.total + " checks landed. " + hp.pct + "% health left.";
  });
  chain("solved", function (m, res) { if (m && m.boss) setTimeout(function () { UI.bossWin(m, res); }, 900); });

  /* ---------------------------------------------------------------- misconception card */
  var seenMis = {};
  chain("tests", function (results, m) {
    var host = $("#learnSlot"); if (!m || !results || !host) return; var old = $("#misSlot"); if (old) old.remove();
    var ok = results.filter(function (r) { return !r.star; }).every(function (r) { return r.ok; }); if (ok) return;
    var lang = m.type === "sql" ? "sql" : ["write-code", "fix-the-bug", "pair"].indexOf(m.type) >= 0 ? "python" : ""; if (!lang) return;
    var ta = $("#code"), src = ta ? ta.value : ""; if (!src.trim() || src.trim() === String(m.starter || "").trim()) return;
    var rule = AK.misMatch(MIS, { lang: lang, code: src, results: results }); if (!rule) return;
    var key = m.id + ":" + rule.id, st = S(); if (!seenMis[key]) { seenMis[key] = 1; AK.misNote(st, rule); AK.newTitles(st, DATA).forEach(function (t) { C.toast("Title: " + t.icon + " " + t.en); }); C.save(); }
    host.insertAdjacentHTML("beforebegin", '<div class="card misc" id="misSlot"><details open><summary><b>🧭 A common mix-up: ' + esc(rule.title) + '</b></summary><p class="muted">Many people think: ' + esc(rule.say) + "</p><p>" + esc(rule.truth) + '</p><div class="grid g2"><div><span class="muted">Mix-up</span>' + code(rule.wrong) + '</div><div><span class="muted">Better</span>' + code(rule.right) + "</div></div><p><b>Rule of thumb:</b> " + esc(rule.tip) + '</p><p class="muted" style="font-size:.85rem">This is a hint about a common slip, not a judgment on your code: it may not be your exact problem.</p></details></div>');
  });

  /* ---------------------------------------------------------------- profile: growth and links */
  var baseProfile = VIEWS.profile;
  VIEWS.profile = function (v, arg) {
    baseProfile(v, arg); var st = S(), p = AK.v5(st).parrot, n = Object.keys(st.solved).length, look = AK.growLook(st);
    var steps = AK.GROW_STEPS.map(function (s) {
      if (n < s.need) return '<div class="grow-step lock"><b>🔒 ' + esc(s.key === "path" ? "Path" : s.key === "trait" ? "Trait" : "Crest") + '</b><span class="muted"> unlocks at ' + s.need + " missions (" + (s.need - n) + " to go)</span></div>";
      return '<div class="grow-step"><b>' + esc(s.q) + '</b><div class="row" style="flex-wrap:wrap;margin-top:.3rem">' + s.opts.map(function (o) { return '<button class="btn small' + (p[s.key] === o.id ? " primary" : "") + '" data-gk="' + s.key + '" data-go="' + o.id + '" aria-pressed="' + (p[s.key] === o.id) + '" title="' + esc(o.desc) + '">' + o.icon + " " + esc(o.en) + "</button>"; }).join("") + "</div></div>";
    }).join("");
    v.insertAdjacentHTML("beforeend", '<section class="card" style="margin-top:1rem"><h3>🦜 Chilaka grows with you</h3><div class="row"><span class="pgwrap ' + look.cls + '">' + C.parrot(72) + (look.badge ? '<span class="pgbadge" aria-hidden="true">' + look.badge + "</span>" : "") + '</span><div class="grow"><p class="muted">Stage: <b>' + look.name + "</b>. Every choice below can be changed whenever you like.</p>" + steps + '</div></div><div class="row" style="margin-top:.6rem"><a class="btn small" href="#/mastery">🌳 Mastery map</a><a class="btn small" href="#/path">🎯 Switch path</a></div></section>');
    $$("[data-gk]", v).forEach(function (b) { b.onclick = function () { if (AK.growPick(st, b.dataset.gk, b.dataset.go)) { C.save(); sfx("ok"); VIEWS.profile(v, arg); } }; });
  };
})();

/* AataKode v4 screens, part 2: offline install guide, mission health dashboard, printable worksheets and certificates,
   Chilaka's morning, play-fair page, calm settings (zen mode, weekend pass, roles), story chapters, and the tiles that
   link all of it from Arena, Home and Profile. */
(function () {
  "use strict";
  var C = window.AK_CORE, AK = window.AK, FX = window.AK_FX, UI = window.AK_UI;
  if (!C || !UI || !AK.v4) return;
  var $ = C.$, $$ = C.$$, esc = C.esc, DATA = C.DATA, VIEWS = C.VIEWS, H = UI.hooks;
  var Q = function (sel) { return $(sel) || { style: {}, classList: { add: function () {}, remove: function () {} }, value: "", insertAdjacentHTML: function () {} }; };
  var S = function () { return C.state(); };
  var sfx = function (n, a) { if (FX) FX.sound(n, a); };
  var code = function (c) { return '<pre class="codepeek mono" style="white-space:pre-wrap;margin:.4rem 0">' + esc(c) + "</pre>"; };
  function chain(name, fn) { var prev = H[name]; H[name] = function () { var a = arguments; try { fn.apply(null, a); } catch (e) { /* ignore */ } return prev ? prev.apply(null, a) : undefined; }; }
  var CHAP = (DATA.story || { chapters: [] }).chapters;

  /* ---------------------------------------------------------------- weekly ring (no streak, no shame) */
  function ring(n, goal, size) {
    var r = 26, c = 2 * Math.PI * r, f = Math.min(1, n / Math.max(1, goal));
    return '<svg class="wring" width="' + size + '" height="' + size + '" viewBox="0 0 64 64" role="img" aria-label="Weekly goal: ' + n + " of " + goal + ' missions"><circle cx="32" cy="32" r="' + r + '" class="wr-bg"/><circle cx="32" cy="32" r="' + r + '" class="wr-fg" stroke-dasharray="' + (c * f).toFixed(1) + " " + c.toFixed(1) + '" transform="rotate(-90 32 32)"/><text x="32" y="37" text-anchor="middle" class="wr-t">' + n + "/" + goal + "</text></svg>";
  }
  UI.ring = ring;

  /* ---------------------------------------------------------------- story chapters */
  UI.chapter = function (n) {
    var ch = CHAP[n - 1]; if (!ch) return; var i = 0, o = document.createElement("div"); o.className = "story-ov"; o.setAttribute("role", "dialog"); o.setAttribute("aria-label", "Story chapter " + n);
    document.body.appendChild(o);
    function draw() {
      var done = i >= ch.lines.length - 1;
      o.innerHTML = '<div class="story-card"><div class="muted">Chapter ' + n + " of " + CHAP.length + "</div><h2>" + esc(ch.title) + '</h2><div class="story-line" aria-live="polite">' + ch.lines.slice(0, i + 1).map(function (l, k) { return '<p class="' + (k === i ? "newl" : "") + '">' + esc(l) + "</p>"; }).join("") + '</div><div class="row spread"><button class="btn small" id="stSkip">Close</button><button class="btn primary" id="stNext">' + (done ? "Continue the journey" : "Next ▶") + "</button></div></div>";
      Q("#stNext").onclick = function () { sfx("click"); if (done) fin(); else { i++; draw(); } }; Q("#stSkip").onclick = fin; Q("#stNext").focus();
    }
    function fin() { var v = AK.v4(S()); v.story = Math.max(v.story, n); C.save(); o.remove(); }
    draw();
  };
  VIEWS.story = function (v) {
    var st = S(), un = AK.chaptersUnlocked(st, DATA);
    v.innerHTML = '<h2>📜 The story of Aata-gram</h2><p class="muted">Twelve short chapters. Each unlocks when you beat a region boss. ' + un + " of " + CHAP.length + " unlocked.</p><div class=\"grid g3\">" + CHAP.map(function (c) { var open = c.n <= un; return '<div class="card' + (open ? "" : " locked") + '"><b>' + (open ? "" : "🔒 ") + "Chapter " + c.n + "</b><div>" + esc(open ? c.title : "???") + "</div>" + (open ? '<button class="btn small" data-c="' + c.n + '" style="margin-top:.5rem">Read</button>' : "") + "</div>"; }).join("") + "</div>";
    $$("[data-c]", v).forEach(function (b) { b.onclick = function () { UI.chapter(+b.dataset.c); }; });
  };

  /* ---------------------------------------------------------------- Chilaka's morning (about 20 seconds) */
  var HELLO = { en: "Good morning", te: "శుభోదయం", hi: "सुप्रभात", kn: "ಶುಭೋದಯ", ta: "காலை வணக்கம்", ml: "സുപ്രഭാതം" };
  var TIPS = ["A function is just a named recipe.", "Print is the best friend of every debugger.", "Names matter: total beats t.", "Lists remember order, sets remember uniqueness.", "Read the error from the bottom up.", "Small steps, run often.", "Indentation is part of the sentence."];
  VIEWS.morning = function (v) {
    var st = S(), now = new Date(), done = AK.ritualDone(st, now), p = AK.ritualPick(DATA, now), g = AK.golden(st, DATA, now), lang = st.settings.lang, wk = AK.weeklyState(st, now);
    v.innerHTML = '<h2>🌅 Chilaka\'s morning</h2><p class="muted">Twenty seconds. No streak depends on it and nothing is lost if you skip it.</p><div class="card morning"><div class="row">' + C.parrot(70) + '<div><b>' + esc((HELLO[lang] || HELLO.en) + (st.name ? ", " + st.name : "")) + '!</b><div class="muted">Tip of the day: ' + esc(TIPS[now.getDay() % TIPS.length]) + "</div></div></div>" +
      '<div id="mnPred" style="margin-top:.8rem"></div><div id="mnEnd"></div></div>';
    var end = function () {
      var first = AK.ritualFinish(st, now); if (first) { C.save(); C.renderHeader("morning"); sfx("coin"); }
      Q("#mnEnd").innerHTML = '<div class="reward"><b>Done. ' + (first ? "🌱 +1 seed." : "Already done today.") + '</b><div class="row" style="margin:.5rem 0">' + UI.ring(wk.n, wk.goal, 54) + '<span class="muted">Weekly goal: ' + wk.n + " of " + wk.goal + " missions</span></div>" + (g ? '<p>🌟 Today\'s golden mission: <a href="#/mission/' + g.id + '">' + esc(g.title) + "</a></p>" : "") + '<a class="btn primary" href="#/map">Start learning</a></div>';
    };
    if (!p || done) { if (done) end(); else Q("#mnPred").innerHTML = '<p class="muted">No question today.</p>'; if (!p) end(); return; }
    Q("#mnPred").appendChild(C.predictCard(p, { done: false, onCorrect: function () { end(); } }));
  };

  /* ---------------------------------------------------------------- Play fair */
  VIEWS.playfair = function (v) {
    v.innerHTML = '<h2>🤝 Play fair</h2><p class="lead">AataKode is free for everyone and built to help you learn, not to keep you glued to a screen. These are promises, and you can check each one in the code.</p><div class="grid g2">' + [
      ["No fake countdowns", "Nothing here expires to pressure you. The only clocks are ones you start yourself, in Clash of Code, and practice mode has none."],
      ["No streak shaming", "If a streak breaks, it just restarts. Weekends are free by default, and a 3-mission comeback quest can restore it. No guilt messages."],
      ["No paid shortcuts", "Nothing can be bought with money. Seeds come only from learning and cannot be purchased. Hints cost a seed or nothing, never a payment."],
      ["No notifications", "We never ask to send notifications and there is no server to send them from. You open the app when you want to."],
      ["No tracking, no accounts", "Your progress stays on this device. Nothing is uploaded. The health dashboard is local and exportable."],
      ["Odds you can see", "The mystery seed packet gives 1 to 5 seeds every 7th mission. That is all it ever does."],
      ["Calm for everyone", "Zen mode hides XP, streaks, stars and leagues. Motion and sound respect your device and your settings."],
      ["Effort counts", "Retry, debug, ask for a hint: all fine. The Explain panel and the \"you debugged it\" moment celebrate the work, not just the win."],
    ].map(function (x) { return '<div class="card"><b>' + esc(x[0]) + '</b><p class="muted">' + esc(x[1]) + "</p></div>"; }).join("") + '</div><p style="margin-top:1rem"><a class="btn" href="#/calm">Open calm settings</a></p>';
  };

  /* ---------------------------------------------------------------- Calm settings: zen, weekend pass, roles, music */
  var PACKS = [{ id: "chime", name: "Chime (default)" }, { id: "veena", name: "Veena" }, { id: "marimba", name: "Marimba" }, { id: "retro", name: "Retro" }];
  VIEWS.calm = function (v) {
    var st = S(), s = st.settings, vv = AK.v4(st), role = AK.roleOf(st, DATA), sc = AK.roleScores(st, DATA);
    v.innerHTML = '<h2>🌿 Calm and settings</h2><div class="grid g2"><div class="card"><h3>Calm</h3>' +
      chk("zen", "Zen mode", "Hide XP, stars, streaks, seeds and leagues. Missions, feedback and learning stay.", s.zen) +
      chk("weekendPass", "Weekend pass", "Saturday and Sunday never break your streak.", s.weekendPass !== false) +
      chk("music", "Music layer", "Soft ambient music that grows with your village. Off by default.", s.music === "on") +
      '<label class="row" style="margin-top:.5rem"><span>Sound pack</span><select id="selPack" class="input" style="width:auto">' + PACKS.map(function (p) { return '<option value="' + p.id + '"' + ((s.pack || "chime") === p.id ? " selected" : "") + ">" + p.name + "</option>"; }).join("") + '</select></label>' +
      '<label class="row" style="margin-top:.5rem"><span>Sound</span><select id="selSnd" class="input" style="width:auto"><option value="on">On</option><option value="quiet">Quiet</option><option value="off">Off</option></select></label>' +
      '<label class="row" style="margin-top:.5rem"><span>Vibration</span><select id="selHap" class="input" style="width:auto"><option value="on">On</option><option value="off">Off</option></select></label>' +
      '<label class="row" style="margin-top:.5rem"><span>Weekly goal (missions)</span><select id="selGoal" class="input" style="width:auto">' + [3, 5, 8, 12].map(function (n) { return "<option" + (vv.weekly.goal === n ? " selected" : "") + ">" + n + "</option>"; }).join("") + "</select></label></div>" +
      '<div class="card"><h3>Who are you as a learner?</h3><p class="muted">A friendly lens, not a label. It only changes the suggestions you see.</p><div class="roles">' + AK.ROLES.map(function (r) { return '<button class="role' + (role && role.id === r.id ? " on" : "") + '" data-r="' + r.id + '"><span style="font-size:1.6rem">' + r.icon + "</span><b>" + r.en + "</b><span class=\"muted\" style=\"font-size:.8rem\">" + esc(r.line) + "</span></button>"; }).join("") + '</div><p class="muted" style="font-size:.85rem">Your play so far leans: ' + Object.keys(sc).map(function (k) { return k + " " + sc[k]; }).join(" · ") + '</p></div></div>' +
      '<div class="card" style="margin-top:1rem"><h3>🏷 Titles you earned</h3>' + (AK.titlesFor(st).length ? AK.titlesFor(st).map(function (t) { return '<span class="chip gold" title="' + esc(t.desc) + '">' + t.icon + " " + esc(t.en) + "</span> "; }).join("") : '<p class="muted">Titles come from how you learn: retrying, reading, exploring. They arrive on their own.</p>') + '<details style="margin-top:.6rem"><summary class="muted">All titles</summary>' + AK.TITLES.map(function (t) { return "<div>" + t.icon + " <b>" + esc(t.en) + '</b> <span class="muted">' + esc(t.desc) + "</span></div>"; }).join("") + "</details></div>";
    function chk(id, label, desc, on) { return '<label class="switch"><input type="checkbox" data-s="' + id + '"' + (on ? " checked" : "") + '><span><b>' + esc(label) + '</b><span class="muted" style="display:block;font-size:.85rem">' + esc(desc) + "</span></span></label>"; }
    $$("[data-s]", v).forEach(function (b) { b.onchange = function () { var k = b.dataset.s; if (k === "music") s.music = b.checked ? "on" : "off"; else s[k] = b.checked; C.save(); C.applySettings(); if (UI.applyCalm) UI.applyCalm(); C.renderHeader("calm"); }; });
    Q("#selSnd").value = s.sound || "on"; Q("#selSnd").onchange = function (e) { s.sound = e.target.value; C.save(); };
    Q("#selHap").value = s.haptics || "on"; Q("#selHap").onchange = function (e) { s.haptics = e.target.value; C.save(); };
    Q("#selPack").onchange = function (e) { s.pack = e.target.value; C.save(); sfx("solved"); };
    Q("#selGoal").onchange = function (e) { vv.weekly.goal = +e.target.value; C.save(); };
    $$("[data-r]", v).forEach(function (b) { b.onclick = function () { vv.role = b.dataset.r; C.save(); VIEWS.calm(v); }; });
  };

  /* ---------------------------------------------------------------- Offline install guide */
  var deferred = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; });
  VIEWS.install = function (v) {
    v.innerHTML = '<h2>📴 Use AataKode offline</h2><p class="muted">Everything runs in your browser. After one online visit, the app and the Python engine live on your device.</p><div class="grid g2">' +
      '<div class="card"><h3>1. Install the app</h3><p class="muted">Installing gives you an icon, a full-screen window and a safer cache.</p><div class="row"><button class="btn primary" id="inBtn">⬇ Install AataKode</button></div><div id="inMsg" class="muted" style="margin-top:.4rem"></div><ul class="muted" style="font-size:.9rem"><li>Chrome or Edge: use the button above, or the install icon in the address bar.</li><li>Android: browser menu, then “Add to Home screen”.</li><li>iPhone or iPad: Share, then “Add to Home Screen”.</li></ul></div>' +
      '<div class="card"><h3>2. Download the Python engine</h3><p class="muted">Python runs in the browser through Pyodide (about 10 MB the first time, then cached).</p><div class="row"><button class="btn good" id="pyBtn">⬇ Download Pyodide now</button></div><div class="bar"><i id="pyBar"></i></div><div id="pyMsg" class="muted" aria-live="polite" style="margin-top:.4rem"></div></div>' +
      '<div class="card"><h3>3. Check you are ready</h3><div id="inChecks" class="muted">Checking…</div></div>' +
      '<div class="card"><h3>What works offline</h3><ul class="muted"><li>All missions, quests, the Arena and Clash of Code.</li><li>Debug-the-Outage terminals need no engine at all.</li><li>Your progress is saved on this device. Export it from Profile as a backup.</li></ul></div></div>';
    Q("#inBtn").onclick = async function () { if (deferred) { deferred.prompt(); try { var r = await deferred.userChoice; Q("#inMsg").textContent = r.outcome === "accepted" ? "Installed. You can open it from your apps." : "No problem, you can install any time."; } catch (e) { /* ignore */ } deferred = null; } else Q("#inMsg").textContent = "Your browser did not offer an install button here. Use the browser steps below, or just keep using the site: it works offline once loaded."; };
    Q("#pyBtn").onclick = function () {
      var b = Q("#pyBtn"); b.disabled = true; Q("#pyMsg").textContent = "Downloading…"; var w = 5; var t = setInterval(function () { w = Math.min(90, w + 4); Q("#pyBar").style.width = w + "%"; }, 400);
      C.ensurePy().then(function () { clearInterval(t); Q("#pyBar").style.width = "100%"; Q("#pyMsg").textContent = "✔ Python is ready and cached for offline use."; checks(); }, function () { clearInterval(t); b.disabled = false; Q("#pyBar").style.width = "0"; Q("#pyMsg").textContent = "Could not download. Check your connection and try again."; });
    };
    async function checks() {
      var rows = [], sw = "serviceWorker" in navigator, ctrl = sw && !!navigator.serviceWorker.controller, usage = null, py = false;
      try { var est = await navigator.storage.estimate(); usage = Math.round(est.usage / 1048576) + " MB used"; } catch (e) { /* ignore */ }
      try { var keys = await caches.keys(); for (var i = 0; i < keys.length && !py; i++) { var c = await caches.open(keys[i]); var rq = await c.keys(); py = rq.some(function (r) { return /pyodide/i.test(r.url); }); } } catch (e) { /* ignore */ }
      rows.push([sw, "Offline support is available in this browser"], [ctrl, "The app is cached (reload once online if this is unchecked)"], [py, "The Python engine is cached"], [!!(window.matchMedia && matchMedia("(display-mode: standalone)").matches), "Running as an installed app (optional)"]);
      Q("#inChecks").innerHTML = rows.map(function (r) { return "<div>" + (r[0] ? "✅" : "⬜") + " " + esc(r[1]) + "</div>"; }).join("") + (usage ? '<div style="margin-top:.4rem">Storage: ' + esc(usage) + "</div>" : "");
    }
    checks();
  };

  /* ---------------------------------------------------------------- Mission health dashboard (local only) */
  VIEWS.health = function (v) {
    var st = S(), h = AK.health(st, DATA, new Date()), tr = DATA.tracks.filter(function (t) { return h.tracks[t.id] && h.tracks[t.id].total; });
    var days = []; for (var i = 27; i >= 0; i--) { var d = new Date(); d.setDate(d.getDate() - i); var k = AK.dateKey(d); days.push([k, h.perDay[k] || 0]); }
    v.innerHTML = '<h2>🩺 Mission health</h2><p class="muted">Local stats from this device only. Nothing is sent anywhere.</p><div class="grid g3">' +
      [["Missions solved", h.solved + " of " + h.total], ["First try", h.firstTry], ["After retrying", h.retried], ["Hints taken", h.hints + " (avg " + h.avgHints + ")"], ["Active days", h.activeDays], ["Best streak", (h.streak || {}).best || 0]].map(function (x) { return '<div class="card stat"><div class="muted">' + x[0] + '</div><div class="big">' + x[1] + "</div></div>"; }).join("") + "</div>" +
      '<div class="card" style="margin-top:1rem"><h3>Progress by track</h3>' + tr.map(function (t) { var x = h.tracks[t.id], pct = Math.round((x.solved / x.total) * 100); return '<div class="trow"><span>' + esc(C.lt(t, "title")) + '</span><div class="bar"><i style="width:' + pct + '%"></i></div><span class="mono">' + x.solved + "/" + x.total + "</span></div>"; }).join("") + "</div>" +
      '<div class="card" style="margin-top:1rem"><h3>Last 28 days</h3><div class="heat" role="img" aria-label="Missions solved per day">' + days.map(function (d) { return '<i class="h' + Math.min(4, d[1]) + '" title="' + d[0] + ": " + d[1] + '"></i>'; }).join("") + "</div></div>" +
      '<div class="card" style="margin-top:1rem"><h3>Missions that took the most tries</h3>' + (h.hardest.length ? h.hardest.map(function (x) { var m = C.byId[x.id]; return '<div><a href="#/mission/' + x.id + '">' + esc(m ? m.title : x.id) + '</a> <span class="muted">' + x.tries + " tries</span></div>"; }).join("") : '<p class="muted">Nothing yet. Tries are counted when a check fails.</p>') + '</div><div class="row" style="margin-top:1rem"><button class="btn" id="hxJson">⬇ Export as JSON</button><button class="btn" id="hxCsv">⬇ Export tracks as CSV</button></div>';
    function dl(name, text, type) { var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000); }
    Q("#hxJson").onclick = function () { dl("aatakode-health-" + h.generated + ".json", JSON.stringify(h, null, 2), "application/json"); };
    Q("#hxCsv").onclick = function () { dl("aatakode-tracks-" + h.generated + ".csv", "track,solved,total\n" + tr.map(function (t) { return t.id + "," + h.tracks[t.id].solved + "," + h.tracks[t.id].total; }).join("\n") + "\n", "text/csv"); };
  };

  /* ---------------------------------------------------------------- Printable worksheets and certificates */
  VIEWS.print = function (v, arg) {
    var st = S(), regions = DATA.regions.filter(function (r) { return AK.regionMissions(DATA, r.id).some(function (m) { return m.type === "predict" || m.type === "read" || m.type === "fill"; }); }), rid = arg && regions.some(function (r) { return r.id === arg; }) ? arg : regions[0].id;
    v.innerHTML = '<div class="noprint"><h2>🖨 Worksheets and certificates</h2><p class="muted">Print on paper or choose “Save as PDF” in the print window. Great for classrooms with no screens.</p><div class="row"><label for="prReg">Worksheet for</label><select id="prReg" class="input" style="width:auto">' + regions.map(function (r) { return '<option value="' + r.id + '"' + (r.id === rid ? " selected" : "") + ">" + esc(C.lt(r, "title")) + "</option>"; }).join("") + '</select><button class="btn primary" id="prSheet">🖨 Print worksheet</button><button class="btn" id="prAnswers">🖨 Print answer key</button><button class="btn good" id="prCert">🏅 Print certificate</button></div></div><div id="prArea" class="print-area"></div>';
    var link = location.origin + location.pathname;
    function sheet(key) {
      var r = C.regionById[Q("#prReg").value], ms = AK.regionMissions(DATA, r.id).filter(function (m) { return m.type === "predict" || m.type === "read" || m.type === "fill" || m.type === "order"; }).slice(0, 8);
      Q("#prArea").innerHTML = '<div class="sheet"><h1>AataKode worksheet: ' + esc(r.title) + (key ? " (answer key)" : "") + '</h1><p>Name: ______________________ &nbsp; Date: ______________</p><p><i>' + esc(r.blurb) + "</i></p>" + ms.map(function (m, i) {
        var body = m.type === "fill" ? "Fill in the blanks: " + esc(m.goal) + code(m.template || m.code || "") : code(m.code || (m.lines || []).join("\n") || "");
        var opts = m.options ? "<ol type=\"A\">" + m.options.map(function (o, k) { return "<li" + (key && k === m.answer ? ' class="ans"' : "") + "><pre>" + esc(o) + "</pre></li>"; }).join("") + "</ol>" : '<p>Answer: ________________________________</p>';
        return '<div class="q"><b>' + (i + 1) + ". " + esc(m.title) + "</b><div>" + esc(m.goal) + "</div>" + body + opts + (key && m.why ? "<p><b>Why:</b> " + esc(m.why) + "</p>" : "") + "</div>";
      }).join("") + '<p class="foot">Free practice at ' + esc(link) + " (works offline once loaded)</p></div>";
      window.print();
    }
    Q("#prSheet").onclick = function () { sheet(false); }; Q("#prAnswers").onclick = function () { sheet(true); };
    Q("#prCert").onclick = function () {
      var c = AK.certificate(st, DATA, "Python Quest"), pyN = DATA.missions.filter(function (m) { var r = C.regionById[m.region]; return r && r.track === "python" && st.solved[m.id]; }).length;
      Q("#prArea").innerHTML = '<div class="cert"><div class="cert-in"><div class="cert-top">' + C.parrot(70) + '</div><h1>Certificate of Learning</h1><p>This certifies that</p><h2>' + esc(c.name) + "</h2><p>has completed <b>" + pyN + "</b> Python missions and <b>" + c.solved + "</b> missions in total on AataKode, reaching the rank of <b>" + esc(c.rank) + "</b>.</p><p>Date: " + esc(c.date) + " &nbsp;·&nbsp; Proof ID: <span class=\"mono\">" + esc(c.id) + "</span></p><p class=\"foot\">AataKode by EknathaLabs · free coding for everyone · " + esc(link) + "</p></div></div>";
      window.print();
    };
  };

  /* ---------------------------------------------------------------- links from Arena, Home and Profile */
  var baseArena = VIEWS.arena;
  VIEWS.arena = function (v, arg) {
    baseArena(v, arg); var st = S(), a = AK.v4(st).arena, cs = AK.v4(st).clash, c = AK.clashDaily(DATA.clash, new Date());
    v.insertAdjacentHTML("afterbegin", '<section class="grid g3" style="margin-bottom:1rem"><a class="card tile" href="#/bots"><b>🤖 Bot Arena</b><div class="muted">Write a bot, climb Wood to Legend. ' + Object.keys(a.done).length + " of 5 leagues cleared. Local and offline.</div></a><a class=\"card tile\" href=\"#/clash/" + c.id + '"><b>⚡ Clash of Code</b><div class="muted">5 minute puzzles, ghosts to race, a friend link with no server. ' + Object.keys(cs.solved).length + ' solved.</div></a><a class="card tile" href="#/morning"><b>🌅 Chilaka\'s morning</b><div class="muted">A 20 second warm-up. Optional, never a chore.</div></a></section>');
  };
  var baseHome = VIEWS.home;
  VIEWS.home = function (v, arg) {
    baseHome(v, arg); var st = S(), now = new Date(), wk = AK.weeklyState(st, now), done = AK.ritualDone(st, now), un = AK.chaptersUnlocked(st, DATA);
    var hero = $(".hero", v);
    if (hero) hero.insertAdjacentHTML("afterend", '<section class="grid g3 home4" style="margin-top:1rem"><a class="card tile" href="#/morning"><b>🌅 Chilaka\'s morning</b><div class="muted">' + (done ? "Done today. See you tomorrow." : "A 20 second warm-up, whenever you like.") + '</div></a><div class="card"><div class="row">' + ring(wk.n, wk.goal, 54) + '<div><b>This week</b><div class="muted">' + wk.n + " of " + wk.goal + ' missions. Go at your own pace.</div></div></div></div><a class="card tile" href="#/story"><b>📜 The story</b><div class="muted">' + un + " of " + CHAP.length + " chapters unlocked.</div></a></section>");
  };
  var baseProfile = VIEWS.profile;
  VIEWS.profile = function (v, arg) {
    baseProfile(v, arg);
    v.insertAdjacentHTML("beforeend", '<section class="card" style="margin-top:1rem"><h3>More</h3><div class="row"><a class="btn small" href="#/health">🩺 Mission health</a><a class="btn small" href="#/print">🖨 Worksheets and certificates</a><a class="btn small" href="#/calm">🌿 Calm and settings</a><a class="btn small" href="#/story">📜 Story</a><a class="btn small" href="#/install">📴 Offline guide</a><a class="btn small" href="#/playfair">🤝 Play fair</a></div></section>');
  };
  /* The streak chip explains rest days and comeback quests instead of nagging. */
  chain("route", function (name) {
    if (name === "bots" || name === "clash") return;
    var ss = AK.streakStatus(S(), new Date()), chip = Q("#hdr .flame, #hdr .chip[title^=\"Day streak\"]");
    if (chip && ss.rest) chip.title = "Rest day: weekends never break your streak.";
    if (chip && ss.rec && ss.rec.offer) chip.title = "Comeback quest: solve 3 missions today to restore your " + ss.rec.count + " day streak.";
  });
})();

/* AataKode v6 screens: real Go programs and Web pages as mission types, track status labels, track-level Test out,
   the placement quiz inside the goal chooser, learn-first cards, the daily review queue and a progress transfer code.
   Plugs into AK_CORE and AK_UI like ext4.js. */
(function () {
  "use strict";
  var C = window.AK_CORE, AK = window.AK, FX = window.AK_FX, UI = window.AK_UI;
  if (!C || !UI) return;
  var $ = C.$, $$ = C.$$, esc = C.esc, DATA = C.DATA, VIEWS = C.VIEWS, H = UI.hooks;
  var S = function () { return C.state(); };
  var sfx = function (n, a) { if (FX) FX.sound(n, a); };
  var buzz = function (p) { if (FX) FX.buzz(p); };
  var Q = function (s, r) { return (r || document).querySelector(s); };
  function chain(name, fn) { var prev = H[name]; H[name] = function () { var a = arguments, r; try { fn.apply(null, a); } catch (e) { /* polish never breaks play */ } return prev ? prev.apply(null, a) : r; }; }

  /* ---------------------------------------------------------------- v6 state */
  AK.v6 = function (st) {
    var v = st.v6 || (st.v6 = {});
    if (!v.trying) v.trying = {}; if (!v.pass) v.pass = {}; if (!v.learnSeen) v.learnSeen = {};
    if (!v.review || typeof v.review !== "object") v.review = { day: "", ids: [], done: {} };
    return v;
  };
  var baseMerge = AK.mergeState;
  AK.mergeState = function (cur, inc) {
    var out = baseMerge(cur, inc), a = AK.v6({ v6: cur.v6 }), b = AK.v6({ v6: inc.v6 }), o = AK.v6(out);
    ["pass", "learnSeen", "trying"].forEach(function (k) { o[k] = Object.assign({}, b[k], a[k]); });
    return out;
  };

  var md = function (t) {
    return String(t).split(/\n\n+/).map(function (p) { return "<p>" + esc(p).replace(/`([^`]+)`/g, '<code class="mono">$1</code>').replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>") + "</p>"; }).join("");
  };
  var codeBox = function (c) { return '<pre class="codepeek mono" style="white-space:pre-wrap;margin:.4rem 0">' + esc(c) + "</pre>"; };

  /* ---------------------------------------------------------------- shared finish path */
  function judge(m, w, results, code) {
    C.lightTests(m, results, function () {
      if (results.every(function (r) { return r.ok; })) { sfx("solved"); C.finishMission(m, w, { code: code, cleanPass: null }); }
      else { C.tries[m.id] = (C.tries[m.id] || 0) + 1; sfx("no"); buzz([30, 40, 30]); C.toast("Not yet. Read the failed checks and try again."); if (H.failed) H.failed(m); }
    });
  }
  var solvedNote = function (m) { var s = Q("#rewardSlot"); if (s) s.innerHTML = S().solved[m.id] ? '<div class="reward"><b>✔ You solved this mission.</b> <a href="#/map">Back to the map</a></div>' : ""; };
  var btnRow = function (extra) { return '<div class="row" style="margin-top:.6rem"><button class="btn primary" id="runBtn">▶ Run</button><button class="btn good" id="submitBtn">✔ ' + esc(C.t("submit")) + '</button><button class="btn small" id="resetBtn">↺ ' + esc(C.t("reset")) + "</button></div>" + (extra || ""); };

  /* ---------------------------------------------------------------- real Go programs */
  UI.mission.gocode = function (v, m, w) {
    v.innerHTML = C.missionFrame(m, {
      tabs: C.tabBtn("out", "Output", true) + C.tabBtn("compare", "Compare"),
      panels: '<div id="tab-out"><div class="out mono" id="outbox" aria-live="polite">Press Run to compile and run your program.</div><div id="errbox"></div><p class="muted" style="font-size:.82rem;margin-top:.6rem">🐹 Runs in a Go interpreter built into this page, checked against real <span class="mono">go run</span>. ' + esc(AK.GO_LIMITS || "") + "</p></div>",
    });
    C.bindHints(m); var show = C.bindTabs(m); C.setHeadStatus(m); C.refreshCompare(m); C.bindExplain(m);
    var ed = C.buildCodeEditor(m, $("#midpane"), function () {}), ta = $("#code");
    ta.setAttribute("aria-label", "Go editor. Press Escape then Tab to leave the editor.");
    $("#midpane").insertAdjacentHTML("beforeend", btnRow());
    function run() {
      show("out"); var r = AK.goRun(ta.value, { stdin: m.stdin || [] });
      $("#outbox").textContent = r.out || (r.err ? "" : "(the program printed nothing)");
      $("#errbox").innerHTML = r.err ? '<div class="err" role="alert"><b>' + (r.compile ? "Compile error" : r.code ? "Program stopped" : "Error") + '</b><pre class="mono" style="white-space:pre-wrap;margin:.3rem 0 0">' + esc(r.err) + "</pre></div>" : "";
    }
    $("#runBtn").onclick = run;
    $("#resetBtn").onclick = function () { ed.reset(); $("#outbox").textContent = "Press Run to compile and run your program."; $("#errbox").innerHTML = ""; };
    $("#submitBtn").onclick = function () { run(); judge(m, w, AK.goGrade(ta.value, m.tests), ta.value); };
    solvedNote(m);
  };

  /* ---------------------------------------------------------------- web pages */
  var webWaiting = {}, webSeq = 0, webPrev = null;
  window.addEventListener("message", function (e) {
    var d = e.data; if (!d || typeof d !== "object") return;
    if (d.ak === "web-result" && webWaiting[d.id]) { var cb = webWaiting[d.id]; delete webWaiting[d.id]; cb(d.results); }
    else if (d.ak === "web-console" && webPrev && e.source === webPrev.contentWindow) {
      var box = Q("#webcon"); if (!box) return;
      var line = document.createElement("div"); line.className = "mono " + (d.kind === "error" ? "conerr" : ""); line.textContent = (d.kind === "error" ? "✘ " : "› ") + d.text; box.appendChild(line);
    }
  });
  UI.mission.web = function (v, m, w) {
    v.innerHTML = C.missionFrame(m, {
      tabs: C.tabBtn("out", "Preview", true) + C.tabBtn("con", "Console") + C.tabBtn("compare", "Compare"),
      panels: '<div id="tab-out"><iframe id="webprev" title="Preview of your page" sandbox="allow-scripts" style="width:100%;height:340px;border:2px solid var(--line);border-radius:8px;background:#fff"></iframe><p class="muted" style="font-size:.82rem;margin:.4rem 0 0">🌐 Your page runs in a sandbox: it cannot reach the network or this site. Edit the HTML on the left; it updates as you type.</p></div><div id="tab-con" hidden><div class="out mono" id="webcon" aria-live="polite"></div></div>',
    });
    C.bindHints(m); var show = C.bindTabs(m); C.setHeadStatus(m); C.refreshCompare(m); C.bindExplain(m);
    var ed = C.buildCodeEditor(m, $("#midpane"), function () { clearTimeout(live); live = setTimeout(preview, 600); }), ta = $("#code"), live = null;
    ta.setAttribute("aria-label", "HTML, CSS and JavaScript editor. Press Escape then Tab to leave the editor.");
    $("#midpane").insertAdjacentHTML("beforeend", btnRow().replace("▶ Run", "↻ Refresh preview"));
    var frame = $("#webprev"); webPrev = frame;
    function preview() { var c = Q("#webcon"); if (c) c.innerHTML = ""; frame.srcdoc = AK.webSrcdoc(ta.value); }
    $("#runBtn").onclick = function () { show("out"); preview(); };
    $("#resetBtn").onclick = function () { ed.reset(); preview(); };
    $("#submitBtn").onclick = function () {
      var id = "w" + (++webSeq), done = false, g = document.createElement("iframe");
      g.setAttribute("sandbox", "allow-scripts"); g.setAttribute("aria-hidden", "true"); g.tabIndex = -1; g.style.cssText = "position:absolute;width:1024px;height:768px;left:-9999px;top:0;border:0";
      var finish = function (results) { if (done) return; done = true; delete webWaiting[id]; if (g.parentNode) g.parentNode.removeChild(g); judge(m, w, results, ta.value); };
      webWaiting[id] = finish; setTimeout(function () { finish(AK.webTests(m).map(function (t) { return { ok: false, label: t.label, hidden: t.hidden, got: "The page took too long. Is there a loop that never ends?" }; })); }, 6000);
      g.srcdoc = AK.webSrcdoc(ta.value, AK.webTests(m), id); document.body.appendChild(g);
    };
    preview(); solvedNote(m);
  };

  /* ---------------------------------------------------------------- learn-first card (concept, then practice) */
  var LEARN = {
    "sql-select": { c: "**SELECT** picks columns, **FROM** names the table, **WHERE** keeps matching rows and **ORDER BY** sorts them.", code: "SELECT name, price FROM products\nWHERE price > 50\nORDER BY price;", out: "Tamarind | 60\nJaggery | 90\nDal 1kg | 140\nRice 5kg | 320\nGhee | 560", note: "Clauses always come in this order: SELECT, FROM, WHERE, ORDER BY." },
    "sql-aggregate": { c: "**COUNT, SUM, AVG, MIN, MAX** summarise many rows into one value. **GROUP BY** makes one summary per group. **HAVING** filters groups; WHERE filters rows before grouping.", code: "SELECT category, COUNT(*) AS n\nFROM products\nGROUP BY category;", out: "dairy | 2\nfruit | 3\ngrain | 2\nspice | 2\nsweet | 1", note: "Every column in SELECT must be in GROUP BY or inside an aggregate." },
    "sql-joins": { c: "**JOIN** glues rows from two tables where the ON condition matches. **LEFT JOIN** keeps every row from the left table, with NULL on the right when nothing matches.", code: "SELECT c.name, o.id\nFROM customers c\nJOIN orders o ON o.customer_id = c.id;", out: "Asha | 1\nAsha | 2\nRavi | 3\n…", note: "One output row per matching pair. A customer with no orders is missing from a plain JOIN." },
    "sql-modify": { c: "**INSERT** adds rows, **UPDATE** changes rows and **DELETE** removes rows. UPDATE and DELETE without WHERE touch every row, and there is no undo.", code: "UPDATE products\nSET price = price * 1.1\nWHERE category = 'fruit';", out: "3 rows changed: Mango, Banana, Coconut", note: "Write the WHERE first, run it as a SELECT, then turn it into an UPDATE." },
    "sql-advanced": { c: "A **subquery** is a query inside brackets. A **CTE** (WITH ... AS) names a step. A **window function** (OVER) calculates across rows without collapsing them.", code: "WITH pricey AS (\n  SELECT name, price FROM products WHERE price > 100\n)\nSELECT name, ROW_NUMBER() OVER (ORDER BY price DESC) AS rank\nFROM pricey;", out: "Ghee | 1\nRice 5kg | 2\nDal 1kg | 3", note: "Build in steps: get the CTE right on its own first, then use it." },
    "sql-capstone": { c: "A real report is built in layers: one CTE per step, then a final SELECT that joins them. Check each layer on its own before you stack the next.", code: "WITH step1 AS (...),\n     step2 AS (SELECT ... FROM step1 ...)\nSELECT ... FROM step2 ...;", out: "(your report)", note: "If a result looks wrong, run the CTEs one at a time." },
    "git-basics": { c: "A repository stores snapshots called **commits**. `git add` stages a change, `git commit` saves the staged snapshot, `git status` and `git log` show where you are.", code: "git init\ngit add notes.txt\ngit commit -m \"first note\"", out: "[main (root-commit) abc1234] first note", note: "The staging area lets you choose exactly what goes into each commit." },
    "git-branches": { c: "A **branch** is a movable label on a commit. Make one to try something safely, then **merge** it back.", code: "git switch -c idea\n# ...edit and commit...\ngit switch main\ngit merge idea", out: "Fast-forward", note: "Branches are cheap. Use one per idea." },
    "git-undo": { c: "`git restore` throws away uncommitted edits. `git reset` moves a branch back. `git revert` adds a new commit that undoes an old one, which is the safe choice for shared history.", code: "git restore notes.txt\ngit revert HEAD", out: "[main def5678] Revert \"add typo\"", note: "Pick the least destructive undo that does the job." },
    "go-basics": { c: "A Go file starts with `package main`, imports what it uses and runs `func main()`. **:=** declares a variable and infers its type. Unused variables and imports are compile errors.", code: "package main\n\nimport \"fmt\"\n\nfunc main() {\n    name := \"Chilaka\"\n    fmt.Println(\"Hello,\", name, 7)\n}", out: "Hello, Chilaka 7", note: "Println puts spaces between its arguments and a newline at the end." },
    "go-data": { c: "A **slice** is a growing list, a **map** is a lookup table and a **struct** groups named fields.", code: "ages := map[string]int{\"asha\": 31}\nages[\"ravi\"] = 28\nfmt.Println(len(ages), ages[\"asha\"])", out: "2 31", note: "Reading a missing map key gives the zero value, not an error." },
    "go-flow": { c: "`for` is Go's only loop. A function can return several values, and **errors are values**: check `if err != nil` right after the call.", code: "n, err := strconv.Atoi(\"12x\")\nif err != nil {\n    fmt.Println(\"bad number\")\n    return\n}\nfmt.Println(n)", out: "bad number", note: "Handle the error where it happens, then carry on." },
    "go-write": { c: "From here you write whole programs. Your code runs in a Go interpreter built into the page, so compile errors, panics and output look like real `go run`. Unused variables and imports still fail.", code: "type Book struct {\n    Title string\n    Pages int\n}\n\nfunc (b Book) Long() bool { return b.Pages > 300 }", out: "(a type with a method)", note: "Methods hang off a type: b.Long()." },
    "go-project": { c: "Projects grow in steps. Each step builds on the last program, so keep your code tidy and let the tests tell you what to add next.", code: "// step 1: a Book\n// step 2: a Library of Books\n// step 3: a report", out: "(three small programs)", note: "Read the checks before you write: they are the spec." },
    "http-curl": { c: "**curl** sends HTTP requests. `-X` picks the method, `-H` adds a header, `-d` sends a body and `-i` shows the response headers. Status codes: 2xx worked, 4xx your mistake, 5xx the server's.", code: "curl -i https://api.example.com/users/7", out: "HTTP/1.1 200 OK\nContent-Type: application/json", note: "Always read the status code first." },
    "web-html": { c: "HTML is **tags** that describe content. A tag has an opening part and a closing part. **Attributes** such as href live inside the opening tag.", code: "<h1>Welcome</h1>\n<a href=\"https://eknathalabs.com\">Visit</a>", out: "A big heading, then a clickable link.", note: "The Preview tab shows your page as you type." },
    "web-css": { c: "A CSS rule is a **selector** plus braces holding `property: value;` pairs. Classes (.note) style many elements; an id (#hero) styles one.", code: ".note {\n  background: #fff3a0;\n  padding: 8px;\n}", out: "Every element with class note gets a yellow background.", note: "Change one property at a time and watch the preview." },
    "web-js": { c: "JavaScript finds elements, listens for **events** such as clicks and changes the page. The pattern is: find, listen, change.", code: "document.getElementById(\"btn\")\n  .addEventListener(\"click\", function () {\n    document.getElementById(\"out\").textContent = \"Hi!\";\n  });", out: "Clicking the button writes Hi!", note: "The Console tab shows errors and console.log." },
    "web-project": { c: "Build a page in layers: **structure** with HTML, **look** with CSS, **behaviour** with JavaScript. Finish each layer before the next.", code: "<main>…</main>      /* structure */\nmain { … }          /* look */\naddEventListener…   /* behaviour */", out: "(a working quiz page)", note: "Four steps, one per layer, plus a score." }
  };
  chain("route", function (name, arg) {
    if (name !== "mission") return;
    setTimeout(function () {
      var m = C.byId[String(arg || "").split("/")[0]], lp = Q("#leftpane"); if (!m || !lp || Q("#learnFirst")) return;
      var first = AK.regionMissions(DATA, m.region)[0]; if (!first || first.id !== m.id) return;
      var body = "", L = LEARN[m.region], lr = !L && AK.learnOf ? AK.learnOf(m, DATA) : null;
      if (L) body = md(L.c) + codeBox(L.code) + '<div class="muted" style="font-size:.85rem">Output</div><pre class="out mono" style="white-space:pre-wrap;margin:.2rem 0">' + esc(L.out) + "</pre>" + (L.note ? '<p class="muted" style="font-size:.85rem">' + esc(L.note) + "</p>" : "");
      else if (lr && lr.concept) {
        body = md(lr.concept); var ex = lr.example;
        if (ex) body += codeBox(ex.code) + (ex.output ? '<pre class="out mono" style="white-space:pre-wrap;margin:.2rem 0">' + esc(ex.output) + "</pre>" : "") + (ex.note ? '<p class="muted" style="font-size:.85rem">' + esc(ex.note) + "</p>" : "");
      }
      if (!body) return;
      var v6 = AK.v6(S()), seen = !!v6.learnSeen[m.region];
      lp.insertAdjacentHTML("afterbegin", '<details class="learnfirst" id="learnFirst"' + (seen ? "" : " open") + '><summary><b>📘 Learn first: ' + esc(C.lt(C.regionById[m.region], "title")) + "</b></summary>" + body + "</details>");
      Q("#learnFirst").addEventListener("toggle", function () { if (!Q("#learnFirst").open && !v6.learnSeen[m.region]) { v6.learnSeen[m.region] = 1; C.save(); } });
      if (!seen) { v6.learnSeen[m.region] = 1; C.save(); }
    }, 90);
  });

  /* ---------------------------------------------------------------- track status labels */
  var STATUS = {
    python: ["complete", "Complete", "Beginner to projects, with bosses and real-world jobs."],
    sql: ["complete", "Complete", "Select to windows and CTEs, plus a capstone report."],
    go: ["complete", "Complete", "Reading, fixing and writing whole Go programs, plus projects."],
    web: ["core", "Core", "HTML, CSS and JavaScript fundamentals and a project. No frameworks yet."],
    git: ["core", "Core", "Everyday Git: commits, branches and undo."],
    http: ["core", "Core", "HTTP, curl and APIs from Python."],
    ops: ["core", "Core", "Linux and shell troubleshooting cases."],
    career: ["core", "Core", "Python for DevOps and interview practice."],
    security: ["preview", "Preview", "A starter set. More to come."],
    arena: ["play", "Play", "Puzzles and games to keep skills sharp."],
    visual: ["play", "Play", "Visual puzzles."],
    games: ["play", "Play", "Tiny games to build."],
    projects: ["core", "Core", "Multi-step projects."],
    jobs: ["play", "Play", "Short real-world jobs."]
  };
  var KEY = { complete: "Complete: takes you from the basics to a project or capstone.", core: "Core: the main ideas, without a capstone yet.", preview: "Preview: a starter set, still growing.", play: "Play: practice and fun rather than a full course." };
  function trackStats(tr) {
    var regs = DATA.regions.filter(function (r) { return r.track === tr.id; }), n = 0; regs.forEach(function (r) { n += AK.regionMissions(DATA, r.id).length; });
    var mins = Math.round(n * 8); return { n: n, hours: mins >= 90 ? Math.round(mins / 60) + " h" : mins + " min", regions: regs };
  }
  function trackOfRegion(id) { var r = C.regionById[id]; return r ? r.track : ""; }

  /* ---------------------------------------------------------------- track-level Test out */
  function gauntlet(trackId) {
    var regs = DATA.regions.filter(function (r) { return r.track === trackId; }), n = regs.length, idx = [];
    if (n <= 3) regs.forEach(function (r, i) { idx.push(i); }); else idx = [0, Math.floor((n - 1) / 2), n - 1];
    var ids = [];
    idx.forEach(function (i) {
      var ms = AK.regionMissions(DATA, regs[i].id); if (!ms.length) return;
      var b = ms.filter(function (m) { return m.boss; })[0] || ms[ms.length - 1]; if (ids.indexOf(b.id) < 0) ids.push(b.id);
    });
    return ids;
  }
  var baseUnlocked = AK.isUnlocked;
  AK.isUnlocked = function (st, data, m, featuredId) {
    if (baseUnlocked(st, data, m, featuredId)) return true;
    var v6 = st.v6; if (!v6) return false; var tr = trackOfRegion(m.region); if (!tr) return false;
    if (v6.pass && v6.pass[tr]) return true;
    return !!(v6.trying && v6.trying[tr] && gauntlet(tr).indexOf(m.id) >= 0);
  };
  function checkPass() {
    var st = S(), v6 = AK.v6(st), got = [];
    Object.keys(v6.trying).forEach(function (tr) { if (v6.pass[tr]) return; var g = gauntlet(tr); if (g.length && g.every(function (id) { return st.solved[id]; })) { v6.pass[tr] = true; got.push(tr); } });
    if (got.length) { C.save(); sfx("solved"); got.forEach(function (tr) { var t = DATA.tracks.filter(function (x) { return x.id === tr; })[0]; C.toast("⚡ Tested out of " + (t ? t.title : tr) + "! Every mission in it is open for good."); }); }
  }
  chain("passed", checkPass); chain("solved", checkPass);

  VIEWS.testout = function (v, arg) {
    var st = S(), v6 = AK.v6(st), tid = String(arg || "");
    var tr = DATA.tracks.filter(function (x) { return x.id === tid; })[0];
    if (!tr) {
      v.innerHTML = '<div class="mhead"><a class="btn small" href="#/map">← Map</a><span class="tag">TEST OUT</span><h2>Already know it? Test out.</h2></div><p class="muted">Pick a track you already know. Beat a short gauntlet of its boss missions and the whole track opens for good. Your own solves still count for XP and mastery; skipped missions are not marked done.</p><div class="grid g3">' +
        DATA.tracks.filter(function (t) { return t.id !== "ops" || true; }).map(function (t) { var g = gauntlet(t.id); if (!g.length) return ""; return '<div class="card"><b>' + esc(C.lt(t, "title")) + '</b><div class="muted" style="font-size:.85rem">' + esc(t.blurb) + '</div><p style="margin:.5rem 0 0">' + (v6.pass[t.id] ? '<span class="chip gold">✔ Tested out</span>' : '<a class="btn small" href="#/testout/' + t.id + '">⚡ ' + g.length + " missions</a>") + "</p></div>"; }).join("") + "</div>";
      return;
    }
    var g = gauntlet(tr.id), passed = !!v6.pass[tr.id];
    var rows = g.map(function (id) { var m = C.byId[id], done = !!st.solved[id]; return "<li>" + (done ? "✔ " : "○ ") + (v6.trying[tr.id] || passed || done ? '<a href="#/mission/' + id + '">' + esc(m.title) + "</a>" : esc(m.title)) + ' <span class="muted">· ' + esc(C.lt(C.regionById[m.region], "title")) + "</span></li>"; }).join("");
    v.innerHTML = '<div class="mhead"><a class="btn small" href="#/testout">← All tracks</a><span class="tag">TEST OUT</span><h2>⚡ ' + esc(C.lt(tr, "title")) + '</h2></div>' +
      '<section class="card"><p>' + (passed ? "<b>✔ You tested out.</b> Every mission in this track is open and stays open." : "Solve all <b>" + g.length + "</b> missions below, in any order. Each is a boss or final project from across the track. When the last one passes, the whole track opens for good.") + '</p><ol class="pathlist" id="toList">' + rows + "</ol>" +
      (passed ? '<a class="btn primary" href="#/map">Open the map</a>' : '<button class="btn primary" id="toStart">' + (v6.trying[tr.id] ? "▶ Continue the gauntlet" : "⚡ Start the gauntlet") + "</button>") +
      '<p class="muted" style="font-size:.85rem;margin-top:.6rem">No penalty for failing. Hints work as usual, and you can stop and take the normal path any time.</p></section>';
    var b = Q("#toStart", v); if (b) b.onclick = function () { v6.trying[tr.id] = true; C.save(); var nx = g.filter(function (id) { return !st.solved[id]; })[0]; location.hash = "#/mission/" + (nx || g[0]); };
  };

  /* ---------------------------------------------------------------- map: status chips and Test out */
  var baseMap = VIEWS.map;
  VIEWS.map = function (v, arg) {
    baseMap(v, arg);
    var st = S(), v6 = AK.v6(st);
    $$(".track", v).forEach(function (el) {
      var h = Q("h3", el); if (!h) return; var tr = DATA.tracks.filter(function (t) { return C.lt(t, "title") === h.textContent; })[0]; if (!tr) return;
      var s = STATUS[tr.id], ts = trackStats(tr);
      h.insertAdjacentHTML("afterend", '<div class="trackmeta">' + (s ? '<span class="chip tstat tstat-' + s[0] + '" title="' + esc(s[2] + " " + KEY[s[0]]) + '">' + esc(s[1]) + "</span> " : "") + '<span class="muted" style="font-size:.82rem">' + ts.n + " missions · about " + ts.hours + "</span>" +
        (ts.regions.length > 1 && gauntlet(tr.id).length ? (v6.pass[tr.id] ? ' <span class="chip gold" style="margin-left:.4rem">✔ Tested out</span>' : ' <a class="btn small" style="margin-left:.4rem" data-tto="' + tr.id + '" href="#/testout/' + tr.id + '">⚡ Test out of this track</a>') : "") + "</div>");
    });
  };

  /* ---------------------------------------------------------------- placement quiz inside the goal chooser */
  var placeRow = '<p class="placeRow" id="placeRow">🎯 <b>Already know some?</b> <a class="btn small" id="chPlace" href="#/placement">Take the placement quiz</a> <span class="muted">Skip what you know. Earlier regions stay open.</span> <a class="btn small" href="#/testout">⚡ Or test out of a track</a></p>';
  var baseHome = VIEWS.home;
  VIEWS.home = function (v, arg) { baseHome(v, arg); var c = Q("#chooser", v); if (c && !Q("#placeRow", c)) { var grid = Q(".goalgrid", c); if (grid) grid.insertAdjacentHTML("afterend", placeRow); } renderReviewCard(v); };
  var basePath = VIEWS.path;
  VIEWS.path = function (v, arg) { basePath(v, arg); var grid = Q(".goalgrid", v); if (grid && !Q("#placeRow", v)) grid.insertAdjacentHTML("afterend", placeRow); };
  var basePlacement = VIEWS.placement;
  VIEWS.placement = function (v, arg) {
    basePlacement(v, arg);
    var mo = new MutationObserver(function () { if (/Your starting point/.test(v.textContent) && !Q("#poTest", v)) { var card = Q(".card", v); if (card) card.insertAdjacentHTML("afterend", '<p id="poTest" class="muted">Placement covers the Python Quest, and your result stays. Know Go, SQL, Git or Web already? <a href="#/testout">Test out of a track</a>.</p>'); } });
    mo.observe(v, { childList: true, subtree: true });
  };

  /* ---------------------------------------------------------------- daily review queue */
  function todayKey() { return AK.dateKey(new Date()); }
  function buildReview(st) {
    var v6 = AK.v6(st), day = todayKey(); if (v6.review.day === day && v6.review.ids.length) return v6.review;
    var cand = Object.keys(st.solved).map(function (id) { return C.byId[id]; }).filter(function (m) { return m && !m.boss && !m.project && !m.project_step && m.type !== "terminal" && m.type !== "lesson"; });
    var hash = function (s) { var h = 7; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
    cand.sort(function (a, b) { var qa = AK.missionQuality ? AK.missionQuality(st, a) : 1, qb = AK.missionQuality ? AK.missionQuality(st, b) : 1; return qa - qb || hash(day + a.id) - hash(day + b.id); });
    v6.review = { day: day, ids: cand.slice(0, 3).map(function (m) { return m.id; }), done: {} }; C.save(); return v6.review;
  }
  function renderReviewCard(v) {
    var st = S(); if (Object.keys(st.solved).length < 5 || Q("#reviewCard", v)) return;
    var rv = buildReview(st); if (!rv.ids.length) return;
    var n = rv.ids.filter(function (id) { return rv.done[id]; }).length, all = n === rv.ids.length;
    var html = '<section class="card reviewcard" id="reviewCard" aria-label="Daily review"><div class="row spread"><b>🔁 Daily review</b><span class="chip' + (all ? " gold" : "") + '">' + n + "/" + rv.ids.length + (all ? " ✔" : "") + '</span></div><p class="muted" style="margin:.3rem 0">' + (all ? "Done for today. See you tomorrow." : "Three quick replays of things you solved. They fade if you do not revisit them.") + '</p><div class="row" style="flex-wrap:wrap">' +
      rv.ids.map(function (id) { var m = C.byId[id]; return '<a class="btn small' + (rv.done[id] ? " good" : "") + '" href="#/mission/' + id + '">' + (rv.done[id] ? "✔ " : "") + esc(m.title) + "</a>"; }).join("") + "</div></section>";
    var anchor = Q("#pathBar", v) || Q(".hero", v); if (anchor) anchor.insertAdjacentHTML("afterend", html);
  }
  chain("passed", function (m) {
    var st = S(), rv = AK.v6(st).review; if (rv.day === todayKey() && rv.ids.indexOf(m.id) >= 0 && !rv.done[m.id]) {
      rv.done[m.id] = 1; C.save(); var left = rv.ids.filter(function (id) { return !rv.done[id]; }).length; C.toast(left ? "🔁 Review: " + left + " to go today." : "🔁 Daily review done. Nice."); }
  });

  /* ---------------------------------------------------------------- progress transfer code (profile) */
  function toCode() {
    var st = JSON.parse(JSON.stringify(S())); delete st.drafts;
    return "AK1." + btoa(unescape(encodeURIComponent(JSON.stringify(st))));
  }
  function fromCode(t) {
    t = String(t || "").replace(/\s+/g, ""); if (t.indexOf("AK1.") !== 0) throw new Error("bad");
    var inc = JSON.parse(decodeURIComponent(escape(atob(t.slice(4))))); if (!inc || inc.v !== 1 || typeof inc.solved !== "object") throw new Error("bad"); return inc;
  }
  var baseProfile = VIEWS.profile;
  VIEWS.profile = function (v, arg) {
    baseProfile(v, arg);
    var card = document.createElement("div"); card.className = "card transfer"; card.style.marginTop = "1rem";
    card.innerHTML = '<h3>🔄 Move to another device</h3><p class="muted" style="margin:.2rem 0 .6rem">Copy a code, paste it on the other device. Progress merges, nothing is overwritten. Drafts are not included. The file export above does the same job.</p>' +
      '<div class="row" style="flex-wrap:wrap"><button class="btn small" id="trMake">Make a transfer code</button><button class="btn small" id="trCopy" hidden>Copy</button></div><textarea class="input mono" id="trOut" rows="3" readonly hidden aria-label="Your transfer code" style="width:100%;margin-top:.5rem"></textarea>' +
      '<label class="muted" for="trIn" style="display:block;margin-top:.8rem">Paste a code from another device</label><textarea class="input mono" id="trIn" rows="3" style="width:100%" autocomplete="off" spellcheck="false"></textarea><div class="row" style="margin-top:.4rem"><button class="btn small good" id="trGo">Import code</button><span class="muted" id="trMsg" role="status"></span></div>';
    v.appendChild(card);
    $("#trMake", card).onclick = function () { var o = $("#trOut", card); o.value = toCode(); o.hidden = false; $("#trCopy", card).hidden = false; o.select(); };
    $("#trCopy", card).onclick = function () { var o = $("#trOut", card); o.select(); try { navigator.clipboard.writeText(o.value); C.toast("Code copied"); } catch (e) { document.execCommand("copy"); C.toast("Copied"); } };
    $("#trGo", card).onclick = function () {
      var msg = $("#trMsg", card);
      try {
        var inc = fromCode($("#trIn", card).value), st = S(), merged = AK.mergeState(st, inc);
        Object.keys(st).forEach(function (k) { delete st[k]; }); Object.assign(st, merged); C.save(); msg.textContent = "Imported ✔ progress merged."; C.renderHeader("profile");
      } catch (e) { msg.textContent = "That is not a valid AataKode transfer code."; }
    };
  };
})();

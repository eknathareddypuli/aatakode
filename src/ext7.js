/* AataKode v7 guide: a Chilaka-led coach-mark tour engine, nine tours plus "What's new", a tour checklist on Home,
   replay from Profile and an "Ask the guide" search (plain keyword matching, no AI, works offline).
   Rules: skippable, replayable, never blocks, steps with a missing target are skipped silently, Esc exits,
   respects reduced motion and calm mode, English with Telugu beside it. Telugu strings need a native review. */
(function () {
  "use strict";
  var C = window.AK_CORE, AK = window.AK, FX = window.AK_FX, UI = window.AK_UI;
  if (!C || !UI || !UI.x5) return;
  var X = UI.x5, $ = C.$, $$ = C.$$, esc = C.esc, DATA = C.DATA, VIEWS = C.VIEWS, H = UI.hooks;
  var S = function () { return C.state(); }, Q = X.Q, chain = X.chain;
  var RELEASE = "v7";

  /* ---------------------------------------------------------------- tour data */
  /* step: {t: target selector, en, te, wait: "none"|"click"|"input", optional: true => never counted as missing in tests} */
  var TOURS = [
    { id: "first60", icon: "👋", en: "First 60 seconds", te: "మొదటి 60 సెకన్లు", go: "#/home", auto: "home", steps: [
      { t: ".hero", en: "Welcome to AataKode. It is free, works offline and has no ads. I am Chilaka, your guide.", te: "AataKode కు స్వాగతం. ఇది ఉచితం, ఆఫ్‌లైన్‌లో పనిచేస్తుంది, ప్రకటనలు లేవు. నేను చిలక, మీ గైడ్." },
      { t: "#chooser", en: "Pick what you want to learn. You can change it any time from the Path page.", te: "మీరు ఏమి నేర్చుకోవాలనుకుంటున్నారో ఎంచుకోండి. తర్వాత Path పేజీలో మార్చుకోవచ్చు.", optional: true },
      { t: ".nav", en: "Everything lives here: the Map, the Village, the Daily puzzle, the Arena and more.", te: "అన్నీ ఇక్కడే: మ్యాప్, విలేజ్, డైలీ పజిల్, అరేనా ఇంకా మరెన్నో." },
      { t: "#seedChip", en: "Seeds are earned by learning. Spend them in the Village shop.", te: "నేర్చుకుంటే విత్తనాలు వస్తాయి. వాటిని విలేజ్ షాప్‌లో ఖర్చు చేయండి." },
      { t: "#playBtn", en: "Ready? Press this to start your first mission.", te: "సిద్ధమా? మీ మొదటి మిషన్ మొదలుపెట్టడానికి దీన్ని నొక్కండి.", wait: "click", optional: true }
    ] },
    { id: "mission", icon: "🧭", en: "Mission anatomy", te: "మిషన్ నిర్మాణం", go: "#/mission/py-01-hello", auto: "mission", steps: [
      { t: "#leftpane", en: "The story and the goal are here, with the checks your code must pass.", te: "కథ, లక్ష్యం, మీ కోడ్ పాస్ కావాల్సిన చెక్‌లు ఇక్కడ ఉంటాయి." },
      { t: "#midpane", en: "Write your code here. Try typing something, then continue.", te: "మీ కోడ్ ఇక్కడ రాయండి. ఏదైనా టైప్ చేసి కొనసాగండి.", wait: "input", inner: "#code" },
      { t: "#runBtn", en: "Run shows what your code prints. Nothing is graded yet.", te: "Run మీ కోడ్ ఏమి ప్రింట్ చేస్తుందో చూపిస్తుంది. ఇంకా గ్రేడింగ్ లేదు.", wait: "click" },
      { t: "#submitBtn", en: "Submit runs every check, including hidden ones. Pass them all to win XP.", te: "Submit అన్ని చెక్‌లను, దాచినవాటితో సహా, నడుపుతుంది. అన్నీ పాస్ అయితే XP వస్తుంది." },
      { t: "#hintSlot", en: "Stuck? Ask a free question or take a hint. Your first hint each day is free.", te: "ఇరుక్కున్నారా? ఉచితంగా ప్రశ్న అడగండి లేదా హింట్ తీసుకోండి. రోజుకు మొదటి హింట్ ఉచితం." },
      { t: "#explainSlot", en: "After you solve it, explain it in your own words. That is how it sticks.", te: "పరిష్కరించాక మీ మాటల్లో వివరించండి. అలా బాగా గుర్తుంటుంది.", optional: true }
    ] },
    { id: "map", icon: "🗺", en: "Map and path", te: "మ్యాప్ మరియు మార్గం", go: "#/map", auto: "map", steps: [
      { t: ".region", en: "Each card is a region, a place on your journey.", te: "ప్రతి కార్డు ఒక ప్రాంతం, మీ ప్రయాణంలో ఒక స్థలం." },
      { t: ".node", en: "Dots are missions. Green is done, gold is open and square ones are bosses.", te: "చుక్కలు మిషన్లు. ఆకుపచ్చ పూర్తయినవి, బంగారు రంగు తెరిచినవి, చతురస్రాలు బాస్‌లు." },
      { t: ".node.next", en: "The glowing dot is your next mission.", te: "మెరిసే చుక్క మీ తదుపరి మిషన్.", optional: true },
      { t: ".nav", en: "The Path page keeps your chosen goal and tracks in order.", te: "Path పేజీ మీ లక్ష్యాన్ని, ట్రాక్‌లను వరుసలో ఉంచుతుంది.", optional: true }
    ] },
    { id: "web", icon: "🌐", en: "Web mission", te: "వెబ్ మిషన్", go: "#/mission/wh-01-heading", type: "web", auto: "mission:web", steps: [
      { t: "#webprev", en: "A live preview of your page. Click any element in it and the editor jumps to its line.", te: "మీ పేజీ లైవ్ ప్రివ్యూ. ఏదైనా ఎలిమెంట్‌ను క్లిక్ చేస్తే ఎడిటర్ ఆ లైన్‌కు వెళ్తుంది." },
      { t: "#midpane", en: "Edit the HTML, CSS and JavaScript in one file. The preview refreshes as you type.", te: "HTML, CSS, JavaScript ఒకే ఫైల్‌లో ఎడిట్ చేయండి. టైప్ చేస్తే ప్రివ్యూ రిఫ్రెష్ అవుతుంది." },
      { t: "[data-tab=con]", en: "The Console tab shows your page's messages and errors.", te: "Console ట్యాబ్ మీ పేజీ సందేశాలు, లోపాలను చూపిస్తుంది." },
      { t: "#submitBtn", en: "Submit checks the page by really clicking and typing in it.", te: "Submit పేజీలో నిజంగా క్లిక్ చేసి, టైప్ చేసి పరీక్షిస్తుంది." }
    ] },
    { id: "go", icon: "🐹", en: "Go mission", te: "గో మిషన్", go: "#/mission/gow-01-hello", type: "gocode", auto: "mission:gocode", steps: [
      { t: "#midpane", en: "Write a real Go program. Unused variables and imports are errors, just like real Go.", te: "నిజమైన Go ప్రోగ్రామ్ రాయండి. వాడని వేరియబుల్స్, ఇంపోర్ట్‌లు లోపాలే, నిజమైన Go లాగానే." },
      { t: "#runBtn", en: "Run compiles and runs it right in your browser.", te: "Run మీ బ్రౌజర్‌లోనే కంపైల్ చేసి నడుపుతుంది." },
      { t: "#outbox", en: "Output appears here. Compile errors and panics look like the real thing.", te: "అవుట్‌పుట్ ఇక్కడ కనిపిస్తుంది. కంపైల్ లోపాలు, పానిక్‌లు నిజమైనవాటిలా ఉంటాయి." },
      { t: "#watchBtn", en: "Watch it run steps through your program line by line.", te: "Watch it run మీ ప్రోగ్రామ్‌ను లైన్ లైన్‌గా నడిపి చూపిస్తుంది.", optional: true }
    ] },
    { id: "sql", icon: "🗄", en: "SQL mission", te: "SQL మిషన్", go: "#/mission/sql-select-all", type: "sql", auto: "mission:sql", steps: [
      { t: "#leftpane", en: "The story names the table. Read the goal, then the checks.", te: "కథ టేబుల్ పేరు చెబుతుంది. లక్ష్యం, తర్వాత చెక్‌లు చదవండి." },
      { t: "#midpane", en: "Type your query here. SQL runs on a real database inside your browser.", te: "మీ క్వెరీ ఇక్కడ టైప్ చేయండి. SQL మీ బ్రౌజర్‌లోని నిజమైన డేటాబేస్‌లో నడుస్తుంది." },
      { t: "#runBtn", en: "Run shows the rows your query returns.", te: "Run మీ క్వెరీ తిరిగి ఇచ్చే వరుసలను చూపిస్తుంది." },
      { t: "#submitBtn", en: "Submit compares your rows with the expected result.", te: "Submit మీ వరుసలను ఆశించిన ఫలితంతో పోలుస్తుంది." }
    ] },
    { id: "boss", icon: "👾", en: "Boss fight", te: "బాస్ ఫైట్", go: "#/mission/gow-12-boss", type: "boss", auto: "mission:boss", steps: [
      { t: "#bossHp", en: "A boss mission has several checks. Each one you pass hits the boss.", te: "బాస్ మిషన్‌లో అనేక చెక్‌లు ఉంటాయి. ప్రతి పాస్ బాస్‌కు దెబ్బ." },
      { t: "#leftpane", en: "Read the goal carefully. Bosses test edge cases such as empty input.", te: "లక్ష్యాన్ని జాగ్రత్తగా చదవండి. బాస్‌లు ఖాళీ ఇన్‌పుట్ వంటి అంచు సందర్భాలను పరీక్షిస్తారు." },
      { t: "#hintSlot", en: "Hints work here too. A defeated boss gives bonus seeds.", te: "ఇక్కడా హింట్లు పనిచేస్తాయి. ఓడించిన బాస్ బోనస్ విత్తనాలు ఇస్తాడు." }
    ] },
    { id: "testout", icon: "⏩", en: "Test out and placement", te: "టెస్ట్ అవుట్ మరియు ప్లేస్‌మెంట్", go: "#/path", auto: "path", steps: [
      { t: ".gpick", en: "Choose a goal. Each goal is a short list of tracks in a sensible order.", te: "లక్ష్యాన్ని ఎంచుకోండి. ప్రతి లక్ష్యం సరైన క్రమంలో ట్రాక్‌ల చిన్న జాబితా." },
      { t: ".trackcard", en: "A track can be skipped with Test out: pass its check and the whole track opens.", te: "Test out తో ట్రాక్‌ను దాటవచ్చు: దాని పరీక్ష పాస్ అయితే మొత్తం ట్రాక్ తెరుచుకుంటుంది.", optional: true },
      { t: "#placeRow", en: "Already experienced? A short placement quiz skips you ahead, and you stay there.", te: "ఇప్పటికే అనుభవం ఉందా? చిన్న ప్లేస్‌మెంట్ క్విజ్ మిమ్మల్ని ముందుకు పంపుతుంది.", optional: true }
    ] },
    { id: "review", icon: "🌱", en: "Review garden", te: "రివ్యూ తోట", go: "#/home", auto: "home:review", steps: [
      { t: "#reviewCard", en: "Old lessons fade. A few quick questions each day keep them fresh.", te: "పాత పాఠాలు మరుగున పడతాయి. రోజూ కొన్ని ప్రశ్నలు వాటిని తాజాగా ఉంచుతాయి.", optional: true },
      { t: "#growCard", en: "Chilaka grows as you practise. Reviewing is the fastest way to grow.", te: "మీరు సాధన చేస్తే చిలక పెరుగుతుంది. రివ్యూ చేయడం వేగంగా పెరిగే మార్గం.", optional: true },
      { t: "#seedChip", en: "Review also earns seeds for your Village.", te: "రివ్యూతో మీ విలేజ్ కోసం విత్తనాలూ వస్తాయి." }
    ] }
  ];
  var NEW = { id: "new-" + RELEASE, icon: "✨", en: "What's new in v7", te: "v7 లో కొత్తవి", go: "#/home", steps: [
    { t: ".nav", en: "New: a Shell Scripting track, written in real bash and checked against real bash.", te: "కొత్తది: నిజమైన bash లో షెల్ స్క్రిప్టింగ్ ట్రాక్." },
    { t: "#seedChip", en: "New: Watch it run, hint-free similar examples and Teach Chilaka after each solve.", te: "కొత్తది: Watch it run, ఉచిత సారూప్య ఉదాహరణలు, ప్రతి పరిష్కారం తర్వాత Teach Chilaka." },
    { t: "#guideBtn", en: "New: tap ? any time to ask the guide a question.", te: "కొత్తది: ఎప్పుడైనా ? నొక్కి గైడ్‌ను ప్రశ్న అడగండి." }
  ] };
  var ALL = TOURS.concat([NEW]);
  var byId = {}; ALL.forEach(function (t) { byId[t.id] = t; });

  var lang = function () { return (S().settings || {}).lang === "te" ? "te" : "en"; };
  var txt = function (o, k) { return (lang() === "te" && o[k === "en" ? "te" : k + "_te"]) || o[k]; };
  var reduced = function () { var s = S().settings || {}; return s.motion === "reduce" || document.body.classList.contains("zen") || (s.motion === "auto" && window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); };
  var V = function () { return AK.v7(S()); };

  /* ---------------------------------------------------------------- engine */
  var run = null;
  function stop(done) {
    if (!run) return;
    var r = run; run = null;
    ["resize", "scroll"].forEach(function (e) { window.removeEventListener(e, r.reflow, true); });
    document.removeEventListener("keydown", r.key, true);
    if (r.unbind) r.unbind();
    clearTimeout(r.timer); if (r.ov && r.ov.parentNode) r.ov.parentNode.removeChild(r.ov);
    if (done) { V().tours.done[r.tour.id] = 1; C.save(); checkReward(); refreshCard(); }
    document.dispatchEvent(new CustomEvent("ak-tour-end", { detail: { id: r.tour.id, done: !!done } }));
  }
  function find(step) { var el = Q(step.t); if (el && el.getClientRects().length) return el; return null; }
  function waitFor(step, ms, cb) { var t0 = Date.now(); (function poll() { var el = find(step); if (el) return cb(el); if (!run || Date.now() - t0 > ms) return cb(null); setTimeout(poll, 150); })(); }
  function place(r) {
    if (!r.el) return;
    var rc = r.el.getBoundingClientRect(), pad = 6, sp = r.spot, pop = r.pop;
    sp.style.cssText = "left:" + (rc.left - pad) + "px;top:" + (rc.top - pad) + "px;width:" + (rc.width + pad * 2) + "px;height:" + (rc.height + pad * 2) + "px";
    var vw = window.innerWidth, vh = window.innerHeight, pw = Math.min(340, vw - 16), ph = pop.offsetHeight || 150, small = vw < 560, top, left;
    if (small) { pop.style.cssText = "left:8px;right:8px;bottom:8px;top:auto;width:auto"; return; }
    top = rc.bottom + 14; if (top + ph > vh - 8) top = Math.max(8, rc.top - ph - 14);
    if (top < 8) top = Math.min(vh - ph - 8, 8 + (rc.height > vh / 2 ? 0 : 0));
    left = Math.max(8, Math.min(vw - pw - 8, rc.left + rc.width / 2 - pw / 2));
    pop.style.cssText = "left:" + left + "px;top:" + top + "px;width:" + pw + "px";
  }
  function show(i, dir) {
    var r = run; if (!r) return;
    var tour = r.tour, step = tour.steps[i];
    if (!step) { stop(true); return; }
    r.i = i; if (r.unbind) { r.unbind(); r.unbind = null; }
    waitFor(step, step.optional ? 600 : 2500, function (el) {
      if (!run || run !== r) return;
      if (!el) { show(i + (dir || 1), dir); return; }          /* missing target: skip silently */
      r.el = el;
      try { el.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" }); } catch (e) { el.scrollIntoView(); }
      var n = tour.steps.length, wait = step.wait || "none", shown = 0, idx = i;
      tour.steps.forEach(function (s, k) { if (k <= i) shown = k + 1; });
      r.pop.innerHTML = '<div class="tp-head"><span class="tp-parrot" aria-hidden="true">🦜</span><b>' + esc(txt(tour, "en")) + '</b><span class="tp-count">' + (i + 1) + "/" + n + '</span></div>' +
        '<p class="tp-text">' + esc(txt(step, "en")) + "</p>" +
        '<div class="tp-actions"><button class="btn small" data-a="skip">' + (lang() === "te" ? "దాటవేయి" : "Skip tour") + "</button><span class=\"tp-sp\"></span>" +
        (i > 0 ? '<button class="btn small" data-a="back">←</button>' : "") +
        (wait === "none" ? '<button class="btn small primary" data-a="next">' + (i === n - 1 ? (lang() === "te" ? "పూర్తి" : "Done") : (lang() === "te" ? "తదుపరి" : "Next")) + " →</button>" : '<span class="tp-do">' + (lang() === "te" ? "ఇది చేసి కొనసాగండి" : "Do it to continue") + '</span><button class="btn small" data-a="next">' + (lang() === "te" ? "ఈ దశ దాటు" : "Skip step") + "</button>") + "</div>";
      var go = function (d) { show(i + d, d); };
      $$("[data-a]", r.pop).forEach(function (b) { b.onclick = function () { var a = b.dataset.a; if (a === "skip") stop(false); else if (a === "back") go(-1); else go(1); }; });
      var nb = Q('[data-a="next"]', r.pop); if (nb && !(nb.disabled)) { try { nb.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
      r.spot.classList.toggle("tp-still", reduced());
      if (wait === "click" || wait === "input") {
        var tgt = step.inner ? Q(step.inner) || el : el, ev = wait === "click" ? "click" : "input", fired = false;
        var h = function () { if (fired) return; if (wait === "input" && !String(tgt.value || "").length) return; fired = true; r.timer = setTimeout(function () { if (run === r) go(1); }, 350); };
        tgt.addEventListener(ev, h, true); r.unbind = function () { tgt.removeEventListener(ev, h, true); };
      }
      place(r); r.pop.setAttribute("aria-label", txt(tour, "en") + " " + (i + 1) + "/" + n);
      setTimeout(function () { if (run === r) place(r); }, reduced() ? 0 : 320);
    });
  }
  function start(id, opts) {
    var tour = byId[id]; if (!tour) return false;
    stop(false);
    var ov = document.createElement("div"); ov.id = "tour"; ov.className = "tour"; ov.setAttribute("role", "presentation");
    ov.innerHTML = '<div class="tp-spot"></div><div class="tp-pop" role="dialog" aria-live="polite"></div>';
    document.body.appendChild(ov);
    run = { tour: tour, i: 0, ov: ov, spot: Q(".tp-spot", ov), pop: Q(".tp-pop", ov), el: null };
    run.reflow = function () { if (run) place(run); };
    run.key = function (e) { if (e.key === "Escape" && run) { e.stopPropagation(); stop(false); } };
    window.addEventListener("resize", run.reflow, true); window.addEventListener("scroll", run.reflow, true); document.addEventListener("keydown", run.key, true);
    V().tours.seen[id] = 1; C.save();
    document.dispatchEvent(new CustomEvent("ak-tour-start", { detail: { id: id } }));
    show(0, 1); return true;
  }

  /* ---------------------------------------------------------------- go to a tour's own screen, then start it */
  function sampleFor(type) {
    var pool = DATA.missions.filter(function (m) { return type === "boss" ? m.boss && m.type !== "predict" : m.type === type; });
    var open = pool.filter(function (m) { return AK.isUnlocked(S(), DATA, m, []); });
    return (open[0] || null);
  }
  function startFromMenu(id) {
    var t = byId[id], hash = t.go;
    if (t.type) { var m = sampleFor(t.type); if (!m) { C.toast(lang() === "te" ? "ముందు అలాంటి మిషన్ తెరవండి." : "Unlock a mission of this kind first, then replay this tour."); return; } hash = "#/mission/" + m.id; }
    var go = function () { setTimeout(function () { start(id); }, 500); };
    if (location.hash === hash) { go(); } else { location.hash = hash; go(); }
  }

  /* ---------------------------------------------------------------- automatic first-time starts (never twice, never over another tour) */
  function auto(kind, m) {
    if (run) return;
    if (navigator.webdriver && !window.AK_TOUR_AUTO) return; /* automated browsers: no surprise overlays unless a test opts in */
    var seen = V().tours.seen, pick = null;
    ALL.forEach(function (t) { if (pick || !t.auto || seen[t.id]) return; if (t.auto === kind) pick = t; });
    if (!pick) return;
    if (pick.id !== "first60" && !seen.first60 && (S().xp || 0) === 0 && !Object.keys(S().solved || {}).length) return; /* brand new learners get the 60-second tour first */
    setTimeout(function () { if (!run && !document.querySelector(".boss-ov")) start(pick.id); }, 900);
  }
  chain("route", function (name, arg) {
    if (name === "home") {
      var v = V(), returning = Object.keys(S().solved || {}).length > 0 || S().goal;
      if (!v.tours.seen.first60 && !returning) auto("home");
      else if (!v.tours.seen["new-" + RELEASE] && returning) { if (navigator.webdriver && !window.AK_TOUR_AUTO) return; setTimeout(function () { if (!run) start("new-" + RELEASE); }, 900); }
      else if (Q("#reviewCard")) auto("home:review");
    } else if (name === "map") auto("map");
    else if (name === "path") auto("path");
    else if (name === "mission") {
      var m = C.byId[arg]; if (!m) return;
      if (m.boss) auto("mission:boss"); else if (m.type === "web" || m.type === "gocode" || m.type === "sql") auto("mission:" + m.type); else auto("mission");
    }
  });

  /* ---------------------------------------------------------------- checklist on Home, replay in Profile */
  function checklistHtml() {
    var done = V().tours.done, n = TOURS.filter(function (t) { return done[t.id]; }).length;
    return '<summary><b>🧭 ' + (lang() === "te" ? "టూర్లు" : "Guided tours") + '</b> <span class="chip' + (n === TOURS.length ? " gold" : "") + '">' + n + "/" + TOURS.length + "</span></summary>" +
      '<div class="tp-list">' + ALL.map(function (t) { return '<div class="row spread tp-row"><span>' + (done[t.id] ? "✅" : "▫️") + " " + t.icon + " " + esc(txt(t, "en")) + '</span><button class="btn small" data-tour="' + t.id + '">' + (done[t.id] ? (lang() === "te" ? "మళ్లీ" : "Replay") : (lang() === "te" ? "మొదలు" : "Start")) + "</button></div>"; }).join("") + "</div>" +
      '<p class="muted" style="font-size:.82rem;margin:.4rem 0 0">' + (lang() === "te" ? "తొమ్మిది టూర్లు పూర్తి చేస్తే 10 విత్తనాలు బోనస్." : "Finish all nine tours for a one-time bonus of 10 seeds.") + "</p>";
  }
  function bindCard(card) { $$("[data-tour]", card).forEach(function (b) { b.onclick = function () { startFromMenu(b.dataset.tour); }; }); }
  function refreshCard() { $$(".tourcard").forEach(function (c) { c.innerHTML = checklistHtml(); bindCard(c); }); }
  function checkReward() {
    var v = V(); if (v.rewards.tours) return;
    if (TOURS.every(function (t) { return v.tours.done[t.id]; })) { v.rewards.tours = 1; var sd = S().seeds || (S().seeds = { earned: 0, spent: 0 }); sd.earned += 10; C.save(); C.toast("🧭 All tours finished. +10 seeds"); if (C.renderHeader) C.renderHeader("home"); }
  }
  function makeCard() { var d = document.createElement("details"); d.className = "card tourcard"; d.innerHTML = checklistHtml(); bindCard(d); return d; }
  var baseHome = VIEWS.home;
  VIEWS.home = function (v, arg) {
    baseHome(v, arg);
    var anchor = Q("#reviewCard", v) || Q(".hero", v); if (!anchor || Q(".tourcard", v)) return;
    var c = makeCard(); if (anchor.id === "reviewCard") anchor.parentNode.insertBefore(c, anchor.nextSibling); else anchor.parentNode.insertBefore(c, anchor.nextSibling);
  };
  var baseProfile = VIEWS.profile;
  VIEWS.profile = function (v, arg) {
    baseProfile(v, arg);
    if (Q(".tourcard", v)) return;
    var c = makeCard(); c.open = true; v.appendChild(c);
  };

  /* ---------------------------------------------------------------- Ask the guide */
  var FAQ = [
    { q: "How do hints work?", te: "హింట్లు ఎలా పనిచేస్తాయి?", k: "hint hints stuck help clue free cost seeds", a: "Ask a question is always free. The first hint each day is free. After that a hint costs a few seeds, and the third hint is the full solution.", ta: "ప్రశ్న అడగడం ఎప్పుడూ ఉచితం. రోజుకు మొదటి హింట్ ఉచితం. తర్వాత హింట్‌కు కొన్ని విత్తనాలు, మూడో హింట్ పూర్తి పరిష్కారం.", tour: "mission" },
    { q: "Is there a hint that costs nothing?", te: "ఉచిత హింట్ ఉందా?", k: "similar example free hint nothing example show", a: "Yes. Press Show me a similar example. It shows a different, solved problem and never gives your answer away.", ta: "ఉంది. “Show me a similar example” నొక్కండి. ఇది మీ సమాధానాన్ని చెప్పకుండా వేరే పరిష్కరించిన సమస్యను చూపిస్తుంది." },
    { q: "How do I keep my streak?", te: "స్ట్రీక్ ఎలా నిలుపుకోవాలి?", k: "streak flame fire day freeze ice daily", a: "Solve or review one thing each day. A streak freeze (ice) saves you for one missed day. The flame flickers when your streak is at risk.", ta: "రోజుకు ఒకటి పరిష్కరించండి లేదా రివ్యూ చేయండి. స్ట్రీక్ ఫ్రీజ్ (మంచు) ఒక రోజు మిస్ అయితే కాపాడుతుంది." },
    { q: "What are seeds?", te: "విత్తనాలు అంటే ఏమిటి?", k: "seeds seed coins currency shop village spend earn", a: "Seeds are earned by solving missions, reviewing and beating bosses. Spend them in the Village shop on plants, buildings and outfits.", ta: "మిషన్లు పరిష్కరిస్తే, రివ్యూ చేస్తే, బాస్‌లను ఓడిస్తే విత్తనాలు వస్తాయి. విలేజ్ షాప్‌లో ఖర్చు చేయండి." },
    { q: "How do I change my goal or path?", te: "లక్ష్యం ఎలా మార్చాలి?", k: "goal path change switch track choose learn", a: "Open the Path page and pick another goal. Your progress is kept.", ta: "Path పేజీ తెరిచి మరో లక్ష్యాన్ని ఎంచుకోండి. మీ ప్రగతి భద్రంగా ఉంటుంది.", link: "#/path", tour: "testout" },
    { q: "What is Test out?", te: "టెస్ట్ అవుట్ అంటే?", k: "test out skip ahead placement experienced know already quiz", a: "If you already know a track, take its Test out. Pass it and the whole track opens. The placement quiz does the same for a goal.", ta: "ట్రాక్ ఇప్పటికే తెలిస్తే Test out తీసుకోండి. పాస్ అయితే మొత్తం ట్రాక్ తెరుచుకుంటుంది.", link: "#/path", tour: "testout" },
    { q: "What is a boss mission?", te: "బాస్ మిషన్ అంటే?", k: "boss fight villain final hp wasp spider", a: "A boss is the last mission of a region. It has several checks, including hidden edge cases, and each check you pass hits the boss.", ta: "బాస్ ప్రాంతంలో చివరి మిషన్. దీనిలో దాచిన అంచు సందర్భాలతో సహా అనేక చెక్‌లు ఉంటాయి.", tour: "boss" },
    { q: "How do I run my code?", te: "కోడ్ ఎలా నడపాలి?", k: "run code execute submit check output press", a: "Run shows the output and grades nothing. Submit runs every check. Ctrl+Enter runs your code.", ta: "Run అవుట్‌పుట్ చూపిస్తుంది, గ్రేడ్ చేయదు. Submit అన్ని చెక్‌లు నడుపుతుంది. Ctrl+Enter కూడా పనిచేస్తుంది.", tour: "mission" },
    { q: "Can I watch my code run line by line?", te: "కోడ్‌ను లైన్ లైన్‌గా చూడవచ్చా?", k: "step watch visualizer visualise debug trace variables line", a: "Yes. Press Watch it run in a Python or Go mission. It highlights the current line and shows your variables as boxes.", ta: "అవును. Python లేదా Go మిషన్‌లో Watch it run నొక్కండి. ప్రస్తుత లైన్‌ను హైలైట్ చేసి వేరియబుల్స్‌ను పెట్టెలుగా చూపిస్తుంది." },
    { q: "Does it work offline?", te: "ఆఫ్‌లైన్‌లో పనిచేస్తుందా?", k: "offline internet wifi install pwa airplane", a: "Yes. After the first load everything runs in your browser. Nothing is sent anywhere.", ta: "అవును. మొదటి లోడ్ తర్వాత అంతా మీ బ్రౌజర్‌లోనే నడుస్తుంది. ఏదీ ఎక్కడికీ పంపబడదు." },
    { q: "How do I back up or move my progress?", te: "ప్రగతిని ఎలా బ్యాకప్ చేయాలి?", k: "backup export import transfer code save move device progress", a: "Open Profile and use the transfer code or the export file. Paste or import it on another device.", ta: "Profile తెరిచి ట్రాన్స్‌ఫర్ కోడ్ లేదా ఎక్స్‌పోర్ట్ ఫైల్ వాడండి. మరో పరికరంలో ఇంపోర్ట్ చేయండి.", link: "#/profile" },
    { q: "How do I change language, theme or motion?", te: "భాష, థీమ్ ఎలా మార్చాలి?", k: "language telugu theme dark light motion calm zen quiet sound settings reduce", a: "Use the language menu and the moon button in the top bar. Profile has settings for motion, sound and calm mode.", ta: "పై బార్‌లో భాష మెను, చంద్రుడి బటన్ వాడండి. Profile లో మోషన్, సౌండ్, కామ్ మోడ్ సెట్టింగ్‌లు ఉన్నాయి.", link: "#/profile" },
    { q: "What is the Village?", te: "విలేజ్ అంటే?", k: "village building plants garden decorate shop", a: "The Village is where your seeds turn into plants and buildings. Finished regions light up their building.", ta: "విలేజ్‌లో మీ విత్తనాలు మొక్కలు, భవనాలుగా మారతాయి. పూర్తయిన ప్రాంతం భవనం వెలుగుతుంది.", link: "#/village" },
    { q: "What is the daily review?", te: "డైలీ రివ్యూ అంటే?", k: "review daily spaced repetition forget garden memory", a: "A few quick questions from lessons you solved before, so they stay in memory.", ta: "మీరు ఇంతకు ముందు పరిష్కరించిన పాఠాల నుండి కొన్ని త్వరిత ప్రశ్నలు.", tour: "review" },
    { q: "What is Teach Chilaka?", te: "Teach Chilaka అంటే?", k: "teach chilaka explain parrot understand", a: "After you solve a mission, explain it to Chilaka in your own words. Teaching is the best way to find gaps.", ta: "మిషన్ పరిష్కరించాక చిలకకు మీ మాటల్లో వివరించండి. బోధించడం ఖాళీలను కనుగొనే ఉత్తమ మార్గం." },
    { q: "Where is shell scripting?", te: "షెల్ స్క్రిప్టింగ్ ఎక్కడ?", k: "shell bash script scripting sh linux terminal", a: "Pick Write shell scripts on the Path page. Scripts run in a bash subset inside your browser.", ta: "Path పేజీలో “Write shell scripts” ఎంచుకోండి. స్క్రిప్టులు మీ బ్రౌజర్‌లోని bash ఉపసమితిలో నడుస్తాయి.", link: "#/path" },
    { q: "How do I click a page element to find its code?", te: "ఎలిమెంట్ కోడ్ ఎలా కనుగొనాలి?", k: "web preview click element line jump html css highlight changed", a: "In a Web mission, click any element in the preview. The editor jumps to the line that made it. Changed elements flash after a refresh.", ta: "Web మిషన్‌లో ప్రివ్యూలో ఏ ఎలిమెంట్‌నైనా క్లిక్ చేయండి. ఎడిటర్ ఆ లైన్‌కు వెళ్తుంది.", tour: "web" }
  ];
  AK.askGuide = function (query) {
    var tokens = String(query).toLowerCase().split(/[^a-z0-9ఀ-౿]+/).filter(function (w) { return w.length > 1; });
    if (!tokens.length) return [];
    return FAQ.map(function (f) {
      var hay = (f.k + " " + f.q).toLowerCase(), score = 0;
      tokens.forEach(function (t) { if (hay.split(/\s+/).indexOf(t) >= 0) score += 3; else if (hay.indexOf(t) >= 0) score += 1; if ((f.te || "").indexOf(t) >= 0) score += 2; });
      return { f: f, score: score };
    }).filter(function (x) { return x.score > 0; }).sort(function (a, b) { return b.score - a.score; }).slice(0, 4).map(function (x) { return x.f; });
  };
  function guidePanel() {
    var p = Q("#guidePanel"); if (p) { p.remove(); return; }
    p = document.createElement("section"); p.id = "guidePanel"; p.className = "card guidepanel"; p.setAttribute("role", "dialog"); p.setAttribute("aria-label", "Ask the guide");
    p.innerHTML = '<div class="row spread"><b>🦜 ' + (lang() === "te" ? "గైడ్‌ను అడగండి" : "Ask the guide") + '</b><button class="btn small" id="guideX" aria-label="Close">✕</button></div>' +
      '<input class="input" id="guideQ" placeholder="' + (lang() === "te" ? "ఉదా: హింట్, స్ట్రీక్, ఆఫ్‌లైన్" : "e.g. hints, streak, offline") + '" aria-label="Your question" autocomplete="off"><div id="guideA" aria-live="polite"></div>' +
      '<div class="muted" style="font-size:.8rem">' + (lang() === "te" ? "ఇది కీవర్డ్ శోధన. AI కాదు, ఆఫ్‌లైన్‌లో పనిచేస్తుంది." : "Keyword search. No AI, works offline.") + "</div>";
    document.body.appendChild(p);
    var out = Q("#guideA", p);
    function list(items) {
      out.innerHTML = items.map(function (f, i) { return '<div class="hintbox"><b>' + esc(lang() === "te" && f.te ? f.te : f.q) + "</b><br>" + esc(lang() === "te" && f.ta ? f.ta : f.a) + (f.tour || f.link ? '<div class="row" style="margin-top:.3rem">' + (f.tour ? '<button class="btn small" data-t="' + f.tour + '">🧭 ' + (lang() === "te" ? "టూర్" : "Show me") + "</button>" : "") + (f.link ? '<a class="btn small" href="' + f.link + '">' + (lang() === "te" ? "తెరువు" : "Open") + "</a>" : "") + "</div>" : "") + "</div>"; }).join("") || '<p class="muted">' + (lang() === "te" ? "ఏదీ దొరకలేదు. వేరే పదాలు ప్రయత్నించండి." : "Nothing found. Try other words, such as hint, streak or offline.") + "</p>";
      $$("[data-t]", out).forEach(function (b) { b.onclick = function () { p.remove(); startFromMenu(b.dataset.t); }; });
    }
    list(FAQ.slice(0, 4));
    Q("#guideQ", p).oninput = function (e) { var q = e.target.value.trim(); list(q ? AK.askGuide(q) : FAQ.slice(0, 4)); };
    Q("#guideX", p).onclick = function () { p.remove(); };
    p.addEventListener("keydown", function (e) { if (e.key === "Escape") p.remove(); });
    Q("#guideQ", p).focus();
  }
  function ensureGuideBtn() {
    if (Q("#guideBtn")) return;
    var b = document.createElement("button"); b.id = "guideBtn"; b.className = "guidebtn"; b.type = "button"; b.setAttribute("aria-label", "Ask the guide"); b.title = "Ask the guide"; b.textContent = "?";
    b.onclick = guidePanel; document.body.appendChild(b);
  }
  ensureGuideBtn();
  chain("route", function () { ensureGuideBtn(); });

  window.AK_TOUR = { TOURS: ALL, FAQ: FAQ, start: start, stop: stop, active: function () { return run ? run.tour.id : null; }, find: find, startFromMenu: startFromMenu, sampleFor: sampleFor };
})();

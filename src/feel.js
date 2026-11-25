/* AataKode v3 feel and culture: Chilaka's growth, streak flame, hearts, damage and heal, pager and "all quiet",
   tiered celebrations, seed rain, weather and festival decorations in the village, muggu (kolam) art, page-turn transitions. */
(function () {
  "use strict";
  var C = window.AK_CORE, AK = window.AK, FX = window.AK_FX, UI = window.AK_UI;
  if (!C || !FX || !UI) return;
  var $ = C.$, $$ = C.$$, esc = C.esc, H = UI.hooks;
  var S = function () { return C.state(); };
  var calm = function () { return C.reducedMotion(); };
  var wrap = function (name, fn) { var prev = H[name]; H[name] = function () { var a = arguments; try { fn.apply(null, a); } catch (e) { /* feel must never break play */ } return prev ? prev.apply(null, a) : undefined; }; };

  /* ---------------------------------------------------------------- streak flame */
  UI.flame = function (st, freezes) {
    var n = st.count, tier = n >= 100 ? 3 : n >= 30 ? 2 : n >= 7 ? 1 : n >= 1 ? 0 : -1, size = [18, 21, 25, 29][Math.max(0, tier)];
    var d = 'M12 1 C13.5 8 21 11 21 20 A9 9 0 0 1 3 20 C3 15 7 13 8 8 C10 10.5 11 8 12 1 Z', inner = 'M12 14 C14 17 17 18 17 21.5 A5 5 0 0 1 7 21.5 C7 19.5 9 18.5 9.5 16 C10.5 17 11.5 16 12 14 Z';
    var cls = "flame t" + (tier < 0 ? "x" : tier) + (st.atRisk ? " ember" : "");
    var svg = '<svg class="' + cls + '" width="' + size + '" height="' + Math.round(size * 1.3) + '" viewBox="0 0 24 31" aria-hidden="true"><defs><linearGradient id="flg" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff5a36"/><stop offset=".6" stop-color="#ff9a2e"/><stop offset="1" stop-color="#ffd84a"/></linearGradient></defs><path d="' + d + '" fill="' + (tier < 0 ? "none" : "url(#flg)") + '" stroke="' + (tier < 0 ? "#8f8cc4" : "#ff5a36") + '" stroke-width="1.4"/>' + (tier >= 0 ? '<path d="' + inner + '" fill="#fff3b0" opacity=".9"/>' : "") + (tier >= 3 ? '<circle class="sp s1" cx="4" cy="6" r="1.4" fill="#ffd84a"/><circle class="sp s2" cx="20" cy="9" r="1.2" fill="#ffd84a"/>' : "") + "</svg>";
    return '<span class="chip flamechip" title="Day streak' + (st.atRisk ? " (learn today to keep the flame)" : "") + '">' + svg + " " + n + (freezes ? " ❄" + freezes : "") + "</span>";
  };

  /* ---------------------------------------------------------------- small effects */
  var layer = function (cls, ms) { var el = document.createElement("div"); el.className = cls; el.setAttribute("aria-hidden", "true"); document.body.appendChild(el); setTimeout(function () { el.remove(); }, ms || 1200); return el; };
  FX.flinch = function () {
    var g = $("#mgrid") || $("#view"); if (!g) return;
    if (!calm()) { g.classList.remove("flinch"); void g.offsetWidth; g.classList.add("flinch"); layer("vignette bad", 600); }
    floatText("−1 ❤", "dmg");
  };
  FX.pulse = function (kind) { var g = $("#mgrid") || $("#view"); if (!g || calm()) return; g.classList.remove("heal"); void g.offsetWidth; g.classList.add("heal"); void kind; };
  function floatText(txt, cls) {
    if (calm()) return; var b = $("#submitBtn") || $("#reportBtn") || $("#mgrid"); if (!b) return; var r = b.getBoundingClientRect(), el = document.createElement("div");
    el.className = "floatx " + (cls || ""); el.textContent = txt; el.style.left = r.left + r.width / 2 + "px"; el.style.top = r.top + "px"; document.body.appendChild(el); setTimeout(function () { el.remove(); }, 1100);
  }
  function rollNumber(el, from, to, suffix) {
    if (!el || calm() || from === to) return; var t0 = performance.now(), dur = 700;
    var f = function (t) { var k = Math.min(1, (t - t0) / dur), val = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))); el.textContent = val + (suffix || ""); if (k < 1) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }

  /* hearts: cosmetic only, they come back every visit and never block anything */
  var hearts = { id: null, n: 3 };
  function paintHearts() { var el = $("#hearts"); if (el) el.innerHTML = "❤".repeat(hearts.n) + '<span class="lost">' + "🖤".repeat(3 - hearts.n) + "</span>"; }
  function mountHearts(name, arg) {
    if (name !== "mission") { hearts.id = null; return; }
    var id = String(arg).split("/")[0], m = C.byId[id], hd = $(".mhead"); if (!m || !hd || m.type === "lesson" || m.type === "predict") return;
    if (hearts.id !== id) { hearts.id = id; hearts.n = 3; }
    if (!$("#hearts")) { var s = document.createElement("span"); s.id = "hearts"; s.className = "chip hearts"; s.title = "Hearts are just for fun. They come back every visit and never block you."; hd.appendChild(s); }
    paintHearts();
  }
  wrap("failed", function () { if (hearts.id) { hearts.n = Math.max(0, hearts.n - 1); paintHearts(); } FX.flinch(); });

  /* ---------------------------------------------------------------- pager and "all quiet" for outages */
  var pagerSeen = {};
  FX.pager = function (m) {
    if (pagerSeen[m.id] || S().solved[m.id]) return; pagerSeen[m.id] = 1;
    FX.sound("no"); setTimeout(function () { FX.sound("no"); }, 280); FX.buzz([120, 80, 120, 80, 240]);
    if (calm()) return;
    var el = layer("pager", 2300);
    el.innerHTML = '<div class="pgbox"><div class="pgled"></div><div class="mono">PAGE · SEV-2</div><b>' + esc(m.title) + '</b><div class="muted">You are on call. Open the terminal.</div></div>';
    document.body.classList.add("redflash"); setTimeout(function () { document.body.classList.remove("redflash"); }, 900);
  };
  FX.allQuiet = function () {
    FX.sound("solved"); [1568, 1760, 2093, 1760].forEach(function (f, i) { setTimeout(function () { FX.sound("star"); }, 300 + i * 160); });
    if (calm()) return; var el = layer("quiet", 2600); el.innerHTML = '<div class="qbox"><div style="font-size:2rem">🐦 🌿 🐦</div><b>All quiet.</b><div class="muted">The service is healthy again.</div></div>';
  };

  /* ---------------------------------------------------------------- celebrations: seeds, sparks, fireworks, hatch */
  function burst(chars, n, cls) {
    if (calm()) return; var box = layer("confetti " + (cls || ""), 2800);
    for (var i = 0; i < n; i++) { var p = document.createElement("i"), t = chars[i % chars.length]; p.textContent = t; p.className = "em"; p.style.left = Math.random() * 100 + "%"; p.style.animationDelay = Math.random() * 0.6 + "s"; p.style.fontSize = 14 + Math.random() * 16 + "px"; box.appendChild(p); }
  }
  function fireworks() {
    if (calm()) return; var cv = document.createElement("canvas"); cv.className = "fwcanvas"; cv.width = innerWidth; cv.height = innerHeight; cv.setAttribute("aria-hidden", "true"); document.body.appendChild(cv);
    var x = cv.getContext("2d"), P = [], cols = ["#f2b531", "#ff7a6b", "#4ade9f", "#74c7ff", "#fff3b0"], t0 = performance.now();
    function boom(cx, cy) { var c = cols[Math.floor(Math.random() * cols.length)]; for (var i = 0; i < 46; i++) { var a = Math.random() * 6.283, s = 1.5 + Math.random() * 4.2; P.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, l: 1, c: c }); } }
    [0, 300, 650, 950].forEach(function (d, i) { setTimeout(function () { boom(cv.width * (0.2 + 0.2 * i + Math.random() * 0.1), cv.height * (0.22 + Math.random() * 0.2)); FX.sound("star"); }, d); });
    (function f(t) {
      x.clearRect(0, 0, cv.width, cv.height);
      P.forEach(function (p) { p.x += p.vx; p.y += p.vy; p.vy += 0.07; p.vx *= 0.985; p.l -= 0.012; if (p.l > 0) { x.globalAlpha = p.l; x.fillStyle = p.c; x.beginPath(); x.arc(p.x, p.y, 2.4, 0, 6.283); x.fill(); } });
      if (t - t0 < 2800) requestAnimationFrame(f); else cv.remove();
    })(t0);
  }
  FX.hatch = function (stage) {
    var names = C.STAGE_NAMES; FX.sound("levelup"); FX.buzz([40, 60, 40, 60, 120]);
    var el = layer("hatch", 3200); el.innerHTML = '<div class="hbox"><div class="hold">' + C.parrot(120, "none", Math.max(0, stage - 1)) + '</div><div class="hnew">' + C.parrot(120, null, stage) + '</div><b class="mono">Chilaka is now a ' + esc(names[stage]) + '!</b><div class="muted">Keep solving to see the next form.</div></div>';
    if (calm()) { el.classList.add("still"); }
  };
  H.celebrate = function (m, res) {
    try {
      var big = res && res.regionDone, spark = m.boss || m.project || (m.project_step && !AK.regionMissions(C.DATA, m.region).some(function (x) { return !S().solved[x.id] && x.id !== m.id; }));
      if (big) { fireworks(); burst(["🪔", "🌟", "🎉"], 22); }
      else if (spark) burst(["✨", "⭐", "💥"], 30, "sparks");
      else burst(["🌱", "🌱", "🍃", "✨"], 20);
      if (res && res.stageUp) setTimeout(function () { FX.hatch(S().stage); }, 1200);
    } catch (e) { return false; }
    return true;
  };
  wrap("solved", function (m, res) {
    FX.pulse("good"); var t = $(".chip.gold"); if (t && /XP/.test(t.textContent) && res && res.gained) { var to = S().xp; rollNumber(t, to - res.gained, to, " XP"); }
    if (m.region === "debug-the-outage" && m.type === "terminal") setTimeout(FX.allQuiet, 500);
    if (res && res.festival) C.toast("🪔 Festival bonus: +" + res.festival.seeds + " 🌱");
  });

  /* ---------------------------------------------------------------- seed rain, quest feed, saved hook */
  var lastBal = null, lastXp = null;
  FX.seedRain = function (n) {
    var chip = $("#seedChip"); if (!chip || calm()) return; var r = chip.getBoundingClientRect(), box = layer("seedrain", 1700), cnt = Math.min(14, 3 + n);
    for (var i = 0; i < cnt; i++) {
      var s = document.createElement("span"); s.textContent = "🌱"; s.className = "sd"; s.style.left = r.left + r.width / 2 - 60 + Math.random() * 120 + "px"; s.style.top = "-30px"; s.style.setProperty("--dx", r.left + r.width / 2 + "px"); s.style.setProperty("--dy", r.top + 4 + "px"); s.style.animationDelay = i * 0.06 + "s"; box.appendChild(s);
    }
    chip.classList.remove("bump"); void chip.offsetWidth; chip.classList.add("bump");
  };
  H.saved = function () {
    var st = S(), bal = AK.seedBalance(st);
    if (lastBal !== null && bal > lastBal) { var n = bal - lastBal, num = $("#seedNum"); FX.sound("coin"); FX.seedRain(n); if (num) rollNumber(num, lastBal, bal, ""); }
    lastBal = bal; lastXp = st.xp;
    var feed = AK.drainFeed();
    feed.forEach(function (f) {
      if (f.kind === "goal") { C.toast("🎯 Quest done: " + f.text + " (+" + f.seeds + " 🌱)"); FX.sound("star"); }
      else { C.toast("🎁 Quest chest! +" + f.seeds + " 🌱 and +" + f.xp + " XP"); FX.sound("solved"); burst(["🎁", "🌱", "✨"], 24); }
    });
    if (feed.length) { var q = $('a.chip[href="#/quests"]'); if (q && UI.questChip) q.outerHTML = UI.questChip(); }
  };
  lastBal = AK.seedBalance(S());

  /* ---------------------------------------------------------------- culture: places, festivals, muggu */
  FX.PLACES = [
    { n: "Hampi", st: "Karnataka", fact: "Ruins of the Vijayanagara capital, with a famous stone chariot." },
    { n: "Lepakshi", st: "Andhra Pradesh", fact: "A temple known for its hanging pillar and a huge monolithic Nandi." },
    { n: "Tirupati", st: "Andhra Pradesh", fact: "Home of the Venkateswara temple on the Tirumala hills." },
    { n: "Madurai", st: "Tamil Nadu", fact: "The Meenakshi temple rises in towers of painted sculpture." },
    { n: "Thanjavur", st: "Tamil Nadu", fact: "The Brihadisvara temple, built by the Cholas, is a World Heritage Site." },
    { n: "Mysuru", st: "Karnataka", fact: "Its palace is lit with thousands of bulbs during Dasara." },
    { n: "Kochi", st: "Kerala", fact: "Chinese fishing nets line the old harbour." },
    { n: "Araku", st: "Andhra Pradesh", fact: "A hill valley known for its coffee." },
    { n: "Charminar", st: "Telangana", fact: "A 1591 monument with four minarets in the heart of Hyderabad." },
    { n: "Alappuzha", st: "Kerala", fact: "Houseboats glide through its backwaters." },
    { n: "Mahabalipuram", st: "Tamil Nadu", fact: "Rock-cut temples and a shore temple by the sea." },
    { n: "Gandikota", st: "Andhra Pradesh", fact: "A gorge on the Penna river, often called India's Grand Canyon." },
  ];
  FX.festivalCard = function () {
    var f = AK.festivalFor(new Date()); if (!f) return ""; var lang = S().settings.lang;
    return '<div class="card festcard"><div class="row spread"><div><span class="tag">TODAY</span><h3 style="margin:.3rem 0 .1rem">' + f.icon + " " + esc(AK.festivalHello(f, lang)) + '</h3><div class="muted">' + esc(AK.festivalName(f, lang)) + " · " + esc(f.line) + '</div></div><span class="chip gold">First solve today: +3 🌱</span></div></div>';
  };
  /* Muggu / kolam: grows ring by ring as you solve missions. */
  FX.muggu = function (frac, size) {
    if (frac === undefined) { var tot = C.DATA.missions.length, got = Object.keys(S().solved).length; frac = got / Math.max(1, tot); }
    size = size || 220; var rows = [1, 3, 5, 7, 5, 3, 1], gap = 26, dots = [];
    rows.forEach(function (n, r) { for (var i = 0; i < n; i++) dots.push({ x: (i - (n - 1) / 2) * gap, y: (r - 3) * gap, r: r, i: i }); });
    var arcs = []; for (var a = 0; a < dots.length; a++) for (var b = a + 1; b < dots.length; b++) { var dx = dots[b].x - dots[a].x, dy = dots[b].y - dots[a].y, d = Math.sqrt(dx * dx + dy * dy); if (d > 0 && d <= gap * 1.01) arcs.push({ a: dots[a], b: dots[b], d: Math.hypot((dots[a].x + dots[b].x) / 2, (dots[a].y + dots[b].y) / 2) }); }
    arcs.sort(function (p, q) { return p.d - q.d; }); var show = Math.floor(arcs.length * Math.min(1, frac)), fest = AK.festivalFor(new Date());
    var col = fest ? "#ffd84a" : "#f3f0ff", acc = fest ? "#ff9acb" : "#4ade9f", s = '<svg class="muggu" viewBox="-110 -110 220 220" width="' + size + '" height="' + size + '" role="img" aria-label="Your muggu, ' + Math.round(frac * 100) + ' percent drawn">';
    arcs.forEach(function (e, k) {
      if (k >= show) return; var mx = (e.a.x + e.b.x) / 2, my = (e.a.y + e.b.y) / 2, nx = -(e.b.y - e.a.y), ny = e.b.x - e.a.x, l = Math.hypot(nx, ny) || 1, off = 9, cx = mx + (nx / l) * off, cy = my + (ny / l) * off, c2x = mx - (nx / l) * off, c2y = my - (ny / l) * off;
      s += '<path class="mg" d="M' + e.a.x + " " + e.a.y + " Q" + cx + " " + cy + " " + e.b.x + " " + e.b.y + " Q" + c2x + " " + c2y + " " + e.a.x + " " + e.a.y + '" fill="none" stroke="' + (k % 2 ? col : acc) + '" stroke-width="1.6" pathLength="1" style="animation-delay:' + Math.min(2, k * 0.012) + 's"/>';
    });
    dots.forEach(function (p) { s += '<circle cx="' + p.x + '" cy="' + p.y + '" r="2.3" fill="' + col + '"/>'; });
    return s + "</svg>";
  };

  /* village overlay: weather, festival decorations and place names */
  var baseVillage = FX.villageSvg;
  FX.villageSvg = function (st, phase, opts) {
    var svg = baseVillage(st, phase, opts), o = "", W = 960;
    try {
      var ss = AK.streakStatus(st, new Date()), today = AK.dateKey(new Date()), solvedToday = st.streak.last === today;
      var weather = ss.count === 0 && st.streak.best > 0 ? "rain" : ss.atRisk ? "drizzle" : "";
      if (weather) {
        o += '<g class="cloud c1"><ellipse cx="180" cy="46" rx="70" ry="20" fill="#7d86a8"/><ellipse cx="230" cy="40" rx="50" ry="18" fill="#8d96b8"/></g><g class="cloud c2"><ellipse cx="640" cy="62" rx="80" ry="22" fill="#7d86a8"/><ellipse cx="700" cy="54" rx="55" ry="18" fill="#8d96b8"/></g>';
        for (var i = 0; i < (weather === "rain" ? 46 : 16); i++) o += '<line class="drop" x1="' + ((i * 71) % W) + '" y1="70" x2="' + (((i * 71) % W) - 6) + '" y2="86" style="animation-delay:' + (i % 9) * 0.13 + 's"/>';
      } else if (solvedToday && phase !== "night") o += '<g class="rays"><circle cx="480" cy="60" r="46" fill="#ffd84a" opacity=".12"/></g>';
      var f = AK.festivalFor(new Date());
      if (f) {
        if (f.decor === "lamps") for (var l = 0; l < 14; l++) o += '<text class="diya" x="' + (40 + l * 68) + '" y="' + (44 + (l % 2) * 8) + '" font-size="22" text-anchor="middle" style="animation-delay:' + (l % 5) * 0.3 + 's">🪔</text>';
        else if (f.decor === "kites") for (var k = 0; k < 6; k++) o += '<text class="kite" x="' + (90 + k * 150) + '" y="' + (70 + (k % 3) * 28) + '" font-size="26" style="animation-delay:' + k * 0.4 + 's">🪁</text>';
        else if (f.decor === "toran") { o += '<path d="M0 20 Q120 70 240 20 T480 20 T720 20 T960 20" fill="none" stroke="#3d8b4a" stroke-width="3"/>'; for (var t = 0; t < 24; t++) o += '<path class="leaf" d="M' + (t * 40 + 6) + " " + (28 + ((t % 2) ? 14 : 10)) + ' q6 12 0 20 q-6 -8 0 -20z" fill="#4caf50"/><circle cx="' + (t * 40 + 26) + '" cy="' + (36 + ((t % 2) ? 8 : 12)) + '" r="4" fill="#ffb300"/>'; }
        else if (f.decor === "flags") for (var g = 0; g < 12; g++) o += '<text class="flagx" x="' + (50 + g * 80) + '" y="40" font-size="24" text-anchor="middle" style="animation-delay:' + (g % 4) * 0.25 + 's">🇮🇳</text>';
        else if (f.decor === "pookalam") { var cols = ["#ff7a6b", "#ffd84a", "#fff3d6", "#ff9acb", "#4ade9f"]; for (var ring = 5; ring >= 1; ring--) o += '<circle cx="480" cy="360" r="' + ring * 9 + '" fill="' + cols[ring - 1] + '" opacity=".82"/>'; o += '<text x="480" y="366" font-size="20" text-anchor="middle">🌸</text>'; }
        else if (f.decor === "ganesha") o += '<text class="ganesh" x="480" y="334" font-size="40" text-anchor="middle">🐘</text><text x="448" y="334" font-size="20">🌺</text><text x="500" y="334" font-size="20">🌺</text>';
        else if (f.decor === "golu") for (var step = 0; step < 3; step++) { o += '<rect x="' + (400 + step * 16) + '" y="' + (330 + step * 14) + '" width="' + (160 - step * 32) + '" height="14" fill="#a8743a" opacity=".9"/>'; for (var dl = 0; dl < 5 - step * 2; dl++) o += '<text x="' + (420 + step * 16 + dl * 26) + '" y="' + (328 + step * 14) + '" font-size="16">' + ["🪆", "🏹", "🐘", "🦚", "🛕"][(dl + step) % 5] + "</text>"; }
        else if (f.decor === "kolam") o += '<g transform="translate(480,356) scale(.45)">' + FX.muggu(1, 1).replace(/<svg[^>]*>/, "").replace("</svg>", "") + "</g>";
        o += '<text class="festbanner" x="480" y="18" font-size="13" text-anchor="middle" fill="#fff">' + esc(f.icon + " " + AK.festivalName(f, S().settings.lang) + " " + f.icon) + "</text>";
      }
      FX.PLACES.forEach(function (p, i) { o += '<text class="plname" x="' + (52 + i * 76) + '" y="426" font-size="9" text-anchor="middle">' + esc(p.n) + "</text>"; });
    } catch (e) { /* decoration is optional */ }
    return svg.replace(/<\/svg>\s*$/, '<g class="overlay">' + o + "</g></svg>");
  };
  /* plot panel: say what the real place is known for */
  var panelObs = null;
  function watchPlots() {
    if (panelObs) { panelObs.disconnect(); panelObs = null; } var p = $("#plotPanel"); if (!p) return;
    var add = function () { if ($(".culture", p) || p.hidden) return; var m = /Plot (\d+)/.exec(p.textContent); if (!m) return; var pl = FX.PLACES[Number(m[1]) - 1]; if (pl) p.insertAdjacentHTML("afterbegin", '<div class="culture muted">📍 <b>' + esc(pl.n) + "</b>, " + esc(pl.st) + ": " + esc(pl.fact) + "</div>"); };
    panelObs = new MutationObserver(function () { panelObs.disconnect(); add(); panelObs.observe(p, { childList: true }); }); panelObs.observe(p, { childList: true }); add();
  }

  /* ---------------------------------------------------------------- route: page turn, hearts, pager, festival hello */
  var lastName = null, helloDay = null;
  wrap("route", function (name) {
    var v = $("#view"); if (v && !calm() && name !== lastName) { v.classList.remove("pageturn"); void v.offsetWidth; v.classList.add("pageturn"); }
    lastName = name;
    var parts = location.hash.replace(/^#\/?/, "").split("/"); mountHearts(name, parts.slice(1).join("/"));
    if (name === "mission") { var m = C.byId[parts[1]]; if (m && m.region === "debug-the-outage" && m.type === "terminal") FX.pager(m); }
    if (name === "village") watchPlots();
    var f = AK.festivalFor(new Date()), key = AK.dateKey(new Date());
    if (f && helloDay !== key) { helloDay = key; setTimeout(function () { C.toast(f.icon + " " + AK.festivalHello(f, S().settings.lang), 5200); FX.sound("star"); }, 700); }
  });
  /* hatch check on load (e.g. after an import) */
  setTimeout(function () { var st = S(), stg = AK.parrotStage(st.xp); if (stg > (st.stage || 0)) { st.stage = stg; C.save(); } }, 0);
})();

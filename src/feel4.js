/* AataKode v7 feel pack: Chilaka reacts to your code (thinking, sleeping), test checks fall like dominoes with rising pitch,
   boss impact (a 2px shake, a hit spark, a dissolve on defeat), map nodes that bloom into plants, a lit village building for each
   finished region, honest streak flame states (flicker when at risk, ice for a freeze), rolling XP numbers, a one-time level-up
   burst, a skeleton shimmer with rotating tips while Python loads, and small editor touches (error-line glow, first-solve sparkle).
   Every effect is skipped under reduced motion or calm mode; CSS animations are also killed by the global [data-motion="reduce"] rule. */
(function () {
  "use strict";
  var C = window.AK_CORE, AK = window.AK, FX = window.AK_FX, UI = window.AK_UI;
  if (!C || !UI) return;
  var $ = C.$, $$ = C.$$, esc = C.esc, VIEWS = C.VIEWS, H = UI.hooks;
  var S = function () { return C.state(); }, Q = function (s, r) { return (r || document).querySelector(s); };
  var chain = UI.x5 ? UI.x5.chain : function (name, fn) { var prev = H[name]; H[name] = function () { var a = arguments; try { fn.apply(null, a); } catch (e) { /* polish never breaks play */ } return prev ? prev.apply(null, a) : undefined; }; };
  var calm = function () { var s = S().settings || {}; return s.motion === "reduce" || document.body.classList.contains("zen") || (s.motion === "auto" && window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); };
  var V = function () { return AK.v7 ? AK.v7(S()) : { rewards: {} }; };
  var sparkLayer = function (cls, ms) { var el = document.createElement("div"); el.className = cls; el.setAttribute("aria-hidden", "true"); document.body.appendChild(el); setTimeout(function () { if (el.parentNode) el.remove(); }, ms || 1200); return el; };
  var burstAt = function (x, y, glyphs, n, ms) {
    if (calm()) return; var l = sparkLayer("ak-burst", ms || 900); l.style.cssText = "position:fixed;left:" + x + "px;top:" + y + "px;width:0;height:0;pointer-events:none;z-index:60";
    for (var i = 0; i < n; i++) { var s = document.createElement("span"), a = (Math.PI * 2 * i) / n + Math.random() * 0.5, d = 24 + Math.random() * 36; s.textContent = glyphs[i % glyphs.length]; s.style.cssText = "position:absolute;--dx:" + Math.round(Math.cos(a) * d) + "px;--dy:" + Math.round(Math.sin(a) * d) + "px"; s.className = "ak-bit"; l.appendChild(s); }
  };

  /* ---------------------------------------------------------------- Chilaka: thinking while code runs, sleeping when idle */
  var idleT = null, asleep = false;
  function mood(m) { var el = Q("#buddy"); if (!el) return; el.className = "buddy mood-" + m; if (m === "sleep") { el.setAttribute("data-zzz", "1"); } else el.removeAttribute("data-zzz"); }
  function wake() { if (asleep) { asleep = false; if (Q("#buddy")) mood("calm"); } clearTimeout(idleT); if (/^#\/mission/.test(location.hash)) idleT = setTimeout(sleep, 90000); }
  function sleep() { if (!/^#\/mission/.test(location.hash) || !Q("#buddy") || calm()) return; asleep = true; mood("sleep"); }
  ["keydown", "pointerdown"].forEach(function (e) { document.addEventListener(e, wake, true); });
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest("#runBtn,#submitBtn,#watchBtn,#checkBtn") : null;
    if (b && Q("#buddy") && !calm()) { mood("think"); setTimeout(function () { var el = Q("#buddy"); if (el && el.classList.contains("mood-think") && !el.querySelector(".bub:not(.gone)")) mood("calm"); }, 2200); }
  }, true);
  chain("route", function () { wake(); });

  /* ---------------------------------------------------------------- tests fall like dominoes, pitch rises (sound does the pitch via FX.sound("ok", i)) */
  chain("test", function (kind, i, n) {
    var li = $$("#testlist li")[i]; if (!li || calm()) return;
    li.classList.add("ak-domino"); li.style.setProperty("--tilt", (kind === "ok" ? 1 : -1) * (6 + (i % 3)) + "deg");
    if (kind === "ok" && n > 1 && i === n - 1) { var all = $$("#testlist li.litok").length === n; if (all) $("#testlist").classList.add("ak-allgreen"); }
  });

  /* ---------------------------------------------------------------- boss impact and dissolve */
  chain("test", function (kind) {
    var hp = Q("#bossHp"); if (!hp || calm()) return;
    if (kind === "ok") {
      var g = Q("#mgrid"); if (g) { g.classList.remove("ak-hit"); void g.offsetWidth; g.classList.add("ak-hit"); setTimeout(function () { g.classList.remove("ak-hit"); }, 140); }
      var r = hp.getBoundingClientRect(); burstAt(r.left + r.width * (0.2 + Math.random() * 0.6), r.top + r.height / 2, ["💥", "✦", "⚡"], 5, 600);
    }
  });
  chain("passed", function (m) { if (m && m.boss && !calm()) { var hp = Q("#bossHp"); if (hp) hp.classList.add("ak-dissolve"); } });

  /* ---------------------------------------------------------------- map: nodes bloom into plants, finished regions light their building */
  var lastSolved = null;
  chain("passed", function (m) { lastSolved = m && m.id; });
  var baseMap = VIEWS.map;
  VIEWS.map = function (v, arg) {
    baseMap(v, arg);
    try {
      $$(".node.done", v).forEach(function (n) {
        var id = n.dataset.m, st = AK.starsOf ? AK.starsOf(S(), id) : 1, plant = st >= 3 ? "🌸" : st === 2 ? "🌿" : "🌱";
        if (!Q(".bloom", n)) { var b = document.createElement("span"); b.className = "bloom" + (id === lastSolved && !calm() ? " ak-bloom" : ""); b.setAttribute("aria-hidden", "true"); b.textContent = plant; n.appendChild(b); }
      });
      lastSolved = null;
      $$(".region", v).forEach(function (r) {
        var n0 = Q(".node", r), reg = n0 && C.byId[n0.dataset.m] ? C.byId[n0.dataset.m].region : null;
        if (reg && AK.regionComplete(S(), C.DATA, reg) && !Q(".bldlit", r)) { var rg = C.regionById[reg], t = r.querySelector("b,h3"); var chip = document.createElement("span"); chip.className = "chip gold bldlit"; chip.title = "This region's building is lit in your Village"; chip.textContent = "🏮 " + (rg.place || "Lit"); (t ? t.parentNode : r).appendChild(chip); }
      });
    } catch (e) { /* ignore */ }
  };
  var baseVillage = FX && FX.villageSvg;
  if (baseVillage) FX.villageSvg = function (st, phase, opts) {
    var svg = baseVillage(st, phase, opts), o = "";
    try {
      var done = C.DATA.regions.filter(function (r) { return AK.regionComplete(st, C.DATA, r.id); });
      done.slice(0, 12).forEach(function (r, i) { var x = 52 + i * 76; o += '<g class="bldlit-g"><circle class="bld-glow" cx="' + x + '" cy="392" r="22" fill="#ffd84a" opacity=".22"/><circle cx="' + (x - 7) + '" cy="396" r="2.2" fill="#ffe27a"/><circle cx="' + (x + 7) + '" cy="396" r="2.2" fill="#ffe27a"/><title>' + esc(r.place || r.title) + " is lit</title></g>"; });
    } catch (e) { /* optional */ }
    return o ? svg.replace(/<\/svg>\s*$/, o + "</svg>") : svg;
  };
  chain("passed", function (m, o) {
    if (!m) return; var reg = m.region;
    if (AK.regionComplete(S(), C.DATA, reg)) { var v7 = V(); v7.rewards.lit = v7.rewards.lit || {}; if (!v7.rewards.lit[reg]) { v7.rewards.lit[reg] = 1; C.save(); var rg = C.regionById[reg]; setTimeout(function () { C.toast("🏮 " + (rg && rg.place ? rg.place : "A building") + " is lit up in your Village"); }, 1500); } }
  });

  /* ---------------------------------------------------------------- honest streak flame: flicker when at risk, ice for a freeze */
  function flameStates() {
    var chip = Q("#hdr .flamechip, #hdr .chip[title^='Day streak']"); if (!chip) return;
    var st = AK.streakStatus(S(), new Date()); chip.classList.toggle("fl-risk", !!st.atRisk); chip.classList.toggle("fl-ice", !!(S().streak && S().streak.freezes > 0));
    if (S().streak && S().streak.freezes > 0) chip.title = "Day streak. A streak freeze (ice) will protect one missed day."; else if (st.atRisk) chip.title = "Day streak at risk: learn today to keep the flame.";
  }
  var hdr = Q("#hdr"); if (hdr && window.MutationObserver) { var fo = new MutationObserver(function () { fo.disconnect(); try { flameStates(); rollSeeds(); } catch (e) { /* ignore */ } fo.observe(hdr, { childList: true, subtree: true }); }); fo.observe(hdr, { childList: true, subtree: true }); flameStates(); }

  /* ---------------------------------------------------------------- numbers roll; one-time level-up burst */
  var seedShown = null, rolling = false;
  function roll(el, from, to, ms) {
    if (!el || calm() || from === to) { if (el) el.textContent = String(to); return; }
    rolling = true; var t0 = performance.now(); (function step(t) { var k = Math.min(1, (t - t0) / ms); el.textContent = String(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)))); if (k < 1 && document.body.contains(el)) requestAnimationFrame(step); else { el.textContent = String(to); setTimeout(function () { rolling = false; }, 0); } })(t0);
  }
  function rollSeeds() { var el = Q("#seedNum"); if (!el || rolling) return; var now = Number(el.textContent) || 0; if (seedShown != null && now !== seedShown && !calm()) roll(el, seedShown, now, 700); seedShown = now; }
  var rankShown = null;
  function rankName() { return AK.rankFor(S().xp).cur ? AK.rankFor(S().xp).cur.en || AK.rankFor(S().xp).cur.name : String(AK.rankFor(S().xp).i); }
  chain("route", function () { try { var r = AK.rankFor(S().xp); rankShown = r.cur ? (r.cur.xp) : 0; } catch (e) { /* ignore */ } });
  chain("passed", function (m, o) {
    setTimeout(function () {
      var rw = Q("#reward b.mono"); if (rw && !calm()) { var mm = /\+(\d+) XP/.exec(rw.textContent); if (mm) { var n = Number(mm[1]), pre = rw.textContent.slice(0, mm.index), post = rw.textContent.slice(mm.index + mm[0].length), t0 = performance.now(); (function step(t) { var k = Math.min(1, (t - t0) / 900); rw.textContent = pre + "+" + Math.round(n * (1 - Math.pow(1 - k, 3))) + " XP" + post; if (k < 1 && document.body.contains(rw)) requestAnimationFrame(step); })(t0); } }
      try {
        var r = AK.rankFor(S().xp), cur = r.cur ? r.cur.xp : 0, v7 = V();
        if (rankShown != null && cur > rankShown && !(v7.rewards.rank && v7.rewards.rank >= cur)) { v7.rewards.rank = cur; C.save(); levelBurst(r.cur); }
        rankShown = cur;
      } catch (e) { /* ignore */ }
    }, 120);
  });
  function levelBurst(rk) {
    var name = rk && (rk.en || rk.name || rk.title) || "a new rank";
    C.toast("🌳 New rank: " + name);
    if (calm()) return;
    var l = sparkLayer("ak-level", 1800); l.innerHTML = '<div class="ak-levelcard">🌳 ' + esc(name) + "</div>";
    var w = window.innerWidth; for (var i = 0; i < 16; i++) burstAt(w * (0.2 + (i / 16) * 0.6), window.innerHeight * 0.35, ["✨", "🌟", "🍃"], 4, 1400);
  }

  /* ---------------------------------------------------------------- skeleton shimmer with rotating tips while code runs or Python loads */
  var TIPS = ["Tip: read the red check first. It names the problem.", "Tip: Run shows output without grading.", "Tip: small steps. Run after every change.", "Tip: say what the code should do before you type.", "Tip: the first hint every day is free.", "Tip: you can ask for a similar example, no cost."];
  var tipI = 0, tipT = null;
  function skeleton(box) {
    if (!box || box.dataset.skel === "1" || calm()) return; box.dataset.skel = "1";
    box.innerHTML = '<div class="ak-skel" aria-hidden="true"><i></i><i></i><i></i></div><div class="muted ak-tip" role="status">' + esc(TIPS[tipI++ % TIPS.length]) + "</div>";
    clearInterval(tipT); tipT = setInterval(function () { var t = Q(".ak-tip", box); if (!t || box.dataset.skel !== "1") { clearInterval(tipT); return; } t.textContent = TIPS[tipI++ % TIPS.length]; }, 2600);
  }
  var viewEl = $("#view");
  if (viewEl && window.MutationObserver) {
    var so = new MutationObserver(function () {
      var box = Q("#outbox"); if (!box) return;
      var t = box.textContent;
      if ((t === "Running…" || t === "Preparing…" || t === "Loading Python…") && box.dataset.skel !== "1") { so.disconnect(); skeleton(box); so.observe(viewEl, { childList: true, subtree: true, characterData: true }); }
      else if (box.dataset.skel === "1" && !Q(".ak-skel", box)) delete box.dataset.skel;
    });
    so.observe(viewEl, { childList: true, subtree: true, characterData: true });
  }

  /* ---------------------------------------------------------------- editor touches: glow on the error line, sparkle on the first solve */
  function errGlow() {
    var eb = Q("#errbox"); if (!eb || calm()) return; var m = /on line (\d+)|line (\d+)/.exec(eb.textContent || ""); var ta = Q("#code"); if (!m || !ta) return;
    var ln = Number(m[1] || m[2]), ed = ta.parentNode; if (!ed) return; ed.style.position = ed.style.position || "relative";
    var old = Q(".ak-errline", ed); if (old) old.remove();
    var cs = getComputedStyle(ta), lh = parseFloat(cs.lineHeight) || 20, pt = parseFloat(cs.paddingTop) || 0, g = document.createElement("div");
    g.className = "ak-errline"; g.setAttribute("aria-hidden", "true"); g.style.cssText = "position:absolute;left:0;right:0;height:" + lh + "px;top:" + (pt + (ln - 1) * lh - ta.scrollTop) + "px;pointer-events:none"; ed.appendChild(g);
    var drop = function () { if (g.parentNode) g.remove(); ta.removeEventListener("input", drop); }; ta.addEventListener("input", drop); setTimeout(drop, 6000);
  }
  var eo = $("#view") && window.MutationObserver ? new MutationObserver(function () { var eb = Q("#errbox"); if (eb && eb.dataset.glow !== eb.textContent && /line \d+/.test(eb.textContent)) { eb.dataset.glow = eb.textContent; errGlow(); } }) : null;
  if (eo) eo.observe($("#view"), { childList: true, subtree: true, characterData: true });
  chain("passed", function (m) {
    var v7 = V(); v7.rewards.sparked = v7.rewards.sparked || {}; if (v7.rewards.sparked[m.id]) return; v7.rewards.sparked[m.id] = 1; C.save();
    var ta = Q("#code"); if (!ta || calm()) return; var r = ta.getBoundingClientRect(); for (var i = 0; i < 6; i++) burstAt(r.left + r.width * (0.15 + i * 0.14), r.top + 18, ["✨", "⭐"], 3, 900);
  });
})();

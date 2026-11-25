/* AataKode v4 feel: sound packs, micro-sounds, an optional music layer that grows with the village, stingers for leagues and
   festivals, the "you debugged it" moment, zen mode, and track outfits. Everything respects mute, quiet and reduced motion. */
(function () {
  "use strict";
  var C = window.AK_CORE, AK = window.AK, FX = window.AK_FX, UI = window.AK_UI;
  if (!C || !FX || !UI || !AK.v4) return;
  var $ = C.$, esc = C.esc, DATA = C.DATA, H = UI.hooks;
  var S = function () { return C.state(); };
  var cfg = function (k, d) { var v = (S().settings || {})[k]; return v === undefined ? d : v; };
  function chain(name, fn) { var prev = H[name]; H[name] = function () { var a = arguments; try { fn.apply(null, a); } catch (e) { /* polish never breaks play */ } return prev ? prev.apply(null, a) : undefined; }; }

  /* ---------------------------------------------------------------- sound packs (the default pack is the v3 synth) */
  var T = FX.tone, base = FX.sound;
  var PENTA = [0, 2, 4, 7, 9], hz = function (root, k) { return root * Math.pow(2, (PENTA[k % 5] + 12 * Math.floor(k / 5)) / 12); };
  var PACK = {
    veena: { ok: function (i) { T(hz(330, i || 0), 0.3, "triangle", 0.06); }, no: function () { T(196, 0.25, "sine", 0.05); T(185, 0.3, "sine", 0.04, 0.1); }, star: function () { T(hz(440, 2), 0.25, "triangle", 0.05); T(hz(440, 4), 0.3, "triangle", 0.05, 0.1); },
      solved: function () { [0, 2, 4, 5].forEach(function (k, i) { T(hz(262, k), 0.35, "triangle", 0.06, i * 0.12); }); }, levelup: function () { [0, 1, 2, 3, 4, 5].forEach(function (k, i) { T(hz(262, k), 0.3, "triangle", 0.05, i * 0.09); }); }, coin: function () { T(hz(523, 2), 0.2, "triangle", 0.05); T(hz(523, 4), 0.3, "triangle", 0.05, 0.08); } },
    marimba: { ok: function (i) { T(hz(392, i || 0), 0.12, "sine", 0.08); T(hz(392, i || 0) * 2, 0.06, "sine", 0.03); }, no: function () { T(147, 0.18, "sine", 0.07); }, star: function () { T(784, 0.1, "sine", 0.07); T(988, 0.14, "sine", 0.06, 0.07); },
      solved: function () { [0, 2, 4, 7].forEach(function (k, i) { T(hz(330, k), 0.16, "sine", 0.08, i * 0.09); }); }, levelup: function () { [0, 2, 4, 5, 7, 9].forEach(function (k, i) { T(hz(330, k), 0.14, "sine", 0.07, i * 0.07); }); }, coin: function () { T(1047, 0.07, "sine", 0.06); T(1319, 0.12, "sine", 0.06, 0.07); } },
    retro: { ok: function (i) { T(440 + (i || 0) * 60, 0.07, "square", 0.04); }, no: function () { T(120, 0.2, "square", 0.04); }, star: function () { T(1319, 0.06, "square", 0.035); T(1568, 0.1, "square", 0.035, 0.06); },
      solved: function () { [523, 659, 784, 1047, 1319].forEach(function (f, i) { T(f, 0.1, "square", 0.04, i * 0.07); }); }, levelup: function () { [262, 330, 392, 523, 659, 784, 1047].forEach(function (f, i) { T(f, 0.09, "square", 0.04, i * 0.06); }); }, coin: function () { T(1319, 0.05, "square", 0.035); T(1760, 0.1, "square", 0.035, 0.05); } },
  };
  var EXTRA = {
    league: function (i) { var n = 3 + (i || 0); for (var k = 0; k <= n; k++) T(hz(262, k * 2), 0.22, "triangle", 0.06, k * 0.1); T(hz(262, n * 2 + 2), 0.5, "triangle", 0.06, (n + 1) * 0.1); },
    festival: function () { [523, 659, 784, 659, 784, 1047].forEach(function (f, i) { T(f, 0.18, "triangle", 0.05, i * 0.12); }); },
    chapter: function () { [392, 494, 587, 784].forEach(function (f, i) { T(f, 0.3, "sine", 0.05, i * 0.16); }); },
    effort: function () { T(196, 0.12, "sawtooth", 0.03); T(294, 0.14, "triangle", 0.05, 0.1); T(440, 0.14, "triangle", 0.05, 0.2); T(587, 0.3, "triangle", 0.06, 0.3); },
    soft: function () { T(660, 0.05, "sine", 0.025); },
  };
  FX.sound = function (n, a) {
    if (cfg("sound", "on") === "off") return;
    try { var pk = PACK[cfg("pack", "chime")]; if (EXTRA[n]) return EXTRA[n](a); if (pk && pk[n]) return pk[n](a); } catch (e) { /* ignore */ }
    return base(n, a);
  };
  /* micro-sounds: a soft tick on buttons and options, only when sound is fully on */
  document.addEventListener("click", function (e) { if (cfg("sound", "on") !== "on") return; var t = e.target && e.target.closest ? e.target.closest("button, .opt, .node.open, .league") : null; if (t && !t.disabled && !t.classList.contains("good")) FX.sound("soft"); }, true);

  /* ---------------------------------------------------------------- music layer */
  var M = { ctx: null, voices: [], gain: null, on: false, key: "" };
  var ROOT = { python: 130.8, ops: 98, sql: 110, git: 123.5, go: 146.8, http: 116.5, security: 87.3, visual: 138.6, projects: 130.8, interview: 130.8, mystery: 103.8 };
  function target() {
    var hash = location.hash.replace(/^#\/?/, ""), parts = hash.split("/"), reg = null;
    if (parts[0] === "mission" && C.byId[parts[1]]) reg = C.regionById[C.byId[parts[1]].region];
    var track = reg ? reg.track : "python", plots = ((S().village || {}).plots || []).filter(Boolean).length, regs = DATA.regions.filter(function (r) { return AK.regionComplete(S(), DATA, r.id); }).length;
    return { root: ROOT[track] || 130.8, voices: Math.min(4, 1 + Math.floor((plots + regs) / 4)), key: track + ":" + Math.min(4, 1 + Math.floor((plots + regs) / 4)) };
  }
  function musicUpdate() {
    var want = cfg("music", "off") === "on" && cfg("sound", "on") !== "off" && !document.hidden;
    if (!want) { musicStop(); return; }
    var a = FX.audio && FX.audio(); if (!a) return;
    var tg = target(); if (M.on && M.key === tg.key) return;
    musicStop(true); M.ctx = a; M.gain = a.createGain(); var vol = cfg("sound", "on") === "quiet" ? 0.012 : 0.025; M.gain.gain.setValueAtTime(0.0001, a.currentTime); M.gain.gain.linearRampToValueAtTime(vol, a.currentTime + 2.5); M.gain.connect(a.destination);
    var ratios = [1, 1.5, 2, 2.25];
    for (var i = 0; i < tg.voices; i++) {
      var o = a.createOscillator(), g = a.createGain(); o.type = i % 2 ? "triangle" : "sine"; o.frequency.value = tg.root * ratios[i]; g.gain.value = 1 / (i + 1.4);
      if (!C.reducedMotion()) { var l = a.createOscillator(), lg = a.createGain(); l.frequency.value = 0.05 + i * 0.03; lg.gain.value = 1.2 + i; l.connect(lg); lg.connect(o.frequency); l.start(); M.voices.push(l); }
      o.connect(g); g.connect(M.gain); o.start(); M.voices.push(o);
    }
    M.on = true; M.key = tg.key;
  }
  function musicStop(quick) {
    if (!M.on && !M.gain) return; var a = M.ctx, g = M.gain, vs = M.voices; M.voices = []; M.on = false; M.key = ""; M.gain = null;
    try { if (g && a) { g.gain.cancelScheduledValues(a.currentTime); g.gain.setValueAtTime(g.gain.value, a.currentTime); g.gain.linearRampToValueAtTime(0.0001, a.currentTime + (quick ? 0.2 : 1.2)); } setTimeout(function () { vs.forEach(function (o) { try { o.stop(); } catch (e) { /* ignore */ } }); }, quick ? 300 : 1400); } catch (e) { /* ignore */ }
  }
  document.addEventListener("visibilitychange", musicUpdate);
  document.addEventListener("pointerdown", function once() { if (cfg("music", "off") === "on") musicUpdate(); }, { passive: true });
  chain("route", function (name) { musicUpdate(); UI.applyCalm(); if (name === "home" || name === "village") festivalStinger(); });
  chain("saved", function () { /* settings may have changed */ if (cfg("music", "off") === "on" !== M.on) musicUpdate(); });

  /* ---------------------------------------------------------------- festival stinger (once per day, per tab) */
  function festivalStinger() { var f = AK.festivalFor(new Date()); if (!f) return; var k = "ak-fest-" + f.id + AK.dateKey(new Date()); try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, "1"); } catch (e) { return; } FX.sound("festival"); }

  /* ---------------------------------------------------------------- "you debugged it" moment and calm mode */
  chain("solved", function (m, res) {
    if (!res) return;
    if (res.effort) { FX.sound("effort"); FX.buzz([15, 30, 15, 30, 50]); var o = document.createElement("div"); o.className = "effort-ov" + (C.reducedMotion() ? " still" : ""); o.setAttribute("role", "status"); o.innerHTML = '<div class="eo-card"><div class="eo-bug" aria-hidden="true">🐛</div><b>You debugged it!</b><div class="muted">' + res.effort.tries + " tries. Every real developer does this.</div></div>"; document.body.appendChild(o); setTimeout(function () { o.classList.add("out"); setTimeout(function () { o.remove(); }, 400); }, C.reducedMotion() ? 1500 : 2300); o.onclick = function () { o.remove(); }; }
    if (res.chapter) setTimeout(function () { FX.sound("chapter"); }, 700);
  });
  UI.applyCalm = function () { document.body.classList.toggle("zen", !!(S().settings || {}).zen); };
  UI.applyCalm();

  /* ---------------------------------------------------------------- outfits unlocked by track and by play */
  var trackDone = function (t) { var rs = DATA.regions.filter(function (r) { return r.track === t; }); return rs.length > 0 && rs.every(function (r) { return AK.regionComplete(S(), DATA, r.id); }); };
  var cap = function (c) { return '<rect x="12" y="6" width="26" height="7" rx="3" fill="' + c + '"/><rect x="8" y="10" width="12" height="4" rx="2" fill="' + c + '"/>'; };
  [{ id: "gophercap", name: "Gopher cap", hint: "finish the Go track", svg: cap("#00add8"), test: function () { return trackDone("go"); } },
   { id: "postcap", name: "Postal cap", hint: "finish the HTTP track", svg: cap("#ff7a6b"), test: function () { return trackDone("http"); } },
   { id: "lockpin", name: "Lock pin", hint: "finish the Security track", svg: '<rect x="34" y="38" width="12" height="9" rx="2" fill="#f2b531"/><path d="M37 38v-3a3 3 0 0 1 6 0v3" fill="none" stroke="#f2b531" stroke-width="2"/>', test: function () { return trackDone("security"); } },
   { id: "hardhat", name: "Hard hat", hint: "finish Debug the Outage", svg: '<path d="M12 14a14 10 0 0 1 28 0z" fill="#f2b531"/><rect x="10" y="13" width="32" height="3" rx="1.5" fill="#e0a21f"/>', test: function () { return trackDone("ops"); } },
   { id: "sash", name: "Champion sash", hint: "clear two Bot Arena leagues", svg: '<path d="M16 26l26 16" stroke="#a78bfa" stroke-width="5" stroke-linecap="round"/>', test: function () { return Object.keys(AK.v4(S()).arena.done).length >= 2; } },
   { id: "stopwatch", name: "Stopwatch", hint: "solve 3 Clash puzzles", svg: '<circle cx="42" cy="44" r="6" fill="none" stroke="#fff" stroke-width="2"/><path d="M42 44v-4M40 36h4" stroke="#fff" stroke-width="2"/>', test: function () { return Object.keys(AK.v4(S()).clash.solved).length >= 3; } },
   { id: "scroll", name: "Reading scroll", hint: "finish the Code Reading Hut", svg: '<rect x="35" y="36" width="13" height="10" rx="2" fill="#fff3d6"/><path d="M38 40h7M38 43h5" stroke="#8a5a2b" stroke-width="1.5"/>', test: function () { return AK.regionComplete(S(), DATA, "read-code"); } },
   { id: "garland", name: "Festival garland", hint: "learn on a festival day", svg: '<path d="M16 30q10 8 20 0" fill="none" stroke="#ff7a6b" stroke-width="3"/><circle cx="20" cy="33" r="2" fill="#f2b531"/><circle cx="26" cy="35" r="2" fill="#f2b531"/><circle cx="32" cy="34" r="2" fill="#f2b531"/>', test: function () { return Object.keys(S().festSeen || {}).length > 0; } }]
    .forEach(function (o) { if (C.OUTFITS && !C.OUTFITS.some(function (x) { return x.id === o.id; })) C.OUTFITS.push(o); });
})();

/* AataKode feel layer: sound, haptics, parrot buddy, typing feel, village scene.
   Everything here is optional polish: it reads settings (sound / haptics / buddy / motion) and never blocks learning. */
(function () {
  "use strict";
  var C = window.AK_CORE, AK = window.AK;
  if (!C) return;
  var $ = C.$, $$ = C.$$, esc = C.esc;
  var UI = (window.AK_UI = window.AK_UI || { hooks: {}, mission: {}, views: {} });
  var FX = (window.AK_FX = {});
  var S = function () { return C.state(); };
  var cfg = function (k) { var v = (S().settings || {})[k]; return v === undefined ? "on" : v; };

  /* ---------------------------------------------------------------- sound (tiny WebAudio synth, no files) */
  var ctx = null;
  function audio() {
    if (cfg("sound") === "off") return null;
    try {
      if (!ctx) { var A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ctx = new A(); }
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    } catch (e) { return null; }
  }
  function tone(f, d, type, v, at) {
    var a = audio(); if (!a) return;
    var t0 = a.currentTime + (at || 0), o = a.createOscillator(), g = a.createGain();
    var vol = (v || 0.06) * (cfg("sound") === "quiet" ? 0.45 : 1);
    o.type = type || "sine"; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + d + 0.03);
  }
  var SND = {
    tick: function () { if (cfg("sound") === "on") tone(1300 + Math.random() * 400, 0.025, "square", 0.012); },
    click: function () { tone(700, 0.04, "sine", 0.04); },
    ok: function (i) { tone(520 + (i || 0) * 70, 0.12, "triangle", 0.06); },
    no: function () { tone(190, 0.16, "sawtooth", 0.045); tone(150, 0.2, "sawtooth", 0.04, 0.09); },
    star: function () { tone(880, 0.09, "triangle", 0.05); tone(1175, 0.16, "triangle", 0.05, 0.07); },
    solved: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.22, "triangle", 0.07, i * 0.1); }); },
    levelup: function () { [392, 523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.2, "square", 0.045, i * 0.08); }); },
    coin: function () { tone(988, 0.08, "square", 0.04); tone(1319, 0.18, "square", 0.04, 0.08); },
    build: function () { tone(220, 0.1, "square", 0.05); tone(330, 0.1, "square", 0.05, 0.1); tone(523, 0.25, "triangle", 0.06, 0.2); },
  };
  FX.tone = tone; FX.SND = SND; FX.audio = audio; FX.cfg = cfg;
  FX.sound = function (n, a) { if (cfg("sound") === "off") return; try { if (SND[n]) SND[n](a); } catch (e) { /* ignore */ } };
  FX.buzz = function (p) { if (cfg("haptics") === "off") return; try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* ignore */ } };

  /* ---------------------------------------------------------------- parrot buddy */
  var MSG = {
    ok: ["Nice!", "Squawk! Yes!", "That one is right.", "Clean."],
    solved: ["Mission complete! 🎉", "You did it. I am so proud.", "Squawk! Perfect.", "Another one down."],
    failed: ["So close. Read the red check.", "Bugs are just clues.", "Try again. I believe in you.", "Check the failed line first."],
    idle: ["Stuck? Hints never cost XP.", "Say it out loud: what should happen?", "Try Run first to see what it does."],
    hint: ["Good call. Hints are for learning.", "A nudge is not cheating."],
  };
  var pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };
  function companionIcon() { var id = S().companion, it = id && AK.shopItem ? AK.shopItem(id) : null; return it ? it.icon : ""; }
  FX.buddy = function (mood, text, ms) {
    if (cfg("buddy") === "off") return;
    var el = $("#buddy");
    if (!el) { el = document.createElement("div"); el.id = "buddy"; el.setAttribute("aria-live", "polite"); document.body.appendChild(el); }
    var comp = companionIcon(), st = AK.companionStage ? AK.companionStage(S()) : 1;
    el.className = "buddy mood-" + mood;
    el.innerHTML = (text ? '<div class="bub">' + esc(text) + "</div>" : "") + '<div class="bpar">' + C.parrot(44) + (comp ? '<span class="bcomp s' + st + '" title="Your companion">' + comp + "</span>" : "") + "</div>";
    clearTimeout(el._t); if (text) el._t = setTimeout(function () { var b = $(".bub", el); if (b) b.classList.add("gone"); el.classList.remove("mood-happy", "mood-sad"); }, ms || 3600);
  };
  FX.buddyOff = function () { var el = $("#buddy"); if (el) el.remove(); };

  /* ---------------------------------------------------------------- village rebuild celebration */
  FX.rebuild = function (region) {
    var o = document.createElement("div"); o.className = "rebuild-ov"; o.setAttribute("role", "status");
    o.innerHTML = '<div class="rb-card"><div class="rb-icon' + (C.reducedMotion() ? "" : " go") + '">' + esc(region.icon) + '</div><div class="rb-dust" aria-hidden="true">' + (C.reducedMotion() ? "" : "💨 ✨ 🔨") + "</div><b>" + esc(region.place) + " is rebuilt!</b><span class=\"muted\">Open the village to see it standing.</span></div>";
    document.body.appendChild(o); FX.sound("build"); FX.buzz([20, 30, 20, 30, 60]);
    setTimeout(function () { o.classList.add("out"); setTimeout(function () { o.remove(); }, 400); }, C.reducedMotion() ? 1600 : 2600);
    o.onclick = function () { o.remove(); };
  };
  function checkRebuild() {
    var st = S(); st.village = st.village || { plots: [], seen: {} }; st.village.seen = st.village.seen || {};
    var fresh = C.DATA.regions.filter(function (r) { return r.track === "python" && AK.regionComplete(st, C.DATA, r.id) && !st.village.seen[r.id]; });
    fresh.forEach(function (r) { st.village.seen[r.id] = 1; });
    if (fresh.length) { C.save(); FX.rebuild(fresh[0]); }
    return fresh;
  }
  FX.pendingRebuilds = function () { var st = S(); return C.DATA.regions.filter(function (r) { return r.track === "python" && AK.regionComplete(st, C.DATA, r.id) && !((st.village || {}).seen || {})[r.id]; }); };

  /* ---------------------------------------------------------------- hooks the core calls */
  var H = UI.hooks;
  H.test = function (kind, i) { if (kind === "ok") { FX.sound("ok", i); FX.buzz(8); } else if (kind === "no") { FX.sound("no"); FX.buzz([30, 40, 30]); } else FX.sound("star"); };
  H.solved = function (m, res) {
    FX.sound("solved"); FX.buzz([20, 40, 20, 40, 70]); FX.buddy("happy", pick(MSG.solved));
    if (res && res.seeds) { C.toast("🌱 +" + res.seeds + " seeds"); setTimeout(function () { FX.sound("coin"); }, 350); }
    if (res && res.rankUp) setTimeout(function () { FX.sound("levelup"); }, 600);
    checkRebuild();
  };
  H.failed = function () { FX.buddy("sad", pick(MSG.failed)); };
  var idleTimer = null;
  H.route = function (name) {
    clearTimeout(idleTimer);
    if (name === "mission") {
      FX.buddy("calm", "");
      idleTimer = setTimeout(function () { if (/^#\/mission/.test(location.hash)) FX.buddy("think", pick(MSG.idle), 5000); }, 60000);
    } else FX.buddyOff();
    document.body.classList.toggle("is-night", FX.phase() === "night");
  };
  FX.phase = function (d) { return AK.dayPhase(d || new Date()); };

  /* ---------------------------------------------------------------- typing feel */
  var KW = /\b(for|while|if|elif|else|def|return|import|class|try|except|with|print|lambda|SELECT|FROM|WHERE|JOIN|GROUP BY|ORDER BY)\s$/;
  var lastLen = {};
  document.addEventListener("input", function (e) {
    var el = e.target; if (!el || (el.id !== "code" && el.id !== "tin" && el.id !== "sqlcode")) return;
    FX.sound("tick");
    var box = el.closest(".editor, .term"); if (box) { box.classList.add("typing"); clearTimeout(box._t); box._t = setTimeout(function () { box.classList.remove("typing"); }, 140); }
    if (el.id === "code" || el.id === "sqlcode") {
      var m = KW.exec(el.value.slice(0, el.selectionStart));
      if (m && !C.reducedMotion()) {
        var f = $("#kwflash"); if (!f) { f = document.createElement("div"); f.id = "kwflash"; f.setAttribute("aria-hidden", "true"); (el.closest(".editor") || el.parentNode).appendChild(f); }
        f.textContent = m[1]; f.classList.remove("go"); void f.offsetWidth; f.classList.add("go");
      }
      var rb = $("#runBtn") || $("#sqlRun"); if (rb) { rb.classList.add("charged"); lastLen.n = el.value.length; }
    }
  }, true);
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest("#runBtn, #sqlRun, #submitBtn, #checkBtn") : null;
    if (b) { var rb = $("#runBtn") || $("#sqlRun"); if (rb) rb.classList.remove("charged"); FX.sound("click"); }
  }, true);

  /* ---------------------------------------------------------------- village scene (SVG) */
  var SKY = {
    dawn: ["#ffb88a", "#ffe3c2", "#7a5a8c"], day: ["#79c6f2", "#d5f0ff", "#ffffff"], dusk: ["#5b3a7a", "#ff9a62", "#ffd08a"], night: ["#0d1330", "#25326b", "#3a4a8a"],
  };
  FX.villageSvg = function (st, phase, opts) {
    opts = opts || {}; var W = 960, Hh = 430, sk = SKY[phase] || SKY.day, night = phase === "night", dusk = phase === "dusk";
    var py = C.DATA.regions.filter(function (r) { return r.track === "python"; }), plots = (st.village && st.village.plots) || [];
    var rebuild = opts.rebuild || [], gId = "g" + Math.floor(Math.random() * 1e6);
    var s = '<svg class="vscene phase-' + phase + '" viewBox="0 0 ' + W + " " + Hh + '" role="img" aria-label="Your village in the ' + phase + '">';
    s += '<defs><linearGradient id="' + gId + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + sk[0] + '"/><stop offset="0.65" stop-color="' + sk[1] + '"/><stop offset="1" stop-color="' + sk[2] + '"/></linearGradient></defs>';
    s += '<rect width="' + W + '" height="' + Hh + '" fill="url(#' + gId + ')"/>';
    if (night) { for (var i = 0; i < 40; i++) s += '<circle class="star" cx="' + ((i * 97) % W) + '" cy="' + ((i * 53) % 200 + 8) + '" r="' + (i % 3 ? 1.1 : 1.8) + '" style="animation-delay:' + (i % 7) * 0.4 + 's"/>'; }
    var sx = { dawn: 130, day: 480, dusk: 820, night: 760 }[phase], sy = { dawn: 170, day: 60, dusk: 160, night: 70 }[phase];
    s += night ? '<g class="moon"><circle cx="' + sx + '" cy="' + sy + '" r="30" fill="#f5f1d6"/><circle cx="' + (sx + 12) + '" cy="' + (sy - 6) + '" r="26" fill="#0d1330" opacity=".85"/></g>'
      : '<g class="sun"><circle cx="' + sx + '" cy="' + sy + '" r="' + (dusk || phase === "dawn" ? 38 : 30) + '" fill="' + (dusk ? "#ff7b3a" : phase === "dawn" ? "#ffc46b" : "#ffd84a") + '"/></g>';
    s += '<path d="M0 270 Q160 200 320 262 T640 250 T960 266 L960 430 L0 430 Z" fill="' + (night ? "#1b3a3a" : dusk ? "#5a7a4a" : "#6fbf73") + '" opacity=".75"/>';
    s += '<rect y="292" width="' + W + '" height="140" fill="' + (night ? "#17302a" : dusk ? "#486a3c" : "#58a95c") + '"/>';
    s += '<path d="M0 360 H960" stroke="' + (night ? "#2a4a3c" : "#c9a96a") + '" stroke-width="30" opacity=".35"/>';
    py.forEach(function (r, i) {
      var x = 50 + i * Math.min(76, 860 / Math.max(1, py.length - 1)), ok = AK.regionComplete(st, C.DATA, r.id), rb = rebuild.indexOf(r.id) >= 0;
      s += '<g class="land ' + (ok ? "up" : "down") + (rb ? " rebuild" : "") + '" transform="translate(' + x + ',300)"><title>' + esc(r.place + (ok ? " (restored)" : " (broken)")) + '</title>' +
        (ok ? '<text class="lico" font-size="38" text-anchor="middle" y="0">' + r.icon + "</text>" + (night ? '<circle class="glow" cx="0" cy="-14" r="26" fill="#ffd36a" opacity=".16"/>' : "") : '<text class="lico dim" font-size="34" text-anchor="middle" y="0">' + r.icon + '</text><text font-size="18" text-anchor="middle" y="14">🧱</text>') + "</g>";
    });
    for (var p = 0; p < AK.VILLAGE_PLOTS; p++) {
      var bx = 52 + p * 76, id = plots[p], it = id && AK.shopItem ? AK.shopItem(id) : null;
      s += '<g class="plot' + (it ? " has" : "") + '" data-plot="' + p + '" transform="translate(' + bx + ',392)" tabindex="0" role="button" aria-label="Plot ' + (p + 1) + (it ? ": " + it.en : ": empty") + '"><rect x="-32" y="-44" width="64" height="58" rx="10" fill="rgba(255,255,255,' + (night ? ".05" : ".18") + ')" stroke="rgba(255,255,255,.5)" stroke-dasharray="' + (it ? "0" : "4 4") + '"/>' +
        (it ? '<text class="bld" font-size="40" text-anchor="middle" y="-2">' + it.icon + "</text>" + (id === "lamp" && (night || dusk) ? '<circle cx="0" cy="-16" r="30" fill="#ffd36a" opacity=".3" class="glow"/>' : "") : '<text font-size="20" text-anchor="middle" y="-10" opacity=".55">＋</text>') + "</g>";
    }
    if (night || dusk) { for (var f = 0; f < 14; f++) s += '<circle class="ff" cx="' + (30 + ((f * 131) % 900)) + '" cy="' + (250 + ((f * 47) % 140)) + '" r="2.4" style="animation-delay:' + (f % 5) * 0.7 + "s;animation-duration:" + (4 + (f % 4)) + 's"/>'; }
    var comp = companionIcon(); if (comp) s += '<text class="comp s' + (AK.companionStage ? AK.companionStage(st) : 1) + '" font-size="34" x="0" y="338">' + comp + "</text>";
    return s + "</svg>";
  };
})();

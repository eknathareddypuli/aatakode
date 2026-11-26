/* AataKode v7 visual layer: "Watch it run" (a step-through visualizer for Python and Go) and the live "what changed"
   preview for Web missions (click an element to jump to its source line; changed elements flash after a refresh).
   Everything respects reduced motion (the global [data-motion="reduce"] rule plus zen mode). */
(function () {
  "use strict";
  var C = window.AK_CORE, AK = window.AK, UI = window.AK_UI;
  if (!C || !UI || !UI.x5) return;
  var X = UI.x5, $ = C.$, $$ = C.$$, esc = C.esc, VIEWS = C.VIEWS, H = UI.hooks;
  var S = function () { return C.state(); }, Q = X.Q;

  /* ---------------------------------------------------------------- Watch it run */
  function ensureTab(id, label) {
    var tabs = Q("#rightpane .tabs"); if (!tabs) return null;
    if (!Q('[data-tab="' + id + '"]', tabs)) {
      var b = document.createElement("button"); b.setAttribute("role", "tab"); b.dataset.tab = id; b.setAttribute("aria-selected", "false"); b.textContent = label; tabs.appendChild(b);
      b.onclick = function () { selectTab(id); };
    }
    var p = Q("#tab-" + id); if (!p) { p = document.createElement("div"); p.id = "tab-" + id; p.hidden = true; Q("#rightpane").appendChild(p); }
    return p;
  }
  function selectTab(id) {
    $$("#rightpane [role=tab]").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.tab === id ? "true" : "false"); });
    $$("#rightpane > div[id^=tab-]").forEach(function (p) { p.hidden = p.id !== "tab-" + id; });
  }
  /* steps: [{line, vars:{name:value}, out:<chars of output so far>, stack?:[names]}] */
  function watch(box, run) {
    var steps = run.steps, lines = String(run.code).split("\n"), i = 0, timer = null, prev = {};
    if (!steps.length) { box.innerHTML = run.err ? '<div class="err" role="alert">' + esc(run.errHint || run.err) + "</div>" : '<p class="muted">Nothing ran. Write some code first.</p>'; return; }
    box.innerHTML = '<div class="row watchbar"><button class="btn small" data-w="prev" aria-label="Previous step">◀</button><button class="btn small primary" data-w="play">▶ Play</button><button class="btn small" data-w="next" aria-label="Next step">▶|</button>' +
      '<input type="range" min="0" max="' + (steps.length - 1) + '" value="0" data-w="range" aria-label="Step" style="flex:1;min-width:6rem"><select class="input" data-w="speed" aria-label="Speed" style="width:auto"><option value="900">Slow</option><option value="550" selected>Normal</option><option value="220">Fast</option></select><span class="muted mono" data-w="lbl"></span></div>' +
      '<div class="watchgrid"><div class="watchcode mono" data-w="code" tabindex="0" aria-label="Code. Use left and right arrows to step."></div><div><div class="muted" style="font-size:.8rem">Variables</div><div class="vboxes" data-w="vars"></div><div class="muted" style="font-size:.8rem;margin-top:.5rem">Output</div><pre class="out mono watchout" data-w="out"></pre><div class="sr-only" aria-live="polite" data-w="say"></div></div></div>' +
      (steps.length >= 300 ? '<p class="muted">Showing the first 300 steps.</p>' : "") + (run.err ? '<div class="err"><b>The program ended with an error.</b> ' + esc(run.errHint || String(run.err).split("\n")[0]) + "</div>" : "");
    var w = function (k) { return Q('[data-w="' + k + '"]', box); };
    function draw(announce) {
      var s = steps[i], names = Object.keys(s.vars || {});
      w("lbl").textContent = "step " + (i + 1) + "/" + steps.length; w("range").value = i;
      w("code").innerHTML = lines.map(function (l, k) { var cur = k + 1 === s.line; return '<div class="wl' + (cur ? " wcur" : "") + '"><span class="wn">' + (k + 1) + '</span><span class="wt">' + esc(l || " ") + "</span>" + (cur ? '<span class="warrow" aria-hidden="true">◀</span>' : "") + "</div>"; }).join("");
      var cur = Q(".wcur", w("code")); if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest" });
      w("vars").innerHTML = names.length ? names.map(function (n) { var v = String(s.vars[n]), cls = !(n in prev) ? " vnew" : prev[n] !== v ? " vchg" : ""; return '<div class="vbox' + cls + '"><span class="vn">' + esc(n) + '</span><span class="vv mono">' + esc(v.length > 60 ? v.slice(0, 57) + "..." : v) + "</span></div>"; }).join("") : '<span class="muted">no variables yet</span>';
      w("out").textContent = String(run.out || "").slice(0, s.out != null ? s.out : 0) || " ";
      prev = {}; names.forEach(function (n) { prev[n] = String(s.vars[n]); });
      if (announce) w("say").textContent = "Line " + s.line + (names.length ? ". " + names.map(function (n) { return n + " is " + s.vars[n]; }).join(", ") : "");
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; w("play").textContent = "▶ Play"; } }
    function go(k) { stop(); i = Math.max(0, Math.min(steps.length - 1, k)); draw(true); }
    w("prev").onclick = function () { go(i - 1); }; w("next").onclick = function () { go(i + 1); };
    w("range").oninput = function (e) { go(Number(e.target.value)); };
    w("play").onclick = function () { if (timer) { stop(); return; } if (i >= steps.length - 1) { i = 0; prev = {}; draw(false); } w("play").textContent = "⏸ Pause"; timer = setInterval(function () { if (!document.body.contains(box) || i >= steps.length - 1) { stop(); return; } i++; draw(false); }, Number(w("speed").value)); };
    w("code").onkeydown = function (e) { if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); go(i + 1); } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); go(i - 1); } };
    draw(false);
    window.addEventListener("hashchange", stop, { once: true });
  }
  function addWatchButton(m, getRun) {
    var run = Q("#runBtn"); if (!run || Q("#watchBtn")) return;
    var b = document.createElement("button"); b.className = "btn"; b.id = "watchBtn"; b.innerHTML = "👁 Watch it run"; run.parentNode.insertBefore(b, run.nextSibling);
    b.onclick = function () {
      var p = ensureTab("watch", "👁 Watch"); if (!p) return; selectTab("watch"); p.innerHTML = '<p class="muted">Preparing…</p>';
      Promise.resolve(getRun()).then(function (r) { if (r) watch(p, r); else p.innerHTML = '<p class="muted">This engine is not ready.</p>'; }).catch(function () { p.innerHTML = '<p class="muted">Could not run the code.</p>'; });
    };
  }
  /* Python: the original "Step" button is replaced by the richer Watch it run */
  var basePy = H.python;
  H.python = function (m, ed, mid) {
    if (basePy) basePy(m, ed, mid);
    try {
      var step = Q("#stepBtn"); if (step) step.style.display = "none";
      addWatchButton(m, function () {
        return C.ensurePy().then(function (api) { var code = ed.getCode(), sin = ($("#stdin") && $("#stdin").value) || "", r = api.run(code, sin === "" ? [] : sin.split("\n"), true); return { steps: r.steps || [], out: r.out || "", err: r.err, errHint: r.err ? AK.friendlyError(r.err).hint : "", code: code }; });
      });
    } catch (e) { /* the visualizer never blocks play */ }
  };
  /* Go: trace from the interpreter */
  var baseGo = UI.mission.gocode;
  UI.mission.gocode = function (v, m, w) {
    baseGo(v, m, w);
    try { addWatchButton(m, function () { var code = ($("#code") || {}).value || "", r = AK.goTrace(code, { stdin: m.stdin || [] }); return { steps: r.steps, out: r.out, err: r.err, errHint: r.err ? String(r.err).split("\n").slice(0, 2).join(" ") : "", code: code }; }); } catch (e) { /* ignore */ }
  };
  UI.watch = watch;

  /* ---------------------------------------------------------------- Web: click an element, jump to its line; flash what changed */
  /* Annotate every start tag in the learner's HTML with data-akl="<line>" (preview only, never used for grading). */
  function annotate(src) {
    var CM = "<" + "!--", re = new RegExp(CM + "[\\s\\S]*?-->|<(script|style)\\b([^>]*)>[\\s\\S]*?<\\/\\1\\s*>|<([a-zA-Z][a-zA-Z0-9-]*)\\b([^>]*)>", "g"), line = 1, last = 0;
    return String(src).replace(re, function (all, rawTag, rawAttrs, tag, attrs, off) {
      line += (String(src).slice(last, off).match(/\n/g) || []).length; last = off;
      if (all.indexOf(CM) === 0) return all;
      var name = rawTag || tag, at = rawTag ? rawAttrs : attrs, head = "<" + name + ' data-akl="' + line + '"' + at + ">";
      if (rawTag) return head + all.slice(all.indexOf(">") + 1);
      return head;
    });
  }
  var PICK = "(function(){var P=window.__akPrev||[],st=document.createElement('style');" +
    "st.textContent='.ak-hov{outline:2px dashed #f2b531!important;outline-offset:-2px;cursor:crosshair}@keyframes akf{0%{box-shadow:0 0 0 4px #3ecf8e}100%{box-shadow:0 0 0 0 rgba(62,207,142,0)}}.ak-flash{animation:akf 1.2s ease-out 1}@media(prefers-reduced-motion:reduce){.ak-flash{animation:none;outline:3px solid #3ecf8e}}';" +
    "(document.head||document.documentElement).appendChild(st);var hv=null;" +
    "function ln(e){var n=e&&e.closest?e.closest('[data-akl]'):null;return n}" +
    "document.addEventListener('mouseover',function(e){var n=ln(e.target);if(hv&&hv!==n)hv.classList.remove('ak-hov');hv=n;if(n)n.classList.add('ak-hov')},true);" +
    "document.addEventListener('mouseout',function(e){if(hv){hv.classList.remove('ak-hov');hv=null}},true);" +
    "document.addEventListener('click',function(e){var n=ln(e.target);if(n)parent.postMessage({ak:'web-pick',line:Number(n.getAttribute('data-akl')),tag:n.tagName.toLowerCase()},'*')},true);" +
    "window.addEventListener('load',function(){var els=[].slice.call(document.querySelectorAll('[data-akl]')),sig=els.map(function(n){var c='';for(var i=0;i<n.childNodes.length;i++){if(n.childNodes[i].nodeType===3)c+=n.childNodes[i].nodeValue.replace(/\\s+/g,' ').trim()}var a=[].slice.call(n.attributes).filter(function(x){return x.name!=='data-akl'&&x.name!=='class'||x.name==='class'&&n.className.replace(/ak-(hov|flash)/g,'').trim()}).map(function(x){return x.name+'='+(x.name==='class'?n.className.replace(/ak-(hov|flash)/g,'').trim():x.value)}).join(';');return n.tagName+'|'+a+'|'+c});" +
    "if(P.length){els.forEach(function(n,i){if(P[i]!==sig[i])n.classList.add('ak-flash')})}parent.postMessage({ak:'web-sig',sig:sig},'*')});})();";
  var prevSig = [], lastMid = null;
  var baseSrcdoc = AK.webSrcdoc;
  AK.webSrcdoc = function (html, tests, id) {
    if (tests) return baseSrcdoc(html, tests, id);
    var doc = baseSrcdoc(annotate(html)), inj = "<" + "script>window.__akPrev=" + JSON.stringify(prevSig).split("<").join("\\u003c") + ";" + PICK + "<" + "/script>";
    return /<\/body>/i.test(doc) ? doc.replace(/<\/body>/i, function () { return inj + "</body>"; }) : doc + inj;
  };
  window.addEventListener("message", function (e) {
    var d = e.data; if (!d || typeof d !== "object") return;
    if (d.ak === "web-sig" && Array.isArray(d.sig)) { prevSig = d.sig.slice(0, 400); return; }
    if (d.ak !== "web-pick") return;
    var ta = Q("#code"); if (!ta) return;
    var lines = ta.value.split("\n"), ln = Math.max(1, Math.min(lines.length, d.line)), start = 0;
    for (var k = 0; k < ln - 1; k++) start += lines[k].length + 1;
    try { ta.focus({ preventScroll: true }); ta.setSelectionRange(start, start + lines[ln - 1].length); } catch (er) { /* ignore */ }
    var lh = parseFloat(getComputedStyle(ta).lineHeight) || 20; ta.scrollTop = Math.max(0, (ln - 3) * lh);
    var chip = Q("#pickChip"); if (!chip) { chip = document.createElement("div"); chip.id = "pickChip"; chip.className = "chip gold"; chip.setAttribute("aria-live", "polite"); chip.style.cssText = "margin:.3rem 0;display:inline-block"; ta.parentNode.insertBefore(chip, ta); }
    chip.textContent = "↳ line " + ln + ": <" + d.tag + ">";
  });
  chain0();
  function chain0() {
    var baseWeb = UI.mission.web;
    UI.mission.web = function (v, m, w) { prevSig = []; baseWeb(v, m, w); var p = Q("#midpane"); if (p && !Q("#pickHelp")) { var h = document.createElement("p"); h.id = "pickHelp"; h.className = "muted"; h.style.cssText = "font-size:.8rem;margin:.2rem 0"; h.textContent = "Tip: click anything in the preview to jump to the line that made it. Changed parts flash green after each refresh."; p.appendChild(h); } };
  }
  UI.x8 = { annotate: annotate };
})();

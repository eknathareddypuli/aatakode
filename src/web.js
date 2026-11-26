/* AataKode Web Basics engine (no DOM of its own). A web mission gives the learner a whole HTML page. We run it in a
   sandboxed iframe (browser) or in jsdom (Node verifier) and then run the mission's checks inside that page.
   A check is {label, js}: `js` is a function body that gets the helpers below and returns true to pass,
   or anything else (shown as "got") to fail. Loaded by the browser and by the Node verifier. */
(function (root) {
  "use strict";
  const AK = typeof module !== "undefined" && module.exports ? require("./engine.js") : root.AK;

  /* Runs INSIDE the page. Must stay self-contained (no outer variables): it is stringified and injected. */
  function akWebRun(win, tests) {
    var doc = win.document;
    var NAMES = { red: "rgb(255, 0, 0)", green: "rgb(0, 128, 0)", blue: "rgb(0, 0, 255)", black: "rgb(0, 0, 0)", white: "rgb(255, 255, 255)", gray: "rgb(128, 128, 128)", grey: "rgb(128, 128, 128)", orange: "rgb(255, 165, 0)", yellow: "rgb(255, 255, 0)", purple: "rgb(128, 0, 128)", pink: "rgb(255, 192, 203)", brown: "rgb(165, 42, 42)", teal: "rgb(0, 128, 128)", navy: "rgb(0, 0, 128)", crimson: "rgb(220, 20, 60)", tomato: "rgb(255, 99, 71)", gold: "rgb(255, 215, 0)", coral: "rgb(255, 127, 80)", skyblue: "rgb(135, 206, 235)", lightblue: "rgb(173, 216, 230)", darkgreen: "rgb(0, 100, 0)", darkblue: "rgb(0, 0, 139)", maroon: "rgb(128, 0, 0)", lime: "rgb(0, 255, 0)", indigo: "rgb(75, 0, 130)", violet: "rgb(238, 130, 238)", transparent: "rgba(0, 0, 0, 0)" };
    function normColor(s) {
      s = String(s == null ? "" : s).trim().toLowerCase(); if (!s) return "";
      var m = /^#([0-9a-f]{3})$/.exec(s); if (m) { var h = m[1]; return "rgb(" + parseInt(h[0] + h[0], 16) + ", " + parseInt(h[1] + h[1], 16) + ", " + parseInt(h[2] + h[2], 16) + ")"; }
      m = /^#([0-9a-f]{6})$/.exec(s); if (m) { var g = m[1]; return "rgb(" + parseInt(g.slice(0, 2), 16) + ", " + parseInt(g.slice(2, 4), 16) + ", " + parseInt(g.slice(4, 6), 16) + ")"; }
      m = /^rgba?\(([^)]*)\)$/.exec(s); if (m) { var p = m[1].split(/[\s,\/]+/).filter(Boolean); if (p.length === 4 && Number(p[3]) === 1) p.length = 3; return (p.length === 4 ? "rgba(" : "rgb(") + p.join(", ") + ")"; }
      return NAMES[s] || s;
    }
    function $(s, root) { return (root || doc).querySelector(s); }
    function $$(s, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(s)); }
    function el(x) { return typeof x === "string" ? $(x) : x; }
    function css(x, prop) { var e = el(x); if (!e) return ""; var v = win.getComputedStyle(e).getPropertyValue(prop); if (/color|background/.test(prop)) return normColor(v); return String(v || "").trim(); }
    function px(x, prop) { var v = css(x, prop); var n = parseFloat(v); if (isNaN(n)) return NaN; if (/rem$/.test(v) || /em$/.test(v)) return n * 16; return n; }
    function txt(x) { var e = el(x); return e ? String(e.textContent).replace(/\s+/g, " ").trim() : ""; }
    function attr(x, a) { var e = el(x); return e ? e.getAttribute(a) : null; }
    function click(x) { var e = el(x); if (e) e.click(); return e; }
    function type(x, v) { var e = el(x); if (!e) return null; e.value = v; e.dispatchEvent(new win.Event("input", { bubbles: true })); e.dispatchEvent(new win.Event("change", { bubbles: true })); return e; }
    function key(x, k) { var e = el(x); if (!e) return null; e.dispatchEvent(new win.KeyboardEvent("keydown", { key: k, bubbles: true })); return e; }
    var H = { $: $, $$: $$, css: css, px: px, txt: txt, attr: attr, click: click, type: type, key: key, color: normColor, win: win, doc: doc };
    var errs = (win.__akErrs || []).slice();
    return tests.map(function (t) {
      var r = { label: t.label, hidden: !!t.hidden, expect: t.expect };
      if (t.kind === "web-clean") { r.ok = errs.length === 0; r.got = errs.join("; "); r.expect = "no JavaScript errors"; return r; }
      try {
        var f = new win.Function("H", "$", "$$", "css", "px", "txt", "attr", "click", "type", "key", "color", t.js);
        var v = f(H, $, $$, css, px, txt, attr, click, type, key, normColor);
        r.ok = v === true; if (!r.ok) { r.got = typeof v === "string" || typeof v === "number" ? String(v) : v === false || v === undefined ? "" : JSON.stringify(v); }
      } catch (e) { r.ok = false; r.got = "error: " + (e && e.message ? e.message : e); }
      return r;
    });
  }
  AK.webRunSrc = akWebRun.toString();

  const ERR_CAP = '<script>window.__akErrs=[];window.addEventListener("error",function(e){__akErrs.push(e.message||"error")});(function(){var P=function(k,a){try{parent.postMessage({ak:"web-console",kind:k,text:Array.prototype.map.call(a,function(x){return typeof x==="string"?x:(function(){try{return JSON.stringify(x)}catch(e){return String(x)}})()}).join(" ")},"*")}catch(e){}};var L=console.log;console.log=function(){P("log",arguments);L.apply(console,arguments)};window.addEventListener("error",function(e){P("error",[e.message])})})();<\/script>';
  const CSP = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; script-src \'unsafe-inline\' \'unsafe-eval\'; img-src data:; font-src data:">';
  const inject = (html, extraHead) => {
    html = String(html);
    if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + extraHead);
    if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => m + "<head>" + extraHead + "</head>");
    if (/^\s*<!doctype[^>]*>/i.test(html)) return html.replace(/^(\s*<!doctype[^>]*>)/i, (m) => m + "<head>" + extraHead + "</head>");
    return "<head>" + extraHead + "</head>" + html;
  };
  /* The page the sandboxed iframe loads. With `tests`, it also posts the results back to the parent. */
  AK.webSrcdoc = function (html, tests, id) {
    let doc = inject(html, CSP + ERR_CAP);
    if (tests) {
      const run = "<script>window.addEventListener('load',function(){setTimeout(function(){var r;try{r=(" + AK.webRunSrc + ")(window," + JSON.stringify(tests).split("<").join("\\u003c") + ")}catch(e){r=[{ok:false,label:'Your page',got:String(e)}]}parent.postMessage({ak:'web-result',id:" + JSON.stringify(id) + ",results:r},'*')},40)});<\/script>";
      doc = /<\/body>/i.test(doc) ? doc.replace(/<\/body>/i, () => run + "</body>") : doc + run;
    }
    return doc;
  };
  /* Node/jsdom: run the checks against a page. `JSDOM` is passed in so this file stays browser-safe. */
  AK.webGradeNode = function (JSDOM, html, tests) {
    const dom = new JSDOM(inject(html, ERR_CAP.replace(/parent\.postMessage/g, "void 0&&0&&parent.postMessage")), { runScripts: "dangerously", pretendToBeVisual: true });
    const win = dom.window; const errs = [];
    win.addEventListener("error", (e) => errs.push(e.message));
    const run = win.eval("(" + AK.webRunSrc + ")");
    const out = run(win, tests); win.close(); return out;
  };
  AK.webTests = (m) => m.tests.map((t) => ({ kind: t.kind, label: t.label, js: t.js, hidden: !!t.hidden, expect: t.expect }));
  if (typeof module !== "undefined" && module.exports) module.exports = AK;
})(typeof window !== "undefined" ? window : globalThis);

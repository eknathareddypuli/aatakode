/* AataKode shell: a bash-subset interpreter with a virtual file system, used by the Shell Scripting track.
   Supports pipelines, && || ; redirections, here-docs and here-strings, if/for/while/until/case, functions, [[ ]] and [ ],
   $(( )) and (( )), $( ), parameter expansion, indexed and associative arrays, globbing, brace expansion, printf and
   a set of common commands. Not supported: job control, awk, background jobs, process substitution, traps other than EXIT.
   Differential-tested against real bash 5.2. No DOM: loaded by the browser and by the Node verifier. */
(function (root) {
  "use strict";
  const AK = typeof module !== "undefined" && module.exports ? require("./engine.js") : root.AK;
  class ShErr extends Error { constructor(msg, line) { super(msg); this.line = line; } }
  class Exit { constructor(code) { this.code = code; } }
  class Ctl { constructor(kind, n) { this.kind = kind; this.n = n || 1; } } // break / continue / return
  const META = " \t\n;&|()<>";

  /* ------------------------------------------------------------------ lexer */
  function lex(src) {
    const toks = []; let i = 0, line = 1; const pendingHere = [];
    const n = src.length;
    const push = (t) => { t.line = line; toks.push(t); return t; };
    function readBalanced(open, close, start) { // returns index after the matching close, honouring quotes
      let depth = 1, j = start;
      while (j < n && depth > 0) {
        const c = src[j];
        if (c === "\\") { j += 2; continue; }
        if (c === "'") { j = src.indexOf("'", j + 1); if (j < 0) throw new ShErr("unexpected EOF while looking for matching `'", line); j++; continue; }
        if (c === '"') { j++; while (j < n && src[j] !== '"') { if (src[j] === "\\") j++; else if (src[j] === "$" && src[j + 1] === "(") { j = readBalanced("(", ")", j + 2) - 1; } j++; } j++; continue; }
        if (c === open && !(open === "(" && src[j - 1] === "$" && false)) depth++;
        else if (c === close) depth--;
        j++;
      }
      if (depth > 0) throw new ShErr("unexpected EOF while looking for matching `" + close + "'", line);
      return j;
    }
    function readWord() {
      let raw = "", hasQ = false; const start = i;
      const lt = toks[toks.length - 1]; const rx = lt && lt.t === "word" && lt.raw === "=~"; let pd = 0;
      while (i < n) {
        const c = src[i];
        if (rx) { if (c === "(") { pd++; raw += c; i++; continue; } if (c === ")" && pd > 0) { pd--; raw += c; i++; continue; } if ((c === " " || c === "\t" || c === "\n") && pd > 0) { raw += c; i++; continue; } }
        if (c === "(" && /^[A-Za-z_]\w*\+?=$/.test(raw) && (() => { for (let k = toks.length - 1; k >= 0 && toks[k].t === "word"; k--) if (/^(declare|local|typeset|readonly|export)$/.test(toks[k].raw)) return true; return false; })()) { const e = readBalanced("(", ")", i + 1); raw += "(" + src.slice(i + 1, e - 1).replace(/[ \t]+/g, "\\ ") + ")"; i = e; hasQ = true; continue; }
        if (META.indexOf(c) >= 0) break;
        if (c === "\\") { if (src[i + 1] === "\n") { i += 2; line++; continue; } raw += c + (src[i + 1] || ""); i += 2; hasQ = true; continue; }
        if (c === "'") { const e = src.indexOf("'", i + 1); if (e < 0) throw new ShErr("unexpected EOF while looking for matching `''", line); raw += src.slice(i, e + 1); i = e + 1; hasQ = true; continue; }
        if (c === '"') { let j = i + 1; while (j < n && src[j] !== '"') { if (src[j] === "\\") j++; else if (src[j] === "$" && src[j + 1] === "(") j = readBalanced("(", ")", j + 2) - 1; else if (src[j] === "$" && src[j + 1] === "{") j = readBalanced("{", "}", j + 2) - 1; else if (src[j] === "`") { j = src.indexOf("`", j + 1); } j++; } if (j >= n) throw new ShErr("unexpected EOF while looking for matching `\"'", line); raw += src.slice(i, j + 1); i = j + 1; hasQ = true; continue; }
        if (c === "$" && src[i + 1] === "'") { let j = i + 2; while (j < n && src[j] !== "'") { if (src[j] === "\\") j++; j++; } raw += src.slice(i, j + 1); i = j + 1; hasQ = true; continue; }
        if (c === "$" && src[i + 1] === "(") { const e = readBalanced("(", ")", i + 2); raw += src.slice(i, e); i = e; continue; }
        if (c === "$" && src[i + 1] === "{") { const e = readBalanced("{", "}", i + 2); raw += src.slice(i, e); i = e; continue; }
        if (c === "`") { const e = src.indexOf("`", i + 1); if (e < 0) throw new ShErr("unexpected EOF while looking for matching ``'", line); raw += src.slice(i, e + 1); i = e + 1; continue; }
        if ((c === "<" || c === ">") && src[i + 1] === "(") { throw new ShErr("process substitution is not supported here", line); }
        raw += c; i++;
      }
      return { raw, hasQ, start };
    }
    function readHeredocs() {
      while (pendingHere.length) {
        const h = pendingHere.shift(); let body = "";
        while (i < n) {
          let e = src.indexOf("\n", i); if (e < 0) e = n; let ln = src.slice(i, e); i = Math.min(n, e + 1); line++;
          const cmp = h.strip ? ln.replace(/^\t+/, "") : ln;
          if (cmp === h.word) { h.done = true; break; }
          body += (h.strip ? ln.replace(/^\t+/, "") : ln) + "\n";
        }
        h.tok.body = body; h.tok.quoted = h.quoted;
      }
    }
    while (i < n) {
      const c = src[i];
      if (c === " " || c === "\t") { i++; continue; }
      if (c === "\\" && src[i + 1] === "\n") { i += 2; line++; continue; }
      if (c === "#") { while (i < n && src[i] !== "\n") i++; continue; }
      if (c === "\n") { push({ t: "nl" }); i++; line++; if (pendingHere.length) readHeredocs(); continue; }
      const prevOp = !toks.length || toks[toks.length - 1].t === "op" || toks[toks.length - 1].t === "nl";
      if (c === "(" && src[i + 1] === "(" && (prevOp || (toks.length && toks[toks.length - 1].t === "word" && ["for", "do", "then", "else", "elif", "while", "until", "if"].indexOf(toks[toks.length - 1].raw) >= 0))) {
        // (( arith )) command; fall back to nested subshell when no closing ))
        try { const e = readBalanced("(", ")", i + 1); if (src[e - 2] === ")" ) { push({ t: "arith", src: src.slice(i + 2, e - 2) }); i = e; continue; } } catch (er) { /* subshell */ }
      }
      if (c === ";" ) { if (src[i + 1] === ";") { push({ t: "op", v: ";;" }); i += 2; } else { push({ t: "op", v: ";" }); i++; } continue; }
      if (c === "&") { if (src[i + 1] === "&") { push({ t: "op", v: "&&" }); i += 2; } else if (src[i + 1] === ">") { throw new ShErr("&> redirection is not supported; use > file 2>&1", line); } else { push({ t: "op", v: "&" }); i++; } continue; }
      if (c === "|") { if (src[i + 1] === "|") { push({ t: "op", v: "||" }); i += 2; } else { push({ t: "op", v: "|" }); i++; } continue; }
      if (c === "(" || c === ")") { push({ t: "op", v: c }); i++; continue; }
      if (c === "<" || c === ">") {
        let v = c; i++;
        if (c === "<" && src[i] === "<" && src[i + 1] === "<") { v = "<<<"; i += 2; }
        else if (c === "<" && src[i] === "<") { v = "<<"; i++; if (src[i] === "-") { v = "<<-"; i++; } }
        else if (c === ">" && src[i] === ">") { v = ">>"; i++; }
        else if (c === ">" && src[i] === "&") { v = ">&"; i++; }
        else if (c === "<" && src[i] === "&") { v = "<&"; i++; }
        const t = push({ t: "redir", v, fd: null });
        if (v === "<<" || v === "<<-") {
          while (src[i] === " " || src[i] === "\t") i++;
          const w = readWord(); let word = w.raw, quoted = false;
          if (/['"\\]/.test(word)) { quoted = true; word = word.replace(/['"\\]/g, ""); }
          pendingHere.push({ tok: t, word, quoted, strip: v === "<<-" });
        }
        continue;
      }
      const w = readWord();
      if (!w.raw && !w.hasQ) { i++; continue; }
      // a number glued to a redirection operator is a file descriptor
      const nx = src[i];
      if (/^\d+$/.test(w.raw) && (nx === "<" || nx === ">")) { i += 0; let v = nx; i++;
        if (nx === ">" && src[i] === ">") { v = ">>"; i++; } else if (nx === ">" && src[i] === "&") { v = ">&"; i++; } else if (nx === "<" && src[i] === "&") { v = "<&"; i++; }
        push({ t: "redir", v, fd: Number(w.raw) }); continue; }
      push({ t: "word", raw: w.raw, hasQ: w.hasQ });
    }
    if (pendingHere.length) readHeredocs();
    push({ t: "eof" });
    return toks;
  }

  /* ------------------------------------------------------------------ word parsing (quotes, $ expansions, braces) */
  function parseParam(inner, line) {
    // inner is the text between ${ and }
    let m, p = { k: "p", name: "", sub: null, op: "", arg: null };
    if (inner[0] === "#" && inner.length > 1 && inner[1] !== "}") { p.op = "len"; inner = inner.slice(1); }
    else if (inner[0] === "!" && inner.length > 1) { p.op = "keys"; inner = inner.slice(1); }
    m = /^([A-Za-z_][A-Za-z0-9_]*|[0-9]+|[@*#?$!-])/.exec(inner);
    if (!m) throw new ShErr("${" + inner + "}: bad substitution", line);
    p.name = m[1]; p.sub = null; let used = m[0].length;
    if (inner[used] === "[") { let d = 0, k = used; for (; k < inner.length; k++) { if (inner[k] === "[") d++; else if (inner[k] === "]") { d--; if (d === 0) break; } } if (k >= inner.length) throw new ShErr("${" + inner + "}: bad substitution", line); p.sub = inner.slice(used + 1, k); used = k + 1; }
    let rest = inner.slice(used);
    if (p.op) { if (rest) throw new ShErr("${" + inner + "}: bad substitution", line); return p; }
    if (!rest) return p;
    const ops = [":-", ":=", ":+", ":?", "##", "%%", "//", "/#", "/%", "^^", ",,", "-", "=", "+", "?", "#", "%", "/", "^", ","];
    if (rest[0] === ":" && !/^:[-=+?]/.test(rest)) { const mm = /^:\s*(-?[^:]*)(?::\s*(.*))?$/.exec(rest); p.op = "substr"; p.off = mm[1]; p.len = mm[2] != null ? mm[2] : null; return p; }
    for (const o of ops) if (rest.startsWith(o)) { p.op = o; p.arg = parseText(rest.slice(o.length), false, line); return p; }
    throw new ShErr("${" + inner + "}: bad substitution", line);
  }
  /* parseText: turns raw word text into parts. inDq=true means we are inside double quotes (no globbing, no splitting). */
  function parseText(raw, inDq, line) {
    const parts = []; let lit = "", i = 0; const n = raw.length;
    const flush = (q) => { if (lit !== "") { parts.push({ k: "s", v: lit, q: !!q || inDq }); lit = ""; } };
    while (i < n) {
      const c = raw[i];
      if (c === "\\") {
        const d = raw[i + 1];
        if (inDq) { if (d === "$" || d === "`" || d === '"' || d === "\\") { lit += d; i += 2; } else if (d === "\n") i += 2; else { lit += c; i++; } }
        else { if (d === "\n") { i += 2; continue; } flush(false); parts.push({ k: "s", v: d == null ? "\\" : d, q: true }); i += 2; }
        continue;
      }
      if (c === "'" && !inDq) { const e = raw.indexOf("'", i + 1); flush(false); parts.push({ k: "s", v: raw.slice(i + 1, e), q: true }); i = e + 1; continue; }
      if (c === '"' && !inDq) {
        let j = i + 1; while (j < n && raw[j] !== '"') { if (raw[j] === "\\") j++; else if (raw[j] === "$" && raw[j + 1] === "(") { j = balanced(raw, j + 2, "(", ")") - 1; } else if (raw[j] === "$" && raw[j + 1] === "{") { j = balanced(raw, j + 2, "{", "}") - 1; } j++; }
        flush(false); const inner = parseText(raw.slice(i + 1, j), true, line); parts.push({ k: "dq", parts: inner, empty: j === i + 1 }); i = j + 1; continue;
      }
      if (c === "$" && raw[i + 1] === "'" && !inDq) { const e = (() => { let j = i + 2; while (j < n && raw[j] !== "'") { if (raw[j] === "\\") j++; j++; } return j; })(); flush(); parts.push({ k: "s", v: unescape(raw.slice(i + 2, e)), q: true }); i = e + 1; continue; }
      if (c === "$") {
        const d = raw[i + 1];
        if (d === "(" && raw[i + 2] === "(") { const e = balanced(raw, i + 2, "(", ")"); if (raw[e - 2] === ")") { flush(); parts.push({ k: "a", src: raw.slice(i + 3, e - 2), q: inDq }); i = e; continue; } }
        if (d === "(") { const e = balanced(raw, i + 2, "(", ")"); flush(); parts.push({ k: "c", src: raw.slice(i + 2, e - 1), q: inDq }); i = e; continue; }
        if (d === "{") { const e = balanced(raw, i + 2, "{", "}"); flush(); const p = parseParam(raw.slice(i + 2, e - 1), line); p.q = inDq; parts.push(p); i = e; continue; }
        if (d != null && /[A-Za-z_]/.test(d)) { let j = i + 1; while (j < n && /[A-Za-z0-9_]/.test(raw[j])) j++; flush(); parts.push({ k: "p", name: raw.slice(i + 1, j), sub: null, op: "", q: inDq }); i = j; continue; }
        if (d != null && /[0-9@*#?$!-]/.test(d)) { flush(); parts.push({ k: "p", name: d, sub: null, op: "", q: inDq }); i += 2; continue; }
        lit += c; i++; continue;
      }
      if (c === "`") { const e = raw.indexOf("`", i + 1); flush(); parts.push({ k: "c", src: raw.slice(i + 1, e).replace(/\\`/g, "`"), q: inDq }); i = e + 1; continue; }
      if (c === "~" && !inDq && i === 0 && (n === 1 || raw[1] === "/")) { flush(); parts.push({ k: "s", v: "/home/user", q: true }); i++; continue; }
      lit += c; i++;
    }
    flush(); return parts;
  }
  function balanced(s, start, open, close) {
    let depth = 1, j = start;
    while (j < s.length && depth > 0) {
      const c = s[j];
      if (c === "\\") { j += 2; continue; }
      if (c === "'") { j = s.indexOf("'", j + 1) + 1; continue; }
      if (c === '"') { j++; while (j < s.length && s[j] !== '"') { if (s[j] === "\\") j++; j++; } j++; continue; }
      if (c === open) depth++; else if (c === close) depth--;
      j++;
    }
    return j;
  }
  /* brace expansion on raw word text: {a,b} and {1..5} / {a..e}; quotes and ${ } are left alone */
  function braceExpand(raw) {
    let depth = 0, start = -1, i = 0;
    const n = raw.length;
    for (; i < n; i++) {
      const c = raw[i];
      if (c === "\\") { i++; continue; }
      if (c === "'") { i = raw.indexOf("'", i + 1); if (i < 0) return [raw]; continue; }
      if (c === '"') { i++; while (i < n && raw[i] !== '"') { if (raw[i] === "\\") i++; i++; } continue; }
      if (c === "$" && raw[i + 1] === "{") { i = balanced(raw, i + 2, "{", "}") - 1; continue; }
      if (c === "$" && raw[i + 1] === "(") { i = balanced(raw, i + 2, "(", ")") - 1; continue; }
      if (c === "{") { if (depth === 0) start = i; depth++; }
      else if (c === "}" && depth > 0) {
        depth--;
        if (depth === 0) {
          const body = raw.slice(start + 1, i), pre = raw.slice(0, start), post = raw.slice(i + 1);
          // split body at top level commas
          const items = []; let d = 0, cur = ""; for (let j = 0; j < body.length; j++) { const ch = body[j]; if (ch === "\\") { cur += ch + (body[j + 1] || ""); j++; continue; } if (ch === "{") d++; if (ch === "}") d--; if (ch === "," && d === 0) { items.push(cur); cur = ""; } else cur += ch; } items.push(cur);
          let alts = null;
          if (items.length > 1) alts = items;
          else { const m = /^(-?\d+)\.\.(-?\d+)(?:\.\.(-?\d+))?$/.exec(body) || /^([a-zA-Z])\.\.([a-zA-Z])(?:\.\.(-?\d+))?$/.exec(body);
            if (m) { alts = []; const num = /\d/.test(m[1]); let a = num ? Number(m[1]) : m[1].charCodeAt(0), b = num ? Number(m[2]) : m[2].charCodeAt(0), st = Math.abs(Number(m[3] || 1)) || 1; const pad = num && (/^-?0\d/.test(m[1]) || /^-?0\d/.test(m[2])) ? Math.max(m[1].length, m[2].length) : 0;
              for (let x = a; a <= b ? x <= b : x >= b; x += a <= b ? st : -st) { let s = num ? String(x) : String.fromCharCode(x); if (pad) s = (x < 0 ? "-" : "") + String(Math.abs(x)).padStart(pad - (x < 0 ? 1 : 0), "0"); alts.push(s); } } }
          if (!alts) { depth = 0; start = -1; continue; }
          const out = []; alts.forEach((a) => braceExpand(pre + a + post).forEach((r) => out.push(r))); return out;
        }
      }
    }
    return [raw];
  }
  function mkWord(tok, line) { // returns array of words (brace expansion can make several)
    const raws = /[{]/.test(tok.raw) ? braceExpand(tok.raw) : [tok.raw];
    return raws.map((r) => ({ parts: parseText(r, false, line), raw: r, line }));
  }

  /* ------------------------------------------------------------------ parser */
  const KW = new Set(["if", "then", "elif", "else", "fi", "for", "in", "do", "done", "while", "until", "case", "esac", "function", "{", "}", "!", "[[", "]]"]);
  function parse(src) {
    const toks = lex(src); let p = 0;
    const peek = () => toks[p], next = () => toks[p++];
    const isKw = (t, k) => t.t === "word" && !t.hasQ && t.raw === k;
    const isOp = (t, v) => t.t === "op" && t.v === v;
    const err = (t, what) => new ShErr(what || "syntax error near unexpected token `" + (t.t === "eof" ? "newline" : t.raw || t.v || t.t) + "'", t.line);
    const skipNl = () => { while (peek().t === "nl") p++; };
    const skipSep = () => { while (peek().t === "nl" || isOp(peek(), ";")) p++; };
    function parseList(stop) { // stop: function(token)->bool
      const items = []; skipSep();
      while (!(peek().t === "eof") && !stop(peek())) {
        let c = parseAndOr(); let bg = false;
        if (isOp(peek(), "&")) { next(); bg = true; }
        items.push({ c, bg });
        if (peek().t === "nl" || isOp(peek(), ";") || isOp(peek(), "&")) skipSep(); else if (!stop(peek()) && peek().t !== "eof") throw err(peek());
      }
      return { t: "list", items };
    }
    function parseAndOr() {
      let left = parsePipeline(); const rest = [];
      while (isOp(peek(), "&&") || isOp(peek(), "||")) { const op = next().v; skipNl(); rest.push({ op, p: parsePipeline() }); }
      return rest.length ? { t: "andor", first: left, rest } : left;
    }
    function parsePipeline() {
      let neg = false; if (isKw(peek(), "!")) { next(); neg = true; }
      const cmds = [parseCommand()];
      while (isOp(peek(), "|")) { next(); skipNl(); cmds.push(parseCommand()); }
      return cmds.length === 1 && !neg ? cmds[0] : { t: "pipe", cmds, neg };
    }
    function parseRedirs(node) {
      const rs = [];
      while (peek().t === "redir") { const r = next(); if (r.v === "<<" || r.v === "<<-") { rs.push({ v: "<<", fd: r.fd, body: r.body, quoted: r.quoted }); continue; } const t = next(); if (t.t !== "word") throw err(t); rs.push({ v: r.v, fd: r.fd, word: mkWord(t, t.line)[0] }); }
      if (rs.length) node.redirs = (node.redirs || []).concat(rs);
      return node;
    }
    function parseCommand() {
      const t = peek();
      if (t.t === "arith") { next(); return parseRedirs({ t: "arith", src: t.src, line: t.line }); }
      if (isOp(t, "(")) { next(); const body = parseList((x) => isOp(x, ")")); if (!isOp(peek(), ")")) throw err(peek()); next(); return parseRedirs({ t: "subshell", body }); }
      if (isKw(t, "{")) { next(); const body = parseList((x) => isKw(x, "}")); if (!isKw(peek(), "}")) throw err(peek()); next(); return parseRedirs({ t: "group", body }); }
      if (isKw(t, "if")) return parseRedirs(parseIf());
      if (isKw(t, "for")) return parseRedirs(parseFor());
      if (isKw(t, "while") || isKw(t, "until")) { const until = next().raw === "until"; const cond = parseList((x) => isKw(x, "do")); if (!isKw(peek(), "do")) throw err(peek()); next(); const body = parseList((x) => isKw(x, "done")); if (!isKw(peek(), "done")) throw err(peek()); next(); return parseRedirs({ t: "while", until, cond, body }); }
      if (isKw(t, "case")) return parseRedirs(parseCase());
      if (isKw(t, "[[")) return parseRedirs(parseCond());
      if (isKw(t, "function")) { next(); const name = next().raw; if (isOp(peek(), "(")) { next(); next(); } skipNl(); const body = parseCommand(); return { t: "func", name, body }; }
      if (t.t === "word" && !t.hasQ && toks[p + 1] && isOp(toks[p + 1], "(") && toks[p + 2] && isOp(toks[p + 2], ")") && /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(t.raw)) { next(); next(); next(); skipNl(); const body = parseCommand(); return { t: "func", name: t.raw, body }; }
      return parseSimple();
    }
    function parseIf() {
      next(); const cond = parseList((x) => isKw(x, "then")); if (!isKw(peek(), "then")) throw err(peek()); next();
      const then = parseList((x) => isKw(x, "elif") || isKw(x, "else") || isKw(x, "fi")); const node = { t: "if", cond, then, elifs: [], els: null };
      while (isKw(peek(), "elif")) { next(); const c = parseList((x) => isKw(x, "then")); if (!isKw(peek(), "then")) throw err(peek()); next(); const b = parseList((x) => isKw(x, "elif") || isKw(x, "else") || isKw(x, "fi")); node.elifs.push({ cond: c, then: b }); }
      if (isKw(peek(), "else")) { next(); node.els = parseList((x) => isKw(x, "fi")); }
      if (!isKw(peek(), "fi")) throw err(peek()); next(); return node;
    }
    function parseFor() {
      next();
      if (peek().t === "arith") { const a = next(); skipSep(); if (!isKw(peek(), "do")) throw err(peek()); next(); const body = parseList((x) => isKw(x, "done")); if (!isKw(peek(), "done")) throw err(peek()); next(); const parts = a.src.split(";"); if (parts.length !== 3) throw new ShErr("syntax error in for ((...))", a.line); return { t: "cfor", init: parts[0], cond: parts[1], step: parts[2], body }; }
      const v = next(); if (v.t !== "word") throw err(v); let words = null;
      skipNl();
      if (isKw(peek(), "in")) { next(); words = []; while (peek().t === "word" || (peek().t === "redir")) { const w = next(); if (w.t !== "word") throw err(w); mkWord(w, w.line).forEach((x) => words.push(x)); } }
      skipSep(); if (!isKw(peek(), "do")) throw err(peek()); next();
      const body = parseList((x) => isKw(x, "done")); if (!isKw(peek(), "done")) throw err(peek()); next();
      return { t: "for", name: v.raw, words, body };
    }
    function parseCase() {
      next(); const w = next(); if (w.t !== "word") throw err(w); skipNl(); if (!isKw(peek(), "in")) throw err(peek()); next(); skipSep();
      const clauses = [];
      while (!isKw(peek(), "esac")) {
        if (isOp(peek(), "(")) next();
        const pats = []; for (;;) { const x = next(); if (x.t !== "word") throw err(x); pats.push(mkWord(x, x.line)[0]); if (isOp(peek(), "|")) { next(); continue; } break; }
        if (!isOp(peek(), ")")) throw err(peek()); next();
        const body = parseList((x) => isOp(x, ";;") || isKw(x, "esac")); clauses.push({ pats, body });
        if (isOp(peek(), ";;")) { next(); skipSep(); }
      }
      next(); return { t: "case", word: mkWord(w, w.line)[0], clauses };
    }
    function parseCond() {
      const startTok = next();
      const words = [];
      const stack = [];
      function primary() {
        const t = peek();
        if (isOp(t, "(")) { next(); const e = orExpr(); if (!isOp(peek(), ")")) throw err(peek()); next(); return e; }
        if (isKw(t, "!")) { next(); return { op: "!", e: primary() }; }
        if (t.t !== "word") throw err(t);
        const a = next();
        if (isKw(a, "]]")) throw err(a);
        if (/^-[a-zA-Z]$/.test(a.raw) && !a.hasQ && peek().t === "word" && !isKw(peek(), "]]")) { const b = next(); return { op: "u", f: a.raw, a: mkWord(b, b.line)[0] }; }
        const o = peek();
        if (o.t === "word" && !o.hasQ && /^(==|=|!=|=~|-eq|-ne|-lt|-le|-gt|-ge|-nt|-ot|-ef)$/.test(o.raw)) { next(); const b = next(); if (b.t !== "word") throw err(b); return { op: "b", f: o.raw, a: mkWord(a, a.line)[0], b: mkWord(b, b.line)[0], rawb: b }; }
        if (o.t === "redir" && (o.v === "<" || o.v === ">")) { next(); const b = next(); return { op: "b", f: o.v, a: mkWord(a, a.line)[0], b: mkWord(b, b.line)[0] }; }
        return { op: "u", f: "-n", a: mkWord(a, a.line)[0] };
      }
      function andExpr() { let l = primary(); while (isOp(peek(), "&&")) { next(); l = { op: "&&", l, r: primary() }; } return l; }
      function orExpr() { let l = andExpr(); while (isOp(peek(), "||")) { next(); l = { op: "||", l, r: andExpr() }; } return l; }
      const e = orExpr(); if (!isKw(peek(), "]]")) throw err(peek(), "syntax error in conditional expression"); next();
      return { t: "cond", e, line: startTok.line };
    }
    function parseSimple() {
      const node = { t: "simple", assigns: [], words: [], redirs: [], line: peek().line };
      for (;;) {
        const t = peek();
        if (t.t === "redir") { const r = next(); if (r.v === "<<" || r.v === "<<-") { node.redirs.push({ v: "<<", fd: r.fd, body: r.body, quoted: r.quoted }); continue; } const tg = next(); if (tg.t !== "word") throw err(tg); node.redirs.push({ v: r.v, fd: r.fd, word: mkWord(tg, tg.line)[0] }); continue; }
        if (t.t !== "word") break;
        if (!node.words.length) {
          const m = /^([A-Za-z_][A-Za-z0-9_]*)(\[[^\]]*\])?(\+?=)([\s\S]*)$/.exec(t.raw);
          if (m && !t.raw.startsWith("=")) {
            next(); const val = m[4];
            if (val.startsWith("(") && !t.hasQ || (val === "" && isOp(peek(), "(") )) {
              // array literal: name=( ... ) ; the lexer split on parentheses, so rebuild from tokens
              let items = []; if (val === "(") { /* tokens follow */ } else if (val === "") { next(); }
              while (!isOp(peek(), ")")) { const w = next(); if (w.t === "nl") continue; if (w.t !== "word") throw err(w); mkWord(w, w.line).forEach((x) => items.push(x)); }
              next(); node.assigns.push({ name: m[1], sub: m[2] ? m[2].slice(1, -1) : null, append: m[3] === "+=", arr: items }); continue;
            }
            const words = mkWord({ raw: val }, t.line);
            node.assigns.push({ name: m[1], sub: m[2] ? m[2].slice(1, -1) : null, append: m[3] === "+=", word: words[0] }); continue;
          }
        }
        if (!node.words.length && KW.has(t.raw) && !t.hasQ && node.assigns.length === 0 && ["then", "elif", "else", "fi", "do", "done", "esac", "}", "in", "]]"].indexOf(t.raw) >= 0) throw err(t);
        next(); mkWord(t, t.line).forEach((w) => node.words.push(w));
      }
      if (!node.words.length && !node.assigns.length && !node.redirs.length) throw err(peek());
      return node;
    }
    const prog = parseList(() => false);
    if (peek().t !== "eof") throw err(peek());
    return prog;
  }

  /* ------------------------------------------------------------------ arithmetic */
  function arith(src, sh) {
    let i = 0; const s = src;
    const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
    const lookup = (name) => { let v = sh.getVar(name); if (v === "" || v == null) return 0; if (/^-?\d+$/.test(v.trim())) return Number(v); if (/^[A-Za-z_]\w*$/.test(v.trim()) && v.trim() !== name) return lookup(v.trim()); return arith(v, sh); };
    const assign = (name, val) => { sh.setVar(name, String(val)); return val; };
    function ternary() { const c = lor(); ws(); if (s[i] === "?") { i++; const a = ternary(); ws(); if (s[i] !== ":") throw new ShErr("arithmetic syntax error: `:' expected"); i++; const b = ternary(); return c ? a : b; } return c; }
    function expr() { return comma(); }
    function comma() { let v = assignExpr(); ws(); while (s[i] === ",") { i++; v = assignExpr(); ws(); } return v; }
    function assignExpr() {
      ws(); const save = i; const m = /^([A-Za-z_]\w*)\s*(\*\*=|<<=|>>=|\+=|-=|\*=|\/=|%=|&=|\^=|\|=|=)(?!=)/.exec(s.slice(i));
      if (m) { i += m[0].length; const r = assignExpr(); const cur = m[2] === "=" ? 0 : lookup(m[1]); const ops = { "+=": cur + r, "-=": cur - r, "*=": cur * r, "/=": Math.trunc(cur / r), "%=": cur % r, "<<=": cur << r, ">>=": cur >> r, "&=": cur & r, "^=": cur ^ r, "|=": cur | r, "**=": Math.pow(cur, r), "=": r }; return assign(m[1], ops[m[2]]); }
      i = save; return ternary();
    }
    const bin = (next, ops) => () => { let l = next(); for (;;) { ws(); let hit = null; for (const o of ops) if (s.startsWith(o, i) && !(o.length === 1 && "&|<>=*".includes(o) && s[i + 1] === o && false)) { // avoid matching prefixes of longer ops
        if ((o === "&" && s[i + 1] === "&") || (o === "|" && s[i + 1] === "|") || (o === "<" && (s[i + 1] === "<" || s[i + 1] === "=")) || (o === ">" && (s[i + 1] === ">" || s[i + 1] === "=")) || (o === "*" && s[i + 1] === "*")) continue; if ((o === "+" || o === "-" || o === "*" || o === "/" || o === "%" || o === "&" || o === "|" || o === "^" || o === "<<" || o === ">>") && s[i + o.length] === "=" && s[i + o.length + 1] !== "=") continue; hit = o; break; }
      if (!hit) return l; i += hit.length; const r = next(); l = apply(hit, l, r); } };
    function apply(o, a, b) { switch (o) { case "||": return a || b ? 1 : 0; case "&&": return a && b ? 1 : 0; case "|": return a | b; case "^": return a ^ b; case "&": return a & b; case "==": return a === b ? 1 : 0; case "!=": return a !== b ? 1 : 0; case "<=": return a <= b ? 1 : 0; case ">=": return a >= b ? 1 : 0; case "<": return a < b ? 1 : 0; case ">": return a > b ? 1 : 0; case "<<": return a << b; case ">>": return a >> b; case "+": return a + b; case "-": return a - b; case "*": return a * b; case "/": if (b === 0) throw new ShErr("division by 0 (error token is \"" + String(b) + "\")"); return Math.trunc(a / b); case "%": if (b === 0) throw new ShErr("division by 0 (error token is \"0\")"); return a % b; } throw new ShErr("arithmetic: bad operator " + o); }
    const power = () => { let b = unary(); ws(); if (s.startsWith("**", i)) { i += 2; const e = power(); return Math.pow(b, e); } return b; };
    function unary() {
      ws(); const c = s[i];
      if (c === "+" && s[i + 1] === "+" || c === "-" && s[i + 1] === "-") { const op = s.slice(i, i + 2); i += 2; ws(); const m = /^[A-Za-z_]\w*/.exec(s.slice(i)); if (!m) throw new ShErr("arithmetic syntax error"); i += m[0].length; return assign(m[0], lookup(m[0]) + (op === "++" ? 1 : -1)); }
      if (c === "-") { i++; return -unary(); } if (c === "+") { i++; return unary(); } if (c === "!") { i++; return unary() ? 0 : 1; } if (c === "~") { i++; return ~unary(); }
      return postfix();
    }
    function postfix() {
      ws(); const c = s[i];
      if (c === "(") { i++; const v = expr(); ws(); if (s[i] !== ")") throw new ShErr("arithmetic syntax error: missing `)'"); i++; return v; }
      let m = /^(0[xX][0-9a-fA-F]+|\d+#[0-9a-zA-Z]+|\d+)/.exec(s.slice(i));
      if (m) { i += m[0].length; const t = m[0]; if (/^0[xX]/.test(t)) return parseInt(t, 16); if (t.includes("#")) { const [b, d] = t.split("#"); return parseInt(d, Number(b)); } if (/^0\d/.test(t)) return parseInt(t, 8); return Number(t); }
      m = /^[A-Za-z_]\w*/.exec(s.slice(i));
      if (m) { i += m[0].length; const name = m[0]; let sub = null; if (s[i] === "[") { const e = s.indexOf("]", i); sub = s.slice(i + 1, e); i = e + 1; }
        ws(); if ((s[i] === "+" && s[i + 1] === "+") || (s[i] === "-" && s[i + 1] === "-")) { const d = s[i] === "+" ? 1 : -1; i += 2; const old = sub != null ? Number(sh.getElem(name, sub) || 0) : lookup(name); if (sub != null) sh.setElem(name, sub, String(old + d)); else assign(name, old + d); return old; }
        return sub != null ? (Number(sh.getElem(name, sub)) || 0) : lookup(name); }
      throw new ShErr("arithmetic syntax error: operand expected (error token is \"" + s.slice(i) + "\")");
    }
    const mul = bin(power, ["*", "/", "%"]), add = bin(mul, ["+", "-"]), shf = bin(add, ["<<", ">>"]), cmp = bin(shf, ["<=", ">=", "<", ">"]), eq = bin(cmp, ["==", "!="]), band = bin(eq, ["&"]), bxor = bin(band, ["^"]), bor = bin(bxor, ["|"]), land = bin(bor, ["&&"]), lor = bin(land, ["||"]);
    if (!s.trim()) return 0;
    const v = expr(); ws(); if (i < s.length) throw new ShErr("arithmetic syntax error in expression (error token is \"" + s.slice(i) + "\")");
    return v;
  }

  /* ------------------------------------------------------------------ glob helpers */
  function globToRegex(segs, anchored) {
    let re = "";
    segs.forEach((sg) => {
      if (sg.q) { re += sg.s.replace(/[.*+?^${}()|[\]\\\/-]/g, "\\$&"); return; }
      const t = sg.s;
      for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (c === "*") re += "[\\s\\S]*"; else if (c === "?") re += "[\\s\\S]";
        else if (c === "[") { const e = t.indexOf("]", i + 2); if (e < 0) { re += "\\["; continue; } let cls = t.slice(i + 1, e); cls = cls.replace(/^!/, "^").replace(/\[:alpha:\]/g, "a-zA-Z").replace(/\[:digit:\]/g, "0-9").replace(/\[:alnum:\]/g, "a-zA-Z0-9").replace(/\[:upper:\]/g, "A-Z").replace(/\[:lower:\]/g, "a-z").replace(/\[:space:\]/g, "\\s").replace(/\\/g, "\\\\"); re += "[" + cls + "]"; i = e; }
        else re += c.replace(/[.+^${}()|\\\/-]/g, "\\$&");
      }
    });
    return new RegExp((anchored === false ? "" : "^") + re + (anchored === false ? "" : "$"), "");
  }
  const hasGlob = (segs) => segs.some((s) => !s.q && /[*?[]/.test(s.s));
  const plainOf = (segs) => segs.map((s) => s.s).join("");

  /* ------------------------------------------------------------------ interpreter */
  class Shell {
    constructor(opts) {
      opts = opts || {};
      this.files = new Map(); this.dirs = new Set(["/", "/home/user", "/tmp"]);
      this.cwd = "/home/user"; this.vars = new Map(); this.funcs = new Map(); this.locals = []; this.args = (opts.args || []).slice(); this.scriptName = opts.name || "script.sh";
      this.status = 0; this.steps = 0; this.limit = opts.limit || 400000; this.errexit = false; this.nounset = false; this.pipefail = false; this.depth = 0; this.traps = {};
      this.out = ""; this.err = ""; this.stdin = { buf: String(opts.stdin || ""), pos: 0 }; this.line = 0; this.noErrexit = 0;
      Object.keys(opts.files || {}).forEach((f) => this.writeFile(this.abs(f), String(opts.files[f])));
      Object.keys(opts.env || {}).forEach((k) => this.vars.set(k, { s: String(opts.env[k]) }));
      for (const [k, v] of Object.entries({ HOME: "/home/user", USER: "user", PATH: "/usr/bin:/bin", IFS: " \t\n", PWD: this.cwd, OLDPWD: "", SHELL: "/bin/bash", HOSTNAME: "aatakode", RANDOM: "4", BASH_VERSION: "5.2.21(1)-release" })) if (!this.vars.has(k)) this.vars.set(k, { s: v });
    }
    /* ---- variables */
    getVar(name) {
      if (/^[0-9]+$/.test(name)) return name === "0" ? this.scriptName : this.args[Number(name) - 1] != null ? this.args[Number(name) - 1] : "";
      switch (name) { case "?": return String(this.status); case "#": return String(this.args.length); case "$": return "4242"; case "@": case "*": return this.args.join(" "); case "!": return ""; case "-": return ""; }
      const v = this.vars.get(name); if (!v) { if (this.nounset) throw new ShErr(name + ": unbound variable", this.line); return ""; }
      if (v.a) return v.a[0] != null ? v.a[0] : ""; if (v.m) return v.m.get("0") || ""; return v.s != null ? v.s : "";
    }
    isSet(name) { if (/^[0-9]+$/.test(name)) return name === "0" || this.args[Number(name) - 1] != null; if ("@*#?$".includes(name)) return true; const v = this.vars.get(name); return !!v && !(v.a && !v.a.length && v.unsetArr); }
    setVar(name, val) { const v = this.vars.get(name); if (v && v.ro) throw new ShErr(name + ": readonly variable", this.line); if (v && v.a) { v.a[0] = val; return; } if (v && v.m) { v.m.set("0", val); return; } if (v && v.int) val = String(arith(String(val), this)); this.vars.set(name, Object.assign({}, v || {}, { s: String(val) })); }
    getElem(name, sub) { const v = this.vars.get(name); if (!v) return ""; if (v.m) return v.m.has(sub) ? v.m.get(sub) : ""; let idx = String(sub).trim(); if (v.a) { let k = Number(/^-?\d+$/.test(idx) ? idx : arith(idx, this)); if (k < 0) k += v.a.length; return v.a[k] != null ? v.a[k] : ""; } return Number(arith(idx, this)) === 0 ? v.s || "" : ""; }
    setElem(name, sub, val) { let v = this.vars.get(name); if (v && v.ro) throw new ShErr(name + ": readonly variable", this.line); if (!v || (!v.a && !v.m)) { v = { a: v && v.s != null ? [v.s] : [] }; this.vars.set(name, v); } if (v.m) { v.m.set(String(sub), val); return; } let k = Number(arith(String(sub), this)); if (k < 0) k += v.a.length; v.a[k] = val; }
    tick() { if (++this.steps > this.limit) throw new ShErr("script took too long (infinite loop?)", this.line); }
    /* ---- file system */
    abs(p) { if (!p) return this.cwd; let q = p[0] === "/" ? p : this.cwd + "/" + p; const out = []; q.split("/").forEach((s) => { if (s === "" || s === ".") return; if (s === "..") out.pop(); else out.push(s); }); return "/" + out.join("/"); }
    writeFile(p, c) { this.files.set(p, c); let d = p; while ((d = d.slice(0, d.lastIndexOf("/")) || "/") !== "/") this.dirs.add(d); }
    isDir(p) { return this.dirs.has(p); }
    list(dir) { const base = dir === "/" ? "/" : dir + "/"; const out = new Set(); this.files.forEach((_, f) => { if (f.startsWith(base)) out.add(f.slice(base.length).split("/")[0]); }); this.dirs.forEach((d) => { if (d !== dir && d.startsWith(base)) out.add(d.slice(base.length).split("/")[0]); }); return [...out].sort(cmpC); }
    globFiles(segs) { // pattern may contain slashes
      const pat = plainOf(segs.map((s) => ({ s: s.s, q: s.q }))); const abs = pat[0] === "/"; const parts = []; let cur = [];
      segs.forEach((sg) => { if (sg.q) { cur.push(sg); return; } const pieces = sg.s.split("/"); pieces.forEach((pc, k) => { if (k > 0) { parts.push(cur); cur = []; } if (pc !== "") cur.push({ s: pc, q: false }); }); });
      parts.push(cur); let results = [abs ? "/" : ""];
      parts.forEach((ps, idx) => { if (!ps.length) return; const last = idx === parts.length - 1; const next = [];
        results.forEach((base) => { if (!hasGlob(ps)) { const nm = plainOf(ps); const full = base + (base && !base.endsWith("/") ? "/" : "") + nm; const a = this.abs(full); if (this.files.has(a) || this.isDir(a)) next.push(full); return; }
          const re = globToRegex(ps); const dirAbs = this.abs(base || "."); const hidden = plainOf(ps)[0] === ".";
          this.list(dirAbs).forEach((e) => { if (e[0] === "." && !hidden) return; if (re.test(e)) { const full = base + (base && !base.endsWith("/") ? "/" : "") + e; if (!last && !this.isDir(this.abs(full))) return; next.push(full); } }); });
        results = next; });
      return results.sort(cmpC);
    }
    /* ---- expansion */
    expandParam(p, qd) {
      // returns {vals: [..], join: bool}; vals for @ and arrays
      const name = p.name, sub = p.sub;
      const isArr = sub === "@" || sub === "*" || (name === "@" || name === "*");
      let list = null, scalar = null;
      if (name === "@" || name === "*") list = this.args.slice();
      else if (sub === "@" || sub === "*") { const v = this.vars.get(name); list = !v ? [] : v.m ? [...v.m.values()] : v.a ? v.a.filter((x) => x !== undefined) : [v.s]; }
      else if (sub != null) scalar = this.getElem(name, this.expandStr(parseText(sub, false, this.line)));
      else scalar = null;
      if (p.op === "keys") { const v = this.vars.get(name); const ks = !v ? [] : v.m ? [...v.m.keys()] : v.a ? v.a.map((x, i) => (x !== undefined ? String(i) : null)).filter((x) => x !== null) : ["0"]; return { vals: ks, star: false }; }
      if (p.op === "len") { if (isArr) return { vals: [String(list.length)] }; const val = scalar != null ? scalar : this.getVar(name); return { vals: [String([...val].length)] }; }
      const unsetCheck = () => { if (isArr) return list.length === 0; if (sub != null) return !this.vars.has(name) || (scalar === "" && !this.elemSet(name, sub)); return !this.isSetNoThrow(name); };
      const emptyCheck = () => { if (isArr) return list.length === 0; return (scalar != null ? scalar : this.getVarQuiet(name)) === ""; };
      const cur = () => (isArr ? list.join(name === "*" || sub === "*" ? this.ifsFirst() : " ") : scalar != null ? scalar : this.getVarQuiet(name));
      const arg = () => (p.arg ? this.expandStr(p.arg) : "");
      switch (p.op) {
        case "": if (isArr) return { vals: list, star: name === "*" || sub === "*" }; if (scalar == null && this.nounset && !this.isSetNoThrow(name)) throw new ShErr(name + ": unbound variable", this.line); return { vals: [scalar != null ? scalar : this.getVarQuiet(name)] };
        case ":-": return unsetCheck() || emptyCheck() ? { vals: [arg()] } : { vals: isArr ? list : [cur()] };
        case "-": return unsetCheck() ? { vals: [arg()] } : { vals: isArr ? list : [cur()] };
        case ":=": case "=": { const need = op2(p.op) === ":" ? unsetCheck() || emptyCheck() : unsetCheck(); if (need) { const a = arg(); if (sub != null) this.setElem(name, this.expandStr(parseText(sub, false)), a); else this.setVar(name, a); return { vals: [a] }; } return { vals: [cur()] }; }
        case ":+": return unsetCheck() || emptyCheck() ? { vals: [""] } : { vals: [arg()] };
        case "+": return unsetCheck() ? { vals: [""] } : { vals: [arg()] };
        case ":?": case "?": { const bad = op2(p.op) === ":" ? unsetCheck() || emptyCheck() : unsetCheck(); if (bad) throw new ShErr(name + ": " + (arg() || "parameter null or not set"), this.line); return { vals: [cur()] }; }
        case "#": case "##": case "%": case "%%": { const segs = this.expandSegs(p.arg || []); const trim = (val) => { const n = [...val].length; const chars = [...val]; if (p.op[0] === "#") { const order = p.op === "#" ? range(0, n) : range(n, 0, -1); for (const k of order) { if (globToRegex(segs).test(chars.slice(0, k).join(""))) return chars.slice(k).join(""); } return val; } const order = p.op === "%" ? range(n, 0, -1) : range(0, n); for (const k of order) { if (globToRegex(segs).test(chars.slice(k).join(""))) return chars.slice(0, k).join(""); } return val; }; return { vals: isArr ? list.map(trim) : [trim(cur())], star: name === "*" || sub === "*" }; }
        case "/": case "//": case "/#": case "/%": { const full = p.arg ? p.arg : []; // split pattern/replacement at first unquoted slash
          let pat = [], rep = [], seen = false; full.forEach((pt) => { if (!seen && pt.k === "s" && !pt.q && pt.v.includes("/")) { const ix = pt.v.indexOf("/"); if (ix > 0) pat.push({ k: "s", v: pt.v.slice(0, ix), q: false }); const r = pt.v.slice(ix + 1); if (r) rep.push({ k: "s", v: r, q: false }); seen = true; } else (seen ? rep : pat).push(pt); });
          const psegs = this.expandSegs(pat), rs = this.expandStr(rep); const re = globToRegex(psegs, false); const src = re.source; const sub1 = (val) => { if (p.op === "/#") return new RegExp("^(?:" + src + ")").test(val) ? val.replace(new RegExp("^(?:" + src + ")"), () => rs) : val; if (p.op === "/%") return val.replace(new RegExp("(?:" + src + ")$"), () => rs); return val.replace(new RegExp(src.replace(/\[\\s\\S\]\*/g, "[\\s\\S]*?").replace(/^$/, "(?!)"), p.op === "//" ? "g" : ""), () => rs); }; // note: bash matches the longest; keep greedy for single
          const sub2 = (val) => { if (p.op === "/") { const g = new RegExp(src); const m = g.exec(val); return m ? val.slice(0, m.index) + rs + val.slice(m.index + m[0].length) : val; } return sub1(val); };
          return { vals: isArr ? list.map(sub2) : [sub2(cur())], star: name === "*" || sub === "*" }; }
        case "^^": case "^": case ",,": case ",": { const f = (val) => (p.op === "^^" ? val.toUpperCase() : p.op === ",," ? val.toLowerCase() : p.op === "^" ? val.charAt(0).toUpperCase() + val.slice(1) : val.charAt(0).toLowerCase() + val.slice(1)); return { vals: isArr ? list.map(f) : [f(cur())], star: name === "*" || sub === "*" }; }
        case "substr": { let off = Number(arith(this.expandStr(parseText(p.off, false)), this)); const ln = p.len != null ? Number(arith(this.expandStr(parseText(p.len, false)), this)) : null; if (isArr) { const arr = list; if (name === "@" || name === "*") { const st = off <= 0 ? (off === 0 ? 0 : arr.length + off) : off - 1; if (name === "@") { const a2 = off === 0 ? [this.scriptName].concat(arr) : arr.slice(st); return { vals: ln == null ? a2 : a2.slice(0, ln) }; } } let st = off < 0 ? arr.length + off : off; const sl = ln == null ? arr.slice(st) : arr.slice(st, st + ln); return { vals: sl, star: sub === "*" }; } const chars = [...cur()]; if (off < 0) off = Math.max(0, chars.length + off); const e = ln == null ? chars.length : ln < 0 ? chars.length + ln : off + ln; return { vals: [chars.slice(off, e).join("")] }; }
      }
      throw new ShErr("bad substitution", this.line);
    }
    getVarQuiet(name) { const ns = this.nounset; this.nounset = false; try { return this.getVar(name); } finally { this.nounset = ns; } }
    isSetNoThrow(name) { return this.isSet(name); }
    elemSet(name, sub) { const v = this.vars.get(name); if (!v) return false; if (v.m) return v.m.has(sub); if (v.a) { const k = Number(arith(String(sub), this)); return v.a[k] !== undefined; } return false; }
    ifsFirst() { const v = this.vars.get("IFS"); const s = v ? v.s : " \t\n"; return s === "" ? "" : s[0]; }
    /* expandSegs: no splitting, returns [{s,q}] */
    expandSegs(parts) {
      const out = []; const add = (s, q) => out.push({ s, q });
      parts.forEach((pt) => {
        if (pt.k === "s") add(pt.v, pt.q);
        else if (pt.k === "dq") { const inner = this.expandSegs(pt.parts); inner.forEach((x) => add(x.s, true)); }
        else if (pt.k === "p") { const r = this.expandParam(pt, pt.q); add(r.vals.join(r.star ? this.ifsFirst() : " "), pt.q); }
        else if (pt.k === "c") add(this.cmdSub(pt.src), pt.q);
        else if (pt.k === "a") add(String(arith(this.expandStr(parseText(pt.src, true)), this)), pt.q);
      });
      return out;
    }
    expandStr(parts) { return this.expandSegs(parts).map((s) => s.s).join(""); }
    /* expandWord: splitting + globbing, returns array of strings */
    expandWord(word) {
      const parts = word.parts; const fields = []; let cur = [], curQ = false;
      const ifsV = this.vars.get("IFS"); const IFS = ifsV ? ifsV.s : " \t\n"; const isWs = (c) => " \t\n".includes(c) && IFS.includes(c); const isSep = (c) => IFS.includes(c);
      const endField = () => { if (cur.length && (cur.some((x) => x.s !== "") || curQ)) fields.push(cur); else if (curQ) fields.push(cur); cur = []; curQ = false; };
      const addQuoted = (s) => { cur.push({ s, q: true }); curQ = true; };
      const addSplit = (s) => { // unquoted expansion result
        if (s === "") return; let i = 0; const n = s.length;
        if (IFS === "") { cur.push({ s, q: false }); return; }
        let buf = "";
        for (; i < n; i++) { const c = s[i];
          if (isSep(c)) { if (buf) { cur.push({ s: buf, q: false }); buf = ""; }
            if (isWs(c)) { // collapse whitespace separators
              while (i + 1 < n && isWs(s[i + 1])) i++; if (cur.length || curQ) endField();
              if (i + 1 < n && isSep(s[i + 1]) && !isWs(s[i + 1])) { /* ws then non-ws separator */ } }
            else { if (!cur.length && !curQ) { fields.push([{ s: "", q: true }]); } else endField(); } }
          else buf += c; }
        if (buf) cur.push({ s: buf, q: false });
      };
      const doParts = (ps, inDq) => ps.forEach((pt) => {
        if (pt.k === "s") { cur.push({ s: pt.v, q: pt.q }); if (pt.q) curQ = true; }
        else if (pt.k === "dq") { curQ = true; if (pt.empty) { cur.push({ s: "", q: true }); } doParts(pt.parts, true); }
        else if (pt.k === "p") {
          const r = this.expandParam(pt, inDq || pt.q); const atForm = (pt.name === "@" || pt.sub === "@") && pt.op !== "len";
          if (inDq || pt.q) {
            if (atForm) { r.vals.forEach((v, k) => { if (k > 0) endFieldQ(); addQuoted(v); }); if (!r.vals.length) { /* "$@" with nothing yields no field */ if (!cur.length) curQ = false; } }
            else addQuoted(r.vals.join(r.star ? this.ifsFirst() : " "));
          } else r.vals.forEach((v, k) => { if (k > 0) endField(); addSplit(v); });
        } else if (pt.k === "c") { const v = this.cmdSub(pt.src); if (inDq || pt.q) addQuoted(v); else addSplit(v); }
        else if (pt.k === "a") { const v = String(arith(this.expandStr(parseText(pt.src, true)), this)); if (inDq || pt.q) addQuoted(v); else addSplit(v); }
      });
      const endFieldQ = () => { fields.push(cur); cur = []; curQ = true; };
      doParts(parts, false); endField();
      const res = [];
      fields.forEach((f) => { if (hasGlob(f)) { const m = this.globFiles(f); if (m.length) { m.forEach((x) => res.push(x)); return; } } res.push(plainOf(f)); });
      // drop a trailing empty from "$@" with no args
      return res;
    }
    expandWords(words) { const out = []; (words || []).forEach((w) => this.expandWord(w).forEach((x) => out.push(x))); return out; }
    cmdSub(src) {
      const sub = this.fork(); const ast = parse(src); let out = ""; sub.sinkOut = (s) => { out += s; }; sub.sinkErr = (s) => this.writeErr(s);
      try { sub.runList(ast); } catch (e) { if (e instanceof Exit) sub.status = e.code; else if (e instanceof Ctl) { /* ignore */ } else throw e; }
      this.status = sub.status; this.steps = Math.max(this.steps, sub.steps); this.lastSubStatus = sub.status; return out.replace(/\n+$/, "");
    }
    fork() { const f = Object.create(Shell.prototype); Object.assign(f, this); f.vars = new Map(); this.vars.forEach((v, k) => f.vars.set(k, v.a ? Object.assign({}, v, { a: v.a.slice() }) : v.m ? Object.assign({}, v, { m: new Map(v.m) }) : Object.assign({}, v))); f.funcs = new Map(this.funcs); f.args = this.args.slice(); f.files = this.files; f.dirs = this.dirs; f.locals = []; f.stdin = this.stdin; f.sinkOut = (s) => this.write(s); f.sinkErr = (s) => this.writeErr(s); f.steps = this.steps; return f; }
    write(s) { if (this.sinkOut) this.sinkOut(s); else this.out += s; }
    writeErr(s) { if (this.sinkErr) this.sinkErr(s); else this.err += s; }
    readLine(raw) { const st = this.stdin; if (st.pos >= st.buf.length) return null; let e = st.buf.indexOf("\n", st.pos); let line; if (e < 0) { line = st.buf.slice(st.pos); st.pos = st.buf.length; return { line, eof: true }; } line = st.buf.slice(st.pos, e); st.pos = e + 1; return { line, eof: false }; }
    /* ---- execution */
    run(src) {
      let code = 0; this.status = 0;
      try { const ast = parse(src); this.runList(ast); code = this.status; }
      catch (e) {
        if (e instanceof Exit) code = e.code;
        else if (e instanceof Ctl) code = this.status;
        else if (e instanceof ShErr) { this.writeErr(this.scriptName + ": line " + (e.line || this.line) + ": " + e.message + "\n"); code = e.message.indexOf("syntax error") >= 0 || e.message.indexOf("unexpected EOF") >= 0 ? 2 : 1; if (/unexpected EOF|syntax error/.test(e.message) && !e.line) code = 2; }
        else throw e;
      }
      try { if (this.traps.EXIT) { const t = parse(this.traps.EXIT); this.runList(t); } } catch (e) { if (e instanceof Exit) code = e.code; }
      return { out: this.out, err: this.err, code };
    }
    runList(list) { let st = 0; for (const it of list.items) { this.runNode(it.c); st = this.status; } this.status = st; return st; }
    runNode(n) {
      this.tick();
      switch (n.t) {
        case "list": return this.runList(n);
        case "simple": return this.runSimple(n);
        case "pipe": return this.runPipe(n);
        case "andor": { this.noErrexit++; let st; try { this.runNode(n.first); } finally { this.noErrexit--; }
          st = this.status; for (let k = 0; k < n.rest.length; k++) { const r = n.rest[k]; if ((r.op === "&&") === (st === 0)) { const last = k === n.rest.length - 1; if (!last) this.noErrexit++; try { this.runNode(r.p); } finally { if (!last) this.noErrexit--; } st = this.status; } }
          this.status = st; if (st !== 0 && this.errexit && !this.noErrexit) throw new Exit(st); return st; }
        case "subshell": { const sub = this.fork(); this.withRedirs(n, sub, () => { try { sub.runList(n.body); } catch (e) { if (e instanceof Exit) sub.status = e.code; else throw e; } }); this.status = sub.status; this.steps = Math.max(this.steps, sub.steps); return this.status; }
        case "group": return this.withRedirs(n, this, () => this.runList(n.body));
        case "if": return this.withRedirs(n, this, () => { this.noErrexit++; let c; try { this.runList(n.cond); c = this.status; } finally { this.noErrexit--; } if (c === 0) return this.runList(n.then); for (const e of n.elifs) { this.noErrexit++; try { this.runList(e.cond); c = this.status; } finally { this.noErrexit--; } if (c === 0) return this.runList(e.then); } if (n.els) return this.runList(n.els); this.status = 0; return 0; });
        case "while": return this.withRedirs(n, this, () => { let last = 0; for (;;) { this.tick(); this.noErrexit++; let c; try { this.runList(n.cond); c = this.status; } finally { this.noErrexit--; } if ((c === 0) === n.until) break; try { this.runList(n.body); last = this.status; } catch (e) { if (e instanceof Ctl && e.kind !== "return") { if (e.n > 1) { e.n--; throw e; } if (e.kind === "break") break; continue; } throw e; } } this.status = last; return last; });
        case "for": return this.withRedirs(n, this, () => { const items = n.words ? this.expandWords(n.words) : this.args.slice(); let last = 0; for (const it of items) { this.tick(); this.setVar(n.name, it); try { this.runList(n.body); last = this.status; } catch (e) { if (e instanceof Ctl && e.kind !== "return") { if (e.n > 1) { e.n--; throw e; } if (e.kind === "break") break; continue; } throw e; } } this.status = last; return last; });
        case "cfor": return this.withRedirs(n, this, () => { const ex = (t) => this.expandStr(parseText(t, true, this.line)); arith(ex(n.init), this); let last = 0; for (;;) { this.tick(); if (n.cond.trim() && !arith(ex(n.cond), this)) break; try { this.runList(n.body); last = this.status; } catch (e) { if (e instanceof Ctl && e.kind !== "return") { if (e.n > 1) { e.n--; throw e; } if (e.kind === "break") break; } else throw e; } arith(ex(n.step), this); } this.status = last; return last; });
        case "case": return this.withRedirs(n, this, () => { const w = this.expandStr(n.word.parts); for (const c of n.clauses) { for (const pw of c.pats) { if (globToRegex(this.expandSegs(pw.parts)).test(w)) { this.runList(c.body); return this.status; } } } this.status = 0; return 0; });
        case "func": this.funcs.set(n.name, n.body); this.status = 0; return 0;
        case "arith": return this.withRedirs(n, this, () => { this.line = n.line; const v = arith(this.expandStr(parseText(n.src, true)), this); this.status = v ? 0 : 1; return this.status; });
        case "cond": { this.line = n.line; this.status = this.evalCond(n.e) ? 0 : 1; if (this.status && this.errexit && !this.noErrexit) throw new Exit(this.status); return this.status; }
      }
      throw new ShErr("unsupported construct: " + n.t, this.line);
    }
    evalCond(e) {
      switch (e.op) {
        case "&&": return this.evalCond(e.l) && this.evalCond(e.r);
        case "||": return this.evalCond(e.l) || this.evalCond(e.r);
        case "!": return !this.evalCond(e.e);
        case "u": return this.testUnary(e.f, this.expandStr(e.a.parts));
        case "b": {
          const a = this.expandStr(e.a.parts);
          if (e.f === "=~") { const re = this.condRegex(e.b); let m; try { m = new RegExp(re).exec(a); } catch (er) { throw new ShErr("invalid regular expression", this.line); } if (m) { this.vars.set("BASH_REMATCH", { a: Array.from(m, (x) => (x === undefined ? "" : x)) }); return true; } this.vars.set("BASH_REMATCH", { a: [] }); return false; }
          if (e.f === "==" || e.f === "=" || e.f === "!=") { const ok = globToRegex(this.expandSegs(e.b.parts)).test(a); return e.f === "!=" ? !ok : ok; }
          const b = this.expandStr(e.b.parts);
          if (e.f === "<") return cmpC(a, b) < 0; if (e.f === ">") return cmpC(a, b) > 0;
          const x = Number(arith(a, this)), y = Number(arith(b, this));
          return ({ "-eq": x === y, "-ne": x !== y, "-lt": x < y, "-le": x <= y, "-gt": x > y, "-ge": x >= y })[e.f];
        }
      }
      return false;
    }
    condRegex(w) { return this.expandSegs(w.parts).map((sg) => (sg.q ? sg.s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : sg.s.replace(/\[\[:alpha:\]\]/g, "[a-zA-Z]").replace(/\[\[:digit:\]\]/g, "[0-9]").replace(/\[\[:space:\]\]/g, "\\s").replace(/\[:alpha:\]/g, "a-zA-Z").replace(/\[:digit:\]/g, "0-9").replace(/\[:alnum:\]/g, "a-zA-Z0-9").replace(/\[:upper:\]/g, "A-Z").replace(/\[:lower:\]/g, "a-z").replace(/\[:space:\]/g, "\\s"))).join(""); }
    testUnary(f, a) {
      switch (f) { case "-z": return a === ""; case "-n": return a !== ""; case "-e": return this.files.has(this.abs(a)) || this.isDir(this.abs(a)); case "-f": return this.files.has(this.abs(a)); case "-d": return this.isDir(this.abs(a)); case "-s": return this.files.has(this.abs(a)) && this.files.get(this.abs(a)).length > 0; case "-r": case "-w": return this.files.has(this.abs(a)) || this.isDir(this.abs(a)); case "-x": return this.isDir(this.abs(a)); case "-L": case "-h": return false; case "-v": return this.isSet(a); }
      throw new ShErr("conditional binary operator expected", this.line);
    }
    /* redirections around compound commands and builtins */
    applyRedirs(node, sh) {
      const undo = []; const rs = node.redirs || [];
      for (const r of rs) {
        const fd = r.fd != null ? r.fd : (r.v === "<" || r.v === "<<" || r.v === "<<<" || r.v === "<&" ? 0 : 1);
        if (r.v === "<<") { const body = r.quoted ? r.body : this.expandStr(parseText(r.body.replace(/\\\n/g, ""), true, this.line).map((p) => p)); const old = sh.stdin; sh.stdin = { buf: body, pos: 0 }; undo.push(() => { sh.stdin = old; }); continue; }
        if (r.v === "<<<") { const old = sh.stdin; sh.stdin = { buf: this.expandStr(r.word.parts) + "\n", pos: 0 }; undo.push(() => { sh.stdin = old; }); continue; }
        const target = r.word ? this.expandStr(r.word.parts) : "";
        if (r.v === "<") { const p = this.abs(target); if (!this.files.has(p)) throw new ShErr(target + ": No such file or directory", this.line); const old = sh.stdin; sh.stdin = { buf: this.files.get(p), pos: 0 }; undo.push(() => { sh.stdin = old; }); continue; }
        if (r.v === ">&" || r.v === "<&") {
          if (/^\d+$/.test(target)) { const to = Number(target); if (fd === 1) { const oldO = sh.sinkOut; const dst = to === 2 ? (sh.sinkErr || ((s) => { this.err += s; })) : oldO || ((s) => { this.out += s; }); sh.sinkOut = dst; undo.push(() => { sh.sinkOut = oldO; }); } else if (fd === 2) { const oldE = sh.sinkErr; const dst = to === 1 ? (sh.sinkOut || ((s) => { this.out += s; })) : oldE || ((s) => { this.err += s; }); sh.sinkErr = dst; undo.push(() => { sh.sinkErr = oldE; }); } continue; }
          if (target === "-") continue; throw new ShErr(target + ": ambiguous redirect", this.line);
        }
        // > and >> to a file (or /dev/null)
        const path = this.abs(target); let sink;
        if (target === "/dev/null") sink = () => {};
        else if (target === "/dev/stdout") sink = sh.sinkOut || ((s) => { this.out += s; }); else if (target === "/dev/stderr") sink = sh.sinkErr || ((s) => { this.err += s; });
        else { if (this.isDir(path)) throw new ShErr(target + ": Is a directory", this.line); const dir = path.slice(0, path.lastIndexOf("/")) || "/"; if (!this.isDir(dir)) throw new ShErr(target + ": No such file or directory", this.line); if (r.v === ">" ) this.writeFile(path, ""); else if (!this.files.has(path)) this.writeFile(path, ""); sink = (s) => { this.files.set(path, (this.files.get(path) || "") + s); }; }
        if (fd === 1) { const old = sh.sinkOut; sh.sinkOut = sink; undo.push(() => { sh.sinkOut = old; }); }
        else if (fd === 2) { const old = sh.sinkErr; sh.sinkErr = sink; undo.push(() => { sh.sinkErr = old; }); }
      }
      return () => undo.reverse().forEach((u) => u());
    }
    withRedirs(node, sh, fn) { if (!node.redirs || !node.redirs.length) return fn(); const undo = this.applyRedirs(node, sh); try { return fn(); } finally { undo(); } }
    runPipe(n) {
      this.noErrexit++; const statuses = []; let input = null; let saved = this.stdin;
      try {
        for (let k = 0; k < n.cmds.length; k++) {
          const last = k === n.cmds.length - 1; const sub = this.fork(); let buf = ""; if (input !== null) sub.stdin = { buf: input, pos: 0 };
          if (!last) sub.sinkOut = (s) => { buf += s; }; else sub.sinkOut = (s) => this.write(s);
          sub.sinkErr = (s) => this.writeErr(s);
          try { sub.runNode(n.cmds[k]); } catch (e) { if (e instanceof Exit) sub.status = e.code; else if (e instanceof Ctl) { /* ignore */ } else throw e; }
          this.steps = Math.max(this.steps, sub.steps); statuses.push(sub.status); input = buf;
          if (last && n.cmds.length === 1) { /* not reached */ }
        }
      } finally { this.noErrexit--; this.stdin = saved; }
      let st = statuses[statuses.length - 1]; if (this.pipefail) { for (let k = statuses.length - 1; k >= 0; k--) if (statuses[k] !== 0) { st = statuses[k]; break; } }
      if (n.neg) st = st === 0 ? 1 : 0; this.status = st; if (st !== 0 && this.errexit && !this.noErrexit && !n.neg) throw new Exit(st); return st;
    }
    runSimple(n) {
      this.line = n.line;
      // assignments only
      const words = this.expandWords(n.words);
      const setAssigns = (local) => {
        n.assigns.forEach((a) => {
          if (a.arr) { const vals = this.expandWords(a.arr.map((x) => x)); const hasKV = false; const isAssoc = this.vars.get(a.name) && this.vars.get(a.name).m; if (isAssoc) { const m = a.append ? this.vars.get(a.name).m : new Map(); a.arr.forEach((w) => { const mm = /^\[(.*?)\]=([\s\S]*)$/.exec(this.expandStr(w.parts)); if (mm) m.set(mm[1], mm[2]); }); this.vars.set(a.name, Object.assign({}, this.vars.get(a.name), { m })); } else { const old = this.vars.get(a.name); const base = a.append && old && old.a ? old.a.slice() : []; this.vars.set(a.name, Object.assign({}, old || {}, { a: base.concat(vals), s: undefined })); } return; }
          let val = a.word ? this.expandStr(a.word.parts) : "";
          if (a.sub != null) { const sub = this.expandStr(parseText(a.sub, false)); if (a.append) val = this.getElem(a.name, sub) + val; this.setElem(a.name, sub, val); return; }
          if (a.append) { const old = this.vars.get(a.name); if (old && old.int) val = String(Number(arith(this.getVar(a.name), this)) + Number(arith(val, this))); else if (old && old.a) { old.a[0] = (old.a[0] || "") + val; return; } else val = this.getVarQuiet(a.name) + val; }
          this.setVar(a.name, val);
        });
      };
      if (!words.length) { const undo = this.applyRedirs(n, this); try { setAssigns(); } finally { undo(); } if (n.assigns.length && n.words.length === 0) { /* status of last cmd substitution */ this.status = n.assigns.some((a) => a.word && a.word.parts.some((p) => p.k === "c")) ? (this.lastSubStatus || 0) : 0; if (!n.assigns.some((a) => a.word && a.word.parts.some((p) => p.k === "c"))) this.status = 0; } else this.status = 0; if (this.status && this.errexit && !this.noErrexit) throw new Exit(this.status); return this.status; }
      // temporary env assignments for this command
      const saved = []; n.assigns.forEach((a) => { saved.push([a.name, this.vars.get(a.name)]); });
      let undoRe = null;
      try {
        if (n.assigns.length) setAssigns();
        undoRe = this.applyRedirs(n, this);
        this.runCommand(words[0], words.slice(1), n);
      } catch (e) {
        if (e instanceof ShErr && !(e instanceof Exit) && n.redirs.length) { this.writeErr(this.scriptName + ": line " + (e.line || this.line) + ": " + e.message + "\n"); this.status = 1; }
        else throw e;
      } finally { if (undoRe) undoRe(); saved.forEach(([k, v]) => { if (v === undefined) this.vars.delete(k); else this.vars.set(k, v); }); }
      if (this.status !== 0 && this.errexit && !this.noErrexit) throw new Exit(this.status);
      return this.status;
    }
    runCommand(name, args, node) {
      this.tick();
      if (this.funcs.has(name)) return this.callFunc(name, args);
      const b = BUILTINS[name]; if (b) { this.status = 0; const r = b.call(this, args, node); if (typeof r === "number") this.status = r; return this.status; }
      const c = COMMANDS[name]; if (c) { this.status = 0; const r = c.call(this, args, node); if (typeof r === "number") this.status = r; return this.status; }
      this.writeErr(this.scriptName + ": line " + (node ? node.line : this.line) + ": " + name + ": command not found\n"); this.status = 127; return 127;
    }
    callFunc(name, args) {
      if (++this.depth > 200) { this.depth--; throw new ShErr("maximum function nesting level exceeded (200)", this.line); }
      const savedArgs = this.args; this.args = args; const locals = []; this.locals.push(locals);
      try { this.runNode(this.funcs.get(name)); }
      catch (e) { if (e instanceof Ctl && e.kind === "return") { this.status = e.n; } else throw e; }
      finally { this.args = savedArgs; this.locals.pop(); locals.reverse().forEach(([k, v]) => { if (v === undefined) this.vars.delete(k); else this.vars.set(k, v); }); this.depth--; }
      return this.status;
    }
  }
  const op2 = (o) => o[0] === ":" ? ":" : "";
  const range = (a, b, step) => { const out = []; step = step || 1; if (step > 0) for (let i = a; i <= b; i += step) out.push(i); else for (let i = a; i >= b; i += step) out.push(i); return out; };
  function cmpC(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  /* ------------------------------------------------------------------ printf and echo escapes */
  function unescape(s, stopC) {
    let out = ""; for (let i = 0; i < s.length; i++) {
      if (s[i] !== "\\") { out += s[i]; continue; }
      const d = s[++i];
      switch (d) { case "n": out += "\n"; break; case "t": out += "\t"; break; case "\\": out += "\\"; break; case '"': out += '"'; break; case "'": out += "'"; break; case "a": out += "\x07"; break; case "b": out += "\b"; break; case "f": out += "\f"; break; case "r": out += "\r"; break; case "v": out += "\v"; break; case "e": case "E": out += "\x1b"; break;
        case "c": if (stopC) return { s: out, stop: true }; break;
        case "0": case "1": case "2": case "3": case "4": case "5": case "6": case "7": { let o = d, k = 0; while (k < (d === "0" ? 3 : 2) && /[0-7]/.test(s[i + 1] || "")) { o += s[++i]; k++; } out += String.fromCharCode(parseInt(o, 8)); break; }
        case "x": { let h = ""; while (h.length < 2 && /[0-9a-fA-F]/.test(s[i + 1] || "")) h += s[++i]; out += h ? String.fromCharCode(parseInt(h, 16)) : "\\x"; break; }
        case "u": { let h = ""; while (h.length < 4 && /[0-9a-fA-F]/.test(s[i + 1] || "")) h += s[++i]; out += h ? String.fromCharCode(parseInt(h, 16)) : "\\u"; break; }
        default: out += "\\" + (d === undefined ? "" : d); }
    }
    return stopC ? { s: out, stop: false } : out;
  }
  function printf(fmt, args, sh) {
    let out = "", ai = 0, any = false; const nextArg = () => (ai < args.length ? args[ai++] : null);
    const toNum = (a) => { if (a == null || a === "") return 0; if (/^[-+]?\d+$/.test(a)) return Number(a); if (/^[-+]?0[xX][0-9a-fA-F]+$/.test(a)) return parseInt(a, 16); if (/^['"]/.test(a)) return a.charCodeAt(1); if (/^[-+]?\d*\.?\d+([eE][-+]?\d+)?$/.test(a)) return Number(a); sh.writeErr(sh.scriptName + ": line " + sh.line + ": printf: " + a + ": invalid number\n"); sh.status = 1; return 0; };
    do {
      let consumed = false;
      for (let i = 0; i < fmt.length; i++) {
        const c = fmt[i];
        if (c === "\\") { const m = /^\\(?:[0-7]{1,3}|x[0-9a-fA-F]{1,2}|u[0-9a-fA-F]{1,4}|.)/.exec(fmt.slice(i)); if (m) { out += unescape(m[0]); i += m[0].length - 1; } else out += c; continue; }
        if (c !== "%") { out += c; continue; }
        const m = /^%([-+ 0#]*)(\*|\d+)?(?:\.(\*|\d+)?)?([diouxXeEfgGcsb%q])/.exec(fmt.slice(i));
        if (!m) { out += c; continue; }
        i += m[0].length - 1; const conv = m[4]; if (conv === "%") { out += "%"; continue; }
        let width = m[2] === "*" ? toNum(nextArg()) : m[2] ? Number(m[2]) : 0; const flags = m[1]; let left = flags.includes("-"); if (width < 0) { left = true; width = -width; }
        let prec = m[3] === "*" ? toNum(nextArg()) : m[3] != null ? Number(m[3]) : (m[0].includes(".") ? 0 : null);
        const a = nextArg(); if (a !== null) consumed = true; let s;
        switch (conv) {
          case "d": case "i": { let v = Math.trunc(toNum(a)); s = String(Math.abs(v)); if (prec != null) s = s.padStart(prec, "0"); s = (v < 0 ? "-" : flags.includes("+") ? "+" : flags.includes(" ") ? " " : "") + s; break; }
          case "u": s = String(Math.abs(Math.trunc(toNum(a)))); break;
          case "o": s = (flags.includes("#") ? "0" : "") + Math.trunc(toNum(a)).toString(8); break;
          case "x": s = (flags.includes("#") ? "0x" : "") + Math.trunc(toNum(a)).toString(16); break; case "X": s = (flags.includes("#") ? "0X" : "") + Math.trunc(toNum(a)).toString(16).toUpperCase(); break;
          case "f": { const v = toNum(a); s = Math.abs(v).toFixed(prec == null ? 6 : prec); s = (v < 0 || Object.is(v, -0) && false ? "-" : flags.includes("+") ? "+" : flags.includes(" ") ? " " : "") + s; if (v < 0 && Number(s) === 0 && false) s = s; break; }
          case "e": case "E": { const v = toNum(a); s = v.toExponential(prec == null ? 6 : prec).replace(/e([+-])(\d)$/, "e$10$2"); if (conv === "E") s = s.toUpperCase(); if (flags.includes("+") && v >= 0) s = "+" + s; break; }
          case "g": case "G": { const v = toNum(a); const P = prec == null ? 6 : prec === 0 ? 1 : prec; let t = v === 0 ? "0" : (() => { const ex = Math.floor(Math.log10(Math.abs(v))); if (ex < -4 || ex >= P) { let e = v.toExponential(P - 1); e = e.replace(/\.?0+e/, "e").replace(/e([+-])(\d)$/, "e$10$2"); return e; } return String(Number(v.toPrecision(P))); })(); s = t; if (conv === "G") s = s.toUpperCase(); break; }
          case "c": s = a == null ? "" : [...a][0] || ""; break;
          case "s": s = a == null ? "" : a; if (prec != null) s = s.slice(0, prec); break;
          case "b": s = a == null ? "" : unescape(a); if (prec != null) s = s.slice(0, prec); break;
          case "q": s = a == null ? "''" : /^[A-Za-z0-9_.\/-]+$/.test(a) ? a : /[\n\t]/.test(a) ? "$'" + a.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\t/g, "\\t") + "'" : a.replace(/([^A-Za-z0-9_.\/-])/g, "\\$1"); break;
        }
        if (s.length < width) { const pad = flags.includes("0") && !left && "diufeEgGxXo".includes(conv) ? "0" : " "; if (pad === "0") { const sign = /^[-+ ]/.test(s) ? s[0] : ""; s = sign + s.slice(sign.length).padStart(width - sign.length, "0"); } else s = left ? s.padEnd(width, " ") : s.padStart(width, " "); }
        out += s; any = true;
      }
      if (!consumed) break;
    } while (ai < args.length);
    return out;
  }

  /* ------------------------------------------------------------------ builtins */
  const BUILTINS = {
    ":": () => 0, true: () => 0, false: () => 1,
    echo(args) { let nl = true, esc = false; while (args.length && /^-[neE]+$/.test(args[0])) { const f = args.shift(); if (f.includes("n")) nl = false; if (f.includes("e")) esc = true; if (f.includes("E")) esc = false; } let s = args.join(" "); if (esc) { const r = unescape(s, true); s = r.s; if (r.stop) nl = false; } this.write(s + (nl ? "\n" : "")); return 0; },
    printf(args) { if (!args.length) { this.writeErr(this.scriptName + ": printf: usage: printf [-v var] format [arguments]\n"); return 2; } let v = null; if (args[0] === "-v") { v = args[1]; args = args.slice(2); } const s = printf(args[0], args.slice(1), this); if (v) { this.setVar(v, s); } else this.write(s); return this.status; },
    cd(args) { const t = args[0] === undefined ? "/home/user" : args[0] === "-" ? this.getVar("OLDPWD") : args[0]; const p = this.abs(t); if (!this.isDir(p)) { this.writeErr(this.scriptName + ": line " + this.line + ": cd: " + t + ": No such file or directory\n"); return 1; } this.vars.set("OLDPWD", { s: this.cwd }); this.cwd = p; this.vars.set("PWD", { s: p }); return 0; },
    pwd() { this.write(this.cwd + "\n"); return 0; },
    exit(args) { throw new Exit(args.length ? Number(args[0]) & 255 : this.status); },
    return(args) { throw new Ctl("return", args.length ? Number(args[0]) & 255 : this.status); },
    break(args) { throw new Ctl("break", args[0] ? Number(args[0]) : 1); }, continue(args) { throw new Ctl("continue", args[0] ? Number(args[0]) : 1); },
    shift(args) { const k = args.length ? Number(args[0]) : 1; if (k > this.args.length) return 1; this.args = this.args.slice(k); return 0; },
    local(args) { const scope = this.locals[this.locals.length - 1]; if (!scope) { this.writeErr(this.scriptName + ": line " + this.line + ": local: can only be used in a function\n"); return 1; } return declare.call(this, args, true, scope); },
    declare(args) { return declare.call(this, args, false, null); }, typeset(args) { return declare.call(this, args, false, null); },
    readonly(args) { args.forEach((a) => { const m = /^([A-Za-z_]\w*)(?:=([\s\S]*))?$/.exec(a); if (!m) return; if (m[2] !== undefined) this.setVar(m[1], m[2]); const v = this.vars.get(m[1]) || { s: "" }; this.vars.set(m[1], Object.assign({}, v, { ro: true })); }); return 0; },
    export(args) { args.forEach((a) => { const m = /^([A-Za-z_]\w*)(?:=([\s\S]*))?$/.exec(a); if (m && m[2] !== undefined) this.setVar(m[1], m[2]); }); return 0; },
    unset(args) { args.forEach((a) => { if (a === "-v" || a === "-f") return; const m = /^([A-Za-z_]\w*)\[(.+)\]$/.exec(a); if (m) { const v = this.vars.get(m[1]); if (v && v.m) v.m.delete(m[2]); else if (v && v.a) delete v.a[Number(m[2])]; } else { const v = this.vars.get(a); if (v && v.ro) { this.writeErr(this.scriptName + ": line " + this.line + ": unset: " + a + ": cannot unset: readonly variable\n"); return; } this.vars.delete(a); this.funcs.delete(a); } }); return 0; },
    set(args) { for (let i = 0; i < args.length; i++) { const a = args[i]; if (a === "--") { this.args = args.slice(i + 1); return 0; } if (/^[-+][a-zA-Z]+$/.test(a)) { const on = a[0] === "-"; for (const f of a.slice(1)) { if (f === "e") this.errexit = on; else if (f === "u") this.nounset = on; else if (f === "o") { const o = args[++i]; if (o === "pipefail") this.pipefail = on; else if (o === "errexit") this.errexit = on; else if (o === "nounset") this.nounset = on; } } } else if (i === 0 || a) { if (!/^[-+]/.test(a)) { this.args = args.slice(i); return 0; } } } return 0; },
    shopt() { return 0; }, trap(args) { if (args.length >= 2 && /EXIT|0/.test(args[args.length - 1])) this.traps.EXIT = args[0]; return 0; }, wait() { return 0; }, sleep() { return 0; }, hash() { return 0; }, umask() { return 0; }, ulimit() { return 0; }, alias() { return 0; },
    eval(args) { const ast = parse(args.join(" ")); this.runList(ast); return this.status; },
    source() { this.writeErr(this.scriptName + ": line " + this.line + ": source: scripts cannot be sourced here\n"); return 1; },
    let(args) { let v = 0; args.forEach((a) => { v = arith(a, this); }); return v ? 0 : 1; },
    test(args) { return testCmd.call(this, args); },
    "["(args) { if (args[args.length - 1] !== "]") { this.writeErr(this.scriptName + ": line " + this.line + ": [: missing `]'\n"); return 2; } return testCmd.call(this, args.slice(0, -1)); },
    type(args) { args.forEach((a) => { if (this.funcs.has(a)) this.write(a + " is a function\n"); else if (BUILTINS[a]) this.write(a + " is a shell builtin\n"); else if (COMMANDS[a]) this.write(a + " is /usr/bin/" + a + "\n"); else { this.writeErr(this.scriptName + ": line " + this.line + ": type: " + a + ": not found\n"); this.status = 1; } }); return this.status; },
    command(args) { if (args[0] === "-v") { const a = args[1]; if (BUILTINS[a] || this.funcs.has(a)) { this.write(a + "\n"); return 0; } if (COMMANDS[a]) { this.write("/usr/bin/" + a + "\n"); return 0; } return 1; } return this.runCommand(args[0], args.slice(1)); },
    read(args) {
      let raw = false, arr = null, prompt = null, delim = "\n", nchars = null; const names = [];
      for (let i = 0; i < args.length; i++) { const a = args[i]; if (a === "-r") raw = true; else if (a === "-a") arr = args[++i]; else if (a === "-p") prompt = args[++i]; else if (a === "-d") delim = args[++i]; else if (a === "-n") nchars = Number(args[++i]); else if (a === "-s") continue; else if (/^-[a-z]+$/.test(a)) { raw = raw || a.includes("r"); } else names.push(a); }
      if (prompt != null) this.writeErr(prompt);
      const st = this.stdin; if (st.pos >= st.buf.length) { (names.length ? names : ["REPLY"]).forEach((n) => this.vars.set(n, { s: "" })); return 1; }
      let line, eof = false;
      if (nchars != null) { line = st.buf.slice(st.pos, st.pos + nchars); st.pos += line.length; }
      else { let e = st.buf.indexOf(delim, st.pos); if (e < 0) { line = st.buf.slice(st.pos); st.pos = st.buf.length; eof = true; } else { line = st.buf.slice(st.pos, e); st.pos = e + 1; } }
      if (!raw) line = line.replace(/\\\n/g, "").replace(/\\(.)/g, "$1");
      const ifsV = this.vars.get("IFS"); const IFS = ifsV ? ifsV.s : " \t\n";
      if (arr) { const parts = IFS === "" ? [line] : line.split(new RegExp("[" + IFS.replace(/[\]\\^-]/g, "\\$&").replace(/\t/g, "\\t").replace(/\n/g, "\\n") + "]+")).filter((x, k, a2) => !(x === "" && (k === 0 || k === a2.length - 1))); this.vars.set(arr, { a: parts }); return eof ? 1 : 0; }
      const vars = names.length ? names : ["REPLY"];
      if (!names.length) { this.vars.set("REPLY", { s: line }); return eof ? 1 : 0; }
      if (IFS === "") { this.vars.set(vars[0], { s: line }); vars.slice(1).forEach((n) => this.vars.set(n, { s: "" })); return eof ? 1 : 0; }
      const isWs = (c) => " \t\n".includes(c) && IFS.includes(c); let i = 0; const out = [];
      while (i < line.length && isWs(line[i])) i++;
      for (let v = 0; v < vars.length; v++) {
        if (v === vars.length - 1) { let rest = line.slice(i); while (rest.length && isWs(rest[rest.length - 1])) rest = rest.slice(0, -1); out.push(rest); break; }
        let j = i; while (j < line.length && !IFS.includes(line[j])) j++; out.push(line.slice(i, j)); i = j; if (i >= line.length) { while (out.length < vars.length) out.push(""); break; }
        if (isWs(line[i])) { while (i < line.length && isWs(line[i])) i++; if (i < line.length && IFS.includes(line[i]) && !isWs(line[i])) { i++; while (i < line.length && isWs(line[i])) i++; } } else { i++; while (i < line.length && isWs(line[i])) i++; }
      }
      vars.forEach((n, k) => this.vars.set(n, { s: out[k] != null ? out[k] : "" })); return eof ? 1 : 0;
    },
    mapfile(args) { let strip = false, name = "MAPFILE"; args.forEach((a) => { if (a === "-t") strip = true; else if (!a.startsWith("-")) name = a; }); const st = this.stdin; const rest = st.buf.slice(st.pos); st.pos = st.buf.length; let lines = rest === "" ? [] : rest.split("\n"); if (lines.length && lines[lines.length - 1] === "") lines.pop(); this.vars.set(name, { a: lines.map((l) => (strip ? l : l + "\n")) }); return 0; },
    getopts() { this.writeErr(this.scriptName + ": getopts is not available here\n"); return 1; },
  };
  BUILTINS.readarray = BUILTINS.mapfile;
  function declare(args, isLocal, scope) {
    let assoc = false, arr = false, int = false, ro = false; const names = [];
    args.forEach((a) => { if (/^-[a-zA-Z]+$/.test(a)) { if (a.includes("A")) assoc = true; if (a.includes("a")) arr = true; if (a.includes("i")) int = true; if (a.includes("r")) ro = true; } else names.push(a); });
    names.forEach((a) => {
      const m = /^([A-Za-z_]\w*)(?:=([\s\S]*))?$/.exec(a); if (!m) return;
      if (isLocal || !this.locals.length === false) { if (scope) scope.push([m[1], this.vars.get(m[1])]); }
      let v = {}; if (assoc) v.m = new Map(); else if (arr) v.a = []; if (int) v.int = true; if (ro) v.ro = true;
      if (m[2] !== undefined && /^\([\s\S]*\)$/.test(m[2])) { const items = m[2].slice(1, -1).trim().split(/\s+/).filter(Boolean).map((x) => x.replace(/^(\[[^\]]*\]=)?(["'])(.*)\2$/, "$1$3")); if (assoc) items.forEach((it) => { const mm = /^\[(.*?)\]=([\s\S]*)$/.exec(it); if (mm) v.m.set(mm[1], mm[2]); }); else v.a = items; this.vars.set(m[1], v); return; }
      if (m[2] !== undefined && !assoc && !arr) { v.s = int ? String(arith(m[2], this)) : m[2]; }
      else if (!assoc && !arr) { const old = this.vars.get(m[1]); if (!isLocal || !old) v.s = ""; if (!isLocal && old) v = Object.assign({}, old, v); }
      if (isLocal && m[2] === undefined && !assoc && !arr) v.s = "";
      this.vars.set(m[1], v);
    });
    return 0;
  }
  function testCmd(args) {
    let i = 0;
    const primary = () => {
      const a = args[i];
      if (a === "!") { i++; return !primary(); }
      if (a === "(") { i++; const v = orx(); i++; return v; }
      if (args.length - i >= 3 && /^(=|==|!=|-eq|-ne|-lt|-le|-gt|-ge|<|>)$/.test(args[i + 1]) ) { const x = args[i], o = args[i + 1], y = args[i + 2]; i += 3;
        if (o === "=" || o === "==") return x === y; if (o === "!=") return x !== y; if (o === "<") return cmpC(x, y) < 0; if (o === ">") return cmpC(x, y) > 0;
        if (!/^\s*[-+]?\d+\s*$/.test(x) || !/^\s*[-+]?\d+\s*$/.test(y)) { this.writeErr(this.scriptName + ": line " + this.line + ": [: " + (!/^\s*[-+]?\d+\s*$/.test(x) ? x : y) + ": integer expression expected\n"); throw new Exit2(2); }
        const nx = Number(x), ny = Number(y); return ({ "-eq": nx === ny, "-ne": nx !== ny, "-lt": nx < ny, "-le": nx <= ny, "-gt": nx > ny, "-ge": nx >= ny })[o]; }
      if (/^-[a-zA-Z]$/.test(a || "") && args.length - i >= 2) { const f = a; const v = args[i + 1]; i += 2; return this.testUnary(f, v); }
      i++; return a !== undefined && a !== "";
    };
    const andx = () => { let l = primary(); while (args[i] === "-a") { i++; const r = primary(); l = l && r; } return l; };
    const orx = () => { let l = andx(); while (args[i] === "-o") { i++; const r = andx(); l = l || r; } return l; };
    try { if (!args.length) return 1; const r = orx(); return r ? 0 : 1; } catch (e) { if (e instanceof Exit2) return 2; throw e; }
  }
  class Exit2 extends Error { constructor(c) { super("x"); this.code = c; } }

  /* ------------------------------------------------------------------ external commands (virtual) */
  function readInputs(sh, files, cmd) { // returns [{name, text}] or null on error
    if (!files.length) return [{ name: "-", text: sh.stdin.buf.slice(sh.stdin.pos), stdin: true }];
    const out = []; let bad = false;
    files.forEach((f) => { if (f === "-") { out.push({ name: "-", text: sh.stdin.buf.slice(sh.stdin.pos), stdin: true }); return; } const p = sh.abs(f); if (sh.files.has(p)) out.push({ name: f, text: sh.files.get(p) }); else { sh.writeErr(cmd + ": " + f + ": " + (sh.isDir(p) ? "Is a directory" : "No such file or directory") + "\n"); bad = true; } });
    out.bad = bad; return out;
  }
  const linesOf = (t) => { if (t === "") return []; const l = t.split("\n"); if (l[l.length - 1] === "") l.pop(); return l; };
  const joinLines = (l) => (l.length ? l.join("\n") + "\n" : "");
  function parseOpts(args, spec) { // spec: {flags:'abc', withArg:'nk'} returns {o:{}, rest:[]}
    const o = {}, rest = []; let done = false; o.ks = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (done || a === "-" || !/^-[^-]/.test(a) && !/^--/.test(a)) { rest.push(a); continue; }
      if (a === "--") { done = true; continue; }
      if (/^-\d+$/.test(a) && spec.num) { o[spec.num] = a.slice(1); continue; }
      const body = a.slice(1);
      for (let k = 0; k < body.length; k++) { const f = body[k]; if (spec.withArg && spec.withArg.includes(f)) { o[f] = k + 1 < body.length ? body.slice(k + 1) : args[++i]; if (f === "k") o.ks.push(o[f]); break; } o[f] = true; }
    }
    return { o, rest };
  }
  function sortCmp(opts) {
    const keys = (opts.ks && opts.ks.length ? opts.ks : [null]).map((k) => { if (k == null) return { all: true }; const m = /^(\d+)(?:\.\d+)?([a-zA-Z]*)(?:,(\d+)(?:\.\d+)?([a-zA-Z]*))?$/.exec(k) || [0, "1", "", "", ""]; const fl = (m[2] || "") + (m[4] || ""); return { from: Number(m[1]), to: m[3] ? Number(m[3]) : null, n: fl.includes("n"), r: fl.includes("r"), f: fl.includes("f") }; });
    const fld = (s, k) => { if (k.all) return s; const sep = opts.t != null ? opts.t : null; const parts = sep != null ? s.split(sep) : s.trim().split(/\s+/); const to = k.to == null ? parts.length : k.to; return parts.slice(k.from - 1, to).join(sep != null ? sep : " "); };
    return (a, b) => {
      for (const k of keys) { let x = fld(a, k), y = fld(b, k); const nf = k.all ? opts.n : k.n, rf = k.all ? opts.r : k.r, ff = k.all ? opts.f : k.f; if (ff) { x = x.toLowerCase(); y = y.toLowerCase(); } let r = nf ? (parseFloat(x.trim()) || 0) - (parseFloat(y.trim()) || 0) : cmpC(x, y); if (r) return rf ? -r : r; }
      if (opts.s) return 0; const r = cmpC(a, b); return opts.r && keys.length === 1 && keys[0].all ? -r : r; };
  }
  function trSet(s) { const out = []; for (let i = 0; i < s.length; i++) { if (s[i] === "[" && s[i + 1] === ":") { const e = s.indexOf(":]", i); const nm = s.slice(i + 2, e); const cl = { upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", lower: "abcdefghijklmnopqrstuvwxyz", digit: "0123456789", alpha: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", alnum: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", space: " \t\n\r\f\v", punct: "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~" }[nm]; if (cl) { out.push(...cl); i = e + 1; continue; } } if (s[i] === "\\") { const d = s[++i]; out.push(d === "n" ? "\n" : d === "t" ? "\t" : d === "\\" ? "\\" : d); continue; } if (s[i + 1] === "-" && i + 2 < s.length) { const a = s.charCodeAt(i), b = s.charCodeAt(i + 2); for (let c = a; c <= b; c++) out.push(String.fromCharCode(c)); i += 2; continue; } out.push(s[i]); } return out; }
  const COMMANDS = {
    cat(args) { const { o, rest } = parseOpts(args, {}); const ins = readInputs(this, rest, "cat"); let n = 0; ins.forEach((f) => { let t = f.text; if (o.n) t = linesOf(t).map((l) => String(++n).padStart(6) + "\t" + l).join("\n") + (t.endsWith("\n") || !t ? "\n" : ""); this.write(t); if (f.stdin) this.stdin.pos = this.stdin.buf.length; }); return ins.bad ? 1 : 0; },
    tac(args) { const ins = readInputs(this, args, "tac"); ins.forEach((f) => { this.write(joinLines(linesOf(f.text).reverse())); if (f.stdin) this.stdin.pos = this.stdin.buf.length; }); return ins.bad ? 1 : 0; },
    rev(args) { const ins = readInputs(this, args, "rev"); ins.forEach((f) => { this.write(joinLines(linesOf(f.text).map((l) => [...l].reverse().join("")))); if (f.stdin) this.stdin.pos = this.stdin.buf.length; }); return 0; },
    head(args) { const { o, rest } = parseOpts(args, { withArg: "nc", num: "n" }); const k = o.n != null ? Number(o.n) : 10; const ins = readInputs(this, rest, "head"); ins.forEach((f, ix) => { if (ins.length > 1) this.write((ix ? "\n" : "") + "==> " + f.name + " <==\n"); if (o.c != null) this.write(f.text.slice(0, Number(o.c))); else { const l = linesOf(f.text); this.write(joinLines(k >= 0 ? l.slice(0, k) : l.slice(0, k))); } if (f.stdin) this.stdin.pos = this.stdin.buf.length; }); return ins.bad ? 1 : 0; },
    tail(args) { const { o, rest } = parseOpts(args, { withArg: "nc", num: "n" }); let ns = o.n != null ? String(o.n) : "10"; const ins = readInputs(this, rest, "tail"); ins.forEach((f, ix) => { if (ins.length > 1) this.write((ix ? "\n" : "") + "==> " + f.name + " <==\n"); const l = linesOf(f.text); if (ns[0] === "+") this.write(joinLines(l.slice(Number(ns.slice(1)) - 1))); else { const k = Number(ns); this.write(joinLines(k === 0 ? [] : l.slice(-k))); } if (f.stdin) this.stdin.pos = this.stdin.buf.length; }); return ins.bad ? 1 : 0; },
    wc(args) { const { o, rest } = parseOpts(args, {}); const ins = readInputs(this, rest, "wc"); const showAll = !o.l && !o.w && !o.c && !o.m; const rows = ins.map((f) => { const t = f.text; return { name: f.stdin ? "" : f.name, l: (t.match(/\n/g) || []).length, w: (t.trim() ? t.trim().split(/\s+/).length : 0), c: Buffer_len(t) }; }); if (ins.length > 1) rows.push({ name: "total", l: rows.reduce((a, r) => a + r.l, 0), w: rows.reduce((a, r) => a + r.w, 0), c: rows.reduce((a, r) => a + r.c, 0) });
      const cols = (r) => { const c = []; if (showAll || o.l) c.push(r.l); if (showAll || o.w) c.push(r.w); if (showAll || o.c || o.m) c.push(r.c); return c; };
      const single = ins.length === 1 && cols(rows[0]).length === 1 && ins[0].stdin; const width = Math.max(1, ...rows.map((r) => cols(r).map((x) => String(x).length)).flat());
      rows.forEach((r) => { const cs = cols(r); this.write((single ? String(cs[0]) : cs.map((x) => String(x).padStart(ins.some((f) => f.stdin) && ins.length === 1 ? (cs.length === 1 ? 0 : 7) : width)).join(" ")) + (r.name ? " " + r.name : "") + "\n"); }); ins.forEach((f) => { if (f.stdin) this.stdin.pos = this.stdin.buf.length; }); return ins.bad ? 1 : 0; },
    sort(args) { const { o, rest } = parseOpts(args, { withArg: "kt" }); const ins = readInputs(this, rest, "sort"); let lines = []; ins.forEach((f) => { lines = lines.concat(linesOf(f.text)); if (f.stdin) this.stdin.pos = this.stdin.buf.length; }); if (o.t === "\\t") o.t = "\t"; lines.sort(sortCmp(o)); if (o.u) { const cmp = sortCmp(Object.assign({}, o, { s: true })); lines = lines.filter((l, k) => k === 0 || cmp(lines[k - 1], l) !== 0); } this.write(joinLines(lines)); return ins.bad ? 1 : 0; },
    uniq(args) { const { o, rest } = parseOpts(args, {}); const ins = readInputs(this, rest.slice(0, 1), "uniq"); const lines = linesOf(ins[0].text); if (ins[0].stdin) this.stdin.pos = this.stdin.buf.length; const groups = []; lines.forEach((l) => { const key = o.i ? l.toLowerCase() : l; if (groups.length && groups[groups.length - 1].key === key) groups[groups.length - 1].n++; else groups.push({ key, l, n: 1 }); }); groups.forEach((g) => { if (o.d && g.n < 2) return; if (o.u && g.n > 1) return; this.write((o.c ? String(g.n).padStart(7) + " " : "") + g.l + "\n"); }); return 0; },
    cut(args) { const { o, rest } = parseOpts(args, { withArg: "dfc" }); const ins = readInputs(this, rest, "cut"); const spec = o.f != null ? o.f : o.c; const sel = []; String(spec).split(",").forEach((r) => { const m = /^(\d*)-(\d*)$/.exec(r); if (m) sel.push([m[1] ? Number(m[1]) : 1, m[2] ? Number(m[2]) : Infinity]); else sel.push([Number(r), Number(r)]); }); const inSel = (k) => sel.some(([a, b]) => k >= a && k <= b); const d = o.d != null ? o.d : "\t";
      ins.forEach((f) => { this.write(joinLines(linesOf(f.text).map((l) => { if (o.c != null) return [...l].filter((_, k) => inSel(k + 1)).join(""); if (!l.includes(d)) return o.s ? null : l; return l.split(d).filter((_, k) => inSel(k + 1)).join(d); }).filter((x) => x !== null))); if (f.stdin) this.stdin.pos = this.stdin.buf.length; }); return 0; },
    tr(args) { const { o, rest } = parseOpts(args, {}); const text = this.stdin.buf.slice(this.stdin.pos); this.stdin.pos = this.stdin.buf.length; let set1 = trSet(rest[0] || ""); const set2 = rest[1] != null ? trSet(rest[1]) : [];
      if (o.c) { const all = []; for (let c = 0; c < 256; c++) all.push(String.fromCharCode(c)); set1 = all.filter((c) => !set1.includes(c)); }
      let out = ""; if (o.d) { for (const ch of text) if (!set1.includes(ch)) out += ch; } else { for (const ch of text) { const k = set1.indexOf(ch); if (k < 0) out += ch; else if (set2.length) out += set2[Math.min(k, set2.length - 1)]; else out += ch; } }
      if (o.s) { const sq = set2.length ? set2 : set1; let r = ""; for (const ch of out) { if (r.length && r[r.length - 1] === ch && sq.includes(ch)) continue; r += ch; } out = r; } this.write(out); return 0; },
    grep(args) { const { o, rest } = parseOpts(args, { withArg: "e" }); let pats = o.e != null ? [o.e] : rest.length ? [rest.shift()] : []; if (!pats.length) { this.writeErr("Usage: grep [OPTION]... PATTERNS [FILE]...\n"); return 2; } const ins = readInputs(this, rest, "grep"); const mk = (p) => { let s = o.F ? p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : o.E || o.P ? p : p.replace(/\\([+?|(){}])/g, "$1").replace(/([+?|(){}])/g, "\\$1").replace(/\\([+?|(){}])/g, (m, c) => "\\" + c).replace(/\\\\([+?|(){}])/g, "$1"); if (o.w) s = "\\b(?:" + s + ")\\b"; if (o.x) s = "^(?:" + s + ")$"; s = s.replace(/\[\[:alpha:\]\]/g, "[a-zA-Z]").replace(/\[\[:digit:\]\]/g, "[0-9]").replace(/\[\[:space:\]\]/g, "\\s").replace(/\[\[:upper:\]\]/g, "[A-Z]").replace(/\[\[:lower:\]\]/g, "[a-z]").replace(/\[\[:alnum:\]\]/g, "[a-zA-Z0-9]"); return new RegExp(s, o.i ? "i" : ""); }; let res; try { res = pats.map(mk); } catch (e) { this.writeErr("grep: Invalid regular expression\n"); return 2; }
      let any = false; const multi = ins.length > 1 || o.r; ins.forEach((f) => { let cnt = 0; linesOf(f.text).forEach((l, ix) => { const hit = res.some((r) => r.test(l)) !== !!o.v; if (!hit) return; cnt++; any = true; if (o.c || o.q || o.l) return; this.write((multi ? f.name + ":" : "") + (o.n ? ix + 1 + ":" : "") + (o.o ? (res[0].exec(l) || [""])[0] : l) + "\n"); }); if (o.c) this.write((multi ? f.name + ":" : "") + cnt + "\n"); if (o.l && cnt) this.write(f.name + "\n"); if (f.stdin) this.stdin.pos = this.stdin.buf.length; }); return any ? 0 : (ins.bad ? 2 : 1); },
    seq(args) { const nums = args.map(Number); let a = 1, st = 1, b; if (nums.length === 1) b = nums[0]; else if (nums.length === 2) { a = nums[0]; b = nums[1]; } else { a = nums[0]; st = nums[1]; b = nums[2]; } const out = []; if (st > 0) for (let x = a; x <= b; x += st) out.push(String(x)); else if (st < 0) for (let x = a; x >= b; x += st) out.push(String(x)); this.write(joinLines(out)); return 0; },
    basename(args) { let p = args[0] || ""; p = p.replace(/\/+$/, ""); p = p.slice(p.lastIndexOf("/") + 1); if (args[1] && p.endsWith(args[1]) && p !== args[1]) p = p.slice(0, -args[1].length); this.write(p + "\n"); return 0; },
    dirname(args) { let p = (args[0] || "").replace(/\/+$/, ""); const k = p.lastIndexOf("/"); this.write((k < 0 ? "." : k === 0 ? "/" : p.slice(0, k)) + "\n"); return 0; },
    tee(args) { const { o, rest } = parseOpts(args, {}); const t = this.stdin.buf.slice(this.stdin.pos); this.stdin.pos = this.stdin.buf.length; rest.forEach((f) => { const p = this.abs(f); if (o.a) this.writeFile(p, (this.files.get(p) || "") + t); else this.writeFile(p, t); }); this.write(t); return 0; },
    ls(args) { const { o, rest } = parseOpts(args, {}); const targets = rest.length ? rest : ["."]; let st = 0; targets.forEach((t, ix) => { const p = this.abs(t); if (this.files.has(p)) { this.write(t + "\n"); return; } if (!this.isDir(p)) { this.writeErr("ls: cannot access '" + t + "': No such file or directory\n"); st = 2; return; } if (targets.length > 1) this.write((ix ? "\n" : "") + t + ":\n"); let l = this.list(p); if (!o.a) l = l.filter((x) => x[0] !== "."); if (o["1"] || true) this.write(joinLines(l)); }); return st; },
    mkdir(args) { const { o, rest } = parseOpts(args, {}); let st = 0; rest.forEach((d) => { const p = this.abs(d); if (this.isDir(p) || this.files.has(p)) { if (!o.p) { this.writeErr("mkdir: cannot create directory '" + d + "': File exists\n"); st = 1; } return; } const par = p.slice(0, p.lastIndexOf("/")) || "/"; if (!this.isDir(par) && !o.p) { this.writeErr("mkdir: cannot create directory '" + d + "': No such file or directory\n"); st = 1; return; } let cur = ""; p.split("/").filter(Boolean).forEach((s) => { cur += "/" + s; this.dirs.add(cur); }); }); return st; },
    touch(args) { args.forEach((f) => { const p = this.abs(f); if (!this.files.has(p) && !this.isDir(p)) this.writeFile(p, ""); }); return 0; },
    rm(args) { const { o, rest } = parseOpts(args, {}); let st = 0; rest.forEach((f) => { const p = this.abs(f); if (this.files.has(p)) { this.files.delete(p); return; } if (this.isDir(p)) { if (!o.r && !o.R) { this.writeErr("rm: cannot remove '" + f + "': Is a directory\n"); st = 1; return; } [...this.files.keys()].forEach((k) => { if (k.startsWith(p + "/")) this.files.delete(k); }); [...this.dirs].forEach((d) => { if (d === p || d.startsWith(p + "/")) this.dirs.delete(d); }); return; } if (!o.f) { this.writeErr("rm: cannot remove '" + f + "': No such file or directory\n"); st = 1; } }); return st; },
    cp(args) { const { rest } = parseOpts(args, {}); const dst = rest.pop(); const dp = this.abs(dst); let st = 0; rest.forEach((f) => { const p = this.abs(f); if (!this.files.has(p)) { this.writeErr("cp: cannot stat '" + f + "': No such file or directory\n"); st = 1; return; } this.writeFile(this.isDir(dp) ? dp + "/" + p.slice(p.lastIndexOf("/") + 1) : dp, this.files.get(p)); }); return st; },
    mv(args) { const { rest } = parseOpts(args, {}); const dst = rest.pop(); const dp = this.abs(dst); let st = 0; rest.forEach((f) => { const p = this.abs(f); if (!this.files.has(p)) { this.writeErr("mv: cannot stat '" + f + "': No such file or directory\n"); st = 1; return; } this.writeFile(this.isDir(dp) ? dp + "/" + p.slice(p.lastIndexOf("/") + 1) : dp, this.files.get(p)); this.files.delete(p); }); return st; },
    whoami() { this.write("user\n"); return 0; }, hostname() { this.write("aatakode\n"); return 0; },
    expr(args) { const a = args; if (a.length === 3) { const x = Number(a[0]), y = Number(a[2]); const r = { "+": x + y, "-": x - y, "*": x * y, "/": Math.trunc(x / y), "%": x % y, "<": x < y ? 1 : 0, ">": x > y ? 1 : 0, "=": a[0] === a[2] ? 1 : 0, "!=": a[0] !== a[2] ? 1 : 0, "<=": x <= y ? 1 : 0, ">=": x >= y ? 1 : 0 }[a[1]]; if (r !== undefined) { this.write(r + "\n"); return r === 0 ? 1 : 0; } if (a[1] === ":") { const m = new RegExp("^" + a[2]).exec(a[0]); const v = m ? (m[1] !== undefined ? m[1] : String(m[0].length)) : "0"; this.write(v + "\n"); return v === "0" || v === "" ? 1 : 0; } } if (a.length === 2 && a[0] === "length") { this.write([...a[1]].length + "\n"); return 0; } this.writeErr("expr: syntax error\n"); return 2; },
    xargs(args) { const { o, rest } = parseOpts(args, { withArg: "nI" }); const items = this.stdin.buf.slice(this.stdin.pos).split(/\s+/).filter(Boolean); this.stdin.pos = this.stdin.buf.length; const cmd = rest.length ? rest : ["echo"]; if (o.I) { items.forEach((it) => this.runCommand(cmd[0], cmd.slice(1).map((x) => x.split(o.I).join(it)))); return this.status; } const k = o.n ? Number(o.n) : items.length || 1; if (!items.length) { this.runCommand(cmd[0], cmd.slice(1)); return this.status; } for (let i = 0; i < items.length; i += k) this.runCommand(cmd[0], cmd.slice(1).concat(items.slice(i, i + k))); return this.status; },
    sed(args) { const scripts = []; let quiet = false, ere = false; const files = []; for (let i = 0; i < args.length; i++) { const a = args[i]; if (a === "-n") quiet = true; else if (a === "-E" || a === "-r") ere = true; else if (a === "-e") scripts.push(args[++i]); else if (/^-[nEr]+$/.test(a)) { if (a.includes("n")) quiet = true; if (/[Er]/.test(a)) ere = true; } else if (!scripts.length && !a.startsWith("-")) scripts.push(a); else files.push(a); }
      const cmds = []; scripts.join("\n").split(/\n|;(?![^/]*\/[^/]*$)/).forEach((sc) => { sc = sc.trim(); if (!sc) return; let addr = null; let m = /^(\$|\d+)(?:,(\$|\d+))?/.exec(sc) || null; let rest = sc; if (m) { addr = { a: m[1], b: m[2] }; rest = sc.slice(m[0].length); } else { const rm = /^\/((?:[^/\\]|\\.)*)\//.exec(sc); if (rm) { addr = { re: new RegExp(rm[1]) }; rest = sc.slice(rm[0].length); } } rest = rest.trim();
        if (rest[0] === "s") { const d = rest[1]; const parts = []; let cur = "", k = 2; for (; k < rest.length && parts.length < 3; k++) { if (rest[k] === "\\" && k + 1 < rest.length) { cur += rest[k] + rest[k + 1]; k++; continue; } if (rest[k] === d) { parts.push(cur); cur = ""; } else cur += rest[k]; } if (parts.length < 2) { parts.push(cur); } const flags = (parts[2] || rest.slice(k)).trim(); let pat = parts[0]; if (!ere) pat = pat.replace(/\\([+?|(){}])/g, "\u0001$1").replace(/([+?|(){}])/g, "\\$1").replace(/\u0001([+?|(){}])/g, "$1"); try { cmds.push({ addr, k: "s", re: new RegExp(pat, (flags.includes("g") ? "g" : "") + (flags.includes("I") || flags.includes("i") ? "i" : "")), rep: parts[1].replace(/\\(\d)/g, "$$$1").replace(/&/g, "$$&").replace(/\\&/g, "&").replace(/\\n/g, "\n"), p: flags.includes("p") }); } catch (e) { cmds.push({ k: "err" }); } } else if (rest === "d") cmds.push({ addr, k: "d" }); else if (rest === "p") cmds.push({ addr, k: "p" }); else if (rest[0] === "y") { const d = rest[1]; const ps = rest.slice(2).split(d); cmds.push({ addr, k: "y", from: ps[0], to: ps[1] }); } else if (rest[0] === "q") cmds.push({ addr, k: "q" }); });
      const ins = readInputs(this, files, "sed"); ins.forEach((f) => { const lines = linesOf(f.text); const last = lines.length; for (let ix = 0; ix < lines.length; ix++) { let l = lines[ix], del = false, quit = false; const n = ix + 1; for (const c of cmds) { if (c.k === "err") { this.writeErr("sed: invalid regex\n"); return 1; } let hit = true; if (c.addr) { if (c.addr.re) hit = c.addr.re.test(l); else { const a = c.addr.a === "$" ? last : Number(c.addr.a); const b = c.addr.b == null ? null : c.addr.b === "$" ? last : Number(c.addr.b); hit = b == null ? n === a : n >= a && n <= b; } } if (!hit) continue; if (c.k === "s") { const before = l; l = l.replace(c.re, c.rep); if (c.p && before !== l) this.write(l + "\n"); } else if (c.k === "d") { del = true; break; } else if (c.k === "p") this.write(l + "\n"); else if (c.k === "y") l = [...l].map((ch) => { const k = c.from.indexOf(ch); return k >= 0 ? c.to[k] : ch; }).join(""); else if (c.k === "q") quit = true; } if (!del && !quiet) this.write(l + "\n"); if (quit) break; } if (f.stdin) this.stdin.pos = this.stdin.buf.length; }); return 0; },
    awk() { this.writeErr("awk is not available in this shell. Try cut, sort, uniq, grep or sed.\n"); return 127; },
    date() { this.write("Thu Nov 26 12:00:00 UTC 2026\n"); return 0; },
    find() { this.writeErr("find is not available in this shell. Try ls or a for loop with a glob.\n"); return 127; },
  };
  function Buffer_len(t) { let n = 0; for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c < 0xdc00 ? (i++, 4) : 3; } return n; }

  /* ------------------------------------------------------------------ public API */
  AK.shRun = function (src, opts) {
    opts = opts || {}; const sh = new Shell(opts);
    let r; try { r = sh.run(src); } catch (e) { if (e instanceof RangeError) r = { out: sh.out, err: sh.err + "script: too much recursion\n", code: 1 }; else throw e; }
    const files = {}; sh.files.forEach((v, k) => { files[k] = v; });
    return { out: r.out, err: r.err, code: r.code, files, steps: sh.steps };
  };
  AK.shCheck = function (src) { try { parse(src); return null; } catch (e) { if (e instanceof ShErr) return { line: e.line, msg: e.message }; throw e; } };
  AK.shGrade = function (src, tests, m) {
    const base = (m && m.files) || {};
    return tests.map((t) => {
      const r = { label: t.label, hidden: !!t.hidden, expect: t.expect, stdin: t.stdin || (t.args ? [] : undefined) };
      const run = (extra) => AK.shRun(src, { files: Object.assign({}, base, t.files || {}), stdin: (t.stdin || []).length ? t.stdin.join("\n") + "\n" : "", args: t.args || [], env: t.env });
      try {
        if (t.kind === "sh-source") { const ok = new RegExp(t.pattern, "m").test(src) !== !!t.absent; r.ok = ok; if (!ok) r.got = t.absent ? "This should not appear in your script." : "Your script does not use that yet."; return r; }
        const res = run();
        if (t.kind === "sh-out") { const got = res.out; r.expect = t.expect; r.got = got + (res.err && got === "" ? "" : ""); r.ok = got === t.expect; if (!r.ok && res.err) r.err = res.err; if (t.status !== undefined && res.code !== t.status) r.ok = false; r.stdin = t.stdin || t.args || []; if (!r.ok) r.got = got + (res.err ? "\n[stderr] " + res.err.trim() : ""); return r; }
        if (t.kind === "sh-status") { r.ok = res.code === t.expect; r.got = String(res.code) + (res.err ? " (" + res.err.trim().split("\n")[0] + ")" : ""); r.expect = String(t.expect); return r; }
        if (t.kind === "sh-file") { const f = res.files[res.files ? "/home/user/" + t.path : ""]; r.ok = f === t.expect; r.got = f === undefined ? "(file " + t.path + " was not created)" : f; r.expect = t.expect; return r; }
        r.ok = false; r.got = "unknown test kind " + t.kind; return r;
      } catch (e) { r.ok = false; r.got = "error: " + (e && e.message ? e.message : e); return r; }
    });
  };
  if (typeof module !== "undefined" && module.exports) module.exports = AK;
})(typeof window !== "undefined" ? window : globalThis);

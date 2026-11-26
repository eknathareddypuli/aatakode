/* AataKode in-browser Go: a small Go interpreter (no DOM). It runs real Go source offline, with the compile errors a
   beginner meets first (unused variable, unused import, undefined name, missing return) and Go's runtime panics.
   Supported: package main, imports, funcs (multiple returns, variadic, closures, defer/recover), consts + iota,
   var/:=, if/for/range/switch/type switch, slices (shared backing array, append, copy, make), arrays, maps, structs
   (methods, embedding), pointers, interfaces, named types, errors, fmt/strings/strconv/math/sort/errors/os/unicode/
   bufio(stdin)/slices. Not supported: goroutines, channels, generics, reflect, time. Type errors are caught only
   where they surface at run time. Loaded by the browser and by the Node verifier. */
(function (root) {
  "use strict";
  const AK = typeof module !== "undefined" && module.exports ? require("./engine.js") : root.AK;

  /* ================================================================ lexer */
  const KW = new Set("break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var".split(" "));
  const OPS = ["<<=", ">>=", "&^=", "...", "&&", "||", "<-", "++", "--", "==", "!=", "<=", ">=", ":=", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<", ">>", "&^", "+", "-", "*", "/", "%", "&", "|", "^", "<", ">", "=", "!", "(", ")", "[", "]", "{", "}", ",", ";", ".", ":", "~"];
  class GoErr extends Error { constructor(msg, line, col) { super(msg); this.line = line; this.col = col; this.compile = true; } }
  function lex(src) {
    const toks = []; let i = 0, line = 1, ls = 0, last = null; const n = src.length;
    const push = (t, v, extra) => { const tk = Object.assign({ t: t, v: v, line: line, col: i - ls + 1 }, extra); toks.push(tk); last = tk; return tk; };
    const needSemi = () => last && (last.t === "id" || last.t === "int" || last.t === "float" || last.t === "str" || last.t === "char" || (last.t === "kw" && /^(break|continue|fallthrough|return)$/.test(last.v)) || (last.t === "op" && /^(\+\+|--|\)|\]|\})$/.test(last.v)));
    const esc = (q) => {
      const c = src[i++];
      switch (c) { case "n": return "\n"; case "t": return "\t"; case "r": return "\r"; case "\\": return "\\"; case "'": return "'"; case '"': return '"'; case "a": return "\x07"; case "b": return "\b"; case "f": return "\f"; case "v": return "\v";
        case "x": { const h = src.substr(i, 2); i += 2; return String.fromCharCode(parseInt(h, 16)); }
        case "u": { const h = src.substr(i, 4); i += 4; return String.fromCodePoint(parseInt(h, 16)); }
        case "U": { const h = src.substr(i, 8); i += 8; return String.fromCodePoint(parseInt(h, 16)); }
        default: if (/[0-7]/.test(c)) { const o = src.substr(i - 1, 3); i += 2; return String.fromCharCode(parseInt(o, 8)); } throw new GoErr("unknown escape sequence", line, i - ls); }
    };
    while (i < n) {
      const c = src[i];
      if (c === "\n") { if (needSemi()) { const t = push("op", ";", { auto: true }); t.col = i - ls + 1; } i++; line++; ls = i; last = last && last.v === ";" ? last : last; continue; }
      if (c === " " || c === "\t" || c === "\r") { i++; continue; }
      if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
      if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); const seg = src.slice(i, e < 0 ? n : e + 2); const nl = (seg.match(/\n/g) || []).length; if (nl && needSemi()) push("op", ";", { auto: true }); i = e < 0 ? n : e + 2; if (nl) { line += nl; ls = i - (seg.length - seg.lastIndexOf("\n") - 1); } continue; }
      if (/[A-Za-z_\u0080-￿]/.test(c)) { let j = i + 1; while (j < n && /[A-Za-z0-9_\u0080-￿]/.test(src[j])) j++; const w = src.slice(i, j); const tk = KW.has(w) ? push("kw", w) : push("id", w); tk.col = i - ls + 1; i = j; continue; }
      if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] || ""))) {
        let j = i; const col = i - ls + 1; let isF = false;
        if (c === "0" && /[xX]/.test(src[i + 1] || "")) { j = i + 2; while (j < n && /[0-9a-fA-F_]/.test(src[j])) j++; }
        else if (c === "0" && /[bB]/.test(src[i + 1] || "")) { j = i + 2; while (j < n && /[01_]/.test(src[j])) j++; }
        else if (c === "0" && /[oO]/.test(src[i + 1] || "")) { j = i + 2; while (j < n && /[0-7_]/.test(src[j])) j++; }
        else { while (j < n && /[0-9_]/.test(src[j])) j++; if (src[j] === "." ) { isF = true; j++; while (j < n && /[0-9_]/.test(src[j])) j++; } if (/[eE]/.test(src[j] || "")) { isF = true; j++; if (/[+-]/.test(src[j])) j++; while (j < n && /[0-9]/.test(src[j])) j++; } }
        const raw = src.slice(i, j).replace(/_/g, ""); let val;
        if (isF) val = parseFloat(raw); else if (/^0[0-7]+$/.test(raw)) val = parseInt(raw, 8); else if (/^0[oO]/.test(raw)) val = parseInt(raw.slice(2), 8); else if (/^0[bB]/.test(raw)) val = parseInt(raw.slice(2), 2); else val = Number(raw);
        const tk = push(isF ? "float" : "int", val, { raw: raw }); tk.col = col; i = j; continue;
      }
      if (c === '"') { const col = i - ls + 1; i++; let s = ""; while (i < n && src[i] !== '"') { if (src[i] === "\n") throw new GoErr("string literal not terminated", line, col); if (src[i] === "\\") { i++; s += esc('"'); } else s += src[i++]; } if (i >= n) throw new GoErr("string literal not terminated", line, col); i++; const tk = push("str", s); tk.col = col; continue; }
      if (c === "`") { const col = i - ls + 1, l0 = line; let j = i + 1; while (j < n && src[j] !== "`") { if (src[j] === "\n") { line++; ls = j + 1; } j++; } if (j >= n) throw new GoErr("raw string literal not terminated", l0, col); const tk = push("str", src.slice(i + 1, j).replace(/\r/g, "")); tk.line = l0; tk.col = col; i = j + 1; continue; }
      if (c === "'") { const col = i - ls + 1; i++; let ch; if (src[i] === "\\") { i++; ch = esc("'"); } else { ch = String.fromCodePoint(src.codePointAt(i)); i += ch.length; } if (src[i] !== "'") throw new GoErr("rune literal not terminated", line, col); i++; const tk = push("char", ch.codePointAt(0)); tk.col = col; continue; }
      let op = null; for (const o of OPS) if (src.startsWith(o, i)) { op = o; break; }
      if (!op) throw new GoErr("invalid character " + JSON.stringify(c), line, i - ls + 1);
      const tk = push("op", op); tk.col = i - ls + 1; i += op.length;
    }
    if (needSemi()) push("op", ";", { auto: true });
    push("eof", "");
    return toks;
  }

  /* ================================================================ parser */
  function parse(src) {
    const toks = lex(src); let p = 0, noLit = 0;
    const peek = () => toks[p], at = (v) => toks[p].v === v && (toks[p].t === "op" || toks[p].t === "kw"), isId = () => toks[p].t === "id";
    const fail = (msg, tk) => { tk = tk || toks[p]; throw new GoErr(msg, tk.line, tk.col); };
    const near = (tk) => (tk.t === "eof" ? "EOF" : tk.auto ? "newline" : tk.t === "str" ? "literal " + JSON.stringify(tk.v) : tk.t === "int" || tk.t === "float" ? "literal " + tk.v : tk.t === "id" ? "name " + tk.v : tk.t === "kw" ? "keyword " + tk.v : tk.v);
    const expect = (v, ctx) => { if (!at(v)) fail("syntax error: unexpected " + near(toks[p]) + ", expected " + v + (ctx ? " " + ctx : "")); return toks[p++]; };
    const accept = (v) => { if (at(v)) { p++; return true; } return false; };
    const skipSemi = () => { while (at(";")) p++; };
    const ident = () => { if (!isId()) fail("syntax error: unexpected " + near(toks[p]) + ", expected name"); return toks[p++]; };
    const node = (k, tk, o) => Object.assign({ k: k, line: tk.line, col: tk.col }, o);

    /* ---- types */
    function parseType() {
      const tk = peek();
      if (tk.t === "id") { p++; if (at(".")) { p++; const nm = ident(); return node("TName", tk, { pkg: tk.v, name: nm.v }); } return node("TName", tk, { name: tk.v }); }
      if (at("*")) { p++; return node("TPtr", tk, { elem: parseType() }); }
      if (at("[")) { p++; if (accept("]")) return node("TSlice", tk, { elem: parseType() }); let len; if (at("...")) { p++; len = null; } else len = parseExpr(); expect("]"); return node("TArray", tk, { len: len, elem: parseType() }); }
      if (at("map")) { p++; expect("["); const key = parseType(); expect("]"); return node("TMap", tk, { key: key, val: parseType() }); }
      if (at("func")) { p++; const sig = parseSig(); return node("TFunc", tk, sig); }
      if (at("struct")) return parseStructType();
      if (at("interface")) { p++; expect("{"); const methods = []; skipSemi(); while (!at("}")) { if (isId() && toks[p + 1].v === "(") { const nm = ident(); const sig = parseSig(); methods.push({ name: nm.v, sig: sig }); } else { parseType(); while (accept("|")) parseType(); } skipSemi(); } expect("}"); return node("TIface", tk, { methods: methods }); }
      if (at("(")) { p++; const t = parseType(); expect(")"); return t; }
      if (at("chan") || at("<-")) fail("goroutines and channels are not supported in the in-browser Go runner yet");
      fail("syntax error: unexpected " + near(tk) + ", expected type");
    }
    function parseStructType() {
      const tk = expect("struct"); expect("{"); const fields = []; skipSemi();
      while (!at("}")) {
        if (at("*")) { const t = parseType(); fields.push({ names: [t.elem.name], type: t, embedded: true }); }
        else {
          const first = ident();
          if (at(";") || at("}") || at(".") || peek().t === "str") { let t = node("TName", first, { name: first.v }); if (at(".")) { p++; const nm = ident(); t = node("TName", first, { pkg: first.v, name: nm.v }); } fields.push({ names: [t.name], type: t, embedded: true }); }
          else { const names = [first.v]; while (accept(",")) names.push(ident().v); fields.push({ names: names, type: parseType() }); }
        }
        if (peek().t === "str") p++;
        skipSemi();
      }
      expect("}"); return node("TStruct", tk, { fields: fields });
    }
    function parseParams() {
      expect("("); const entries = []; let anyNamed = false;
      while (!at(")")) {
        const tk = peek(); let name = null, type, variadic = false;
        if (at("...")) { p++; variadic = true; type = parseType(); }
        else if (tk.t === "id" && !(toks[p + 1].v === "." && toks[p + 1].t === "op") && toks[p + 1].v !== "," && toks[p + 1].v !== ")") { name = ident(); if (at("...")) { p++; variadic = true; } type = parseType(); anyNamed = true; }
        else type = parseType();
        entries.push({ name: name ? name.v : null, nameTok: name, type: type, variadic: variadic });
        if (!accept(",")) break; skipSemi();
      }
      expect(")");
      if (anyNamed) { let t = null; for (let i = entries.length - 1; i >= 0; i--) { const e = entries[i]; if (e.name) t = e; else if (t) { e.name = e.type.name; e.nameTok = tk0(e.type); e.type = t.type; e.variadic = t.variadic; } } }
      return entries;
    }
    const tk0 = (t) => ({ line: t.line, col: t.col });
    function parseSig() {
      const params = parseParams(); let results = [];
      if (at("(")) { results = parseParams(); }
      else if (!at("{") && !at(";") && !at(")") && !at(",") && !at("]") && !at("}") && !at("=") && !at(":=") && peek().t !== "str") { results = [{ name: null, type: parseType() }]; }
      return { params: params, results: results };
    }

    /* ---- expressions */
    const PREC = { "||": 1, "&&": 2, "==": 3, "!=": 3, "<": 3, "<=": 3, ">": 3, ">=": 3, "+": 4, "-": 4, "|": 4, "^": 4, "*": 5, "/": 5, "%": 5, "<<": 5, ">>": 5, "&": 5, "&^": 5 };
    function parseExpr(minPrec) {
      minPrec = minPrec || 1; let l = parseUnary();
      for (;;) { const tk = peek(); const pr = tk.t === "op" ? PREC[tk.v] : 0; if (!pr || pr < minPrec) return l; p++; const r = parseExpr(pr + 1); l = node("Binary", tk, { op: tk.v, l: l, r: r }); }
    }
    function parseUnary() {
      const tk = peek();
      if (tk.t === "op" && /^(\+|-|!|\^|&)$/.test(tk.v)) { p++; return node("Unary", tk, { op: tk.v, x: parseUnary() }); }
      if (at("*")) { p++; return node("Deref", tk, { x: parseUnary() }); }
      if (at("<-")) fail("goroutines and channels are not supported in the in-browser Go runner yet");
      return parsePrimary();
    }
    function parseOperand() {
      const tk = peek();
      switch (tk.t) {
        case "int": p++; return node("Lit", tk, { kind: "int", v: tk.v });
        case "float": p++; return node("Lit", tk, { kind: "float", v: tk.v, raw: tk.raw });
        case "str": p++; return node("Lit", tk, { kind: "string", v: tk.v });
        case "char": p++; return node("Lit", tk, { kind: "rune", v: tk.v });
        case "id": p++; return node("Ident", tk, { name: tk.v });
        case "kw":
          if (tk.v === "func") { p++; const sig = parseSig(); if (at("{")) { const save = noLit; noLit = 0; const body = parseBlock(); noLit = save; return node("FuncLit", tk, { sig: sig, body: body }); } return node("TypeX", tk, { t: node("TFunc", tk, sig) }); }
          if (tk.v === "struct" || tk.v === "map" || tk.v === "interface") { const t = parseType(); return node("TypeX", tk, { t: t }); }
          if (tk.v === "go" || tk.v === "chan" || tk.v === "select") fail("goroutines and channels are not supported in the in-browser Go runner yet");
          break;
        case "op":
          if (tk.v === "(") { p++; const save = noLit; noLit = 0; const e = parseExprOrType(); noLit = save; expect(")"); return node("Paren", tk, { x: e }); }
          if (tk.v === "[") { const t = parseType(); return node("TypeX", tk, { t: t }); }
          break;
      }
      fail("syntax error: unexpected " + near(tk) + ", expected expression");
    }
    function parseExprOrType() { if (at("*") ) { return parseExpr(); } return parseExpr(); }
    const typeLike = (e) => e.k === "TypeX" || e.k === "Ident" || (e.k === "Selector" && e.x.k === "Ident");
    function parsePrimary() {
      let x = parseOperand();
      for (;;) {
        const tk = peek();
        if (at(".")) {
          p++;
          if (at("(")) { p++; if (at("type")) { p++; expect(")"); x = node("TypeAssert", tk, { x: x, t: null }); } else { const t = parseType(); expect(")"); x = node("TypeAssert", tk, { x: x, t: t }); } }
          else { const nm = ident(); x = node("Selector", nm, { x: x, name: nm.v }); }
        } else if (at("(")) {
          p++; const save = noLit; noLit = 0; const args = []; let spread = false; skipSemi();
          while (!at(")")) { args.push(parseExprOrTypeArg()); if (accept("...")) spread = true; if (!accept(",")) break; skipSemi(); }
          noLit = save; skipSemi(); expect(")", "in argument list; possibly missing comma or )"); x = node("Call", tk, { fn: x, args: args, spread: spread });
        } else if (at("[")) {
          p++; const save = noLit; noLit = 0; let lo = null, hi = null, max = null, isSlice = false;
          if (!at(":")) lo = parseExprOrTypeArg();
          if (accept(":")) { isSlice = true; if (!at("]") && !at(":")) hi = parseExpr(); if (accept(":")) max = parseExpr(); }
          noLit = save; expect("]");
          x = isSlice ? node("SliceExpr", tk, { x: x, lo: lo, hi: hi, max: max }) : node("Index", tk, { x: x, i: lo });
        } else if (at("{") && (x.k === "TypeX" || !noLit) && typeLike(x) && (x.k !== "Ident" || /^[A-Za-z_]/.test(x.name)) ) {
          x = parseCompositeBody(x.k === "TypeX" ? x.t : exprToType(x), x);
        } else return x;
      }
    }
    function parseExprOrTypeArg() { const tk = peek(); if (at("*") || at("[") || at("map") || at("struct") || at("interface") || (at("func"))) return parseExpr(); return parseExpr(); }
    function exprToType(e) { if (e.k === "Ident") return node("TName", e, { name: e.name }); if (e.k === "Selector" && e.x.k === "Ident") return node("TName", e, { pkg: e.x.name, name: e.name }); if (e.k === "TypeX") return e.t; fail("syntax error: not a type", e); }
    function parseCompositeBody(type, at0) {
      const tk = expect("{"); const save = noLit; noLit = 0; const elems = []; skipSemi();
      while (!at("}")) {
        let key = null, val;
        const parseElem = () => (at("{") ? parseCompositeBody(null, peek()) : parseExpr());
        val = parseElem();
        if (accept(":")) { key = val; val = parseElem(); }
        elems.push({ key: key, val: val }); if (!accept(",")) { skipSemi(); break; } skipSemi();
      }
      skipSemi(); noLit = save; expect("}", "in composite literal; possibly missing comma or }");
      return node("Composite", at0 || tk, { type: type, elems: elems });
    }

    /* ---- statements */
    function parseBlock() { const tk = expect("{"); const stmts = parseStmtList(); expect("}"); return node("Block", tk, { stmts: stmts, end: toks[p - 1] }); }
    function parseStmtList() { const out = []; skipSemi(); while (!at("}") && peek().t !== "eof" && !at("case") && !at("default")) { out.push(parseStmt()); if (!at("}") && !at("case") && !at("default")) { if (!at(";")) fail("syntax error: unexpected " + near(peek()) + " at end of statement"); } skipSemi(); } return out; }
    function exprList() { const l = [parseExpr()]; while (accept(",")) l.push(parseExpr()); return l; }
    function parseSimple(noRange) {
      const tk = peek();
      if (at("range")) { p++; const x = parseExpr(); return node("Range", tk, { key: null, val: null, def: false, x: x }); }
      const lhs = exprList(); const o = peek();
      if (o.t === "op" && (o.v === ":=" || o.v === "=")) {
        p++;
        if (at("range")) { p++; const x = parseExpr(); return node("Range", tk, { key: lhs[0], val: lhs[1] || null, def: o.v === ":=", x: x }); }
        const rhs = exprList(); return node(o.v === ":=" ? "Define" : "Assign", o, { lhs: lhs, rhs: rhs });
      }
      if (o.t === "op" && /^(\+=|-=|\*=|\/=|%=|&=|\|=|\^=|<<=|>>=|&\^=)$/.test(o.v)) { p++; return node("OpAssign", o, { op: o.v.slice(0, -1), lhs: lhs[0], rhs: parseExpr() }); }
      if (o.t === "op" && (o.v === "++" || o.v === "--")) { p++; return node("IncDec", o, { op: o.v, x: lhs[0] }); }
      if (o.t === "op" && o.v === "<-") fail("goroutines and channels are not supported in the in-browser Go runner yet");
      if (at(":") && lhs[0].k === "Ident" && lhs.length === 1 && !noRange) { p++; skipSemi(); const body = at("}") ? node("Empty", o, {}) : parseStmt(); return node("Label", tk, { name: lhs[0].name, body: body }); }
      if (lhs.length > 1) fail("syntax error: unexpected " + near(o) + ", expected := or = or comma");
      return node("ExprStmt", tk, { x: lhs[0] });
    }
    function parseVarSpec(kind) {
      const tk = peek(); const names = [ident()]; while (accept(",")) names.push(ident()); let type = null, vals = [];
      if (!at("=") && !at(";") && !at(")")) type = parseType();
      if (accept("=")) vals = exprList();
      return node("VarSpec", tk, { names: names, type: type, vals: vals, kind: kind });
    }
    function parseDeclGroup(kind, fn) { expect(kind); const out = []; if (accept("(")) { skipSemi(); let iota = 0, prev = null; while (!at(")")) { const sp = fn(kind); if (kind === "const") { if (sp.vals.length === 0 && prev) { sp.vals = prev.vals; sp.type = prev.type; sp.implicit = true; } else prev = sp; sp.iota = iota++; } out.push(sp); skipSemi(); } expect(")"); } else { const sp = fn(kind); if (kind === "const") sp.iota = 0; out.push(sp); } return out; }
    function parseTypeSpec() { const tk = peek(); const nm = ident(); if (at("[") && toks[p + 1].t === "id" && toks[p + 2].v !== "]") fail("generic types are not supported in the in-browser Go runner yet"); const alias = accept("="); const t = parseType(); return node("TypeSpec", tk, { name: nm.v, type: t, alias: alias }); }
    function parseStmt() {
      const tk = peek();
      if (tk.t === "kw") {
        switch (tk.v) {
          case "var": return node("DeclStmt", tk, { specs: parseDeclGroup("var", parseVarSpec) });
          case "const": return node("DeclStmt", tk, { specs: parseDeclGroup("const", parseVarSpec) });
          case "type": return node("DeclStmt", tk, { specs: parseDeclGroup("type", parseTypeSpec), isType: true });
          case "return": { p++; const vals = at(";") || at("}") ? [] : exprList(); return node("Return", tk, { vals: vals }); }
          case "break": p++; return node("Branch", tk, { kind: "break", label: isId() ? ident().v : null });
          case "continue": p++; return node("Branch", tk, { kind: "continue", label: isId() ? ident().v : null });
          case "fallthrough": p++; return node("Fallthrough", tk, {});
          case "goto": fail("goto is not supported in the in-browser Go runner");
          case "go": case "select": fail("goroutines and channels are not supported in the in-browser Go runner yet");
          case "defer": { p++; const e = parseExpr(); if (e.k !== "Call") fail("expression in defer must be function call", tk); return node("Defer", tk, { call: e }); }
          case "if": return parseIf();
          case "for": return parseFor();
          case "switch": return parseSwitch();
          case "func": if (toks[p + 1].v === "(" || toks[p + 1].t !== "id") return parseSimple(); fail("syntax error: unexpected name " + toks[p + 1].v + ", expected (");
        }
      }
      if (at("{")) return parseBlock();
      if (at(";")) return node("Empty", tk, {});
      return parseSimple();
    }
    function parseIf() {
      const tk = expect("if"); const save = noLit; noLit = 1; let init = null, cond;
      if (at("{")) fail("missing condition in if statement");
      let s = at(";") ? null : parseSimple(); if (accept(";")) { init = s; if (at("{")) fail("missing condition in if statement"); cond = parseSimple(); } else cond = s;
      noLit = save; if (cond.k !== "ExprStmt") fail("cannot use " + (cond.k === "Define" || cond.k === "Assign" ? "assignment" : "statement") + " as value", tk);
      const then = parseBlock(); let els = null;
      if (accept("else")) { if (at("if")) els = parseIf(); else if (at("{")) els = parseBlock(); else fail("else must be followed by if or statement block"); }
      return node("If", tk, { init: init, cond: cond.x, then: then, els: els });
    }
    function parseFor() {
      const tk = expect("for"); const save = noLit; noLit = 1; let init = null, cond = null, post = null, range = null;
      if (at("{")) { /* infinite */ }
      else {
        let s = at(";") ? null : parseSimple();
        if (s && s.k === "Range") range = s;
        else if (at(";")) { p++; init = s; if (!at(";")) { const c = parseSimple(); cond = c.x; } expect(";"); if (!at("{")) post = parseSimple(); }
        else { if (s.k !== "ExprStmt") fail("expected for loop condition", tk); cond = s.x; }
      }
      noLit = save; const body = parseBlock();
      if (range) return node("ForRange", tk, { key: range.key, val: range.val, def: range.def, x: range.x, body: body });
      return node("For", tk, { init: init, cond: cond, post: post, body: body });
    }
    function parseSwitch() {
      const tk = expect("switch"); const save = noLit; noLit = 1; let init = null, tag = null;
      if (!at("{")) { let s = at(";") ? null : parseSimple(); if (accept(";")) { init = s; if (!at("{")) tag = parseSimple(); } else tag = s; }
      noLit = save; expect("{"); skipSemi();
      let typeSwitch = null;
      if (tag) { const e = tag.k === "ExprStmt" ? tag.x : tag.k === "Define" ? tag.rhs[0] : null; if (e && e.k === "TypeAssert" && e.t === null) typeSwitch = { bind: tag.k === "Define" ? tag.lhs[0].name : null, x: e.x }; else if (tag.k !== "ExprStmt") fail("switch expression must be an expression", tk); }
      const cases = [];
      while (!at("}")) {
        const ct = peek(); let exprs = null, types = null;
        if (accept("default")) { /* default */ } else { expect("case"); if (typeSwitch) { types = [parseCaseType()]; while (accept(",")) types.push(parseCaseType()); } else exprs = exprList(); }
        expect(":"); const body = parseStmtList(); cases.push({ tok: ct, exprs: exprs, types: types, body: body, isDefault: !exprs && !types });
      }
      expect("}");
      return node(typeSwitch ? "TypeSwitch" : "Switch", tk, { init: init, tag: tag && !typeSwitch ? tag.x : null, ts: typeSwitch, cases: cases });
    }
    function parseCaseType() { if (peek().v === "nil" && peek().t === "id") { const t = peek(); p++; return node("TName", t, { name: "nil" }); } return parseType(); }

    /* ---- top level */
    expect("package"); const pkg = ident(); skipSemi();
    const imports = []; const decls = [];
    while (at("import")) { p++; const one = () => { let alias = null; if (isId() || at(".")) alias = toks[p++].v; const s = toks[p]; if (s.t !== "str") fail("syntax error: missing import path"); p++; imports.push({ path: s.v, alias: alias, tok: s }); }; if (accept("(")) { skipSemi(); while (!at(")")) { one(); skipSemi(); } expect(")"); } else one(); skipSemi(); }
    while (peek().t !== "eof") {
      const tk = peek();
      if (at("func")) {
        p++; let recv = null;
        if (at("(")) { const ps = parseParams(); recv = ps[0]; }
        const nm = ident(); if (at("[")) fail("generic functions are not supported in the in-browser Go runner yet", peek());
        const sig = parseSig(); let body = null; if (at("{")) { const save = noLit; noLit = 0; body = parseBlock(); noLit = save; }
        decls.push(node("FuncDecl", nm, { name: nm.v, recv: recv, sig: sig, body: body }));
      } else if (at("var") || at("const")) { const kind = peek().v; decls.push(node("DeclStmt", tk, { specs: parseDeclGroup(kind, parseVarSpec), top: true })); }
      else if (at("type")) decls.push(node("DeclStmt", tk, { specs: parseDeclGroup("type", parseTypeSpec), isType: true, top: true }));
      else if (at("import")) fail("syntax error: imports must appear before other declarations");
      else fail("syntax error: non-declaration statement outside function body");
      if (!at(";") && peek().t !== "eof") fail("syntax error: unexpected " + near(peek()) + " after top level declaration");
      skipSemi();
    }
    return { pkg: pkg.v, imports: imports, decls: decls };
  }

  /* ================================================================ static checks */
  const BUILTIN_TYPES = "int int8 int16 int32 int64 uint uint8 uint16 uint32 uint64 uintptr float32 float64 string bool byte rune error any complex128".split(" ");
  const BUILTIN_FUNCS = "len cap append make new copy delete panic recover print println min max clear close complex real imag".split(" ");
  const PKG_NAMES = { fmt: 1, strings: 1, strconv: 1, math: 1, sort: 1, errors: 1, os: 1, unicode: 1, utf8: 1, bufio: 1, slices: 1, time: 1, bytes: 1, sync: 1, rand: 1, maps: 1 };
  function check(ast) {
    const errs = []; const report = (msg, tk) => errs.push({ line: tk.line, col: tk.col, msg: msg });
    const imp = {}; ast.imports.forEach((im) => { const name = im.alias || im.path.split("/").pop(); imp[name] = { used: false, tok: im.tok, path: im.path }; });
    const top = new Set(); ast.decls.forEach((d) => { if (d.k === "FuncDecl" && !d.recv) top.add(d.name); else if (d.k === "DeclStmt") d.specs.forEach((s) => { if (s.k === "TypeSpec") top.add(s.name); else s.names.forEach((n) => top.add(n.v)); }); });
    const universe = new Set(["true", "false", "nil", "iota", "_"].concat(BUILTIN_TYPES, BUILTIN_FUNCS));
    let scopes = [];
    const push = () => scopes.push(new Map()), pop = () => { const sc = scopes.pop(); sc.forEach((v, k) => { if (!v.used && v.kind === "var" && k !== "_") report("declared and not used: " + k, v.tok); }); };
    const declare = (name, tk, kind) => { if (name === "_") return; const sc = scopes[scopes.length - 1]; sc.set(name, { used: false, tok: tk, kind: kind || "var" }); };
    const lookup = (name) => { for (let i = scopes.length - 1; i >= 0; i--) if (scopes[i].has(name)) return scopes[i].get(name); return null; };
    function useName(id) { const v = lookup(id.name); if (v) { v.used = true; return; } if (top.has(id.name) || universe.has(id.name)) return; if (imp[id.name]) { imp[id.name].used = true; return; } report("undefined: " + id.name, id); }
    function type(t) { if (!t) return; switch (t.k) { case "TName": if (t.pkg) { if (imp[t.pkg]) imp[t.pkg].used = true; else report("undefined: " + t.pkg, t); } else if (!lookup(t.name) && !top.has(t.name) && !universe.has(t.name)) report("undefined: " + t.name, t); else { const v = lookup(t.name); if (v) v.used = true; } break; case "TPtr": case "TSlice": type(t.elem); break; case "TArray": if (t.len) expr(t.len); type(t.elem); break; case "TMap": type(t.key); type(t.val); break; case "TFunc": t.params.forEach((q) => type(q.type)); t.results.forEach((q) => type(q.type)); break; case "TStruct": t.fields.forEach((f) => type(f.type)); break; case "TIface": t.methods.forEach((m) => { m.sig.params.forEach((q) => type(q.type)); m.sig.results.forEach((q) => type(q.type)); }); break; } }
    function expr(e) {
      if (!e) return;
      switch (e.k) {
        case "Ident": useName(e); break;
        case "Lit": break;
        case "Binary": expr(e.l); expr(e.r); break;
        case "Unary": case "Deref": expr(e.x); break;
        case "Paren": expr(e.x); break;
        case "Call": expr(e.fn); e.args.forEach(expr); break;
        case "Index": expr(e.x); expr(e.i); break;
        case "SliceExpr": expr(e.x); expr(e.lo); expr(e.hi); expr(e.max); break;
        case "Selector": if (e.x.k === "Ident" && !lookup(e.x.name) && imp[e.x.name]) { imp[e.x.name].used = true; if (!/^[A-Z]/.test(e.name)) report("name " + e.name + " not exported by package " + e.x.name, e); } else expr(e.x); break;
        case "TypeAssert": expr(e.x); type(e.t); break;
        case "TypeX": type(e.t); break;
        case "Composite": type(e.type); e.elems.forEach((el) => { if (el.key && !(el.key.k === "Ident" && (!e.type || fieldKey(e)))) expr(el.key); expr(el.val); }); break;
        case "FuncLit": func(e.sig, e.body, null); break;
      }
    }
    const structTypes = {}; ast.decls.forEach((d) => { if (d.k === "DeclStmt" && d.isType) d.specs.forEach((s) => { if (s.type.k === "TStruct") structTypes[s.name] = s.type; }); });
    function fieldKey(e) { const t = e.type; if (!t) return true; if (t.k === "TName" && structTypes[t.name]) return true; if (t.k === "TStruct") return true; return false; }
    function terminates(stmts) {
      if (!stmts.length) return false; const s = stmts[stmts.length - 1];
      switch (s.k) {
        case "Return": return true;
        case "ExprStmt": return s.x.k === "Call" && s.x.fn.k === "Ident" && s.x.fn.name === "panic" || (s.x.k === "Call" && s.x.fn.k === "Selector" && s.x.fn.x.k === "Ident" && s.x.fn.x.name === "os" && s.x.fn.name === "Exit");
        case "Block": return terminates(s.stmts);
        case "If": return !!s.els && terminates(s.then.stmts) && (s.els.k === "If" ? terminates([s.els]) : terminates(s.els.stmts));
        case "For": return !s.cond && !hasBreak(s.body.stmts);
        case "Switch": case "TypeSwitch": return s.cases.some((c) => c.isDefault) && s.cases.every((c) => (terminates(c.body) || (c.body.length && c.body[c.body.length - 1].k === "Fallthrough")) && !hasBreak(c.body));
        case "Label": return terminates([s.body]);
      }
      return false;
    }
    function hasBreak(stmts) { return stmts.some((s) => s.k === "Branch" && s.kind === "break" || (s.k === "Block" && hasBreak(s.stmts)) || (s.k === "If" && (hasBreak(s.then.stmts) || (s.els && hasBreak(s.els.k === "If" ? [s.els] : s.els.stmts))))); }
    function func(sig, body, recv) {
      push(); if (recv && recv.name) { declare(recv.name, recv.nameTok || { line: 0, col: 0 }, "param"); type(recv.type); }
      sig.params.forEach((q) => { type(q.type); if (q.name) declare(q.name, q.nameTok, "param"); }); sig.results.forEach((q) => { type(q.type); if (q.name) declare(q.name, q.nameTok, "param"); });
      if (body) { block(body.stmts, true); if (sig.results.length && !terminates(body.stmts)) report("missing return", body.end); }
      pop();
    }
    function block(stmts, noScope) { if (!noScope) push(); stmts.forEach(stmt); if (!noScope) pop(); }
    function lhsExpr(e) { if (e.k === "Ident") { if (!lookup(e.name) && !top.has(e.name) && e.name !== "_") report("undefined: " + e.name, e); return; } expr(e); }
    function stmt(s) {
      switch (s.k) {
        case "Empty": break;
        case "ExprStmt": expr(s.x); break;
        case "Define": { s.rhs.forEach(expr); let fresh = false, named = false; s.lhs.forEach((l) => { if (l.k !== "Ident") { report("non-name on left side of :=", l); return; } if (l.name === "_") return; named = true; if (!scopes[scopes.length - 1].has(l.name)) { declare(l.name, l); fresh = true; } }); if (named && !fresh) report("no new variables on left side of :=", s); break; }
        case "Assign": s.rhs.forEach(expr); s.lhs.forEach(lhsExpr); break;
        case "OpAssign": expr(s.rhs); expr(s.lhs); break;
        case "IncDec": expr(s.x); break;
        case "DeclStmt": s.specs.forEach((sp) => { if (sp.k === "TypeSpec") { declare(sp.name, sp, "type"); type(sp.type); } else { type(sp.type); sp.vals.forEach(expr); sp.names.forEach((n) => declare(n.v, n, sp.kind === "var" ? "var" : "const")); } }); break;
        case "Return": s.vals.forEach(expr); break;
        case "Branch": case "Fallthrough": break;
        case "Defer": expr(s.call); break;
        case "Block": block(s.stmts); break;
        case "Label": stmt(s.body); break;
        case "If": push(); if (s.init) stmt(s.init); expr(s.cond); block(s.then.stmts); if (s.els) { if (s.els.k === "If") stmt(s.els); else block(s.els.stmts); } pop(); break;
        case "For": push(); if (s.init) stmt(s.init); expr(s.cond); if (s.post) stmt(s.post); block(s.body.stmts); pop(); break;
        case "ForRange": push(); expr(s.x); if (s.def) { [s.key, s.val].forEach((l) => { if (l && l.k === "Ident") declare(l.name, l); }); } else { [s.key, s.val].forEach((l) => l && lhsExpr(l)); } block(s.body.stmts); pop(); break;
        case "Switch": push(); if (s.init) stmt(s.init); expr(s.tag); s.cases.forEach((c) => { (c.exprs || []).forEach(expr); push(); c.body.forEach(stmt); pop(); }); pop(); break;
        case "TypeSwitch": { push(); if (s.init) stmt(s.init); expr(s.ts.x); let used = false; s.cases.forEach((c) => { c.types.forEach && (c.types || []).forEach(type); push(); if (s.ts.bind) { declare(s.ts.bind, s, "var"); } c.body.forEach(stmt); if (s.ts.bind) { const v = scopes[scopes.length - 1].get(s.ts.bind); if (v && v.used) used = true; scopes[scopes.length - 1].delete(s.ts.bind); } pop(); }); if (s.ts.bind && !used) report("declared and not used: " + s.ts.bind, s); pop(); break; }
      }
    }
    push();
    ast.decls.forEach((d) => {
      if (d.k === "FuncDecl") func(d.sig, d.body, d.recv);
      else d.specs.forEach((sp) => { if (sp.k === "TypeSpec") type(sp.type); else { type(sp.type); sp.vals.forEach(expr); } });
    });
    scopes.pop();
    for (const name in imp) if (!imp[name].used) report(JSON.stringify(imp[name].path) + " imported and not used", imp[name].tok);
    errs.sort((a, b) => a.line - b.line || a.col - b.col);
    return errs;
  }

  /* ================================================================ runtime values */
  class Float { constructor(v, f32) { this.v = v; if (f32) this.f = true; } }
  class NV { constructor(t, v) { this.t = t; this.v = v; } }            // value of a named non-struct type
  class Slice { constructor(a, off, len, cap, et, isNil) { this.a = a; this.off = off; this.len = len; this.cap = cap; this.et = et; this.isNil = !!isNil; } }
  class Arr { constructor(a, et) { this.a = a; this.et = et; } }
  class GoMap { constructor(kt, vt, isNil) { this.m = new Map(); this.kt = kt; this.vt = vt; this.isNil = !!isNil; } }
  class Struct { constructor(t, f) { this.t = t; this.f = f; } }
  class Ptr { constructor(get, set, target, t) { this.get = get; this.set = set; this.target = target; this.t = t; } }  // target = Struct for struct pointers
  class ErrVal { constructor(msg, wrapped) { this.msg = msg; this.wrapped = wrapped || null; } }
  class Fn { constructor(name, call, sig) { this.name = name; this.call = call; this.sig = sig; } }
  class Panic extends Error { constructor(v, rt) { super("panic"); this.v = v; this.rt = !!rt; } }
  class Exit extends Error { constructor(code) { super("exit"); this.code = code; } }
  class TypeVal { constructor(t) { this.t = t; } }

  const T = {};
  ["int", "int8", "int16", "int32", "int64", "uint", "uint8", "uint16", "uint32", "uint64", "uintptr", "float32", "float64", "string", "bool"].forEach((n) => { T[n] = { kind: n, basic: true, name: n }; });
  T.byte = T.uint8; T.rune = T.int32; T.any = { kind: "iface", name: "any", methods: [] }; T.error = { kind: "iface", name: "error", methods: ["Error"] };
  const isFloatT = (t) => t && (t.kind === "float64" || t.kind === "float32");
  const BITS = { int8: [8, true], int16: [16, true], int32: [32, true], uint8: [8, false], uint16: [16, false], uint32: [32, false], int: [64, true], int64: [64, true], uint: [64, false], uint64: [64, false] };
  const under = (t) => (t && t.kind === "named" ? under(t.under) : t);
  function wrapInt(v, k) { const b = BITS[k]; if (!b || b[0] === 64) return v; const m = Math.pow(2, b[0]); v = ((v % m) + m) % m; if (b[1] && v >= m / 2) v -= m; return v; }
  const num = (v) => (v instanceof Float ? v.v : v instanceof NV ? num(v.v) : v);
  const unwrapNV = (v) => (v instanceof NV ? unwrapNV(v.v) : v);
  function zero(t) {
    t = t || T.any; if (t.kind === "named") { const u = under(t); if (u.kind === "struct") { const s = zero(u); s.t = t; return s; } return new NV(t, zero(t.under)); }
    switch (t.kind) {
      case "float64": return new Float(0); case "float32": return new Float(0, true);
      case "string": return ""; case "bool": return false;
      case "slice": return new Slice([], 0, 0, 0, t.elem, true);
      case "array": { const a = []; for (let i = 0; i < t.len; i++) a.push(zero(t.elem)); return new Arr(a, t.elem); }
      case "map": return new GoMap(t.key, t.val, true);
      case "struct": { const f = {}; t.fields.forEach((fl) => { f[fl.name] = zero(fl.type); }); return new Struct(t, f); }
      case "ptr": case "iface": case "func": return null;
      case "builder": return { builder: true, s: "" };
      default: return t.basic ? 0 : null;
    }
  }
  function coerce(v, t) {
    if (!t || v === undefined) return v;
    if (t.kind === "named") { const u = under(t); if (u.kind === "struct" || u.kind === "iface") return v; if (v instanceof NV) return v; return new NV(t, coerce(v, t.under)); }
    if (t.kind === "float64" || t.kind === "float32") { const f32 = t.kind === "float32"; if (typeof v === "number") return new Float(f32 ? Math.fround(v) : v, f32); if (v instanceof Float) return f32 && !v.f ? new Float(Math.fround(v.v), true) : (!f32 && v.f ? new Float(v.v) : v); if (v instanceof NV) return new Float(num(v.v), f32); return v; }
    if (t.basic && BITS[t.kind]) { if (v instanceof Float) return wrapInt(Math.trunc(v.v), t.kind); if (typeof v === "number") return wrapInt(v, t.kind); return v; }
    if (t.kind === "array" && v instanceof Arr) return v;
    return v;
  }
  function copyVal(v) {
    if (v instanceof Struct) { const f = {}; for (const k in v.f) f[k] = copyVal(v.f[k]); return new Struct(v.t, f); }
    if (v instanceof Arr) return new Arr(v.a.map(copyVal), v.et);
    if (v instanceof NV && (v.v instanceof Struct || v.v instanceof Arr)) return new NV(v.t, copyVal(v.v));
    return v;
  }
  function typeName(t) {
    if (!t) return "<nil>"; if (t.name && (t.basic || t.kind === "named" || t.kind === "iface")) return (t.kind === "named" && t.pkgName ? t.pkgName + "." : t.kind === "named" ? "main." : "") + t.name;
    switch (t.kind) { case "slice": return "[]" + typeName(t.elem); case "array": return "[" + t.len + "]" + typeName(t.elem); case "map": return "map[" + typeName(t.key) + "]" + typeName(t.val); case "ptr": return "*" + typeName(t.elem); case "func": return "func()"; case "struct": return "struct {...}"; case "iface": return "interface {}"; case "builder": return "strings.Builder"; default: return t.kind; }
  }
  function typeOf(v) {
    if (v === null || v === undefined) return null; if (typeof v === "number") return T.int; if (typeof v === "string") return T.string; if (typeof v === "boolean") return T.bool;
    if (v instanceof Float) return T.float64; if (v instanceof NV) return v.t; if (v instanceof Struct) return v.t;
    if (v instanceof Slice) return { kind: "slice", elem: v.et || T.any }; if (v instanceof Arr) return { kind: "array", elem: v.et || T.any, len: v.a.length }; if (v instanceof GoMap) return { kind: "map", key: v.kt || T.any, val: v.vt || T.any };
    if (v instanceof Ptr) return { kind: "ptr", elem: v.target ? v.target.t : v.t || T.any }; if (v instanceof ErrVal) return { kind: "named", name: v.wrapped ? "wrapError" : "errorString", pkgName: v.wrapped ? "fmt" : "errors", under: T.string, methods: {} }; if (v instanceof Fn) return { kind: "func" }; if (v && v.builder) return { kind: "builder" };
    return T.any;
  }
  function typesEqual(a, b) {
    if (a === b) return true; if (!a || !b) return false; if (a.kind !== b.kind) return false;
    switch (a.kind) { case "named": return a === b; case "slice": return typesEqual(a.elem, b.elem); case "array": return a.len === b.len && typesEqual(a.elem, b.elem); case "map": return typesEqual(a.key, b.key) && typesEqual(a.val, b.val); case "ptr": return typesEqual(a.elem, b.elem); default: return a.basic ? a.kind === b.kind : false; }
  }

  /* ================================================================ formatting */
  function fmtG(x, prec) {   // %v for float64 (shortest)
    if (Number.isNaN(x)) return "NaN"; if (x === Infinity) return "+Inf"; if (x === -Infinity) return "-Inf"; if (x === 0) return Object.is(x, -0) ? "-0" : "0";
    const e = x.toExponential(); const m = /^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(e); const digs = m[2] + (m[3] || ""), exp = parseInt(m[4], 10), sign = m[1];
    const eprec = prec == null ? 6 : Math.max(prec, 1);
    if (exp < -4 || exp >= eprec) {
      return sign + digs[0] + (digs.length > 1 ? "." + digs.slice(1) : "") + "e" + (exp < 0 ? "-" : "+") + String(Math.abs(exp)).padStart(2, "0");
    }
    if (exp >= 0) { if (digs.length <= exp + 1) return sign + digs + "0".repeat(exp + 1 - digs.length); return sign + digs.slice(0, exp + 1) + "." + digs.slice(exp + 1); }
    return sign + "0." + "0".repeat(-exp - 1) + digs;
  }
  function fmtG32(x) { if (!isFinite(x) || x === 0) return fmtG(x); for (let p = 1; p <= 9; p++) { const y = Number(x.toPrecision(p)); if (Math.fround(y) === x) return fmtG(y); } return fmtG(x); }
  function fmtFloatVerb(x, verb, prec) {
    if (Number.isNaN(x)) return "NaN"; if (!isFinite(x)) return x > 0 ? "+Inf" : "-Inf";
    if (verb === "f" || verb === "F") return x.toFixed(prec == null ? 6 : prec);
    if (verb === "e" || verb === "E") { let s = x.toExponential(prec == null ? 6 : prec).replace(/e([+-])(\d)$/, "e$10$2"); return verb === "E" ? s.toUpperCase() : s; }
    if (verb === "g" || verb === "G") { if (prec == null) return fmtG(x, null).replace(/^(-?\d)e/, "$1e"); const s = Number(x.toPrecision(prec)); return fmtG(s, null); }
    return fmtG(x);
  }
  const utf8len = (s) => { let n = 0; for (const ch of s) { const c = ch.codePointAt(0); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; } return n; };
  const toBytes = (s) => Array.from(new TextEncoder().encode(s));
  const fromBytes = (b) => new TextDecoder("utf-8").decode(Uint8Array.from(b));
  const isAscii = (s) => /^[\x00-\x7f]*$/.test(s);
  function quote(s) { let o = '"'; for (const ch of s) { const c = ch.codePointAt(0); if (ch === '"') o += '\\"'; else if (ch === "\\") o += "\\\\"; else if (ch === "\n") o += "\\n"; else if (ch === "\t") o += "\\t"; else if (ch === "\r") o += "\\r"; else if (c < 32 || c === 127) o += "\\x" + c.toString(16).padStart(2, "0"); else o += ch; } return o + '"'; }

  function makeRt(ast, opts) {
    opts = opts || {}; const out = []; let outLen = 0, steps = 0; const MAXSTEPS = opts.maxSteps || 8e6, MAXOUT = 400000;
    const stdinLines = (opts.stdin || []).slice(); let stdinPos = 0, stdinBuf = (opts.stdin || []).join("\n") + ((opts.stdin || []).length ? "\n" : "");
    const emit = (s) => { outLen += s.length; if (outLen > MAXOUT) throw new Panic("output limit exceeded", true); out.push(s); };
    const tick = () => { if (++steps > MAXSTEPS) throw new Panic("program ran too long (infinite loop?)", true); };
    const rtPanic = (msg) => new Panic("runtime error: " + msg, true);
    const globalEnv = Object.create(null), types = Object.create(null);
    Object.keys(T).forEach((k) => { types[k] = T[k]; });
    const cell = (v, t) => ({ v: v, t: t || null });

    /* ---- type resolution */
    function resolveType(t, env) {
      switch (t.k) {
        case "TName": {
          if (t.pkg) { if (t.pkg === "strings" && t.name === "Builder") return { kind: "builder", name: "strings.Builder" }; if (t.pkg === "sync" || t.pkg === "time") throw new Panic(t.pkg + "." + t.name + " is not supported in the in-browser Go runner yet", true); return T.any; }
          const loc = env && env["type:" + t.name]; if (loc) return loc;
          if (types[t.name]) return types[t.name]; throw new Panic("undefined type " + t.name, true);
        }
        case "TPtr": return { kind: "ptr", elem: resolveType(t.elem, env) };
        case "TSlice": return { kind: "slice", elem: resolveType(t.elem, env) };
        case "TArray": return { kind: "array", len: t.len ? num(evalExpr(t.len, env)) : -1, elem: resolveType(t.elem, env) };
        case "TMap": return { kind: "map", key: resolveType(t.key, env), val: resolveType(t.val, env) };
        case "TFunc": return { kind: "func", sig: t };
        case "TStruct": { const fields = []; t.fields.forEach((f) => { const ft = resolveType(f.type, env); f.names.forEach((n) => fields.push({ name: n, type: ft, embedded: !!f.embedded })); }); return { kind: "struct", fields: fields }; }
        case "TIface": return { kind: "iface", methods: t.methods.map((m) => m.name) };
      }
      throw new Panic("bad type", true);
    }

    /* ---- method lookup */
    function methodsOf(t) { if (!t) return null; if (t.kind === "named") return t.methods; return null; }
    function findField(s, name) {
      if (!(s instanceof Struct)) return null; if (name in s.f) return { obj: s, name: name };
      const st = under(s.t); for (const fl of st.fields) if (fl.embedded) { const inner = s.f[fl.name]; const base = inner instanceof Ptr ? inner.target : inner; const r = findField(base, name); if (r) return r; }
      return null;
    }
    function findMethod(v, name) {
      let base = v; let isPtr = false; if (v instanceof Ptr) { base = v.target || (v.get ? v.get() : null); isPtr = true; }
      const t = base instanceof NV ? base.t : base instanceof Struct ? base.t : null;
      if (t && t.methods && t.methods[name]) return { m: t.methods[name], recv: v, base: base };
      if (base instanceof Struct) { const st = under(base.t); for (const fl of st.fields) if (fl.embedded) { const inner = base.f[fl.name]; const r = findMethod(inner, name); if (r) return r; } }
      return null;
    }
    function callMethod(v, name, args) {
      const f = findMethod(v, name); if (!f) throw new Panic("value has no method " + name, true);
      return invokeMethod(f, args);
    }
    function invokeMethod(f, args) {
      const m = f.m; let recv = f.recv;
      if (m.ptrRecv) { if (!(recv instanceof Ptr)) { const b = f.base; recv = b instanceof Struct ? new Ptr(null, null, b) : recv; } }
      else { if (recv instanceof Ptr) { if (recv.target === null && !recv.get) throw rtPanic("invalid memory address or nil pointer dereference"); recv = copyVal(recv.target || recv.get()); } else recv = copyVal(recv); }
      return m.call(recv, args);
    }
    const hasMethod = (v, name) => !!findMethod(v, name) || (name === "Error" && v instanceof ErrVal);

    /* ---- equality */
    function eq(a, b) {
      a = unwrapNV(a); b = unwrapNV(b);
      if (a === null || b === null || a === undefined || b === undefined) { if (a instanceof Slice) return a.isNil && b === null; if (b instanceof Slice) return b.isNil && a === null; if (a instanceof GoMap) return a.isNil && b === null; if (b instanceof GoMap) return b.isNil && a === null; return a === b; }
      if (a instanceof Float || b instanceof Float) return num(a) === num(b);
      if (a instanceof Struct && b instanceof Struct) { if (a.t !== b.t) return false; for (const k in a.f) if (!eq(a.f[k], b.f[k])) return false; return true; }
      if (a instanceof Arr && b instanceof Arr) return a.a.length === b.a.length && a.a.every((x, i) => eq(x, b.a[i]));
      if (a instanceof Ptr && b instanceof Ptr) return a === b || (a.target && a.target === b.target);
      if (a instanceof Slice || b instanceof Slice) throw rtPanic("comparing uncomparable type slice");
      if (a instanceof GoMap || b instanceof GoMap) throw rtPanic("comparing uncomparable type map");
      return a === b;
    }
    const mapKey = (k) => { k = unwrapNV(k); if (k instanceof Float) return "f" + k.v; if (k instanceof Struct) return "s" + JSON.stringify(Object.keys(k.f).map((x) => mapKey(k.f[x]))); if (k instanceof Arr) return "a" + k.a.map(mapKey).join(","); if (typeof k === "number") return "n" + k; if (typeof k === "string") return "t" + k; if (typeof k === "boolean") return "b" + k; return k; };

    /* ---- fmt */
    function fmtVal(v, verb, flags, top) {
      verb = verb || "v"; flags = flags || {};
      if (v === null || v === undefined) return verb === "v" || verb === "s" ? "<nil>" : "%!" + verb + "(<nil>)";
      if (verb !== "T" && verb !== "p" && (verb === "v" || verb === "s" || verb === "q") && !flags.sharp) {
        if (hasMethod(v, "Error")) { const r = v instanceof ErrVal ? v.msg : callMethod(v, "Error", []); return verb === "q" ? quote(r) : r; }
        if (hasMethod(v, "String")) { const r = callMethod(v, "String", []); return verb === "q" ? quote(r) : r; }
      }
      if (v instanceof NV) { if (verb === "v" || verb === "s" || verb === "d" || verb === "q" || verb === "f" || verb === "x" || verb === "c" || verb === "t" || verb === "g" || verb === "e") return fmtVal(v.v, verb, flags, top); }
      if (verb === "T") return typeName(typeOf(v));
      if (typeof v === "boolean") return verb === "t" || verb === "v" ? String(v) : "%!" + verb + "(bool=" + v + ")";
      if (typeof v === "number") {
        switch (verb) { case "v": case "d": return String(v); case "c": return String.fromCodePoint(v); case "q": return "'" + String.fromCodePoint(v) + "'"; case "x": return (v < 0 ? "-" : "") + Math.abs(v).toString(16); case "X": return (v < 0 ? "-" : "") + Math.abs(v).toString(16).toUpperCase(); case "o": return Math.abs(v).toString(8); case "b": return (v < 0 ? "-" : "") + Math.abs(v).toString(2); case "U": return "U+" + v.toString(16).toUpperCase().padStart(4, "0"); case "f": case "F": case "e": case "g": return "%!" + verb + "(int=" + v + ")"; case "s": return "%!s(int=" + v + ")"; default: return "%!" + verb + "(int=" + v + ")"; }
      }
      if (v instanceof Float) { switch (verb) { case "v": return v.f ? fmtG32(v.v) : fmtG(v.v); case "f": case "F": case "e": case "E": case "g": case "G": return fmtFloatVerb(v.v, verb, flags.prec); case "d": return "%!d(float64=" + fmtG(v.v) + ")"; case "s": return "%!s(float64=" + fmtG(v.v) + ")"; default: return "%!" + verb + "(float64=" + fmtG(v.v) + ")"; } }
      if (typeof v === "string") {
        switch (verb) { case "v": case "s": return flags.sharp && verb === "v" ? quote(v) : v; case "q": return quote(v); case "x": return toBytes(v).map((b) => b.toString(16).padStart(2, "0")).join(""); case "d": return "%!d(string=" + v + ")"; default: return "%!" + verb + "(string=" + v + ")"; }
      }
      if (v instanceof Slice) {
        const els = sliceToArray(v);
        if (verb === "s" && v.et === T.uint8) return fromBytes(els);
        if (verb === "x" && v.et === T.uint8) return els.map((b) => b.toString(16).padStart(2, "0")).join("");
        if (flags.sharp) return typeName(typeOf(v)) + "{" + els.map((x) => fmtVal(x, "v", flags)).join(", ") + "}";
        return "[" + els.map((x) => fmtVal(x, verb, flags)).join(" ") + "]";
      }
      if (v instanceof Arr) return "[" + v.a.map((x) => fmtVal(x, verb, flags)).join(" ") + "]";
      if (v instanceof GoMap) { const keys = Array.from(v.m.values()).map((e) => e[0]); keys.sort(cmpKeys); return "map[" + keys.map((k) => fmtVal(k, verb, flags) + ":" + fmtVal(v.m.get(mapKey(k))[1], verb, flags)).join(" ") + "]"; }
      if (v instanceof Struct) {
        const st = under(v.t);
        if (flags.sharp) return typeName(v.t) + "{" + st.fields.map((fl) => fl.name + ":" + fmtVal(v.f[fl.name], "v", flags)).join(", ") + "}";
        return "{" + st.fields.map((fl) => (flags.plus ? fl.name + ":" : "") + fmtVal(v.f[fl.name], verb, flags)).join(" ") + "}";
      }
      if (v instanceof Ptr) { if (v.target && top) return "&" + fmtVal(v.target, verb, flags); return v.target ? "0xc000012345" : "0xc000012340"; }
      if (v instanceof Fn) return "0x47b3a0";
      if (v && v.builder) return v.s;
      return String(v);
    }
    function cmpKeys(a, b) { a = unwrapNV(a); b = unwrapNV(b); if (typeof a === "string") return a < b ? -1 : a > b ? 1 : 0; return num(a) - num(b); }
    function sliceToArray(s) { return s.a.slice(s.off, s.off + s.len); }
    function sprintf(format, args) {
      let o = "", ai = 0; const re = /%([-+# 0]*)(\*|\d+)?(?:\.(\*|\d+))?([a-zA-Z%])/g; let last = 0, m;
      while ((m = re.exec(format))) {
        o += format.slice(last, m.index); last = re.lastIndex; const verb = m[4];
        if (verb === "%") { o += "%"; continue; }
        const fl = { minus: m[1].includes("-"), plus: m[1].includes("+"), sharp: m[1].includes("#"), zero: m[1].includes("0"), space: m[1].includes(" ") };
        let width = m[2] === "*" ? num(args[ai++]) : m[2] != null ? Number(m[2]) : null; if (width != null && width < 0) { fl.minus = true; width = -width; }
        fl.prec = m[3] === "*" ? num(args[ai++]) : m[3] != null ? Number(m[3]) : null;
        if (ai >= args.length) { o += "%!" + verb + "(MISSING)"; continue; }
        const arg = args[ai++]; let s = fmtVal(arg, verb, fl, true);
        if (fl.prec != null && (verb === "s" || verb === "v") && typeof unwrapNV(arg) === "string" && !hasMethod(arg, "String") && !hasMethod(arg, "Error")) s = Array.from(s).slice(0, fl.prec).join("");
        if (fl.plus && (typeof unwrapNV(arg) === "number" || unwrapNV(arg) instanceof Float) && /^[0-9]/.test(s) && "dfeEgGv".includes(verb)) s = "+" + s; else if (fl.space && /^[0-9]/.test(s) && "dfeEgGv".includes(verb) && (typeof unwrapNV(arg) === "number" || unwrapNV(arg) instanceof Float)) s = " " + s;
        if (width != null) { const len = Array.from(s).length; if (len < width) { const pad = width - len; if (fl.minus) s += " ".repeat(pad); else if (fl.zero && /[dfeEgGxXob]/.test(verb) && typeof unwrapNV(arg) !== "string") { const sign = /^[+-]/.test(s) ? s[0] : ""; s = sign + "0".repeat(pad) + s.slice(sign.length); } else s = " ".repeat(pad) + s; } }
        o += s;
      }
      o += format.slice(last);
      if (ai < args.length) o += "%!(EXTRA " + args.slice(ai).map((a) => typeName(typeOf(a)) + "=" + fmtVal(a, "v", {}, true)).join(", ") + ")";
      return o;
    }
    const sprint = (args) => { let o = ""; args.forEach((a, i) => { const isStr = typeof unwrapNV(a) === "string" && !(a instanceof NV && false); if (i > 0 && !(typeof unwrapNV(args[i - 1]) === "string") && !isStr) o += " "; o += fmtVal(a, "v", {}, true); }); return o; };
    const sprintln = (args) => args.map((a) => fmtVal(a, "v", {}, true)).join(" ") + "\n";

    /* ---- slices */
    function mkSlice(arr, et) { return new Slice(arr, 0, arr.length, arr.length, et); }
    function appendTo(s, vals, et) {
      et = (s && s.et) || et; if (!(s instanceof Slice)) s = new Slice([], 0, 0, 0, et, true);
      const need = s.len + vals.length; vals = vals.map((x) => coerce(copyVal(x), s.et));
      if (need <= s.cap) { for (let i = 0; i < vals.length; i++) s.a[s.off + s.len + i] = vals[i]; return new Slice(s.a, s.off, need, s.cap, s.et); }
      let nc = s.cap === 0 ? need : s.cap; if (need > nc * 2) nc = need; else { while (nc < need) nc = nc < 256 ? nc * 2 : nc + Math.floor((nc + 768) / 4); }
      const na = s.a.slice(s.off, s.off + s.len); for (let i = 0; i < vals.length; i++) na.push(vals[i]); return new Slice(na, 0, need, nc, s.et);
    }
    const idxCheck = (i, len) => { if (!(typeof i === "number") || i < 0 || i >= len) throw rtPanic("index out of range [" + num(i) + "] with length " + len); };

    /* ---- strings (Go strings are bytes) */
    const strLen = (s) => (isAscii(s) ? s.length : utf8len(s));
    function strIndex(s, i) { if (isAscii(s)) { idxCheck(i, s.length); return s.charCodeAt(i); } const b = toBytes(s); idxCheck(i, b.length); return b[i]; }
    function strSlice(s, lo, hi) { if (isAscii(s)) { lo = lo == null ? 0 : lo; hi = hi == null ? s.length : hi; if (lo < 0 || hi > s.length || lo > hi) throw rtPanic("slice bounds out of range [" + (hi > s.length ? ":" + hi + "] with length " + s.length : lo + ":" + hi + "]")); return s.slice(lo, hi); } const b = toBytes(s); lo = lo == null ? 0 : lo; hi = hi == null ? b.length : hi; if (lo < 0 || hi > b.length || lo > hi) throw rtPanic("slice bounds out of range [" + lo + ":" + hi + "] with length " + b.length); return fromBytes(b.slice(lo, hi)); }

    /* ---- calling */
    function bindParams(sig, env, args, ctxEnv) {
      const ps = sig.params; let k = 0;
      for (let i = 0; i < ps.length; i++) {
        const q = ps[i]; const t = resolveType(q.type, ctxEnv);
        if (q.variadic) { const rest = args.slice(i).map((x) => coerce(copyVal(x), t)); const sv = args.__spread ? args[i] : new Slice(rest, 0, rest.length, rest.length, t, rest.length === 0); if (q.name && q.name !== "_") env[q.name] = cell(sv, { kind: "slice", elem: t }); k = args.length; break; }
        if (i >= args.length) throw new Panic("not enough arguments in call (have " + args.length + ", want " + ps.length + ")", true);
        if (q.name && q.name !== "_") env[q.name] = cell(coerce(copyVal(args[i]), t), t); k = i + 1;
      }
      if (!ps.length || !ps[ps.length - 1].variadic) { if (args.length > ps.length) throw new Panic("too many arguments in call (have " + args.length + ", want " + ps.length + ")", true); }
    }
    function makeFunc(name, sig, body, closureEnv, recvInfo) {
      let depth = 0;
      const call = function (recv, args) {
        if (args === undefined) { args = recv; recv = null; }
        tick(); if (++depth > 6000) { depth = 0; throw new Panic("stack overflow", true); }
        const env = Object.create(closureEnv); const frame = { defers: [], panicking: null, recovered: false, results: [], resultNames: [], sig: sig };
        env.__frame = frame;
        if (recvInfo && recvInfo.name && recvInfo.name !== "_") env[recvInfo.name] = cell(recv, recvInfo.t);
        bindParams(sig, env, args, closureEnv);
        const rtypes = sig.results.map((q) => resolveType(q.type, closureEnv)); const named = sig.results.length && sig.results[0].name;
        if (named) sig.results.forEach((q, i) => { env[q.name] = cell(zero(rtypes[i]), rtypes[i]); frame.resultNames.push(q.name); });
        let ret;
        try {
          try { const sg = execBlock(body.stmts, env); if (sg && sg.t === "return") ret = sg.vals; }
          catch (e) { if (e instanceof Panic) { frame.panicking = e; } else throw e; }
          // run defers
          while (frame.defers.length) { const d = frame.defers.pop(); try { d(); } catch (e2) { if (e2 instanceof Panic) { frame.panicking = e2; frame.recovered = false; } else throw e2; } }
          if (frame.panicking && !frame.recovered) throw frame.panicking;
        } finally { depth--; }
        if (named) { const r = sig.results.map((q) => env[q.name].v); return r.length === 1 ? r[0] : r; }
        if (frame.panicking && frame.recovered) { if (!sig.results.length) return undefined; const z = rtypes.map((t) => zero(t)); return z.length === 1 ? z[0] : z; }
        if (!sig.results.length) return undefined;
        if (!ret) ret = [];
        ret = ret.map((x, i) => coerce(x, rtypes[i])); return ret.length === 1 ? ret[0] : ret;
      };
      const fn = new Fn(name, (args) => call(null, args), sig); fn.callWith = call; return fn;
    }

    /* ---- environment helpers */
    function lookupCell(name, env) { const c = env[name]; return c; }
    function evalType(t, env) { return resolveType(t, env); }

    /* ---- expression evaluation */
    function evalMulti(e, env) { const v = evalExpr(e, env, true); return v; }
    function evalExpr(e, env, multi) {
      switch (e.k) {
        case "Lit": return e.kind === "float" ? new Float(e.v) : e.v;
        case "Ident": {
          const c = env[e.name]; if (c !== undefined) { if (c.fnDecl) return c.fnDecl; if (c.iotaConst) return c.get(); return c.v; }
          switch (e.name) { case "true": return true; case "false": return false; case "nil": return null; case "iota": return env.__iota || 0; }
          if (types[e.name] || env["type:" + e.name]) return new TypeVal(env["type:" + e.name] || types[e.name]);
          if (BUILTIN_FUNCS.indexOf(e.name) >= 0) return builtinFn(e.name);
          throw new Panic("undefined: " + e.name, true);
        }
        case "Paren": return evalExpr(e.x, env, multi);
        case "FuncLit": return makeFunc("func", e.sig, e.body, env, null);
        case "TypeX": return new TypeVal(evalType(e.t, env));
        case "Binary": return evalBinary(e, env);
        case "Unary": return evalUnary(e, env);
        case "Deref": { const p = evalExpr(e.x, env); if (p instanceof TypeVal) return new TypeVal({ kind: "ptr", elem: p.t }); if (p === null || p === undefined) throw rtPanic("invalid memory address or nil pointer dereference"); return p.target ? p.target : p.get(); }
        case "Selector": return evalSelector(e, env);
        case "Index": return evalIndex(e, env);
        case "SliceExpr": return evalSliceExpr(e, env);
        case "TypeAssert": { const v = evalExpr(e.x, env); const t = evalType(e.t, env); const ok = assertOk(v, t); if (multi) return [ok ? v : zero(t), ok]; if (!ok) throw new Panic("interface conversion: interface {} is " + (v === null ? "nil" : typeName(typeOf(v))) + ", not " + typeName(t), true); return v; }
        case "Composite": return evalComposite(e, env, null);
        case "Call": return evalCall(e, env, multi);
      }
      throw new Panic("cannot evaluate " + e.k, true);
    }
    function assertOk(v, t) {
      if (t.kind === "iface") { if (v === null) return false; return t.methods.every((m) => hasMethod(v, m)); }
      if (v === null || v === undefined) return false;
      if (t.kind === "ptr") return v instanceof Ptr && v.target && (v.target.t === t.elem || typesEqual(under(v.target.t), under(t.elem)) && v.target.t === t.elem);
      return typesEqual(typeOf(v), t) || (t.kind === "named" && ((v instanceof Struct && v.t === t) || (v instanceof NV && v.t === t)));
    }
    function builtinFn(name) { return new Fn(name, (args) => callBuiltin(name, args, null), null); }
    function evalSelector(e, env) {
      if (e.x.k === "Ident" && env[e.x.name] === undefined && PKG_NAMES[e.x.name]) { const p = pkgMember(e.x.name, e.name); if (p === undefined) throw new Panic("undefined: " + e.x.name + "." + e.name, true); return p; }
      let x = evalExpr(e.x, env);
      if (x instanceof TypeVal) { const m = x.t.methods && x.t.methods[e.name]; if (m) return new Fn(e.name, (args) => m.call(args[0], args.slice(1))); throw new Panic("no method " + e.name, true); }
      if (x === null || x === undefined) throw rtPanic("invalid memory address or nil pointer dereference");
      let base = x instanceof Ptr ? (x.target || x.get()) : x; if (base === null || base === undefined) throw rtPanic("invalid memory address or nil pointer dereference");
      if (base instanceof NV && base.v instanceof Struct && false) base = base.v;
      const f = findField(base, e.name); if (f) return f.obj.f[e.name];
      const m = findMethod(x, e.name); if (m) return new Fn(e.name, (args) => invokeMethod(m, args));
      if (base && base.builder) return builderMethod(base, e.name);
      if (base instanceof ErrVal && e.name === "Error") return new Fn("Error", () => base.msg);
      if (base && base.bufio) return bufioMethod(base, e.name);
      throw new Panic("x." + e.name + " undefined (type " + typeName(typeOf(x)) + " has no field or method " + e.name + ")", true);
    }
    function builderMethod(b, name) {
      switch (name) { case "WriteString": return new Fn(name, (a) => { b.s += a[0]; return [a[0].length, null]; }); case "WriteByte": return new Fn(name, (a) => { b.s += String.fromCharCode(a[0]); return null; }); case "WriteRune": return new Fn(name, (a) => { b.s += String.fromCodePoint(a[0]); return [1, null]; }); case "String": return new Fn(name, () => b.s); case "Len": return new Fn(name, () => strLen(b.s)); case "Reset": return new Fn(name, () => { b.s = ""; }); case "Grow": return new Fn(name, () => {}); }
      throw new Panic("strings.Builder has no method " + name, true);
    }
    function readLine() { if (stdinPos >= stdinBuf.length) return null; let nl = stdinBuf.indexOf("\n", stdinPos); let line; if (nl < 0) { line = stdinBuf.slice(stdinPos); stdinPos = stdinBuf.length; } else { line = stdinBuf.slice(stdinPos, nl); stdinPos = nl + 1; } return line.replace(/\r$/, ""); }
    function bufioMethod(b, name) {
      switch (name) {
        case "Scan": return new Fn(name, () => { const l = readLine(); if (l === null) { b.cur = ""; return false; } b.cur = l; return true; });
        case "Text": return new Fn(name, () => b.cur || ""); case "Err": return new Fn(name, () => null); case "Buffer": return new Fn(name, () => undefined); case "Split": return new Fn(name, () => undefined);
        case "ReadString": return new Fn(name, () => { const l = readLine(); if (l === null) return ["", new ErrVal("EOF")]; return [l + "\n", null]; });
      }
      throw new Panic("bufio has no method " + name, true);
    }
    function evalIndex(e, env) {
      const x = evalExpr(e.x, env); if (x instanceof Fn || x instanceof TypeVal) return x;
      const i = evalExpr(e.i, env);
      if (x instanceof Slice) { const k = num(i); idxCheck(k, x.len); return x.a[x.off + k]; }
      if (x instanceof Arr) { const k = num(i); idxCheck(k, x.a.length); return x.a[k]; }
      if (typeof x === "string") return strIndex(x, num(i));
      if (x instanceof GoMap) { const en = x.m.get(mapKey(i)); return en ? en[1] : zero(x.vt); }
      if (x === null) throw rtPanic("invalid memory address or nil pointer dereference");
      if (x instanceof Ptr && x.target === null) { const a = x.get(); if (a instanceof Arr) return a.a[num(i)]; }
      throw new Panic("cannot index " + typeName(typeOf(x)), true);
    }
    function evalSliceExpr(e, env) {
      const x = evalExpr(e.x, env); const lo = e.lo ? num(evalExpr(e.lo, env)) : null, hi = e.hi ? num(evalExpr(e.hi, env)) : null, mx = e.max ? num(evalExpr(e.max, env)) : null;
      if (typeof x === "string") return strSlice(x, lo, hi);
      let a, off, len, cap, et; if (x instanceof Slice) { a = x.a; off = x.off; len = x.len; cap = x.cap; et = x.et; } else if (x instanceof Arr) { a = x.a; off = 0; len = x.a.length; cap = len; et = x.et; } else if (x instanceof Ptr && x.get() instanceof Arr) { const ar = x.get(); a = ar.a; off = 0; len = a.length; cap = len; et = ar.et; } else throw new Panic("cannot slice " + typeName(typeOf(x)), true);
      const l = lo == null ? 0 : lo, h = hi == null ? len : hi;
      if (h < 0 || h > cap) throw rtPanic("slice bounds out of range [:" + h + "] with capacity " + cap);
      if (l < 0 || l > h) throw rtPanic("slice bounds out of range [" + l + ":" + h + "]");
      return new Slice(a, off + l, h - l, (mx == null ? cap : mx) - l, et);
    }
    function evalUnary(e, env) {
      if (e.op === "&") {
        const x = e.x; if (x.k === "Composite") { const v = evalComposite(x, env, null); return new Ptr(null, null, v instanceof Struct ? v : null, null).__wrap(v); }
        if (x.k === "Paren") return evalUnary({ k: "Unary", op: "&", x: x.x }, env);
        if (x.k === "Ident") { const c = env[x.name]; if (!c) throw new Panic("undefined: " + x.name, true); if (c.v instanceof Struct) return new Ptr(null, null, c.v); return new Ptr(() => c.v, (v) => { c.v = v; }, null, c.t); }
        if (x.k === "Selector") { const base = evalExpr(x.x, env); const b = base instanceof Ptr ? (base.target || base.get()) : base; const f = findField(b, x.name); if (!f) throw new Panic("cannot take address", true); const cur = f.obj.f[f.name]; if (cur instanceof Struct) return new Ptr(null, null, cur); return new Ptr(() => f.obj.f[f.name], (v) => { f.obj.f[f.name] = v; }); }
        if (x.k === "Index") { const s = evalExpr(x.x, env), i = num(evalExpr(x.i, env)); if (s instanceof Slice) { idxCheck(i, s.len); const cur = s.a[s.off + i]; if (cur instanceof Struct) return new Ptr(null, null, cur); return new Ptr(() => s.a[s.off + i], (v) => { s.a[s.off + i] = v; }); } if (s instanceof Arr) { const cur = s.a[i]; if (cur instanceof Struct) return new Ptr(null, null, cur); return new Ptr(() => s.a[i], (v) => { s.a[i] = v; }); } }
        throw new Panic("cannot take the address of this expression", true);
      }
      const v = evalExpr(e.x, env); const raw = unwrapNV(v), wrap = (r) => (v instanceof NV ? new NV(v.t, r) : r);
      switch (e.op) { case "-": return wrap(raw instanceof Float ? new Float(-raw.v) : -raw); case "+": return v; case "!": return !raw; case "^": return wrap(~raw); }
      throw new Panic("bad unary " + e.op, true);
    }
    /* exact constant folding for literal-only expressions: 0.1 + 0.2 is exactly 0.3 in Go */
    function ratOfLit(e) {
      if (e.k === "Lit" && e.kind === "float") { const m = /^(\d*)\.?(\d*)(?:[eE]([+-]?\d+))?$/.exec(e.raw || String(e.v)); if (!m) return null; const frac = m[2] || ""; let n = BigInt((m[1] || "0") + frac), d = 10n ** BigInt(frac.length); const ex = m[3] ? parseInt(m[3], 10) : 0; if (ex >= 0) n *= 10n ** BigInt(ex); else d *= 10n ** BigInt(-ex); return { n: n, d: d, f: true }; }
      if (e.k === "Lit" && (e.kind === "int" || e.kind === "rune")) return Number.isSafeInteger(e.v) ? { n: BigInt(e.v), d: 1n, f: false } : null;
      if (e.k === "Paren") return ratOfLit(e.x);
      if (e.k === "Unary" && e.op === "-") { const r = ratOfLit(e.x); return r && { n: -r.n, d: r.d, f: r.f }; }
      if (e.k === "Binary" && /^[-+*/]$/.test(e.op)) {
        const a = ratOfLit(e.l), b = ratOfLit(e.r); if (!a || !b) return null; const f = a.f || b.f;
        switch (e.op) { case "+": return { n: a.n * b.d + b.n * a.d, d: a.d * b.d, f: f }; case "-": return { n: a.n * b.d - b.n * a.d, d: a.d * b.d, f: f }; case "*": return { n: a.n * b.n, d: a.d * b.d, f: f };
          case "/": if (b.n === 0n) return null; if (!f) return { n: a.n / b.n, d: 1n, f: false }; return { n: a.n * b.d, d: a.d * b.n, f: true }; }
      }
      return null;
    }
    function ratToNum(r) { if (!r.f) return Number(r.n); let n = r.n, d = r.d; if (d < 0n) { n = -n; d = -d; } const neg = n < 0n; if (neg) n = -n; const sc = 10n ** 40n; const q = (n * sc) / d; const s = q.toString().padStart(41, "0"); const v = parseFloat(s.slice(0, -40) + "." + s.slice(-40)); return neg ? -v : v; }
    function evalBinary(e, env) {
      if (e.cf === undefined) { const r = /^[-+*/]$/.test(e.op) ? ratOfLit(e) : null; e.cf = r ? { v: ratToNum(r), f: r.f } : false; }
      if (e.cf && (e.l.k !== "Lit" || e.r.k !== "Lit" || e.cf.f)) return e.cf.f ? new Float(e.cf.v) : e.cf.v;
      if (e.op === "&&") { const l = unwrapNV(evalExpr(e.l, env)); return l ? unwrapNV(evalExpr(e.r, env)) : false; }
      if (e.op === "||") { const l = unwrapNV(evalExpr(e.l, env)); return l ? true : unwrapNV(evalExpr(e.r, env)); }
      return binop(e.op, evalExpr(e.l, env), evalExpr(e.r, env));
    }
    function binop(op, a, b) {
      let nt = null; if (a instanceof NV) nt = a.t; else if (b instanceof NV) nt = b.t;
      if (op === "==") return eq(a, b); if (op === "!=") return !eq(a, b);
      a = unwrapNV(a); b = unwrapNV(b);
      const wrap = (r) => (nt && (typeof r === "number" || r instanceof Float || typeof r === "string") ? coerce(r, nt.under ? nt.under : nt) && new NV(nt, r instanceof Float ? r : wrapNamedInt(r, nt)) : r);
      let r;
      if (typeof a === "string" && typeof b === "string") {
        switch (op) { case "+": return wrap(a + b); case "<": return a < b; case "<=": return a <= b; case ">": return a > b; case ">=": return a >= b; } throw new Panic("invalid operation: operator " + op + " not defined on string", true);
      }
      if (a instanceof Float || b instanceof Float) {
        const x = num(a), y = num(b);
        switch (op) { case "+": r = x + y; break; case "-": r = x - y; break; case "*": r = x * y; break; case "/": r = x / y; break; case "<": return x < y; case "<=": return x <= y; case ">": return x > y; case ">=": return x >= y; default: throw new Panic("invalid operation: operator " + op + " not defined on float64", true); }
        return wrap(a.f || b.f ? new Float(Math.fround(r), true) : new Float(r));
      }
      if (typeof a === "number" && typeof b === "number") {
        switch (op) {
          case "+": r = a + b; break; case "-": r = a - b; break; case "*": r = a * b; break;
          case "/": if (b === 0) throw rtPanic("integer divide by zero"); r = Math.trunc(a / b); break;
          case "%": if (b === 0) throw rtPanic("integer divide by zero"); r = a % b; if (Object.is(r, -0)) r = 0; break;
          case "&": r = Number(BigInt(a) & BigInt(b)); break; case "|": r = Number(BigInt(a) | BigInt(b)); break; case "^": r = Number(BigInt(a) ^ BigInt(b)); break; case "&^": r = Number(BigInt(a) & ~BigInt(b)); break;
          case "<<": r = Number(BigInt(a) << BigInt(b)); break; case ">>": r = Number(BigInt(a) >> BigInt(b)); break;
          case "<": return a < b; case "<=": return a <= b; case ">": return a > b; case ">=": return a >= b;
          default: throw new Panic("bad operator " + op, true);
        }
        return wrap(r);
      }
      throw new Panic("invalid operation: operator " + op + " not defined on " + typeName(typeOf(a)) + " and " + typeName(typeOf(b)), true);
    }
    const wrapNamedInt = (r, nt) => { const u = under(nt); return typeof r === "number" && u && BITS[u.kind] ? wrapInt(r, u.kind) : r; };

    function evalComposite(e, env, elided) {
      let t = e.type ? evalType(e.type, env) : elided; if (!t) throw new Panic("missing type in composite literal", true);
      const u = under(t);
      const val = (el, et) => (el.val.k === "Composite" && !el.val.type ? coerceElided(el.val, et, env) : coerce(copyVal(evalExpr(el.val, env)), et));
      if (u.kind === "struct") {
        const s = zero(t); if (!(s instanceof Struct)) return s;
        if (e.elems.length && e.elems[0].key) { e.elems.forEach((el) => { const name = el.key.name; const fl = u.fields.find((f) => f.name === name); if (!fl) throw new Panic("unknown field " + name + " in struct literal", true); s.f[name] = val(el, fl.type); }); }
        else e.elems.forEach((el, i) => { const fl = u.fields[i]; if (!fl) throw new Panic("too many values in struct literal", true); s.f[fl.name] = val(el, fl.type); });
        return s;
      }
      if (u.kind === "slice" || u.kind === "array") {
        const arr = []; let idx = 0; e.elems.forEach((el) => { if (el.key) idx = num(evalExpr(el.key, env)); while (arr.length < idx) arr.push(zero(u.elem)); arr[idx++] = val(el, u.elem); });
        if (u.kind === "array") { const n = u.len < 0 ? arr.length : u.len; while (arr.length < n) arr.push(zero(u.elem)); return new Arr(arr, u.elem); }
        const sl = new Slice(arr, 0, arr.length, arr.length, u.elem); return t.kind === "named" ? new NV(t, sl) : sl;
      }
      if (u.kind === "map") { const m = new GoMap(u.key, u.val); e.elems.forEach((el) => { const k = el.key.k === "Composite" && !el.key.type ? coerceElided(el.key, u.key, env) : coerce(evalExpr(el.key, env), u.key); m.m.set(mapKey(k), [k, val(el, u.val)]); }); return t.kind === "named" ? new NV(t, m) : m; }
      throw new Panic("invalid composite literal type " + typeName(t), true);
    }
    function coerceElided(c, t, env) { if (t.kind === "ptr") { const v = evalComposite(c, env, t.elem); return new Ptr(null, null, v); } return evalComposite(c, env, t); }
    Ptr.prototype.__wrap = function (v) { if (v instanceof Struct) { this.target = v; return this; } const cellv = { v: v }; this.get = () => cellv.v; this.set = (x) => { cellv.v = x; }; return this; };

    /* ---- calls */
    function evalArgs(args, env, spread) {
      const out = [];
      if (args.length === 1 && args[0].k === "Call") { const r = evalExpr(args[0], env, true); if (Array.isArray(r) && r.__multi) return r.slice(); out.push(r); return out; }
      args.forEach((a) => out.push(evalExpr(a, env)));
      if (spread) out.__spread = true; return out;
    }
    function evalCall(e, env, multi) {
      // conversions and builtins by name
      const fnE = e.fn.k === "Paren" ? e.fn.x : e.fn;
      if (fnE.k === "Ident" && env[fnE.name] === undefined) {
        const nm = fnE.name;
        if (BUILTIN_FUNCS.indexOf(nm) >= 0 && !types[nm]) return callBuiltin(nm, null, e, env, multi);
        if (types[nm] || env["type:" + nm]) return convert(env["type:" + nm] || types[nm], evalExpr(e.args[0], env), e);
      }
      if (fnE.k === "TypeX") return convert(evalType(fnE.t, env), evalExpr(e.args[0], env), e);
      let f;
      if (fnE.k === "Selector" && fnE.x.k === "Ident" && env[fnE.x.name] === undefined && PKG_NAMES[fnE.x.name]) { f = pkgMember(fnE.x.name, fnE.name); if (f === undefined) throw new Panic("undefined: " + fnE.x.name + "." + fnE.name, true); }
      else f = evalExpr(fnE, env);
      if (f instanceof TypeVal) return convert(f.t, evalExpr(e.args[0], env), e);
      if (f === null || f === undefined) throw rtPanic("invalid memory address or nil pointer dereference");
      if (!(f instanceof Fn)) throw new Panic("cannot call non-function " + typeName(typeOf(f)), true);
      const args = evalArgs(e.args, env, e.spread);
      let r = f.call(args);
      if (Array.isArray(r) && !r.__multi) { r.__multi = true; }
      if (!multi && Array.isArray(r) && r.__multi && r.length !== 1) { /* multi-value used in single context */ }
      return r;
    }
    function convert(t, v, e) {
      const u = under(t); v = unwrapNV(v);
      if (t.kind === "named" && u.kind !== "struct" && u.kind !== "iface") { return coerce(convert(t.under, v, e), t); }
      if (u.kind === "iface") return v;
      switch (u.kind) {
        case "float64": return new Float(num(v));
        case "float32": return new Float(Math.fround(num(v)), true);
        case "string": if (typeof v === "number") return String.fromCodePoint(v); if (v instanceof Slice) { const els = sliceToArray(v); return v.et === T.uint8 || (v.et && v.et.kind === "uint8") ? fromBytes(els) : els.map((c) => String.fromCodePoint(c)).join(""); } return v;
        case "bool": return v;
        case "slice": if (typeof v === "string") { if (u.elem.kind === "uint8") return mkSlice(toBytes(v), u.elem); return mkSlice(Array.from(v).map((c) => c.codePointAt(0)), u.elem); } return v;
        case "struct": return v;
        default:
          if (u.basic && BITS[u.kind]) { if (v instanceof Float) return wrapInt(Math.trunc(v.v), u.kind); if (typeof v === "number") return wrapInt(v, u.kind); throw new Panic("cannot convert " + typeName(typeOf(v)) + " to " + u.kind, true); }
          return v;
      }
    }
    function callBuiltin(name, args, e, env, multi) {
      const A = () => args || e.args.map((a) => evalExpr(a, env));
      switch (name) {
        case "len": { const a = A()[0]; const x = unwrapNV(a); if (typeof x === "string") return strLen(x); if (x instanceof Slice) return x.len; if (x instanceof Arr) return x.a.length; if (x instanceof GoMap) return x.m.size; if (x === null) return 0; throw new Panic("invalid argument for len", true); }
        case "cap": { const x = unwrapNV(A()[0]); if (x instanceof Slice) return x.cap; if (x instanceof Arr) return x.a.length; return 0; }
        case "append": {
          let a = e ? e.args.map((x) => evalExpr(x, env)) : args; let s = unwrapNV(a[0]);
          if (e && e.spread) { const extra = unwrapNV(a[1]); const els = typeof extra === "string" ? toBytes(extra) : sliceToArray(extra); return appendTo(s, els, null); }
          const r = appendTo(s, a.slice(1), s instanceof Slice ? s.et : null); return a[0] instanceof NV ? new NV(a[0].t, r) : r;
        }
        case "make": {
          const t = evalType(e.args[0].k === "TypeX" ? e.args[0].t : exprAsType(e.args[0]), env); const u = under(t); const a = e.args.slice(1).map((x) => num(evalExpr(x, env)));
          if (u.kind === "slice") { const len = a[0] || 0, cap = a[1] != null ? a[1] : len; if (len < 0) throw rtPanic("makeslice: len out of range"); if (cap < len) throw rtPanic("makeslice: cap out of range"); const arr = []; for (let i = 0; i < cap; i++) arr.push(zero(u.elem)); const s = new Slice(arr, 0, len, cap, u.elem); return t.kind === "named" ? new NV(t, s) : s; }
          if (u.kind === "map") { const m = new GoMap(u.key, u.val); return t.kind === "named" ? new NV(t, m) : m; }
          throw new Panic("cannot make " + typeName(t), true);
        }
        case "new": { const t = evalType(e.args[0].k === "TypeX" ? e.args[0].t : exprAsType(e.args[0]), env); const z = zero(t); if (z instanceof Struct) return new Ptr(null, null, z); const c = { v: z }; return new Ptr(() => c.v, (v) => { c.v = v; }, null, t); }
        case "copy": { const a = A(); const dst = unwrapNV(a[0]), src = unwrapNV(a[1]); const els = typeof src === "string" ? toBytes(src) : sliceToArray(src); const n = Math.min(dst.len, els.length); for (let i = 0; i < n; i++) dst.a[dst.off + i] = copyVal(els[i]); return n; }
        case "delete": { const a = A(); const m = unwrapNV(a[0]); if (m instanceof GoMap) m.m.delete(mapKey(a[1])); return undefined; }
        case "panic": { const a = A()[0]; throw new Panic(a === undefined ? null : a); }
        case "recover": { const fr = env && findFrame(env); if (fr && fr.panicking && !fr.recovered) { fr.recovered = true; const v = fr.panicking.v; return v; } return null; }
        case "print": case "println": { const a = A(); return undefined; }
        case "min": case "max": { const a = A(); let r = a[0]; for (let i = 1; i < a.length; i++) { const c = num(a[i]) < num(r); if (name === "min" ? c : !c && num(a[i]) !== num(r)) r = a[i]; } if (a.some((x) => x instanceof Float)) return new Float(num(r)); return r; }
        case "clear": { const x = unwrapNV(A()[0]); if (x instanceof GoMap) x.m.clear(); else if (x instanceof Slice) for (let i = 0; i < x.len; i++) x.a[x.off + i] = zero(x.et); return undefined; }
      }
      throw new Panic("unsupported builtin " + name, true);
    }
    function exprAsType(x) { if (x.k === "Ident") return { k: "TName", name: x.name, line: x.line, col: x.col }; if (x.k === "TypeX") return x.t; if (x.k === "Selector" && x.x.k === "Ident") return { k: "TName", pkg: x.x.name, name: x.name }; if (x.k === "Deref") return { k: "TPtr", elem: exprAsType(x.x) }; throw new Panic("expected a type", true); }
    function findFrame(env) { let e = env; while (e) { if (Object.prototype.hasOwnProperty.call(e, "__frame")) { /* the deferred closure's own frame is not the panicking one */ return e.__deferTarget || null; } e = Object.getPrototypeOf(e); } return null; }

    /* ---- statements */
    function execBlock(stmts, env) { for (let i = 0; i < stmts.length; i++) { const sg = execStmt(stmts[i], env); if (sg) return sg; } return null; }
    function frameOf(env) { let e = env; while (e) { if (Object.prototype.hasOwnProperty.call(e, "__frame")) return e.__frame; e = Object.getPrototypeOf(e); } return null; }
    function assignTo(lhs, v, env) {
      switch (lhs.k) {
        case "Ident": { if (lhs.name === "_") return; const c = env[lhs.name]; if (!c) throw new Panic("undefined: " + lhs.name, true); c.v = c.t ? coerce(v, c.t) : (c.v instanceof Float && typeof v === "number" ? new Float(v) : v); return; }
        case "Paren": return assignTo(lhs.x, v, env);
        case "Index": {
          const x = evalExpr(lhs.x, env), i = evalExpr(lhs.i, env); const xs = unwrapNV(x);
          if (xs instanceof Slice) { const k = num(i); idxCheck(k, xs.len); xs.a[xs.off + k] = coerce(v, xs.et); return; }
          if (xs instanceof Arr) { const k = num(i); idxCheck(k, xs.a.length); xs.a[k] = coerce(v, xs.et); return; }
          if (xs instanceof GoMap) { if (xs.isNil) throw new Panic("assignment to entry in nil map", true); const k = coerce(i, xs.kt); xs.m.set(mapKey(k), [k, coerce(v, xs.vt)]); return; }
          if (xs instanceof Ptr && xs.get && xs.get() instanceof Arr) { xs.get().a[num(i)] = v; return; }
          throw new Panic("cannot assign to index", true);
        }
        case "Selector": { const b = evalExpr(lhs.x, env); const base = b instanceof Ptr ? (b.target || b.get()) : b; if (base === null || base === undefined) throw rtPanic("invalid memory address or nil pointer dereference"); const f = findField(base, lhs.name); if (!f) throw new Panic("no field " + lhs.name, true); const st = under(f.obj.t); const fl = st.fields.find((q) => q.name === lhs.name); f.obj.f[lhs.name] = coerce(v, fl && fl.type); return; }
        case "Deref": { const p = evalExpr(lhs.x, env); if (p === null) throw rtPanic("invalid memory address or nil pointer dereference"); if (p.target) { const src = v; for (const k in p.target.f) delete p.target.f[k]; Object.assign(p.target.f, copyVal(src).f); } else p.set(v); return; }
      }
      throw new Panic("cannot assign to " + lhs.k, true);
    }
    function declareVar(env, name, v, t) { if (name === "_") return; env[name] = cell(v, t || null); }
    function multiVals(rhs, n, env) {
      if (rhs.length === 1 && n > 1) {
        const e = rhs[0]; let r;
        if (e.k === "Index" ) { const x = evalExpr(e.x, env); if (unwrapNV(x) instanceof GoMap) { const m = unwrapNV(x), k = evalExpr(e.i, env); const en = m.m.get(mapKey(k)); return [en ? en[1] : zero(m.vt), !!en]; } }
        r = evalExpr(e, env, true); if (!Array.isArray(r)) throw new Panic("assignment mismatch: " + n + " variables but 1 value", true);
        if (r.length !== n) throw new Panic("assignment mismatch: " + n + " variables but " + (e.k === "Call" && e.fn.k === "Ident" ? e.fn.name + "()" : "call") + " returns " + r.length + " values", true); return r;
      }
      if (rhs.length !== n) throw new Panic("assignment mismatch: " + n + " variables but " + rhs.length + " values", true);
      return rhs.map((x) => evalExpr(x, env));
    }
    const asMulti = (r) => r;
    function execStmt(s, env) {
      tick();
      switch (s.k) {
        case "Empty": return null;
        case "ExprStmt": evalExpr(s.x, env, true); return null;
        case "Define": {
          const vals = s.lhs.length === 1 ? [evalExpr(s.rhs[0], env)] : multiVals(s.rhs, s.lhs.length, env);
          s.lhs.forEach((l, i) => { const nm = l.name; if (nm === "_") return; const v = copyVal(vals[i]); if (Object.prototype.hasOwnProperty.call(env, nm) && env[nm]) { env[nm].v = env[nm].t ? coerce(v, env[nm].t) : v; } else env[nm] = cell(v, null); });
          return null;
        }
        case "Assign": {
          if (s.lhs.length === 1 && s.rhs.length === 1) { assignTo(s.lhs[0], copyVal(evalExpr(s.rhs[0], env)), env); return null; }
          const vals = multiVals(s.rhs, s.lhs.length, env).map(copyVal); s.lhs.forEach((l, i) => assignTo(l, vals[i], env)); return null;
        }
        case "OpAssign": { const cur = evalExpr(s.lhs, env), r = evalExpr(s.rhs, env); assignTo(s.lhs, binop(s.op, cur, r), env); return null; }
        case "IncDec": { const cur = evalExpr(s.x, env); assignTo(s.x, binop(s.op === "++" ? "+" : "-", cur, 1), env); return null; }
        case "DeclStmt": execDecl(s, env); return null;
        case "Block": return execBlock(s.stmts, Object.create(env));
        case "If": { const e2 = Object.create(env); if (s.init) execStmt(s.init, e2); if (unwrapNV(evalExpr(s.cond, e2))) return execBlock(s.then.stmts, Object.create(e2)); if (s.els) return s.els.k === "If" ? execStmt(s.els, e2) : execBlock(s.els.stmts, Object.create(e2)); return null; }
        case "For": return execFor(s, env, null);
        case "ForRange": return execRange(s, env, null);
        case "Label": { const b = s.body; if (b.k === "For") return execFor(b, env, s.name); if (b.k === "ForRange") return execRange(b, env, s.name); const sg = execStmt(b, env); return sg && sg.t === "break" && sg.label === s.name ? null : sg; }
        case "Switch": return execSwitch(s, env);
        case "TypeSwitch": return execTypeSwitch(s, env);
        case "Return": {
          const fr = frameOf(env); const sig = fr && fr.sig; let vals;
          if (s.vals.length === 1 && sig && sig.results.length > 1) { const r = evalExpr(s.vals[0], env, true); vals = r; }
          else vals = s.vals.map((v) => copyVal(evalExpr(v, env)));
          if (s.vals.length === 0 && sig && sig.results.length && sig.results[0].name) { return { t: "return", vals: [] }; }
          if (sig && sig.results.length && sig.results[0].name && s.vals.length) { sig.results.forEach((q, i) => { let c = env[q.name]; if (c) c.v = coerce(vals[i], c.t); }); }
          return { t: "return", vals: vals };
        }
        case "Branch": return { t: s.kind, label: s.label };
        case "Fallthrough": return { t: "fallthrough" };
        case "Defer": {
          const fr = frameOf(env); const c = s.call; const fnE = c.fn.k === "Paren" ? c.fn.x : c.fn;
          let f = null, args = null, builtin = null;
          if (fnE.k === "Ident" && env[fnE.name] === undefined && BUILTIN_FUNCS.indexOf(fnE.name) >= 0) { builtin = fnE.name; args = c.args.map((a) => evalExpr(a, env)); }
          else { f = fnE.k === "Selector" && fnE.x.k === "Ident" && env[fnE.x.name] === undefined && PKG_NAMES[fnE.x.name] ? pkgMember(fnE.x.name, fnE.name) : evalExpr(fnE, env); args = evalArgs(c.args, env, c.spread); }
          fr.defers.push(() => {
            if (builtin) { if (builtin === "recover") { if (fr.panicking && !fr.recovered) fr.recovered = true; return; } callBuiltin(builtin, args, null, env); return; }
            if (f && f.callWith && f.deferFrame !== false) { /* a closure: recover() inside reads the enclosing frame */ }
            runDeferred(f, args, fr);
          }); return null;
        }
      }
      throw new Panic("unsupported statement " + s.k, true);
    }
    function runDeferred(f, args, fr) { const prev = currentPanicFrame; currentPanicFrame = fr; try { f.call(args); } finally { currentPanicFrame = prev; } }
    let currentPanicFrame = null;
    function execDecl(s, env) {
      s.specs.forEach((sp) => {
        if (sp.k === "TypeSpec") { declareType(sp, env); return; }
        const t = sp.type ? evalType(sp.type, env) : null;
        if (sp.kind === "const") { sp.names.forEach((n, i) => { const e2 = Object.create(env); e2.__iota = sp.iota; if (sp.vals[i]) { let v = evalExpr(sp.vals[i], e2); if (t) v = coerce(v, t); if (n.v !== "_") env[n.v] = cell(v, null); } }); return; }
        if (sp.vals.length === 0) { sp.names.forEach((n) => declareVar(env, n.v, zero(t), t)); return; }
        const vals = sp.names.length === 1 ? [evalExpr(sp.vals[0], env)] : multiVals(sp.vals, sp.names.length, env);
        sp.names.forEach((n, i) => declareVar(env, n.v, coerce(copyVal(vals[i]), t), t));
      });
    }
    function declareType(sp, env) {
      const nt = { kind: "named", name: sp.name, under: null, methods: {} }; env["type:" + sp.name] = nt;
      const u = resolveType(sp.type, env); if (sp.alias) { env["type:" + sp.name] = u; return; }
      nt.under = u.kind === "named" ? u.under : u; if (nt.under.kind === "struct") { nt.kind = "named"; } return nt;
    }
    function execFor(s, env, label) {
      const loop = Object.create(env); if (s.init) execStmt(s.init, loop);
      const names = s.init && s.init.k === "Define" ? s.init.lhs.map((l) => l.name) : [];
      for (;;) {
        if (s.cond && !unwrapNV(evalExpr(s.cond, loop))) break;
        const iter = Object.create(loop); names.forEach((n) => { if (n !== "_" && loop[n]) iter[n] = { v: loop[n].v, t: loop[n].t }; });
        const sg = execBlock(s.body.stmts, iter);
        names.forEach((n) => { if (n !== "_" && iter[n]) loop[n].v = iter[n].v; });
        if (sg) { if (sg.t === "break") { if (!sg.label || sg.label === label) break; return sg; } if (sg.t === "continue") { if (!sg.label || sg.label === label) { /* next */ } else return sg; } else return sg; }
        if (s.post) execStmt(s.post, loop); tick();
      }
      return null;
    }
    function execRange(s, env, label) {
      const x0 = evalExpr(s.x, env); const x = unwrapNV(x0); const loop = Object.create(env);
      const bind = (k, v, iterEnv) => { if (s.def) { if (s.key && s.key.name !== "_" && k === 0) iterEnv[s.key.name] = cell(v, null); } };
      const each = (kv, vv) => { const it = Object.create(env); if (s.def) { if (s.key && s.key.name !== "_") it[s.key.name] = cell(kv, null); if (s.val && s.val.name !== "_") it[s.val.name] = cell(copyVal(vv), null); } else { if (s.key) assignTo(s.key, kv, env); if (s.val) assignTo(s.val, copyVal(vv), env); } return execBlock(s.body.stmts, it); };
      const handle = (sg) => { if (!sg) return 0; if (sg.t === "break") { if (!sg.label || sg.label === label) return 1; return sg; } if (sg.t === "continue") { if (!sg.label || sg.label === label) return 0; return sg; } return sg; };
      let res;
      if (typeof x === "number") { for (let i = 0; i < x; i++) { res = handle(each(i, undefined)); if (res === 1) break; if (res) return res; } return null; }
      if (x instanceof Slice) { const n = x.len; for (let i = 0; i < n; i++) { res = handle(each(i, x.a[x.off + i])); if (res === 1) break; if (res) return res; } return null; }
      if (x instanceof Arr) { const snap = x.a.slice(); for (let i = 0; i < snap.length; i++) { res = handle(each(i, snap[i])); if (res === 1) break; if (res) return res; } return null; }
      if (typeof x === "string") { let bi = 0; for (const ch of x) { const c = ch.codePointAt(0); res = handle(each(bi, c)); bi += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; if (res === 1) break; if (res) return res; } return null; }
      if (x instanceof GoMap) { const entries = Array.from(x.m.values()); for (const en of entries) { if (!x.m.has(mapKey(en[0]))) continue; res = handle(each(en[0], x.m.get(mapKey(en[0]))[1])); if (res === 1) break; if (res) return res; } return null; }
      if (x === null) return null;
      throw new Panic("cannot range over " + typeName(typeOf(x)), true);
    }
    function execSwitch(s, env) {
      const e2 = Object.create(env); if (s.init) execStmt(s.init, e2);
      const tag = s.tag ? evalExpr(s.tag, e2) : true; let matched = -1;
      for (let i = 0; i < s.cases.length && matched < 0; i++) { const c = s.cases[i]; if (c.isDefault) continue; for (const ex of c.exprs) { const v = evalExpr(ex, e2); if (s.tag ? eq(tag, v) : unwrapNV(v) === true) { matched = i; break; } } }
      if (matched < 0) matched = s.cases.findIndex((c) => c.isDefault); if (matched < 0) return null;
      for (let i = matched; i < s.cases.length; i++) { const sg = execBlock(s.cases[i].body, Object.create(e2)); if (sg) { if (sg.t === "fallthrough") continue; if (sg.t === "break" && !sg.label) return null; return sg; } break; }
      return null;
    }
    function execTypeSwitch(s, env) {
      const e2 = Object.create(env); if (s.init) execStmt(s.init, e2); const v = evalExpr(s.ts.x, e2); let chosen = null, matchedType = null;
      for (const c of s.cases) { if (c.isDefault) continue; for (const tn of c.types) { const ok = tn.name === "nil" && !tn.pkg ? v === null : assertOk(v, evalType(tn, e2)); if (ok) { chosen = c; matchedType = c.types.length === 1 && !(tn.name === "nil") ? evalType(tn, e2) : null; break; } } if (chosen) break; }
      if (!chosen) chosen = s.cases.find((c) => c.isDefault); if (!chosen) return null;
      const e3 = Object.create(e2); if (s.ts.bind) e3[s.ts.bind] = cell(v, null);
      const sg = execBlock(chosen.body, e3); if (sg && sg.t === "break" && !sg.label) return null; return sg;
    }

    /* ---- packages */
    function toStrArr(a) { return a.map((x) => String(x)); }
    const sv = (a) => sliceToArray(unwrapNV(a));
    const retErr = (v, msg) => [v, msg == null ? null : new ErrVal(msg)];
    const nerr = (fn, s, msg) => new ErrVal("strconv." + fn + ": parsing " + quote(s) + ": " + msg);
    function sortSlice(s, cmp) { const els = sliceToArray(s); els.sort(cmp); for (let i = 0; i < els.length; i++) s.a[s.off + i] = els[i]; }
    const P = {
      fmt: {
        Println: (a) => { emit(sprintln(a)); return [0, null]; }, Printf: (a) => { emit(sprintf(a[0], a.slice(1))); return [0, null]; }, Print: (a) => { emit(sprint(a)); return [0, null]; },
        Sprintf: (a) => sprintf(a[0], a.slice(1)), Sprint: (a) => sprint(a), Sprintln: (a) => sprintln(a),
        Errorf: (a) => { const f = a[0]; const msg = sprintf(f.replace(/%w/g, "%v"), a.slice(1)); const wi = f.indexOf("%w"); let wrapped = null; if (wi >= 0) { const before = (f.slice(0, wi).match(/%[^%]/g) || []).length; wrapped = a[1 + before] || null; } return new ErrVal(msg, wrapped); },
        Scan: (a) => scanInto(a, false), Scanln: (a) => scanInto(a, true), Sscanf: (a) => [0, new ErrVal("Sscanf is not supported")], Sscan: (a) => { const toks = a[0].trim().split(/\s+/); let n = 0; a.slice(1).forEach((p, i) => { if (toks[i] != null) { setScanned(p, toks[i]); n++; } }); return [n, null]; },
        Fprintf: (a) => { if (a[0] && a[0].stderr) return [0, null]; emit(sprintf(a[1], a.slice(2))); return [0, null]; }, Fprintln: (a) => { if (a[0] && a[0].stderr) return [0, null]; emit(sprintln(a.slice(1))); return [0, null]; },
      },
      strings: {
        ToUpper: (a) => a[0].toUpperCase(), ToLower: (a) => a[0].toLowerCase(), Contains: (a) => a[0].includes(a[1]), ContainsRune: (a) => a[0].includes(String.fromCodePoint(a[1])), ContainsAny: (a) => Array.from(a[1]).some((c) => a[0].includes(c)), HasPrefix: (a) => a[0].startsWith(a[1]), HasSuffix: (a) => a[0].endsWith(a[1]),
        Index: (a) => { const i = a[0].indexOf(a[1]); return i < 0 ? -1 : utf8len(a[0].slice(0, i)); }, LastIndex: (a) => { const i = a[0].lastIndexOf(a[1]); return i < 0 ? -1 : utf8len(a[0].slice(0, i)); }, IndexByte: (a) => a[0].indexOf(String.fromCharCode(a[1])),
        Split: (a) => mkSlice(a[1] === "" ? Array.from(a[0]) : a[0].split(a[1]), T.string), SplitN: (a) => { const n = a[2]; if (n < 0) return mkSlice(a[0].split(a[1]), T.string); const parts = a[0].split(a[1]); if (parts.length <= n) return mkSlice(parts, T.string); return mkSlice(parts.slice(0, n - 1).concat(parts.slice(n - 1).join(a[1])), T.string); },
        Join: (a) => sv(a[0]).join(a[1]), Repeat: (a) => { if (a[1] < 0) throw new Panic("strings: negative Repeat count", true); return a[0].repeat(a[1]); }, TrimSpace: (a) => a[0].replace(/^[\s\u0085 ]+|[\s\u0085 ]+$/g, ""),
        Trim: (a) => { const set = new Set(Array.from(a[1])); const ch = Array.from(a[0]); let i = 0, j = ch.length; while (i < j && set.has(ch[i])) i++; while (j > i && set.has(ch[j - 1])) j--; return ch.slice(i, j).join(""); },
        TrimLeft: (a) => { const set = new Set(Array.from(a[1])); const ch = Array.from(a[0]); let i = 0; while (i < ch.length && set.has(ch[i])) i++; return ch.slice(i).join(""); }, TrimRight: (a) => { const set = new Set(Array.from(a[1])); const ch = Array.from(a[0]); let j = ch.length; while (j > 0 && set.has(ch[j - 1])) j--; return ch.slice(0, j).join(""); },
        TrimPrefix: (a) => (a[0].startsWith(a[1]) ? a[0].slice(a[1].length) : a[0]), TrimSuffix: (a) => (a[1] && a[0].endsWith(a[1]) ? a[0].slice(0, -a[1].length) : a[0]), TrimFunc: (a) => { const ch = Array.from(a[0]); let i = 0, j = ch.length; while (i < j && a[1].call([ch[i].codePointAt(0)])) i++; while (j > i && a[1].call([ch[j - 1].codePointAt(0)])) j--; return ch.slice(i, j).join(""); },
        Fields: (a) => mkSlice(a[0].split(/\s+/).filter(Boolean), T.string), Replace: (a) => { if (a[3] < 0) return a[0].split(a[1]).join(a[2]); let n = a[3], o = a[0], res = "", i = 0; while (n > 0) { const j = o.indexOf(a[1], i); if (j < 0) break; res += o.slice(i, j) + a[2]; i = j + a[1].length; n--; } return res + o.slice(i); }, ReplaceAll: (a) => a[0].split(a[1]).join(a[2]),
        Count: (a) => (a[1] === "" ? Array.from(a[0]).length + 1 : a[0].split(a[1]).length - 1), EqualFold: (a) => a[0].toLowerCase() === a[1].toLowerCase(), Title: (a) => a[0].replace(/\b\w/g, (c) => c.toUpperCase()), Compare: (a) => (a[0] < a[1] ? -1 : a[0] > a[1] ? 1 : 0),
        Map: (a) => Array.from(a[1]).map((c) => { const r = a[0].call([c.codePointAt(0)]); return r < 0 ? "" : String.fromCodePoint(r); }).join(""), ToTitle: (a) => a[0].toUpperCase(),
        Cut: (a) => { const i = a[0].indexOf(a[1]); return i < 0 ? [a[0], "", false] : [a[0].slice(0, i), a[0].slice(i + a[1].length), true]; },
        NewReplacer: (a) => { const pairs = a.map((x) => x); return { replacer: true, pairs: pairs }; }, NewReader: (a) => ({ bufio: true, cur: "" }),
      },
      strconv: {
        Itoa: (a) => String(num(a[0])), Atoi: (a) => { const s = a[0]; if (!/^[+-]?\d+$/.test(s)) return [0, nerr("Atoi", s, "invalid syntax")]; const n = Number(s); if (!Number.isSafeInteger(n) && Math.abs(n) > 9.3e18) return [n > 0 ? 9223372036854775807 : -9223372036854775808, nerr("Atoi", s, "value out of range")]; return [n, null]; },
        ParseInt: (a) => { const s = a[0], base = a[1] || 10; const v = parseInt(s, base === 0 ? 10 : base); if (s === "" || Number.isNaN(v) || !new RegExp("^[+-]?[0-9a-zA-Z]+$").test(s) || (base === 10 && !/^[+-]?\d+$/.test(s))) return [0, nerr("ParseInt", s, "invalid syntax")]; return [v, null]; },
        ParseFloat: (a) => { const s = a[0]; if (!/^[+-]?(\d+\.?\d*([eE][+-]?\d+)?|\.\d+([eE][+-]?\d+)?|inf|infinity|nan)$/i.test(s)) return [new Float(0), nerr("ParseFloat", s, "invalid syntax")]; return [new Float(parseFloat(s)), null]; },
        ParseBool: (a) => { if (/^(1|t|T|true|TRUE|True)$/.test(a[0])) return [true, null]; if (/^(0|f|F|false|FALSE|False)$/.test(a[0])) return [false, null]; return [false, nerr("ParseBool", a[0], "invalid syntax")]; },
        FormatInt: (a) => num(a[0]).toString(a[1]), FormatFloat: (a) => fmtFloatVerb(num(a[0]), String.fromCharCode(a[1]), a[2] < 0 ? null : a[2]), Quote: (a) => quote(a[0]), FormatBool: (a) => String(a[0]),
      },
      math: {
        Sqrt: (a) => new Float(Math.sqrt(num(a[0]))), Pow: (a) => new Float(Math.pow(num(a[0]), num(a[1]))), Abs: (a) => new Float(Math.abs(num(a[0]))), Floor: (a) => new Float(Math.floor(num(a[0]))), Ceil: (a) => new Float(Math.ceil(num(a[0]))), Round: (a) => { const x = num(a[0]); return new Float(x < 0 ? -Math.round(-x) : Math.round(x)); }, Trunc: (a) => new Float(Math.trunc(num(a[0]))),
        Max: (a) => new Float(Math.max(num(a[0]), num(a[1]))), Min: (a) => new Float(Math.min(num(a[0]), num(a[1]))), Mod: (a) => new Float(num(a[0]) % num(a[1])), Log: (a) => new Float(Math.log(num(a[0]))), Log2: (a) => new Float(Math.log2(num(a[0]))), Log10: (a) => new Float(Math.log10(num(a[0]))), Exp: (a) => new Float(Math.exp(num(a[0]))),
        Sin: (a) => new Float(Math.sin(num(a[0]))), Cos: (a) => new Float(Math.cos(num(a[0]))), Tan: (a) => new Float(Math.tan(num(a[0]))), Atan: (a) => new Float(Math.atan(num(a[0]))), Hypot: (a) => new Float(Math.hypot(num(a[0]), num(a[1]))), Cbrt: (a) => new Float(Math.cbrt(num(a[0]))),
        Inf: (a) => new Float(a[0] >= 0 ? Infinity : -Infinity), IsNaN: (a) => Number.isNaN(num(a[0])), IsInf: (a) => { const x = num(a[0]); return a[1] > 0 ? x === Infinity : a[1] < 0 ? x === -Infinity : !isFinite(x) && !Number.isNaN(x); }, NaN: () => new Float(NaN),
        Pi: new Float(Math.PI), E: new Float(Math.E), MaxInt: 9223372036854775807, MinInt: -9223372036854775808, MaxInt64: 9223372036854775807, MinInt64: -9223372036854775808, MaxInt32: 2147483647, MinInt32: -2147483648, MaxInt16: 32767, MaxInt8: 127, MaxUint8: 255, MaxUint32: 4294967295, MaxFloat64: new Float(Number.MAX_VALUE), SmallestNonzeroFloat64: new Float(5e-324),
      },
      sort: {
        Ints: (a) => sortSlice(a[0], (x, y) => x - y), Strings: (a) => sortSlice(a[0], (x, y) => (x < y ? -1 : x > y ? 1 : 0)), Float64s: (a) => sortSlice(a[0], (x, y) => num(x) - num(y)),
        Slice: (a) => { const s = unwrapNV(a[0]); const less = a[1]; const idx = []; for (let i = 0; i < s.len; i++) idx.push(i); const snap = sliceToArray(s); const tmp = s.a.slice(); /* less(i,j) refers to current positions: use stable merge via comparing snapshot positions */ const items = snap.map((v, i) => ({ v: v, i: i })); items.sort((p, q) => { for (let i = 0; i < snap.length; i++) s.a[s.off + i] = snap[i]; return less.call([p.i, q.i]) ? -1 : less.call([q.i, p.i]) ? 1 : p.i - q.i; }); for (let i = 0; i < items.length; i++) s.a[s.off + i] = items[i].v; return undefined; },
        SliceStable: (a) => P.sort.Slice(a), SearchInts: (a) => { const els = sv(a[0]); let lo = 0, hi = els.length; while (lo < hi) { const m = (lo + hi) >> 1; if (els[m] < a[1]) lo = m + 1; else hi = m; } return lo; },
        Search: (a) => { let lo = 0, hi = a[0]; while (lo < hi) { const m = Math.floor((lo + hi) / 2); if (!a[1].call([m])) lo = m + 1; else hi = m; } return lo; }, IntsAreSorted: (a) => { const e = sv(a[0]); return e.every((x, i) => i === 0 || e[i - 1] <= x); }, StringsAreSorted: (a) => { const e = sv(a[0]); return e.every((x, i) => i === 0 || e[i - 1] <= x); },
      },
      errors: {
        New: (a) => new ErrVal(a[0]),
        Is: (a) => { let e = a[0]; for (let i = 0; i < 50 && e !== null && e !== undefined; i++) { if (eq(e, a[1])) return true; e = unwrapErr(e); } return a[1] === null && a[0] === null; },
        Unwrap: (a) => unwrapErr(a[0]),
        As: (a) => { const target = a[1]; const tt = target.t || (target.get && target.get() && null); let e = a[0]; for (let i = 0; i < 50 && e !== null && e !== undefined; i++) { if (target.t && assertOk(e, target.t)) { target.set(e); return true; } e = unwrapErr(e); } return false; },
      },
      os: { Exit: (a) => { throw new Exit(a[0]); }, Stdin: { bufio: true, stdin: true }, Stdout: { stdout: true }, Stderr: { stderr: true }, Args: mkSlice(["main"], T.string) },
      unicode: { IsUpper: (a) => /\p{Lu}/u.test(String.fromCodePoint(a[0])), IsLower: (a) => /\p{Ll}/u.test(String.fromCodePoint(a[0])), IsDigit: (a) => /\p{Nd}/u.test(String.fromCodePoint(a[0])), IsLetter: (a) => /\p{L}/u.test(String.fromCodePoint(a[0])), IsSpace: (a) => /\s/.test(String.fromCodePoint(a[0])), IsPunct: (a) => /\p{P}/u.test(String.fromCodePoint(a[0])), ToUpper: (a) => String.fromCodePoint(a[0]).toUpperCase().codePointAt(0), ToLower: (a) => String.fromCodePoint(a[0]).toLowerCase().codePointAt(0) },
      utf8: { RuneCountInString: (a) => Array.from(a[0]).length, RuneLen: (a) => utf8len(String.fromCodePoint(a[0])), RuneError: 65533 },
      bufio: { NewScanner: () => ({ bufio: true, cur: "" }), NewReader: () => ({ bufio: true, cur: "" }), ScanWords: null, ScanLines: null },
      slices: {
        Sort: (a) => sortSlice(unwrapNV(a[0]), (x, y) => (typeof x === "string" ? (x < y ? -1 : x > y ? 1 : 0) : num(x) - num(y))), Contains: (a) => sv(a[0]).some((x) => eq(x, a[1])), Index: (a) => sv(a[0]).findIndex((x) => eq(x, a[1])), Reverse: (a) => { const s = unwrapNV(a[0]); const e = sliceToArray(s).reverse(); e.forEach((v, i) => { s.a[s.off + i] = v; }); },
        Max: (a) => { const e = sv(a[0]); if (!e.length) throw new Panic("slices.Max: empty list", true); return e.reduce((m, x) => (num(x) > num(m) ? x : m)); }, Min: (a) => { const e = sv(a[0]); if (!e.length) throw new Panic("slices.Min: empty list", true); return e.reduce((m, x) => (num(x) < num(m) ? x : m)); }, Equal: (a) => { const x = sv(a[0]), y = sv(a[1]); return x.length === y.length && x.every((v, i) => eq(v, y[i])); },
      },
    };
    function unwrapErr(e) { if (e instanceof ErrVal) return e.wrapped; if (e && hasMethod(e, "Unwrap")) return callMethod(e, "Unwrap", []); return null; }
    function setScanned(p, tok) { const cur = p.get(); if (typeof cur === "string") p.set(tok); else if (cur instanceof Float) p.set(new Float(parseFloat(tok))); else p.set(parseInt(tok, 10)); }
    function scanInto(ptrs, line) {
      let n = 0;
      for (const p of ptrs) { while (stdinPos < stdinBuf.length && /\s/.test(stdinBuf[stdinPos]) && !(line && stdinBuf[stdinPos] === "\n")) stdinPos++; if (stdinPos >= stdinBuf.length) return [n, new ErrVal(n === 0 ? "EOF" : "unexpected newline")]; let j = stdinPos; while (j < stdinBuf.length && !/\s/.test(stdinBuf[j])) j++; const tok = stdinBuf.slice(stdinPos, j); stdinPos = j; setScanned(p, tok); n++; }
      if (line) { while (stdinPos < stdinBuf.length && stdinBuf[stdinPos] !== "\n") stdinPos++; stdinPos++; }
      return [n, null];
    }
    const pkgCache = {};
    function pkgMember(pkg, name) {
      const m = P[pkg]; if (!m || !(name in m)) { if (pkg === "time" || pkg === "sync" || pkg === "rand" || pkg === "maps" || pkg === "bytes") throw new Panic("package " + pkg + " is not supported in the in-browser Go runner yet", true); return undefined; }
      const v = m[name]; if (typeof v === "function") { const key = pkg + "." + name; return pkgCache[key] || (pkgCache[key] = new Fn(key, (args) => { const r = v(args.__spread ? spreadArgs(args) : args); return r; })); } return v;
    }
    function spreadArgs(args) { const last = args[args.length - 1]; if (last instanceof Slice) return args.slice(0, -1).concat(sliceToArray(last)); return args; }

    /* ---- load program */
    const genv = globalEnv; const funcs = [], methods = [];
    // types first (so they can reference each other)
    ast.decls.forEach((d) => { if (d.k === "DeclStmt" && d.isType) d.specs.forEach((sp) => { if (!sp.alias) genv["type:" + sp.name] = { kind: "named", name: sp.name, under: null, methods: {} }; }); });
    ast.decls.forEach((d) => { if (d.k === "DeclStmt" && d.isType) d.specs.forEach((sp) => { if (sp.alias) { genv["type:" + sp.name] = resolveType(sp.type, genv); return; } const nt = genv["type:" + sp.name]; const u = resolveType(sp.type, genv); nt.under = u.kind === "named" ? u.under : u; }); });
    ast.decls.forEach((d) => {
      if (d.k === "FuncDecl") {
        if (d.recv) { const rt = d.recv.type; const ptr = rt.k === "TPtr"; const bt = ptr ? rt.elem : rt; const t = genv["type:" + bt.name]; if (!t) throw new GoErr("undefined: " + bt.name, bt.line, bt.col); const info = { name: d.recv.name, t: ptr ? { kind: "ptr", elem: t } : t };
          const fn = makeFunc(d.name, d.sig, d.body || { stmts: [] }, genv, info); t.methods[d.name] = { ptrRecv: ptr, call: (recv, args) => fn.callWith(recv, args) }; }
        else if (d.name === "init" || d.name === "main") { funcs.push(d); genv[d.name] = { fnDecl: makeFunc(d.name, d.sig, d.body, genv, null) }; }
        else genv[d.name] = { fnDecl: makeFunc(d.name, d.sig, d.body, genv, null) };
      }
    });
    // package-level vars and consts (dependency order by retry)
    const vspecs = []; ast.decls.forEach((d) => { if (d.k === "DeclStmt" && !d.isType) d.specs.forEach((sp) => vspecs.push(sp)); });
    let pending = vspecs.slice(), guard = 0;
    while (pending.length && guard++ < vspecs.length + 3) { const next = []; pending.forEach((sp) => { try { execDecl({ specs: [sp] }, genv); } catch (e) { if (e instanceof Panic && /^undefined: /.test(String(e.v))) next.push(sp); else throw e; } }); if (next.length === pending.length) { execDecl({ specs: [next[0]] }, genv); } pending = next; }

    function panicText(e) {
      const v = e.v; let s;
      if (e.rt) s = String(v) + (/^runtime error/.test(String(v)) ? "" : ""); else if (v instanceof ErrVal) s = v.msg; else if (typeof v === "string") s = v; else if (v !== null && v !== undefined && hasMethod(v, "Error")) s = callMethod(v, "Error", []); else if (v !== null && v !== undefined && hasMethod(v, "String")) s = callMethod(v, "String", []); else s = typeName(typeOf(v)) + "(" + fmtVal(v, "v", {}, true) + ")";
      if (!e.rt && v instanceof ErrVal) s = v.msg; else if (!e.rt && typeof v === "string") s = v; else if (!e.rt && typeof unwrapNV(v) === "number") s = typeName(typeOf(v)) + "(" + fmtVal(v) + ")";
      return "panic: " + s + (/nil pointer dereference/.test(s) ? "\n[signal SIGSEGV: segmentation violation code=0x1 addr=0x0 pc=0x0]" : "") + "\n\ngoroutine 1 [running]:\nmain.main()\n\t/tmp/main.go\nexit status 2";
    }
    const api = {
      genv: genv, types: types, emit: emit, out: () => out.join(""), hasMain: !!genv.main,
      runMain: function () {
        let code = 0, err = "";
        try { if (genv.init) genv.init.fnDecl.call([]); if (!genv.main) { return { out: out.join(""), err: "function main is undeclared in the main package", code: 1, compile: true }; } genv.main.fnDecl.call([]); }
        catch (e) { if (e instanceof Exit) code = e.code; else if (e instanceof Panic) { err = panicText(e); code = 2; } else throw e; }
        return { out: out.join(""), err: err, code: code };
      },
      evalExprSrc: function (src) {
        const ast2 = parse("package main\nvar __r = " + src + "\n"); const sp = ast2.decls[0].specs[0]; const v = evalExpr(sp.vals[0], genv, true);
        return v;
      },
      fmt: (v) => (Array.isArray(v) ? v.map((x) => fmtVal(x, "v", {}, true)).join(" ") : fmtVal(v, "v", {}, true)),
      panicText: panicText,
    };
    // recover() must see the panicking frame of the function whose deferred call is running
    const baseCall = callBuiltin;
    callBuiltin = function (name, args, e, env, multi) { if (name === "recover") { const fr = currentPanicFrame; if (fr && fr.panicking && !fr.recovered) { fr.recovered = true; return fr.panicking.v === undefined ? null : fr.panicking.v; } return null; } return baseCall(name, args, e, env, multi); };
    return api;
  }

  /* ================================================================ public API */
  function compileErrorText(errs) { return "# command-line-arguments\n" + errs.slice(0, 10).map((e) => "./prog.go:" + e.line + ":" + e.col + ": " + e.msg).join("\n") + (errs.length > 10 ? "\n./prog.go:" + errs[10].line + ":" + errs[10].col + ": too many errors" : ""); }
  function goRun(src, opts) {
    opts = opts || {}; let ast;
    try { ast = parse(src); } catch (e) { if (e instanceof GoErr) return { out: "", err: compileErrorText([{ line: e.line, col: e.col, msg: e.message }]), code: 1, compile: true }; throw e; }
    if (ast.pkg !== "main") return { out: "", err: "package " + ast.pkg + " is not a main package", code: 1, compile: true };
    const errs = check(ast); if (errs.length) return { out: "", err: compileErrorText(errs), code: 1, compile: true };
    let rt; try { rt = makeRt(ast, opts); } catch (e) { if (e instanceof GoErr) return { out: "", err: compileErrorText([{ line: e.line, col: e.col, msg: e.message }]), code: 1, compile: true }; if (e instanceof Panic) return { out: "", err: "panic: " + String(e.v), code: 2 }; throw e; }
    return rt.runMain();
  }
  /* Grade tests: {kind:"go-out", expect, stdin?} runs main and compares stdout; {kind:"go-call", expr, expect} evaluates a Go expression
     after the program is loaded; {kind:"go-compiles"} just needs a clean compile; {kind:"go-fails", contains} expects the compile error text. */
  function goGrade(src, tests) {
    let ast = null, cerr = null;
    try { ast = parse(src); const errs = check(ast); if (errs.length) cerr = compileErrorText(errs); } catch (e) { if (e instanceof GoErr) cerr = compileErrorText([{ line: e.line, col: e.col, msg: e.message }]); else throw e; }
    return tests.map((t) => {
      const base = { label: t.label, hidden: !!t.hidden };
      if (t.kind === "go-fails") { const ok = !!cerr && cerr.includes(t.contains); return Object.assign(base, { ok: ok, got: cerr ? cerr.split("\n").slice(1).join(" ") : "it compiled", expect: "an error containing: " + t.contains }); }
      if (cerr) return Object.assign(base, { ok: false, err: cerr, got: cerr, expect: t.expect });
      if (t.kind === "go-compiles") return Object.assign(base, { ok: true });
      try {
        if (t.kind === "go-out") {
          const rt = makeRt(ast, { stdin: t.stdin || [] }); const r = rt.runMain(); const got = (r.out + (r.err ? "\n" + r.err.split("\n")[0] : "")).replace(/\s+$/, "");
          return Object.assign(base, { ok: !r.err && !r.compile && got === String(t.expect).replace(/\s+$/, ""), got: got, expect: t.expect, stdin: t.stdin || [] });
        }
        if (t.kind === "go-call") {
          const rt = makeRt(ast, {}); const v = rt.evalExprSrc(t.expr); const got = rt.fmt(v);
          return Object.assign(base, { ok: got === t.expect, got: got, expect: t.expect, expr: t.expr });
        }
      } catch (e) { if (e instanceof Panic) return Object.assign(base, { ok: false, got: "panic: " + String(e.v), expect: t.expect, expr: t.expr }); if (e instanceof GoErr) return Object.assign(base, { ok: false, err: e.message, got: e.message, expect: t.expect }); throw e; }
      return Object.assign(base, { ok: false });
    });
  }
  AK.goRun = goRun; AK.goGrade = goGrade; AK.goParse = parse; AK.goCheck = (src) => { try { return check(parse(src)); } catch (e) { if (e instanceof GoErr) return [{ line: e.line, col: e.col, msg: e.message }]; throw e; } };
  AK.GO_LIMITS = "No goroutines, channels, generics, reflect or time. Type errors show up when the code runs, not before.";
  if (typeof module !== "undefined" && module.exports) module.exports = AK;
})(typeof window !== "undefined" ? window : globalThis);

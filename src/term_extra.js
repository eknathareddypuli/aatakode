/* AataKode terminal extras: more Linux commands, services, perms and curl for the simulated server.
   Registers an extension that createTerminal() runs for every new terminal. Pure logic, no DOM. */
(function (root) {
  "use strict";
  const AK = typeof module !== "undefined" && module.exports ? require("./engine.js") : root.AK;
  AK._termExt = AK._termExt || [];

  /* Line diff (LCS). Returns [{t:" "|"-"|"+", s}]. Shared with the git simulator. */
  AK.lineDiff = function (a, b) {
    const n = a.length, m = b.length, L = [];
    for (let i = 0; i <= n; i++) L.push(new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const out = []; let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { out.push({ t: " ", s: a[i] }); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) { out.push({ t: "-", s: a[i] }); i++; }
      else { out.push({ t: "+", s: b[j] }); j++; }
    }
    while (i < n) out.push({ t: "-", s: a[i++] });
    while (j < m) out.push({ t: "+", s: b[j++] });
    return out;
  };

  const SIZE_UNITS = { K: 1024, M: 1024 * 1024, G: 1024 * 1024 * 1024 };
  const parseSize = (v) => { const m = String(v).match(/^([\d.]+)\s*([KMG]?)/i); return m ? parseFloat(m[1]) * (SIZE_UNITS[(m[2] || "").toUpperCase()] || 1) : 0; };
  const permStr = (mode, dir) => { const r = ["---", "--x", "-w-", "-wx", "r--", "r-x", "rw-", "rwx"]; return (dir ? "d" : "-") + String(mode).split("").map((d) => r[Number(d)] || "---").join(""); };

  AK._termExt.push(function (T, cmds) {
    const abs = T.abs, lines = T.lines, pad = T.pad;
    const isFile = (p) => T.files[p] !== undefined;
    const modeOf = (p) => T.modes[p] || (T.isDir(p) && !isFile(p) ? "755" : "644");
    const ownerOf = (p) => T.owners[p] || "root";
    const canRead = (p) => {
      const m = T.modes[p]; if (!m || T.user === "root") return true;
      return (Number(ownerOf(p) === T.user ? m[0] : m[2]) & 4) !== 0;
    };
    const readFile = (f) => { const p = abs(f); if (!isFile(p)) return { err: f + ": No such file or directory" }; if (!canRead(p)) return { err: f + ": Permission denied" }; return { text: T.files[p] }; };
    const flagsOf = (a) => a.filter((x) => x[0] === "-" && x.length > 1 && !/^-\d+$/.test(x)).join("").replace(/-/g, "");
    const plain = (a) => a.filter((x) => !(x[0] === "-" && x.length > 1 && !/^-\d+$/.test(x)));
    const sub = (p, base) => (p === base ? [p] : []);

    cmds.help = () => "Commands: ls cd pwd cat head tail grep wc echo sort uniq cut awk tr find diff\n  ps top kill pkill ss netstat lsof df du free uptime date whoami\n  touch mkdir rm mv cp chmod chown sudo sed env export which history clear\n  systemctl journalctl crontab curl jq" + (T.gitSpec || (AK._termExt && T.git) ? "\n  git (init status add commit log diff branch switch merge restore reset revert stash tag show blame)" : "") + "\nPipes (|), chaining (; &&) and redirects (> >>) work. Nothing touches your real computer.";

    cmds.ls = (a) => {
      const fl = flagsOf(a), long = fl.includes("l"), all = fl.includes("a"), args = plain(a), targets = args.length ? args : ["."];
      const row = (p, name, dir) => long ? permStr(modeOf(p), dir) + " 1 " + pad(ownerOf(p), 7) + pad(ownerOf(p), 7) + String(dir ? 4096 : (T.files[p] || "").length).padStart(6) + " Nov 24 02:07 " + name : name + (dir ? "/" : "");
      const outs = [];
      targets.forEach((tg, ti) => {
        const p = abs(tg);
        if (isFile(p)) { outs.push(row(p, tg, false)); return; }
        if (!T.isDir(p)) { outs.push("ls: cannot access '" + tg + "': No such file or directory"); return; }
        const names = T.children(p).filter((c) => all || c[0] !== ".");
        const rows = names.map((c) => { const cp = (p === "/" ? "" : p) + "/" + c; return row(cp, c, T.isDir(cp) && !isFile(cp)); });
        if (targets.length > 1) outs.push((ti ? "\n" : "") + tg + ":");
        if (long && rows.length) outs.push("total " + rows.length * 4);
        outs.push(rows.join(long ? "\n" : "\n"));
      });
      return outs.filter((x) => x !== "").join("\n");
    };

    cmds.cat = (a, inp) => {
      if (!a.length) return inp || "";
      return a.map((f) => { const r = readFile(f); return r.err ? "cat: " + r.err : r.text.replace(/\n$/, ""); }).join("\n");
    };
    cmds.head = (a, inp) => ht(a, inp, true);
    cmds.tail = (a, inp) => ht(a, inp, false);
    function ht(a, inp, head) {
      let n = 10; const rest = [];
      for (let i = 0; i < a.length; i++) { if (a[i] === "-n") n = Number(a[++i]) || 10; else if (/^-\d+$/.test(a[i])) n = Number(a[i].slice(1)); else if (a[i][0] !== "-") rest.push(a[i]); }
      let text = inp || "";
      if (rest.length) { const r = readFile(rest[0]); if (r.err) return (head ? "head: " : "tail: ") + r.err; text = r.text; }
      const ls = lines(text); return (head ? ls.slice(0, n) : ls.slice(-n)).join("\n");
    }
    cmds.wc = (a, inp) => {
      const fl = flagsOf(a), f = plain(a)[0]; let text = inp || "";
      if (f) { const r = readFile(f); if (r.err) return "wc: " + r.err; text = r.text; }
      const n = fl.includes("w") ? text.split(/\s+/).filter(Boolean).length : fl.includes("c") ? text.length : lines(text).length;
      return String(n) + (f ? " " + f : "");
    };

    cmds.grep = (a, inp) => {
      const fl = flagsOf(a), rest = plain(a), pat = rest[0];
      if (pat === undefined) return "grep: missing pattern";
      let re; try { re = new RegExp(pat, fl.includes("i") ? "i" : ""); } catch (e) { re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), fl.includes("i") ? "i" : ""); }
      if (fl.includes("w")) re = new RegExp("\\b(?:" + re.source + ")\\b", re.flags);
      const inv = fl.includes("v"), files = rest.slice(1);
      const jobs = [];
      if (!files.length) jobs.push({ name: null, text: inp || "" });
      else files.forEach((f) => {
        const p = abs(f);
        if (T.isDir(p) && !isFile(p)) { if (fl.includes("r") || fl.includes("R")) Object.keys(T.files).filter((k) => k.startsWith(p + "/")).sort().forEach((k) => jobs.push({ name: k, text: T.files[k] })); else jobs.push({ err: "grep: " + f + ": Is a directory" }); return; }
        const r = readFile(f); if (r.err) jobs.push({ err: "grep: " + r.err }); else jobs.push({ name: files.length > 1 || fl.includes("r") ? (T.isDir(p) ? p : f) : null, text: r.text });
      });
      const out = [];
      jobs.forEach((j) => {
        if (j.err) { out.push(j.err); return; }
        const ls = lines(j.text), hits = [];
        ls.forEach((l, i) => { if (re.test(l) !== inv) hits.push((j.name ? j.name + ":" : "") + (fl.includes("n") ? (i + 1) + ":" : "") + l); });
        if (fl.includes("c")) out.push((j.name ? j.name + ":" : "") + hits.length); else if (fl.includes("l")) { if (hits.length) out.push(j.name || "(standard input)"); } else hits.forEach((h) => out.push(h));
      });
      return out.join("\n");
    };

    cmds.sort = (a, inp) => {
      const fl = flagsOf(a.filter((x, i) => x !== "-k" && x !== "-t" && a[i - 1] !== "-k" && a[i - 1] !== "-t")), args = plain(a.filter((x, i) => a[i - 1] !== "-k" && a[i - 1] !== "-t" && x !== "-k" && x !== "-t"));
      let key = 0, sep = null; for (let i = 0; i < a.length; i++) { if (a[i] === "-k") key = Number(a[i + 1]) || 0; if (a[i] === "-t") sep = a[i + 1]; }
      let text = inp || ""; if (args.length) { const r = readFile(args[0]); if (r.err) return "sort: " + r.err; text = r.text; }
      const kf = (l) => { if (!key) return l; const parts = sep ? l.split(sep) : l.trim().split(/\s+/); return parts[key - 1] || ""; };
      const num = fl.includes("n");
      let ls = lines(text).map((l, i) => ({ l: l, i: i, k: kf(l) }));
      ls.sort((x, y) => { const c = num ? (parseFloat(x.k) || 0) - (parseFloat(y.k) || 0) : x.k < y.k ? -1 : x.k > y.k ? 1 : 0; return (fl.includes("r") ? -c : c) || x.i - y.i; });
      let out = ls.map((x) => x.l);
      if (fl.includes("u")) out = out.filter((l, i) => i === 0 || l !== out[i - 1]);
      return out.join("\n");
    };
    cmds.uniq = (a, inp) => {
      const fl = flagsOf(a), args = plain(a); let text = inp || "";
      if (args.length) { const r = readFile(args[0]); if (r.err) return "uniq: " + r.err; text = r.text; }
      const out = []; lines(text).forEach((l) => { const last = out[out.length - 1]; if (last && last.l === l) last.n++; else out.push({ l: l, n: 1 }); });
      return out.map((x) => (fl.includes("c") ? String(x.n).padStart(7) + " " + x.l : x.l)).join("\n");
    };
    cmds.cut = (a, inp) => {
      let sep = "\t", f = "", file = null;
      for (let i = 0; i < a.length; i++) { if (a[i] === "-d") sep = a[++i]; else if (a[i].startsWith("-d") && a[i].length > 2) sep = a[i].slice(2); else if (a[i] === "-f") f = a[++i]; else if (a[i].startsWith("-f")) f = a[i].slice(2); else if (a[i][0] !== "-") file = a[i]; }
      let text = inp || ""; if (file) { const r = readFile(file); if (r.err) return "cut: " + r.err; text = r.text; }
      const idx = f.split(",").map((x) => Number(x) - 1).filter((x) => x >= 0);
      if (!idx.length) return "cut: you must specify a list of fields (-f)";
      return lines(text).map((l) => { const p = l.split(sep); return idx.map((i) => p[i]).filter((x) => x !== undefined).join(sep); }).join("\n");
    };
    cmds.tr = (a, inp) => {
      const del = a.includes("-d"), args = a.filter((x) => x !== "-d"), ex = (s) => s.replace(/(.)-(.)/g, (m, x, y) => { let r = ""; for (let c = x.charCodeAt(0); c <= y.charCodeAt(0); c++) r += String.fromCharCode(c); return r; }).replace(/\\n/g, "\n");
      const from = ex(args[0] || ""), to = ex(args[1] || "");
      return String(inp || "").split("").map((c) => { const i = from.indexOf(c); if (i < 0) return c; return del ? "" : (to[Math.min(i, to.length - 1)] || ""); }).join("");
    };
    cmds.awk = (a, inp) => {
      let sep = /\s+/, prog = null, file = null;
      for (let i = 0; i < a.length; i++) { if (a[i] === "-F") sep = a[++i]; else if (a[i].startsWith("-F")) sep = a[i].slice(2); else if (prog === null) prog = a[i]; else file = a[i]; }
      if (prog === null) return "awk: missing program";
      let text = inp || ""; if (file) { const r = readFile(file); if (r.err) return "awk: " + r.err; text = r.text; }
      const split = (l) => (typeof sep === "string" ? l.split(sep) : l.trim().split(sep));
      const sum = prog.match(/^\s*\{\s*(\w+)\s*\+=\s*\$(\d+)\s*\}\s*END\s*\{\s*print\s+(\w+)\s*\}\s*$/);
      if (sum) { let t = 0; lines(text).forEach((l) => { t += parseFloat(split(l)[Number(sum[2]) - 1]) || 0; }); return String(t); }
      if (/^\s*END\s*\{\s*print\s+NR\s*\}\s*$/.test(prog)) return String(lines(text).length);
      const m = prog.match(/^\s*(.*?)\s*\{\s*print\s*(.*?)\s*\}\s*$/);
      if (!m) return "awk: only { print $N } programs (with an optional condition) are supported here";
      const cond = m[1], items = m[2] ? m[2].split(",") : ["$0"];
      const fieldVal = (f, tok) => (tok === "$0" ? f.line : tok === "$NF" ? f.parts[f.parts.length - 1] || "" : tok[0] === "$" ? f.parts[Number(tok.slice(1)) - 1] || "" : tok.replace(/^"|"$/g, ""));
      const test = (f) => {
        if (!cond) return true; let c;
        if ((c = cond.match(/^\/(.*)\/$/))) return new RegExp(c[1]).test(f.line);
        if ((c = cond.match(/^(\$\d+|\$NF)\s*(==|!=|>=|<=|>|<|~)\s*(.+)$/))) {
          const l = fieldVal(f, c[1]); let r = c[3].trim();
          if (c[2] === "~") return new RegExp(r.replace(/^\/|\/$|^"|"$/g, "")).test(l);
          r = r.replace(/^"|"$/g, ""); const ln = parseFloat(l), rn = parseFloat(r), numeric = !isNaN(ln) && !isNaN(rn) && /^[\d.\-]+$/.test(r);
          const x = numeric ? ln : l, y = numeric ? rn : r;
          return c[2] === "==" ? x === y : c[2] === "!=" ? x !== y : c[2] === ">=" ? x >= y : c[2] === "<=" ? x <= y : c[2] === ">" ? x > y : x < y;
        }
        return true;
      };
      return lines(text).map((l) => ({ line: l, parts: split(l) })).filter(test).map((f) => items.map((it) => (it.match(/\$NF|\$\d+|"[^"]*"/g) || ["$0"]).map((tok) => fieldVal(f, tok)).join("")).join(" ")).join("\n");
    };

    cmds.find = (a) => {
      const args = a.slice(), start = abs(args[0] && args[0][0] !== "-" ? args.shift() : ".");
      let name = null, type = null, size = null;
      for (let i = 0; i < args.length; i++) { if (args[i] === "-name" || args[i] === "-iname") name = args[++i]; else if (args[i] === "-type") type = args[++i]; else if (args[i] === "-size") size = args[++i]; }
      const re = name ? new RegExp("^" + name.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$") : null;
      const all = Object.keys(T.files).concat(Object.keys(T.sizes)).filter((p, i, arr) => arr.indexOf(p) === i && (p === start || p.startsWith((start === "/" ? "" : start) + "/")));
      const dirs = {}; all.forEach((p) => { let d = p; while (d.length > 1 && (d = d.slice(0, d.lastIndexOf("/")) || "/")) { if (d === start || d.startsWith(start === "/" ? "/" : start + "/")) dirs[d] = 1; if (d === "/") break; } });
      const cand = all.map((p) => ({ p: p, dir: false })).concat(Object.keys(dirs).filter((d) => !all.includes(d)).map((d) => ({ p: d, dir: true })));
      const szOk = (p) => { if (!size) return true; const m = size.match(/^([+-]?)(\d+(?:\.\d+)?)([KMG]?)/i); if (!m) return true; const lim = parseFloat(m[2]) * (SIZE_UNITS[m[3].toUpperCase()] || 1), have = T.sizes[p] ? parseSize(T.sizes[p]) : (T.files[p] || "").length; return m[1] === "+" ? have > lim : m[1] === "-" ? have < lim : have >= lim; };
      return cand.filter((c) => (!type || (type === "d") === c.dir) && (!re || re.test(c.p.slice(c.p.lastIndexOf("/") + 1))) && (!size || (!c.dir && szOk(c.p)))).map((c) => c.p).sort().join("\n");
    };

    cmds.touch = (a) => { plain(a).forEach((f) => { const p = abs(f); if (!isFile(p)) T.files[p] = ""; }); return ""; };
    cmds.mkdir = (a) => { plain(a).forEach((f) => { const p = abs(f); if (!T.dirs.includes(p)) T.dirs.push(p); }); return ""; };
    cmds.rm = (a) => {
      const fl = flagsOf(a), rec = fl.includes("r") || fl.includes("R"), out = [];
      plain(a).forEach((f) => {
        const p = abs(f);
        if (isFile(p)) { delete T.files[p]; delete T.sizes[p]; return; }
        if (T.isDir(p)) { if (!rec) { out.push("rm: cannot remove '" + f + "': Is a directory"); return; } Object.keys(T.files).concat(Object.keys(T.sizes)).forEach((k) => { if (k === p || k.startsWith(p + "/")) { delete T.files[k]; delete T.sizes[k]; } }); T.dirs = T.dirs.filter((d) => d !== p && !d.startsWith(p + "/")); return; }
        if (!fl.includes("f")) out.push("rm: cannot remove '" + f + "': No such file or directory");
      });
      return out.join("\n");
    };
    const dest = (src, to) => { const d = abs(to); return T.isDir(d) && !isFile(d) ? d + "/" + src.slice(src.lastIndexOf("/") + 1) : d; };
    cmds.mv = (a) => { const r = plain(a); if (r.length < 2) return "mv: missing destination file operand"; const p = abs(r[0]); if (!isFile(p)) return "mv: cannot stat '" + r[0] + "': No such file or directory"; const d = dest(p, r[1]); T.files[d] = T.files[p]; delete T.files[p]; if (T.modes[p]) { T.modes[d] = T.modes[p]; delete T.modes[p]; } return ""; };
    cmds.cp = (a) => { const r = plain(a); if (r.length < 2) return "cp: missing destination file operand"; const p = abs(r[0]); if (!isFile(p)) return "cp: cannot stat '" + r[0] + "': No such file or directory"; T.files[dest(p, r[1])] = T.files[p]; return ""; };

    const applyMode = (cur, spec) => {
      if (/^[0-7]{3}$/.test(spec)) return spec;
      const m = spec.match(/^([ugoa]*)([+\-=])([rwx]+)$/); if (!m) return null;
      const who = m[1] || "a", bits = m[3].split("").reduce((n, c) => n + (c === "r" ? 4 : c === "w" ? 2 : 1), 0), d = cur.split("").map(Number);
      ["u", "g", "o"].forEach((c, i) => { if (who.includes("a") || who.includes(c)) d[i] = m[2] === "+" ? d[i] | bits : m[2] === "-" ? d[i] & ~bits : bits; });
      return d.join("");
    };
    cmds.chmod = (a) => {
      const r = plain(a), fl = flagsOf(a); if (r.length < 2) return "chmod: missing operand";
      const out = [];
      r.slice(1).forEach((f) => {
        const p = abs(f); if (!isFile(p) && !T.isDir(p)) { out.push("chmod: cannot access '" + f + "': No such file or directory"); return; }
        const targets = [p]; if (fl.includes("R")) Object.keys(T.files).filter((k) => k.startsWith(p + "/")).forEach((k) => targets.push(k));
        targets.forEach((q) => { const nm = applyMode(modeOf(q), r[0]); if (nm === null) { out.push("chmod: invalid mode: '" + r[0] + "'"); return; } T.modes[q] = nm; });
      });
      return out.join("\n");
    };
    cmds.chown = (a) => {
      const r = plain(a), fl = flagsOf(a); if (r.length < 2) return "chown: missing operand";
      const user = r[0].split(":")[0];
      r.slice(1).forEach((f) => { const p = abs(f); const ts = [p]; if (fl.includes("R")) Object.keys(T.files).filter((k) => k.startsWith(p + "/")).forEach((k) => ts.push(k)); ts.forEach((q) => { T.owners[q] = user; }); });
      return "";
    };
    cmds.whoami = () => T.user;
    cmds.date = () => T.date;
    cmds.uptime = () => " 02:07:31 up 41 days,  3:12,  1 user,  load average: " + T.load;
    cmds.free = () => {
      const m = T.mem || { total: 7982, used: 1210, free: 5120, swapTotal: 2047, swapUsed: 0 };
      return "              total        used        free\nMem:   " + pad(m.total, 12) + pad(m.used, 12) + m.free + "\nSwap:  " + pad(m.swapTotal, 12) + pad(m.swapUsed, 12) + (m.swapTotal - m.swapUsed);
    };
    cmds.env = () => Object.keys(T.env).sort().map((k) => k + "=" + T.env[k]).join("\n");
    cmds.printenv = (a) => (a[0] ? (T.env[a[0]] !== undefined ? T.env[a[0]] : "") : cmds.env());
    cmds["export"] = (a) => { a.forEach((x) => { const i = x.indexOf("="); if (i > 0) T.env[x.slice(0, i)] = x.slice(i + 1); }); return ""; };
    const baseEcho = cmds.echo;
    cmds.echo = (a) => { if (a[0] === "-n") { T._noNl = true; a = a.slice(1); } return baseEcho(a.map((w) => w.replace(/\$\{?(\w+)\}?/g, (m, k) => (T.env[k] !== undefined ? T.env[k] : "")))); };
    cmds.which = (a) => (a[0] && cmds[a[0]] ? "/usr/bin/" + a[0] : "");
    cmds.pkill = (a) => { const n = plain(a)[0]; const before = T.procs.length; T.procs = T.procs.filter((p) => p.name !== n); return before === T.procs.length ? "" : ""; };
    cmds.killall = cmds.pkill;
    cmds.pgrep = (a) => T.procs.filter((p) => p.name === plain(a)[0]).map((p) => p.pid).join("\n");
    cmds.sudo = (a) => { if (!a.length) return "usage: sudo COMMAND"; const prev = T.user; T.user = "root"; const hl = T.history.length; const r = T.exec(a.join(" ")); T.history.length = hl; T.user = prev; return r.out; };
    cmds.diff = (a) => {
      const r = plain(a); if (r.length < 2) return "diff: missing operand";
      const x = readFile(r[0]), y = readFile(r[1]); if (x.err) return "diff: " + x.err; if (y.err) return "diff: " + y.err;
      const ops = AK.lineDiff(lines(x.text), lines(y.text)).filter((o) => o.t !== " ");
      return ops.length ? "--- " + r[0] + "\n+++ " + r[1] + "\n" + ops.map((o) => o.t + o.s).join("\n") : "";
    };

    /* ---- conditions shared by services, curl and mission tests */
    const listening = (port) => T.procs.some((p) => p.port === port);
    T.cond = function (c) {
      if (c.file !== undefined) {
        const p = abs(c.file), has = isFile(p), txt = T.files[p] || "";
        if (c.exists !== undefined) return has === c.exists;
        if (c.contains !== undefined) return has && txt.includes(c.contains);
        if (c.notContains !== undefined) return has && !txt.includes(c.notContains);
        if (c.matches !== undefined) return has && new RegExp(c.matches, "m").test(txt);
        if (c.noMatch !== undefined) return has && !new RegExp(c.noMatch, "m").test(txt);
        return has;
      }
      if (c.port !== undefined) return c.free ? !listening(c.port) : listening(c.port);
      if (c.mode) return modeOf(abs(c.mode.path)) === c.mode.value;
      if (c.owner) return ownerOf(abs(c.owner.path)) === c.owner.user;
      if (c.service) return (T.services[c.service] || {}).state === c.state;
      if (c.proc) return T.procs.some((p) => p.name === c.proc) === (c.running !== false);
      return true;
    };
    const svcName = (n) => String(n || "").replace(/\.service$/, "");
    const nowStamp = () => "Nov 24 02:08:" + String(10 + (T.journalTick = (T.journalTick || 0) + 1)).padStart(2, "0");
    const jpush = (unit, line) => { (T.journal[unit] = T.journal[unit] || []).push(line); };
    cmds.systemctl = (a) => {
      const r = plain(a), act = r[0], name = svcName(r[1]), sv = T.services[name];
      if (!act) return "systemctl: missing command";
      if (act === "daemon-reload") return "";
      if (act === "list-units" || act === "list-unit-files") return Object.keys(T.services).sort().map((k) => pad(k + ".service", 22) + pad(T.services[k].state === "active" ? "loaded active running" : "loaded " + T.services[k].state, 26) + (T.services[k].desc || "")).join("\n");
      if (!sv) return "Unit " + name + ".service could not be found.";
      if (act === "status") {
        const act2 = sv.state === "active", lg = (T.journal[name] || []).slice(-4);
        return "● " + name + ".service - " + (sv.desc || name) + "\n     Loaded: loaded (/etc/systemd/system/" + name + ".service; enabled)\n     Active: " + (act2 ? "active (running)" : sv.state === "failed" ? "failed (Result: exit-code)" : "inactive (dead)") + (lg.length ? "\n\n" + lg.join("\n") : "");
      }
      if (act === "is-active") return sv.state;
      if (act === "enable" || act === "disable") return "";
      if (act === "stop") { sv.state = "inactive"; T.procs = T.procs.filter((p) => p.name !== (sv.proc || name)); return ""; }
      if (act === "start" || act === "restart" || act === "reload") {
        if (act === "restart" || act === "reload") T.procs = T.procs.filter((p) => p.name !== (sv.proc || name));
        const bad = (sv.needs || []).find((c) => !T.cond(c));
        if (bad) { sv.state = "failed"; jpush(name, nowStamp() + " host " + name + "[" + (3000 + (T.journalTick || 0)) + "]: " + (bad.msg || "failed to start")); jpush(name, nowStamp() + " host systemd[1]: " + name + ".service: Failed with result 'exit-code'."); return "Job for " + name + ".service failed because the control process exited with error code.\nSee \"systemctl status " + name + ".service\" and \"journalctl -xeu " + name + ".service\" for details."; }
        sv.state = "active"; jpush(name, nowStamp() + " host systemd[1]: Started " + (sv.desc || name) + ".");
        if (sv.port || sv.proc) T.procs.push({ pid: 4000 + Object.keys(T.services).indexOf(name) * 10 + (T.journalTick || 0), name: sv.proc || name, port: sv.port, user: sv.user || "root", cpu: 0.2, mem: 0.6 });
        return "";
      }
      return "systemctl: unknown command '" + act + "'";
    };
    cmds.journalctl = (a) => {
      let unit = null, n = null, pri = false;
      for (let i = 0; i < a.length; i++) { if (a[i] === "-u") unit = svcName(a[++i]); else if (a[i] === "-n") n = Number(a[++i]); else if (a[i] === "-p") { pri = true; i++; } else if (a[i] === "-xeu") unit = svcName(a[++i]); }
      let ls = unit ? (T.journal[unit] || []) : Object.keys(T.journal).reduce((acc, k) => acc.concat(T.journal[k]), []);
      if (unit && !T.journal[unit]) return "-- No entries --";
      if (pri) ls = ls.filter((l) => /err|fail|fatal|emerg|denied|killed|oom|panic/i.test(l));
      if (n) ls = ls.slice(-n);
      return ls.join("\n");
    };
    cmds.crontab = (a) => { if (!a.includes("-l")) return "crontab: use -l to list (edit the file with sed)"; const p = "/var/spool/cron/crontabs/" + T.user; return isFile(p) ? T.files[p].replace(/\n$/, "") : "no crontab for " + T.user; };

    /* curl against rule-based fake endpoints. A spec is a string, {status, body, headers}, {cases:[{if,status,body}], default},
       or {routes:[{method, auth, header:{Name:"part"}, bodyHas, query, status, body, headers}], default}. */
    T.reqLog = [];
    const REASON = { 200: "OK", 201: "Created", 202: "Accepted", 204: "No Content", 301: "Moved Permanently", 302: "Found", 304: "Not Modified", 307: "Temporary Redirect", 308: "Permanent Redirect", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 409: "Conflict", 415: "Unsupported Media Type", 422: "Unprocessable Entity", 429: "Too Many Requests", 500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout" };
    T.reason = (c) => REASON[c] || "Status";
    const stripUrl = (u) => String(u).replace(/^https?:\/\//, "").replace(/\/$/, "");
    T.httpFor = function (url, req) {
      req = req || { method: "GET", headers: {}, body: "" };
      const full = stripUrl(url), qi = full.indexOf("?"), path = qi < 0 ? full : full.slice(0, qi), query = qi < 0 ? "" : full.slice(qi + 1);
      const hit = Object.keys(T.http).find((k) => stripUrl(k) === full) || Object.keys(T.http).find((k) => stripUrl(k) === path);
      if (hit === undefined) return null;
      let spec = T.http[hit];
      if (typeof spec === "string") return { status: 200, body: spec, headers: {} };
      if (Array.isArray(spec.cases)) { const c = spec.cases.find((x) => (x.if || []).every((cd) => T.cond(cd))); spec = c || spec.default || { status: 503, body: "Service Unavailable" }; }
      else if (Array.isArray(spec.routes)) {
        const lower = {}; Object.keys(req.headers || {}).forEach((k) => (lower[k.toLowerCase()] = req.headers[k]));
        const r = spec.routes.find((x) => (!x.method || x.method === (req.method === "HEAD" ? "GET" : req.method)) && (x.auth === undefined || lower.authorization === x.auth) &&
          Object.keys(x.header || {}).every((h) => (lower[h.toLowerCase()] || "").toLowerCase().includes(String(x.header[h]).toLowerCase())) &&
          (x.bodyHas === undefined || String(req.body || "").includes(x.bodyHas)) && (x.query === undefined || query.includes(x.query)) && (x.noAuth !== true || !lower.authorization));
        spec = r || spec.default || { status: 405, body: "Method Not Allowed" };
      }
      const headers = Object.assign({}, spec.headers || {}); if (spec.redirect) headers.Location = spec.redirect;
      return { status: spec.status || 200, body: spec.body === undefined ? "" : spec.body, headers: headers };
    };
    const ctype = (b) => (/^\s*[\[{]/.test(b) ? "application/json" : "text/plain");
    const parseCurl = (a) => {
      const o = { method: null, headers: {}, data: null, out: null, fmt: null, flags: {}, url: null, user: null };
      for (let i = 0; i < a.length; i++) {
        const x = a[i];
        if (x === "-X" || x === "--request") o.method = String(a[++i] || "").toUpperCase();
        else if (x === "-H" || x === "--header") { const h = String(a[++i] || ""), k = h.indexOf(":"); if (k > 0) o.headers[h.slice(0, k).trim()] = h.slice(k + 1).trim(); }
        else if (x === "-d" || x === "--data" || x === "--data-raw") o.data = (o.data === null ? "" : o.data + "&") + String(a[++i] || "");
        else if (x === "-o" || x === "--output") o.out = a[++i];
        else if (x === "-w" || x === "--write-out") o.fmt = String(a[++i] || "");
        else if (x === "-u" || x === "--user") o.user = a[++i];
        else if (x === "--max-time" || x === "-m" || x === "--retry") i++;
        else if (x === "--json") { o.data = String(a[++i] || ""); o.headers["Content-Type"] = "application/json"; o.headers.Accept = "application/json"; }
        else if (x[0] === "-" && x.length > 1) x.replace(/^-+/, "").split("").forEach((c) => (o.flags[c] = true));
        else if (!o.url) o.url = x;
      }
      return o;
    };
    cmds.curl = (a) => {
      const o = parseCurl(a), fl = o.flags; let url = o.url; if (!url) return "curl: try 'curl --help' for more information";
      let method = o.method || (fl.I ? "HEAD" : o.data !== null ? "POST" : "GET"), hops = 0, r, shown = "";
      const headers = Object.assign({}, o.headers); if (o.user) headers.Authorization = "Basic " + btoa(o.user);
      if (o.data !== null && !Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) headers["Content-Type"] = "application/x-www-form-urlencoded";
      for (;;) {
        const req = { method: method, headers: headers, body: o.data || "" };
        r = T.httpFor(url, req);
        if (!r) { const port = (String(url).match(/:(\d+)/) || [])[1]; return port && listening(Number(port)) ? "" : "curl: (7) Failed to connect to " + String(url).replace(/^https?:\/\//, "").split("/")[0].replace(":", " port ") + ": Connection refused"; }
        T.reqLog.push({ method: method, url: String(url), headers: Object.assign({}, headers), body: o.data || "", status: r.status });
        if (fl.v) { const hostp = stripUrl(url); shown += "> " + method + " /" + hostp.split("/").slice(1).join("/") + " HTTP/1.1\n> Host: " + hostp.split("/")[0] + "\n> User-Agent: curl/8.5.0\n> Accept: */*\n" + Object.keys(headers).map((k) => "> " + k + ": " + headers[k] + "\n").join("") + ">\n"; }
        const loc = r.headers.Location;
        if (fl.L && loc && r.status >= 300 && r.status < 400 && hops < 5) { shown += fl.v || fl.i ? "HTTP/1.1 " + r.status + " " + T.reason(r.status) + "\n" + Object.keys(r.headers).map((k) => k + ": " + r.headers[k]).join("\n") + "\n\n" : ""; url = /^https?:/.test(loc) ? loc : String(url).replace(/^(https?:\/\/[^/]+).*$/, "$1") + loc; if (r.status === 303 || ((r.status === 301 || r.status === 302) && method === "POST")) method = "GET"; hops++; continue; }
        break;
      }
      const hd = Object.assign({ "Content-Type": ctype(r.body), "Content-Length": String(String(r.body).length) }, r.headers);
      const head = "HTTP/1.1 " + r.status + " " + T.reason(r.status) + "\n" + Object.keys(hd).map((k) => k + ": " + hd[k]).join("\n") + "\n";
      let out = "";
      if (fl.I) out = head;
      else {
        if (fl.v) out += shown + "< " + head.replace(/\n(?=.)/g, "\n< ").replace(/\n$/, "\n") + "<\n";
        else out += shown;
        if (fl.i) out += head + "\n";
        if (o.out) { if (o.out !== "/dev/null") T.files[abs(o.out)] = String(r.body) + "\n"; } else out += r.body;
      }
      if (o.fmt !== null) out += (out && !/\n$/.test(out) ? "\n" : "") + o.fmt.replace(/%\{http_code\}/g, String(r.status)).replace(/\\n/g, "\n");
      if (fl.f && r.status >= 400) return "curl: (22) The requested URL returned error: " + r.status;
      return out.replace(/\n$/, "");
    };

    /* jq: a small subset (paths, [], pipes, length, keys, -r, -c) so API missions can read JSON from curl */
    cmds.jq = (a, inp) => {
      const fl = flagsOf(a), args = plain(a), filter = args[0] || ".", file = args[1];
      let src = inp; if (file) { const r = readFile(file); if (r.err) return "jq: error: Could not open " + r.err; src = r.text; }
      let data; try { data = JSON.parse(src); } catch (e) { return "jq: error (at <stdin>:0): Cannot parse input as JSON"; }
      const step = (vals, st) => {
        st = st.trim(); const out = [];
        vals.forEach((v) => {
          if (st === "length") out.push(v === null ? 0 : typeof v === "object" ? (Array.isArray(v) ? v.length : Object.keys(v).length) : String(v).length);
          else if (st === "keys") out.push(Object.keys(v).sort());
          else if (st === ".") out.push(v);
          else {
            let cur = [v]; const re = /\.([A-Za-z_][\w-]*)|\.?\[(\d+)\]|\.?\[\]|\."([^"]+)"/g; let m, used = 0;
            while ((m = re.exec(st)) !== null) {
              used += m[0].length; const next = [];
              cur.forEach((c) => {
                if (m[1] !== undefined || m[3] !== undefined) { const k = m[1] !== undefined ? m[1] : m[3]; next.push(c && typeof c === "object" && k in c ? c[k] : null); }
                else if (m[2] !== undefined) next.push(Array.isArray(c) ? (c[Number(m[2])] === undefined ? null : c[Number(m[2])]) : null);
                else if (Array.isArray(c)) c.forEach((x) => next.push(x)); else if (c && typeof c === "object") Object.keys(c).forEach((k) => next.push(c[k]));
              });
              cur = next;
            }
            if (used !== st.length) throw new Error("jq: error: syntax error in filter: " + st);
            cur.forEach((x) => out.push(x));
          }
        });
        return out;
      };
      let res; try { res = filter.split("|").reduce((vals, st) => step(vals, st), [data]); } catch (e) { return e.message; }
      return res.map((v) => (fl.includes("r") && typeof v === "string" ? v : fl.includes("c") ? JSON.stringify(v) : JSON.stringify(v, null, 2))).join("\n");
    };
    void sub;
  });

  /* Extra mission test kinds */
  AK.termTest = function (t, T) {
    const abs = T.abs;
    switch (t.kind) {
      case "service-state": return (T.services[t.name] || {}).state === t.state;
      case "file-mode": return (T.modes[abs(t.path)] || "644") === t.mode;
      case "file-owner": return (T.owners[abs(t.path)] || "root") === t.user;
      case "file-exists": return T.files[abs(t.path)] !== undefined;
      case "file-missing": return T.files[abs(t.path)] === undefined;
      case "file-equals": return (T.files[abs(t.path)] || "").trim() === String(t.text).trim();
      case "file-regex": return new RegExp(t.pattern, "m").test(T.files[abs(t.path)] || "");
      case "req-made": return T.reqLog.some((q) => (!t.method || q.method === t.method) && (!t.url || q.url.includes(t.url)) && (t.status === undefined || q.status === t.status) && Object.keys(t.header || {}).every((h) => { const k = Object.keys(q.headers).find((x) => x.toLowerCase() === h.toLowerCase()); return k && q.headers[k].toLowerCase().includes(String(t.header[h]).toLowerCase()); }) && (t.bodyHas === undefined || q.body.includes(t.bodyHas)));
      case "curl-ok": { const r = T.httpFor(t.url); return !!r && r.status === (t.status || 200) && (t.contains === undefined || r.body.includes(t.contains)); }
      case "cond": return T.cond(t.cond);
      case "history-has": return T.history.some((h) => h.includes(t.text));
      case "git": return AK.gitCheck ? AK.gitCheck(T, t) : false;
      default: return false;
    }
  };
})(typeof self !== "undefined" ? self : globalThis);

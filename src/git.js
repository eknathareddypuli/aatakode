/* AataKode git simulator: a small, honest model of git inside the practice terminal.
   Commits are whole-file snapshots; merges work line by line. No network commands.
   Registers an extension for createTerminal(); mission tests use {kind:"git", check:...}. */
(function (root) {
  "use strict";
  const AK = typeof module !== "undefined" && module.exports ? require("./engine.js") : root.AK;
  AK._termExt = AK._termExt || [];

  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dateOf = (tick) => { const d = new Date(Date.UTC(2026, 10, 10, 9, 0, 0) + tick * 5820000), p = (n) => String(n).padStart(2, "0"); return DAYS[d.getUTCDay()] + " " + MONTHS[d.getUTCMonth()] + " " + d.getUTCDate() + " " + p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + ":00 2026 +0000"; };
  const djb = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h; };
  const MARK = "<<<<<<<";

  AK._termExt.push(function (T, cmds) {
    const abs = T.abs, lines = T.lines;
    let G = null;
    const need = () => (G ? null : "fatal: not a git repository (or any of the parent directories): .git");
    const inRepo = (p) => G && (p === G.root || p.startsWith(G.root + "/"));
    const rel = (p) => (p === G.root ? "" : p.slice(G.root.length + 1));
    const work = () => { const w = {}; Object.keys(T.files).forEach((p) => { if (p.startsWith(G.root + "/")) w[rel(p)] = T.files[p]; }); return w; };
    const setWork = (path, c) => { const p = G.root + "/" + path; if (c === null || c === undefined) delete T.files[p]; else T.files[p] = c; };
    const copy = (o) => Object.assign({}, o);
    const tipOf = (b) => G.branches[b];
    const headId = () => (G.detached ? G.detached : G.branches[G.head] || null);
    const headTree = () => (headId() ? G.commits[headId()].tree : {});
    const short = (id) => id.slice(0, 7);
    const userStr = () => G.user.name + " <" + G.user.email + ">";

    function newCommit(tree, parents, msg, author) {
      G.tick++;
      let id = (djb(JSON.stringify([tree, parents, msg, G.tick])).toString(16).padStart(8, "0") + djb(msg + G.tick).toString(16).padStart(8, "0")).slice(0, 7), n = 0;
      while (G.commits[id]) id = (djb(id + ++n).toString(16).padStart(8, "0")).slice(0, 7);
      G.commits[id] = { id: id, parents: parents, msg: msg, tree: copy(tree), author: author || userStr(), time: G.tick };
      return id;
    }
    function moveHead(id, why) {
      if (G.detached) G.detached = id; else G.branches[G.head] = id;
      G.reflog.unshift({ id: id, msg: why });
    }
    function ancestors(id) { const seen = {}, st = [id]; while (st.length) { const c = st.pop(); if (!c || seen[c]) continue; seen[c] = true; G.commits[c].parents.forEach((p) => st.push(p)); } return seen; }
    const isAncestor = (a, b) => !!ancestors(b)[a];
    function mergeBase(a, b) {
      const A = ancestors(a), common = Object.keys(ancestors(b)).filter((x) => A[x]);
      common.sort((x, y) => G.commits[y].time - G.commits[x].time); return common[0] || null;
    }
    function resolve(rev) {
      if (!rev) return null;
      let m = String(rev).match(/^(.*?)((?:~\d+|\^\d*)*)$/); if (!m) return null;
      let base = m[1] || "HEAD", suffix = m[2], id = null, rl = base.match(/^HEAD@\{(\d+)\}$/);
      if (rl) id = (G.reflog[Number(rl[1])] || {}).id || null;
      else if (base === "HEAD") id = headId();
      else if (G.branches[base]) id = G.branches[base];
      else if (G.tags[base]) id = G.tags[base];
      else { const ids = Object.keys(G.commits).filter((c) => c.startsWith(base)); if (base.length >= 4 && ids.length === 1) id = ids[0]; }
      if (!id) return null;
      (suffix.match(/~\d+|\^\d*/g) || []).forEach((sx) => {
        if (!id) return;
        if (sx[0] === "~") { for (let i = 0; i < Number(sx.slice(1)); i++) id = id && G.commits[id].parents[0] || null; }
        else id = G.commits[id].parents[Number(sx.slice(1) || 1) - 1] || null;
      });
      return id;
    }
    const changesBetween = (a, b) => {
      const out = []; Object.keys(b).sort().forEach((p) => { if (!(p in a)) out.push({ path: p, kind: "new file" }); else if (a[p] !== b[p]) out.push({ path: p, kind: "modified" }); });
      Object.keys(a).sort().forEach((p) => { if (!(p in b)) out.push({ path: p, kind: "deleted" }); });
      return out.sort((x, y) => (x.path < y.path ? -1 : 1));
    };
    function status() {
      const w = work(), h = headTree(), idx = G.index;
      const staged = changesBetween(h, idx), unstaged = [], untracked = [];
      Object.keys(idx).sort().forEach((p) => { if (!(p in w)) unstaged.push({ path: p, kind: "deleted" }); else if (w[p] !== idx[p]) unstaged.push({ path: p, kind: "modified" }); });
      Object.keys(w).sort().forEach((p) => { if (!(p in idx)) untracked.push(p); });
      const unmerged = G.merging ? G.merging.conflicts.filter((p) => !G.merging.resolved[p]) : [];
      return { staged: staged.filter((c) => unmerged.indexOf(c.path) < 0), unstaged: unstaged.filter((c) => unmerged.indexOf(c.path) < 0), untracked: untracked, unmerged: unmerged };
    }
    const isClean = (st) => !st.staged.length && !st.unstaged.length && !st.untracked.length && !st.unmerged.length;

    /* ---- diff output */
    function diffText(path, a, b) {
      const al = a === null ? [] : lines(a), bl = b === null ? [] : lines(b);
      const ops = AK.lineDiff(al, bl), out = ["diff --git a/" + path + " b/" + path];
      if (a === null) out.push("new file mode 100644"); if (b === null) out.push("deleted file mode 100644");
      out.push("--- " + (a === null ? "/dev/null" : "a/" + path), "+++ " + (b === null ? "/dev/null" : "b/" + path));
      const keep = ops.map(() => false); ops.forEach((o, i) => { if (o.t !== " ") for (let k = Math.max(0, i - 2); k <= Math.min(ops.length - 1, i + 2); k++) keep[k] = true; });
      let i = 0, ol = 1, nl = 1;
      while (i < ops.length) {
        if (!keep[i]) { if (ops[i].t !== "+") ol++; if (ops[i].t !== "-") nl++; i++; continue; }
        const start = i, so = ol, sn = nl; let cnt = 0, co = 0, cn = 0; const body = [];
        while (i < ops.length && keep[i]) { body.push(ops[i].t + ops[i].s); if (ops[i].t !== "+") { ol++; co++; } if (ops[i].t !== "-") { nl++; cn++; } i++; cnt++; }
        out.push("@@ -" + so + "," + co + " +" + sn + "," + cn + " @@"); body.forEach((l) => out.push(l)); void start; void cnt;
      }
      return out.join("\n");
    }
    function treeDiff(a, b, only) {
      return changesBetween(a, b).filter((c) => !only || only.some((o) => c.path === o || c.path.startsWith(o + "/"))).map((c) => diffText(c.path, c.kind === "new file" ? null : a[c.path], c.kind === "deleted" ? null : b[c.path])).join("\n");
    }
    const relPaths = (args) => args.map((a) => { const p = abs(a); return inRepo(p) ? rel(p) : null; }).filter((x) => x !== null);

    /* ---- checkout machinery */
    function dirtyBlock(target) {
      const w = work(), h = headTree(), bad = [];
      Object.keys(Object.assign({}, h, target)).forEach((p) => {
        if (h[p] === target[p]) return;
        const staged = G.index[p] !== h[p], modified = (p in w ? w[p] : undefined) !== (p in G.index ? G.index[p] : undefined);
        if ((staged || modified) && p in G.index) bad.push(p);
      });
      return bad;
    }
    function applyTree(target) {
      const h = headTree();
      Object.keys(h).forEach((p) => { if (!(p in target)) setWork(p, null); });
      Object.keys(target).forEach((p) => setWork(p, target[p]));
      G.index = copy(target);
    }
    function labelDecor(id) {
      const refs = [];
      if (headId() === id) refs.push(G.detached ? "HEAD" : "HEAD -> " + G.head);
      Object.keys(G.branches).sort().forEach((b) => { if (G.branches[b] === id && !(headId() === id && !G.detached && b === G.head)) refs.push(b); });
      Object.keys(G.tags).sort().forEach((t2) => { if (G.tags[t2] === id) refs.push("tag: " + t2); });
      return refs.length ? " (" + refs.join(", ") + ")" : "";
    }

    function merge3(base, ours, theirs, name) {
      if (ours === theirs) return { text: ours };
      if (ours === base) return { text: theirs };
      if (theirs === base) return { text: ours };
      const b = lines(base || ""), o = lines(ours), t = lines(theirs), blocks = [];
      if (b.length === o.length && o.length === t.length) {
        const out = []; let conf = false, cur = null;
        for (let i = 0; i < b.length; i++) {
          if (o[i] === t[i]) { if (cur) { out.push(MARK + " HEAD", cur.o.join("\n"), "=======", cur.t.join("\n"), ">>>>>>> " + name); cur = null; } out.push(o[i]); }
          else if (o[i] === b[i]) { if (cur) { out.push(MARK + " HEAD", cur.o.join("\n"), "=======", cur.t.join("\n"), ">>>>>>> " + name); cur = null; } out.push(t[i]); }
          else if (t[i] === b[i]) { if (cur) { out.push(MARK + " HEAD", cur.o.join("\n"), "=======", cur.t.join("\n"), ">>>>>>> " + name); cur = null; } out.push(o[i]); }
          else { conf = true; if (!cur) cur = { o: [], t: [] }; cur.o.push(o[i]); cur.t.push(t[i]); }
        }
        if (cur) out.push(MARK + " HEAD", cur.o.join("\n"), "=======", cur.t.join("\n"), ">>>>>>> " + name);
        void blocks; return { text: out.join("\n") + "\n", conflict: conf };
      }
      return { text: MARK + " HEAD\n" + ours.replace(/\n$/, "") + "\n=======\n" + theirs.replace(/\n$/, "") + "\n>>>>>>> " + name + "\n", conflict: true };
    }

    /* ---- build a starting repository from a mission's starter */
    function build(spec) {
      G = { root: spec.root, commits: {}, branches: {}, head: spec.head || "main", detached: null, index: {}, stash: [], tags: {}, merging: null, reflog: [], tick: 0, user: parseUser(spec.user || "You <you@aata.dev>") };
      if (T.dirs.indexOf(G.root) < 0) T.dirs.push(G.root);
      const apply = (c, branch) => {
        const tree = copy(headTree()); Object.keys(c.files || {}).forEach((p) => { if (c.files[p] === null) delete tree[p]; else tree[p] = c.files[p]; });
        const id = newCommit(tree, headId() ? [headId()] : [], c.msg, c.author ? c.author + " <" + c.author.toLowerCase().replace(/\W+/g, ".") + "@aata.dev>" : undefined);
        G.branches[branch] = id; G.reflog.unshift({ id: id, msg: "commit: " + c.msg });
      };
      (spec.commits || []).forEach((c) => apply(c, G.head));
      (spec.branches || []).forEach((b) => {
        const keep = G.head; G.branches[b.name] = b.from ? (spec.tags && spec.tags[b.from]) || G.branches[b.from] : headId(); G.head = b.name;
        (b.commits || []).forEach((c) => apply(c, b.name)); G.head = keep;
      });
      Object.keys(spec.tags || {}).forEach((t2) => { G.tags[t2] = resolve(spec.tags[t2]) || headId(); });
      if (spec.checkout) G.head = spec.checkout;
      const h = headTree(); Object.keys(h).forEach((p) => setWork(p, h[p])); G.index = copy(h);
      Object.keys(spec.staged || {}).forEach((p) => { G.index[p] = spec.staged[p]; setWork(p, spec.staged[p]); });
      Object.keys(spec.work || {}).forEach((p) => setWork(p, spec.work[p]));
      Object.keys(spec.untracked || {}).forEach((p) => setWork(p, spec.untracked[p]));
      Object.keys(spec.deleted || {}).forEach(() => {});
      (spec.removed || []).forEach((p) => setWork(p, null));
      T.git = G;
    }
    function parseUser(s) { const m = String(s).match(/^(.*?)\s*<(.+)>$/); return m ? { name: m[1], email: m[2] } : { name: s, email: String(s).toLowerCase().replace(/\W+/g, ".") + "@aata.dev" }; }
    if (T.gitSpec) build(T.gitSpec);

    /* ---- commands */
    const flags = (a) => a.filter((x) => x[0] === "-");
    const noNet = "fatal: this practice terminal has no network, so push/pull/fetch/clone are not available. Practise the local commands.";
    cmds.git = function (a) {
      const sub = a[0], args = a.slice(1);
      if (!sub) return "usage: git <command> [<args>]\nTry: init status add commit log diff branch switch merge restore reset revert stash tag show blame reflog";
      if (["push", "pull", "fetch", "clone", "remote"].indexOf(sub) >= 0) return noNet;
      if (sub === "init") {
        if (G) return "Reinitialized existing Git repository in " + G.root + "/.git/";
        build({ root: T.cwd, commits: [] }); return "Initialized empty Git repository in " + T.cwd + "/.git/";
      }
      if (sub === "config") {
        if (!G) { const hit = args.join(" "); return /user\./.test(hit) ? "" : need(); }
        if (args[0] === "user.name" && args[1]) G.user.name = args[1]; else if (args[0] === "user.email" && args[1]) G.user.email = args[1];
        else if (args[0] === "--list") return "user.name=" + G.user.name + "\nuser.email=" + G.user.email;
        else if (args[0] && !args[1]) return G.user[args[0].replace("user.", "")] || "";
        return "";
      }
      const nr = need(); if (nr) return nr;
      if (!inRepo(T.cwd)) return "fatal: not a git repository (or any of the parent directories): .git";
      const fn = GIT[sub]; if (!fn) return "git: '" + sub + "' is not a git command here. Try: status add commit log diff branch switch merge restore reset revert stash tag show blame reflog.";
      return fn(args);
    };

    const GIT = {
      status(args) {
        const st = status(), out = [G.detached ? "HEAD detached at " + short(G.detached) : "On branch " + G.head];
        if (G.merging) out.push("You have unmerged paths.\n  (fix conflicts and run \"git commit\")");
        if (!headId()) out.push("\nNo commits yet");
        if (flags(args).indexOf("-s") >= 0 || flags(args).indexOf("--short") >= 0) {
          const mk = { "new file": "A", modified: "M", deleted: "D" }, o = [];
          st.staged.forEach((c) => o.push(mk[c.kind] + "  " + c.path)); st.unstaged.forEach((c) => o.push(" " + mk[c.kind] + " " + c.path)); st.unmerged.forEach((p) => o.push("UU " + p)); st.untracked.forEach((p) => o.push("?? " + p));
          return o.join("\n");
        }
        if (st.unmerged.length) out.push("\nUnmerged paths:\n  (use \"git add <file>...\" to mark resolution)\n" + st.unmerged.map((p) => "\tboth modified:   " + p).join("\n"));
        if (st.staged.length) out.push("\nChanges to be committed:\n  (use \"git restore --staged <file>...\" to unstage)\n" + st.staged.map((c) => "\t" + (c.kind + ":").padEnd(12) + c.path).join("\n"));
        if (st.unstaged.length) out.push("\nChanges not staged for commit:\n  (use \"git add <file>...\" to update what will be committed)\n  (use \"git restore <file>...\" to discard changes in working directory)\n" + st.unstaged.map((c) => "\t" + (c.kind + ":").padEnd(12) + c.path).join("\n"));
        if (st.untracked.length) out.push("\nUntracked files:\n  (use \"git add <file>...\" to include in what will be committed)\n" + st.untracked.map((p) => "\t" + p).join("\n"));
        if (isClean(st)) out.push(headId() ? "\nnothing to commit, working tree clean" : "\nnothing to commit (create/copy files and use \"git add\" to track)");
        else if (!st.staged.length && !st.unmerged.length) out.push("\nno changes added to commit (use \"git add\" and/or \"git commit -a\")");
        return out.join("\n");
      },
      add(args) {
        const w = work(), paths = args.filter((x) => x[0] !== "-"), all = args.indexOf("-A") >= 0 || args.indexOf("--all") >= 0 || args.indexOf("-u") >= 0;
        if (!paths.length && !all) return "Nothing specified, nothing added.";
        const targets = all ? [""] : relPaths(paths), out = [];
        if (!all && paths.length && !targets.length) return "fatal: pathspec is outside repository";
        const hit = (p, t2) => t2 === "" || p === t2 || p.startsWith(t2 + "/");
        targets.forEach((t2) => {
          let any = false;
          Object.keys(w).forEach((p) => { if (hit(p, t2)) { if (args.indexOf("-u") >= 0 && !(p in G.index)) return; G.index[p] = w[p]; any = true; if (G.merging) G.merging.resolved[p] = true; } });
          Object.keys(G.index).forEach((p) => { if (hit(p, t2) && !(p in w)) { delete G.index[p]; any = true; if (G.merging) G.merging.resolved[p] = true; } });
          if (!any && t2 !== "") out.push("fatal: pathspec '" + t2 + "' did not match any files");
        });
        return out.join("\n");
      },
      rm(args) {
        const cached = args.indexOf("--cached") >= 0, paths = relPaths(args.filter((x) => x[0] !== "-")), out = [];
        paths.forEach((p) => { if (!(p in G.index)) { out.push("fatal: pathspec '" + p + "' did not match any files"); return; } delete G.index[p]; if (!cached) setWork(p, null); out.push("rm '" + p + "'"); });
        return out.join("\n");
      },
      mv(args) {
        const r = args.filter((x) => x[0] !== "-"); if (r.length < 2) return "usage: git mv <source> <destination>";
        const [s, d] = relPaths(r); if (!(s in G.index)) return "fatal: not under version control, source=" + s;
        const w = work(); G.index[d] = w[s] !== undefined ? w[s] : G.index[s]; delete G.index[s]; setWork(d, G.index[d]); setWork(s, null); return "";
      },
      commit(args) {
        let msg = null, all = false, amend = false;
        for (let i = 0; i < args.length; i++) { const x = args[i]; if (x === "-m") msg = args[++i]; else if (x.startsWith("-m") && x.length > 2) msg = x.slice(2); else if (x === "-a" || x === "-am") { all = true; if (x === "-am") msg = args[++i]; } else if (x === "--amend") amend = true; else if (x === "--no-edit") msg = msg; else if (/^-[a-z]*a[a-z]*m$/.test(x)) { all = true; msg = args[++i]; } }
        if (all) { const w = work(); Object.keys(G.index).forEach((p) => { if (p in w) G.index[p] = w[p]; else delete G.index[p]; }); }
        if (G.merging) {
          const un = G.merging.conflicts.filter((p) => !G.merging.resolved[p]);
          if (un.length) return "error: Committing is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use 'git add <file>'\nfatal: Exiting because of an unresolved conflict.";
          const id = newCommit(G.index, [headId(), G.merging.theirs], msg || "Merge branch '" + G.merging.name + "'"); const nm = G.merging.name; G.merging = null; moveHead(id, "commit (merge): " + nm);
          return "[" + (G.detached ? "detached HEAD" : G.head) + " " + short(id) + "] " + G.commits[id].msg;
        }
        const h = headTree(), diff = changesBetween(h, G.index);
        if (amend) {
          const cur = G.commits[headId()]; if (!cur) return "fatal: You have nothing to amend.";
          const id = newCommit(G.index, cur.parents.slice(), msg || cur.msg, cur.author); moveHead(id, "commit (amend): " + (msg || cur.msg));
          return "[" + (G.detached ? "detached HEAD" : G.head) + " " + short(id) + "] " + G.commits[id].msg;
        }
        if (!diff.length) { const st = status(); return "On branch " + G.head + "\n" + (st.unstaged.length || st.untracked.length ? "Changes not staged for commit / untracked files present. Use \"git add\" first." : "nothing to commit, working tree clean"); }
        if (msg === null || msg === undefined || !String(msg).trim()) return "Aborting commit due to empty commit message. Use: git commit -m \"your message\"";
        const id = newCommit(G.index, headId() ? [headId()] : [], msg); moveHead(id, "commit: " + msg);
        return "[" + (G.detached ? "detached HEAD" : G.head) + (headId() && G.commits[id].parents.length ? "" : " (root-commit)") + " " + short(id) + "] " + msg + "\n " + diff.length + " file" + (diff.length > 1 ? "s" : "") + " changed";
      },
      log(args) {
        let n = Infinity, oneline = false, author = null, pick = null, fmt = null, graph = false, all = false, rev = null, paths = [], afterDD = false;
        for (let i = 0; i < args.length; i++) {
          const x = args[i];
          if (afterDD) { paths.push(x); continue; }
          if (x === "--") afterDD = true; else if (x === "--oneline") oneline = true; else if (x === "-n") n = Number(args[++i]); else if (/^-\d+$/.test(x)) n = Number(x.slice(1)); else if (x.startsWith("--author=")) author = x.slice(9); else if (x === "-S") pick = args[++i]; else if (x.startsWith("-S") && x.length > 2) pick = x.slice(2);
          else if (x.startsWith("--format=") || x.startsWith("--pretty=")) fmt = x.replace(/^--(format|pretty)=(format:)?/, ""); else if (x === "--graph") graph = true; else if (x === "--all") all = true; else if (x[0] !== "-") { if (resolve(x)) rev = x; else if (inRepo(abs(x))) paths.push(x); else return "fatal: ambiguous argument '" + x + "': unknown revision or path not in the working tree."; }
        }
        let start = rev ? resolve(rev) : headId(); if (!start && !all) return "fatal: your current branch '" + G.head + "' does not have any commits yet";
        let reach = {};
        if (all) Object.keys(G.branches).forEach((b) => Object.assign(reach, ancestors(G.branches[b]))); else reach = ancestors(start);
        let ids = Object.keys(reach).sort((x, y) => G.commits[y].time - G.commits[x].time);
        const prel = relPaths(paths);
        ids = ids.filter((id) => {
          const c = G.commits[id], par = c.parents[0] ? G.commits[c.parents[0]].tree : {};
          if (author && c.author.toLowerCase().indexOf(author.toLowerCase()) < 0) return false;
          if (prel.length && !changesBetween(par, c.tree).some((ch) => prel.some((p) => ch.path === p || ch.path.startsWith(p + "/")))) return false;
          if (pick !== null) { const cnt = (tr) => Object.keys(tr).reduce((k, p) => k + (tr[p].split(pick).length - 1), 0); if (cnt(c.tree) === cnt(par)) return false; }
          return true;
        }).slice(0, n);
        return ids.map((id) => {
          const c = G.commits[id], dec = labelDecor(id);
          if (fmt) return fmt.replace(/%H/g, id).replace(/%h/g, short(id)).replace(/%an/g, c.author.replace(/\s*<.*$/, "")).replace(/%ae/g, (c.author.match(/<(.*)>/) || [])[1] || "").replace(/%s/g, c.msg).replace(/%ad/g, dateOf(c.time)).replace(/%d/g, dec).replace(/%n/g, "\n");
          if (oneline) return (graph ? "* " : "") + short(id) + dec + " " + c.msg;
          return (graph ? "* " : "") + "commit " + short(id) + dec + (c.parents.length > 1 ? "\nMerge: " + c.parents.map(short).join(" ") : "") + "\nAuthor: " + c.author + "\nDate:   " + dateOf(c.time) + "\n\n    " + c.msg + "\n";
        }).join(oneline || fmt ? "\n" : "\n").replace(/\n$/, "");
      },
      show(args) {
        const rev = args.filter((x) => x[0] !== "-")[0] || "HEAD", id = resolve(rev); if (!id) return "fatal: ambiguous argument '" + rev + "': unknown revision or path not in the working tree.";
        const c = G.commits[id], par = c.parents[0] ? G.commits[c.parents[0]].tree : {};
        return "commit " + short(id) + labelDecor(id) + "\nAuthor: " + c.author + "\nDate:   " + dateOf(c.time) + "\n\n    " + c.msg + "\n\n" + treeDiff(par, c.tree);
      },
      diff(args) {
        const fl = flags(args), staged = fl.indexOf("--staged") >= 0 || fl.indexOf("--cached") >= 0, rest = args.filter((x) => x[0] !== "-"), dd = args.indexOf("--"), pathArgs = dd >= 0 ? args.slice(dd + 1) : [];
        const revs = rest.filter((x) => dd < 0 || args.indexOf(x) < dd).filter((x) => resolve(x) || /\.\./.test(x)), only = pathArgs.length ? relPaths(pathArgs) : rest.filter((x) => !revs.includes(x) && inRepo(abs(x))).length ? relPaths(rest.filter((x) => !revs.includes(x))) : null;
        let a, b; const w = work();
        const tracked = () => { const o = {}; Object.keys(G.index).forEach((p) => { if (p in w) o[p] = w[p]; }); return o; };
        if (revs.length >= 2 || (revs.length === 1 && /\.\./.test(revs[0]))) { const pr = revs.length === 1 ? revs[0].split(/\.\.\.?/) : revs; const x = resolve(pr[0]), y = resolve(pr[1]); if (!x || !y) return "fatal: bad revision"; a = G.commits[x].tree; b = G.commits[y].tree; }
        else if (revs.length === 1) { const x = resolve(revs[0]); a = G.commits[x].tree; b = staged ? G.index : tracked(); if (!staged) { Object.keys(a).forEach((p) => { if (!(p in w)) delete b[p]; }); } }
        else if (staged) { a = headTree(); b = G.index; }
        else { a = G.index; b = tracked(); Object.keys(a).forEach((p) => { if (!(p in w)) delete b[p]; }); const dels = Object.keys(a).filter((p) => !(p in w)); a = copy(a); dels.forEach((p) => { delete b[p]; }); }
        return treeDiff(a, b, only);
      },
      blame(args) {
        const f = args.filter((x) => x[0] !== "-")[0]; if (!f) return "usage: git blame <file>";
        const p = rel(abs(f)), tr = headTree(); if (!(p in tr)) return "fatal: no such path " + f + " in HEAD";
        const ls = lines(tr[p]); let id = headId();
        const owner = ls.map(() => null);
        ls.forEach((line, i) => {
          let cur = headId();
          while (cur) {
            const c = G.commits[cur], holder = c.parents.find((pid) => { const pl = G.commits[pid].tree[p]; return pl !== undefined && lines(pl).indexOf(line) >= 0; });
            if (!holder) { owner[i] = cur; return; }
            cur = holder;
          }
        });
        void id;
        return ls.map((l, i) => { const c = G.commits[owner[i]]; return short(c.id) + " (" + c.author.replace(/\s*<.*$/, "").padEnd(8) + " " + String(i + 1).padStart(2) + ") " + l; }).join("\n");
      },
      branch(args) {
        const fl = flags(args), rest = args.filter((x) => x[0] !== "-");
        if (fl.indexOf("-d") >= 0 || fl.indexOf("-D") >= 0) {
          const name = rest[0]; if (!name || !(name in G.branches)) return "error: branch '" + name + "' not found.";
          if (name === G.head) return "error: Cannot delete branch '" + name + "' checked out";
          if (fl.indexOf("-d") >= 0 && !isAncestor(G.branches[name], headId())) return "error: The branch '" + name + "' is not fully merged.\nIf you are sure you want to delete it, run 'git branch -D " + name + "'.";
          const id = G.branches[name]; delete G.branches[name]; return "Deleted branch " + name + " (was " + short(id) + ").";
        }
        if (fl.indexOf("-m") >= 0) { const nm = rest.length > 1 ? rest[1] : rest[0], old = rest.length > 1 ? rest[0] : G.head; if (!(old in G.branches)) return "error: refname refs/heads/" + old + " not found"; G.branches[nm] = G.branches[old]; delete G.branches[old]; if (G.head === old) G.head = nm; return ""; }
        if (!rest.length) return Object.keys(G.branches).sort().map((b) => (b === G.head && !G.detached ? "* " : "  ") + b).join("\n") || "  (no branches yet: make a commit first)";
        if (!headId()) return "fatal: not a valid object name: '" + G.head + "'.";
        if (rest[0] in G.branches) return "fatal: a branch named '" + rest[0] + "' already exists";
        if (!/^[\w./-]+$/.test(rest[0])) return "fatal: '" + rest[0] + "' is not a valid branch name";
        const from = rest[1] ? resolve(rest[1]) : headId(); if (!from) return "fatal: not a valid object name: '" + rest[1] + "'";
        G.branches[rest[0]] = from; return "";
      },
      switch(args) { return switchTo(args, true); },
      checkout(args) {
        const dd = args.indexOf("--");
        if (dd >= 0 || (args.length && !(args[0] in G.branches) && !resolve(args[0]) && args[0][0] !== "-" && inRepo(abs(args[0])))) {
          const targets = relPaths(dd >= 0 ? args.slice(dd + 1) : args), out = [];
          targets.forEach((p) => { if (!(p in G.index)) out.push("error: pathspec '" + p + "' did not match any file(s) known to git"); else setWork(p, G.index[p]); }); return out.join("\n");
        }
        return switchTo(args, false);
      },
      merge(args) {
        const fl = flags(args), rest = args.filter((x) => x[0] !== "-");
        if (fl.indexOf("--abort") >= 0) { if (!G.merging) return "fatal: There is no merge to abort (MERGE_HEAD missing)."; const h = headTree(); const w = work(); Object.keys(w).forEach((p) => { if (!(p in h) && p in G.index) setWork(p, null); }); Object.keys(h).forEach((p) => setWork(p, h[p])); G.index = copy(h); G.merging = null; return ""; }
        const name = rest[0]; if (!name) return "fatal: No commit specified and merge.defaultToUpstream not set.";
        const theirs = resolve(name); if (!theirs) return "merge: " + name + " - not something we can merge";
        if (G.merging) return "error: You have not concluded your merge (MERGE_HEAD exists).\nhint: Please, commit your changes before you merge.";
        const st = status(); if (st.staged.length || st.unstaged.length) return "error: Your local changes to the following files would be overwritten by merge. Commit or stash them first.";
        const ours = headId(); if (!ours) return "fatal: you have no commits yet";
        if (isAncestor(theirs, ours)) return "Already up to date.";
        if (isAncestor(ours, theirs) && fl.indexOf("--no-ff") < 0) {
          const t2 = G.commits[theirs].tree; applyTree(t2); moveHead(theirs, "merge " + name + ": Fast-forward");
          return "Updating " + short(ours) + ".." + short(theirs) + "\nFast-forward\n " + changesBetween(G.commits[ours].tree, t2).length + " file(s) changed";
        }
        const base = mergeBase(ours, theirs), bt = base ? G.commits[base].tree : {}, ot = G.commits[ours].tree, tt = G.commits[theirs].tree, merged = {}, conflicts = [], msgs = [];
        Object.keys(Object.assign({}, bt, ot, tt)).sort().forEach((p) => {
          const b = bt[p], o = ot[p], t2 = tt[p];
          if (o === t2) { if (o !== undefined) merged[p] = o; return; }
          if (o === b) { if (t2 !== undefined) merged[p] = t2; return; }
          if (t2 === b) { if (o !== undefined) merged[p] = o; return; }
          if (o === undefined || t2 === undefined) { merged[p] = o !== undefined ? o : t2; conflicts.push(p); msgs.push("CONFLICT (modify/delete): " + p); return; }
          const r = merge3(b, o, t2, name); merged[p] = r.text; if (r.conflict) { conflicts.push(p); msgs.push("CONFLICT (content): Merge conflict in " + p); }
        });
        if (fl.indexOf("--no-commit") >= 0 && !conflicts.length) { /* fall through to merge commit anyway */ }
        Object.keys(merged).forEach((p) => setWork(p, merged[p]));
        Object.keys(ot).forEach((p) => { if (!(p in merged)) setWork(p, null); });
        if (conflicts.length) {
          G.index = copy(ot); Object.keys(merged).forEach((p) => { if (conflicts.indexOf(p) < 0) G.index[p] = merged[p]; });
          G.merging = { theirs: theirs, name: name, conflicts: conflicts, resolved: {} };
          return msgs.join("\n") + "\nAutomatic merge failed; fix conflicts and then commit the result.";
        }
        G.index = copy(merged);
        const id = newCommit(merged, [ours, theirs], "Merge branch '" + name + "'"); moveHead(id, "merge " + name + ": Merge made by the 'ort' strategy.");
        return "Merge made by the 'ort' strategy.\n " + changesBetween(ot, merged).length + " file(s) changed";
      },
      restore(args) {
        const staged = args.indexOf("--staged") >= 0 || args.indexOf("-S") >= 0, wt = args.indexOf("--worktree") >= 0 || args.indexOf("-W") >= 0, sIdx = args.findIndex((x) => x.startsWith("--source"));
        const srcRev = sIdx >= 0 ? (args[sIdx].indexOf("=") > 0 ? args[sIdx].split("=")[1] : args[sIdx + 1]) : null;
        const paths = args.filter((x, i) => x[0] !== "-" && !(sIdx >= 0 && args[sIdx].indexOf("=") < 0 && i === sIdx + 1)); if (!paths.length) return "fatal: you must specify path(s) to restore";
        const src = srcRev ? (resolve(srcRev) ? G.commits[resolve(srcRev)].tree : null) : null; if (srcRev && !src) return "fatal: could not resolve " + srcRev;
        const all = paths.some((x) => abs(x) === G.root || x === "."), targets = relPaths(paths), out = [];
        const keys = Object.keys(Object.assign({}, G.index, headTree(), work())).filter((p) => all || targets.some((t2) => p === t2 || p.startsWith(t2 + "/")));
        if (!keys.length) return "error: pathspec '" + paths[0] + "' did not match any file(s) known to git";
        keys.forEach((p) => {
          if (staged || (staged && wt)) { const h = src || headTree(); if (p in h) G.index[p] = h[p]; else delete G.index[p]; }
          if (!staged || wt) { const s = src || G.index; if (p in s) setWork(p, s[p]); else if (!(p in G.index)) { /* untracked: leave */ } else setWork(p, null); }
        });
        return out.join("\n");
      },
      reset(args) {
        const fl = flags(args), rest = args.filter((x) => x[0] !== "-"), mode = fl.indexOf("--hard") >= 0 ? "hard" : fl.indexOf("--soft") >= 0 ? "soft" : "mixed";
        if (rest.length && !resolve(rest[0])) { const ps = relPaths(rest), h = headTree(); ps.forEach((p) => { if (p in h) G.index[p] = h[p]; else delete G.index[p]; }); return ""; }
        const id = rest[0] ? resolve(rest[0]) : headId(); if (!id) return "fatal: ambiguous argument: unknown revision";
        const old = headId(), tr = G.commits[id].tree;
        if (id !== old) moveHead(id, "reset: moving to " + (rest[0] || "HEAD"));
        if (mode !== "soft") G.index = copy(tr);
        if (mode === "hard") { const w = work(); Object.keys(w).forEach((p) => { if (p in G.index || p in headTree() || (old && p in G.commits[old].tree)) { if (!(p in tr)) setWork(p, null); } }); Object.keys(tr).forEach((p) => setWork(p, tr[p])); G.merging = null; return "HEAD is now at " + short(id) + " " + G.commits[id].msg; }
        return mode === "mixed" ? (id !== old ? "Unstaged changes after reset: kept in your working folder." : "") : "";
      },
      revert(args) {
        const rev = args.filter((x) => x[0] !== "-")[0]; if (!rev) return "usage: git revert <commit>";
        const id = resolve(rev); if (!id) return "fatal: bad revision '" + rev + "'"; const st = status(); if (st.staged.length || st.unstaged.length) return "error: your local changes would be overwritten by revert.";
        const c = G.commits[id], par = c.parents[0] ? G.commits[c.parents[0]].tree : {}, h = headTree(), tree = copy(h), conflicts = [];
        changesBetween(par, c.tree).forEach((ch) => { const cur = h[ch.path]; if (cur === c.tree[ch.path]) { if (par[ch.path] === undefined) delete tree[ch.path]; else tree[ch.path] = par[ch.path]; } else if (cur !== par[ch.path]) conflicts.push(ch.path); });
        if (conflicts.length) return "error: could not revert " + short(id) + "... " + c.msg + "\nCONFLICT: " + conflicts.join(", ") + " changed since that commit. Resolve by hand.";
        const nid = newCommit(tree, [headId()], "Revert \"" + c.msg + "\"\n\nThis reverts commit " + id + "."); moveHead(nid, "revert: " + c.msg);
        applyTree(tree); return "[" + (G.detached ? "detached HEAD" : G.head) + " " + short(nid) + "] Revert \"" + c.msg + "\"";
      },
      stash(args) {
        const sub = args[0] || "push";
        if (sub === "list") return G.stash.map((s, i) => "stash@{" + i + "}: WIP on " + s.branch + ": " + s.base).join("\n");
        if (sub === "pop" || sub === "apply") {
          const s = G.stash[0]; if (!s) return "No stash entries found.";
          Object.keys(s.work).forEach((p) => { setWork(p, s.work[p]); if (s.work[p] === null) delete G.index[p]; });
          Object.keys(s.index).forEach((p) => { G.index[p] = s.index[p]; });
          if (sub === "pop") G.stash.shift();
          return "Applied the stashed changes" + (sub === "pop" ? " and dropped the stash entry." : ".");
        }
        if (sub === "drop") { G.stash.shift(); return "Dropped stash entry."; }
        const st = status(); if (!st.staged.length && !st.unstaged.length) return "No local changes to save";
        const h = headTree(), w = work(), entry = { work: {}, index: {}, branch: G.head, base: short(headId()) + " " + G.commits[headId()].msg };
        Object.keys(G.index).forEach((p) => { if (G.index[p] !== h[p]) entry.index[p] = G.index[p]; });
        Object.keys(G.index).forEach((p) => { if ((p in w ? w[p] : null) !== (h[p] !== undefined ? h[p] : null)) entry.work[p] = p in w ? w[p] : null; });
        G.stash.unshift(entry);
        Object.keys(entry.work).forEach((p) => { setWork(p, h[p] !== undefined ? h[p] : null); }); G.index = copy(h);
        return "Saved working directory and index state WIP on " + G.head + ": " + entry.base;
      },
      tag(args) {
        const rest = args.filter((x) => x[0] !== "-"), fl = flags(args);
        if (fl.indexOf("-d") >= 0) { delete G.tags[rest[0]]; return "Deleted tag '" + rest[0] + "'"; }
        if (!rest.length) return Object.keys(G.tags).sort().join("\n");
        if (rest[0] in G.tags) return "fatal: tag '" + rest[0] + "' already exists";
        const id = rest[1] ? resolve(rest[1]) : headId(); if (!id) return "fatal: Failed to resolve '" + rest[1] + "' as a valid ref."; G.tags[rest[0]] = id; return "";
      },
      reflog() { return G.reflog.map((r, i) => short(r.id) + " HEAD@{" + i + "}: " + r.msg).join("\n"); },
      "rev-parse"(args) { const id = resolve(args[0] || "HEAD"); return id || "fatal: ambiguous argument '" + args[0] + "'"; },
      ls(args) { return Object.keys(G.index).sort().join("\n"); },
    };
    GIT["ls-files"] = GIT.ls;

    function switchTo(args, isSwitch) {
      const fl = flags(args), rest = args.filter((x) => x[0] !== "-"), create = fl.indexOf("-c") >= 0 || fl.indexOf("-b") >= 0 || fl.indexOf("-C") >= 0 || fl.indexOf("-B") >= 0, detach = fl.indexOf("--detach") >= 0;
      const name = rest[0]; if (!name) return "fatal: missing branch or commit argument";
      if (create) {
        if (name in G.branches && fl.indexOf("-B") < 0 && fl.indexOf("-C") < 0) return "fatal: a branch named '" + name + "' already exists";
        const from = rest[1] ? resolve(rest[1]) : headId(); if (!from) return "fatal: not a valid object name"; G.branches[name] = from; G.head = name; G.detached = null; G.reflog.unshift({ id: from, msg: "checkout: moving to " + name });
        return "Switched to a new branch '" + name + "'";
      }
      const isBranch = name in G.branches && !detach, id = isBranch ? G.branches[name] : resolve(name);
      if (!id) return "fatal: invalid reference: " + name;
      if (!isBranch && isSwitch && !detach) return "fatal: a branch is expected, got commit '" + name + "'\nhint: use --detach to inspect a commit.";
      if (isBranch && name === G.head && !G.detached) return "Already on '" + name + "'";
      const target = G.commits[id].tree, bad = dirtyBlock(target);
      if (bad.length) return "error: Your local changes to the following files would be overwritten by checkout:\n\t" + bad.join("\n\t") + "\nPlease commit your changes or stash them before you switch branches.\nAborting";
      applyTree(target);
      if (isBranch) { G.head = name; G.detached = null; G.reflog.unshift({ id: id, msg: "checkout: moving to " + name }); return "Switched to branch '" + name + "'"; }
      G.detached = id; G.reflog.unshift({ id: id, msg: "checkout: moving to " + short(id) });
      return "Note: switching to '" + name + "'.\nYou are in 'detached HEAD' state. Make a branch (git switch -c <name>) if you want to keep new commits.\nHEAD is now at " + short(id) + " " + G.commits[id].msg;
    }
    T.gitResolve = resolve;
  });

  /* Mission tests for git state */
  AK.gitCheck = function (T, t) {
    const G = T.git; if (!G) return false;
    const headId = () => (G.detached ? G.detached : G.branches[G.head] || null), commitOf = (id) => G.commits[id];
    const ancestors = (id) => { const seen = {}, st = [id]; while (st.length) { const c = st.pop(); if (!c || seen[c]) continue; seen[c] = true; commitOf(c).parents.forEach((p) => st.push(p)); } return seen; };
    const w = {}; Object.keys(T.files).forEach((p) => { if (p.startsWith(G.root + "/")) w[p.slice(G.root.length + 1)] = T.files[p]; });
    const head = headId() ? commitOf(headId()).tree : {}, idx = G.index;
    const stagedDiff = Object.keys(Object.assign({}, head, idx)).filter((p) => head[p] !== idx[p]);
    const unstaged = Object.keys(idx).filter((p) => w[p] !== idx[p]);
    const untracked = Object.keys(w).filter((p) => !(p in idx));
    const unresolved = G.merging ? G.merging.conflicts.filter((p) => !G.merging.resolved[p]) : [];
    switch (t.check) {
      case "branch-is": return !G.detached && G.head === t.value;
      case "has-branch": return t.value in G.branches;
      case "no-branch": return !(t.value in G.branches);
      case "commits": { const n = headId() ? Object.keys(ancestors(headId())).length : 0; return t.n !== undefined ? n === t.n : n >= (t.min || 0); }
      case "msg-contains": return !!headId() && commitOf(headId()).msg.toLowerCase().includes(String(t.value).toLowerCase());
      case "clean": return !stagedDiff.length && !unstaged.length && !untracked.length && !unresolved.length && !G.merging;
      case "clean-tracked": return !stagedDiff.length && !unstaged.length && !unresolved.length;
      case "staged": return stagedDiff.indexOf(t.path) >= 0;
      case "not-staged": return stagedDiff.indexOf(t.path) < 0;
      case "in-head": return t.path in head;
      case "not-in-head": return !(t.path in head);
      case "in-index": return t.path in idx;
      case "file": return t.path in w && w[t.path].includes(t.text);
      case "file-not": return t.path in w && !w[t.path].includes(t.text);
      case "file-missing": return !(t.path in w);
      case "file-equals": return (w[t.path] || "").trim() === String(t.text).trim();
      case "file-at-head": return t.path in head && head[t.path].includes(t.text);
      case "no-conflict": return !Object.keys(w).some((p) => w[p].indexOf("<<<<<<<") >= 0 || w[p].indexOf(">>>>>>>") >= 0);
      case "merged": return !!G.branches[t.branch] && !!headId() && !!ancestors(headId())[G.branches[t.branch]];
      case "parents": return !!headId() && commitOf(headId()).parents.length === t.n;
      case "detached": return !!G.detached === (t.value !== false);
      case "stash": return G.stash.length === t.n;
      case "tag": return t.name in G.tags;
      case "head-is": { const id = T.gitResolve(t.rev); return !!id && id === headId(); }
      case "commit-msg": return !!headId() && Object.keys(ancestors(headId())).some((c) => commitOf(c).msg.toLowerCase().includes(String(t.value).toLowerCase()));
      case "branch-commit-msg": { const id = G.branches[t.branch]; return !!id && Object.keys(ancestors(id)).some((c) => commitOf(c).msg.toLowerCase().includes(String(t.value).toLowerCase())); }
      case "no-commit-msg": return !headId() || !Object.keys(ancestors(headId())).some((c) => commitOf(c).msg.toLowerCase().includes(String(t.value).toLowerCase()));
      case "branch-has-file": return !!G.branches[t.branch] && t.path in commitOf(G.branches[t.branch]).tree;
      case "branch-file": return !!G.branches[t.branch] && (commitOf(G.branches[t.branch]).tree[t.path] || "").includes(t.text);
      case "merging": return !!G.merging === (t.value !== false);
      case "file-count": return Object.keys(head).length === t.n;
      default: return false;
    }
  };
})(typeof self !== "undefined" ? self : globalThis);

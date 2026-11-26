/* AataKode v5 logic (no DOM): goal-based learning paths, concept mastery map, Maze Dash (the second Arena game),
   story boss battles (choices, perks), parrot growth with choices, and the misconception detector.
   The browser and the Node verifier both load this file after more2.js. */
(function (root) {
  "use strict";
  const AK = typeof module !== "undefined" && module.exports ? require("./engine.js") : root.AK;
  const nowOf = (x) => (x instanceof Date ? x : new Date());
  const ymd = (d) => AK.dateKey(nowOf(d));
  const seeds = (S) => (S.seeds = S.seeds || { earned: 0, spent: 0 });

  /* ---------------------------------------------------------------- state */
  const blank = () => ({
    goal: "", picked: false, skipped: false, mapOnly: false, primer: false, goalDay: "",
    dash: { done: {}, wins: {}, tried: 0, code: "", prev: "", beatPrev: 0 },
    bossSeen: {}, bossPerk: {}, bossDone: {}, mis: {}, parrot: { path: "", trait: "", crest: "" },
  });
  AK.v5 = (S) => { const b = blank(); const v = S.v5 || (S.v5 = b); for (const k in b) if (v[k] == null) v[k] = b[k]; for (const g of ["dash", "parrot"]) for (const k in b[g]) if (v[g][k] == null) v[g][k] = b[g][k]; return v; };
  const baseNew = AK.newState;
  AK.newState = function () { const s = baseNew(); s.v5 = blank(); return s; };
  const baseMerge = AK.mergeState;
  const maxObj = (a, b) => { const o = Object.assign({}, a || {}); for (const k in b || {}) o[k] = Math.max(o[k] || 0, b[k]); return o; };
  AK.mergeState = function (cur, inc) {
    const out = baseMerge(cur, inc), a = AK.v5({ v5: cur.v5 }), b = AK.v5({ v5: inc.v5 }), o = AK.v5(out);
    o.goal = a.goal || b.goal; o.picked = a.picked || b.picked; o.skipped = a.skipped || b.skipped; o.mapOnly = a.mapOnly; o.primer = a.primer || b.primer;
    o.dash.done = Object.assign({}, b.dash.done, a.dash.done); o.dash.wins = maxObj(a.dash.wins, b.dash.wins); o.dash.tried = Math.max(a.dash.tried, b.dash.tried);
    o.dash.code = a.dash.code || b.dash.code; o.dash.prev = a.dash.prev || b.dash.prev;
    o.bossSeen = Object.assign({}, b.bossSeen, a.bossSeen); o.bossDone = Object.assign({}, b.bossDone, a.bossDone); o.bossPerk = Object.assign({}, b.bossPerk, a.bossPerk);
    o.mis = maxObj(a.mis, b.mis); o.parrot = { path: a.parrot.path || b.parrot.path, trait: a.parrot.trait || b.parrot.trait, crest: a.parrot.crest || b.parrot.crest };
    return out;
  };

  /* ---------------------------------------------------------------- goal paths */
  const T = (id) => "track:" + id, Rg = (id) => "region:" + id;
  AK.GOALS = [
    { id: "new", icon: "🌱", en: "I'm new to coding", line: "Python, starting at First Steps.", stages: [{ label: "Python Quest", of: [T("python")] }] },
    { id: "job", icon: "💼", en: "Get a dev or SRE job", line: "Python, Git, SQL, Go, then interview prep.", stages: [{ label: "Python", of: [T("python")] }, { label: "Git", of: [T("git")] }, { label: "SQL", of: [T("sql")] }, { label: "Go", of: [T("go")] }, { label: "Interview prep", of: [Rg("interview-prep")] }] },
    { id: "ops", icon: "🛠", en: "Automate my work / DevOps", line: "Python, Git, HTTP and APIs, then Python for DevOps.", stages: [{ label: "Python", of: [T("python")] }, { label: "Git", of: [T("git")] }, { label: "HTTP and APIs", of: [T("http")] }, { label: "Python for DevOps", of: [Rg("python-devops")] }] },
    { id: "data", icon: "🗄", en: "Work with data", line: "SQL first, then Python.", stages: [{ label: "SQL", of: [T("sql")] }, { label: "Python", of: [T("python")] }] },
    { id: "go", icon: "🐹", en: "Learn Go", line: "Go basics, data and flow. A short Python primer is optional.", primer: "first-steps", stages: [{ label: "Go", of: [T("go")] }] },
    { id: "web", icon: "🌐", en: "Build web pages", line: "HTML, CSS and JavaScript, then a small quiz app.", stages: [{ label: "Web Basics", of: [T("web")] }] },
    { id: "sec", icon: "🔐", en: "Security", line: "Security Hunt, then the Debug-the-Outage cases.", stages: [{ label: "Security Hunt", of: [Rg("sec-spot"), Rg("sec-patch")] }, { label: "Debug the Outage", of: [Rg("debug-the-outage"), Rg("sec-ops"), Rg("mystery-cases")] }] },
    { id: "play", icon: "🎮", en: "Just play", line: "Arena, Clash and the visual puzzles.", stages: [{ label: "Arena puzzles", of: [T("arena")] }, { label: "Visual puzzles", of: [T("visual")] }], extras: ["bots", "dash", "clash"] },
    { id: "game", icon: "🕹", en: "Build a game", line: "Python basics, then the Game Workshop and a text adventure.", stages: [{ label: "Python basics", of: [Rg("first-steps"), Rg("decisions"), Rg("loops"), Rg("strings"), Rg("collections"), Rg("functions")] }, { label: "Game Workshop", of: [T("games")] }] },
    { id: "jobs", icon: "🧰", en: "Practise real jobs", line: "Python basics, then short jobs from shops, schools and clubs.", stages: [{ label: "Python basics", of: [Rg("first-steps"), Rg("decisions"), Rg("loops"), Rg("strings"), Rg("collections"), Rg("functions")] }, { label: "Micro-Jobs", of: [T("jobs")] }] },
  ];
  AK.goalById = (id) => AK.GOALS.find((g) => g.id === id) || null;
  const expand = (data, of) => { const out = []; of.forEach((tok) => { const [k, id] = tok.split(":"); if (k === "track") data.regions.filter((r) => r.track === id).forEach((r) => out.push(r.id)); else out.push(id); }); return out; };
  /* The path as ordered stages of region ids. `primer` (Go) puts the Python First Steps region in front. */
  AK.pathOf = function (S, data, goalId, primer) {
    const g = AK.goalById(goalId != null ? goalId : AK.v5(S).goal); if (!g) return null;
    const usePrimer = primer != null ? primer : AK.v5(S).primer;
    const stages = g.stages.map((st) => ({ label: st.label, regions: expand(data, st.of) }));
    if (g.primer && usePrimer) stages.unshift({ label: "Python primer", regions: [g.primer] });
    const seen = {}, flat = [];
    stages.forEach((st) => { st.regions = st.regions.filter((r) => { if (seen[r]) return false; seen[r] = 1; return true; }); st.regions.forEach((r) => flat.push(r)); });
    return { goal: g, stages: stages.filter((st) => st.regions.length), regions: flat, set: seen };
  };
  AK.pathMissions = function (S, data, goalId, primer) {
    const p = AK.pathOf(S, data, goalId, primer); if (!p) return [];
    const out = []; p.regions.forEach((r) => AK.regionMissions(data, r).forEach((m) => out.push(m))); return out;
  };
  /* A goal opens the first mission of a path region when everything it needs lies outside the path. No dead ends, no waiting. */
  const baseUnlocked = AK.isUnlocked;
  AK.isUnlocked = function (S, data, m, featuredId) {
    if (baseUnlocked(S, data, m, featuredId)) return true;
    const v = S.v5 && S.v5.goal ? S.v5 : null; if (!v) return false;
    const p = AK.pathOf(S, data); if (!p || !p.set[m.region]) return false;
    const first = AK.regionMissions(data, m.region)[0]; if (!first || first.id !== m.id) return false;
    const byId = data.__byId || (data.__byId = Object.fromEntries(data.missions.map((x) => [x.id, x])));
    return (m.requires || []).every((r) => S.solved[r] || !byId[r] || !p.set[byId[r].region]);
  };
  AK.pathNext = function (S, data, goalId) {
    const list = AK.pathMissions(S, data, goalId);
    return list.find((m) => !S.solved[m.id] && AK.isUnlocked(S, data, m)) || null;
  };
  AK.pathProgress = function (S, data, goalId, primer) {
    const p = AK.pathOf(S, data, goalId, primer); if (!p) return null;
    let solved = 0, total = 0;
    const stages = p.stages.map((st) => { let a = 0, b = 0; st.regions.forEach((r) => AK.regionMissions(data, r).forEach((m) => { b++; if (S.solved[m.id]) a++; })); solved += a; total += b; return { label: st.label, solved: a, total: b, done: b > 0 && a === b }; });
    return { solved: solved, total: total, pct: total ? Math.round((100 * solved) / total) : 0, stages: stages, path: p };
  };
  /* Go goal: offer the short Python primer to anyone who has not finished Python's first region. */
  AK.primerOffer = function (S, data, goalId) {
    const g = AK.goalById(goalId != null ? goalId : AK.v5(S).goal); if (!g || !g.primer) return null;
    if (AK.regionComplete(S, data, g.primer) || AK.v5(S).primer) return null;
    const ms = AK.regionMissions(data, g.primer); return { region: g.primer, missions: ms.length, started: ms.some((m) => S.solved[m.id]) };
  };
  AK.chooseGoal = function (S, id, now) {
    const g = AK.goalById(id); if (!g) return null; const v = AK.v5(S);
    v.goal = id; v.picked = true; v.skipped = false; v.goalDay = ymd(now); if (id !== "go") v.primer = false; return g;
  };
  AK.skipGoal = function (S) { const v = AK.v5(S); v.skipped = true; v.goal = ""; };
  AK.needsChooser = (S) => { const v = AK.v5(S); return !v.picked && !v.skipped && Object.keys(S.solved).length < 3; };
  /* Track cards for "browse everything": one per track with progress. */
  AK.trackCards = function (S, data) {
    return data.tracks.map((t) => {
      const ms = []; data.regions.filter((r) => r.track === t.id).forEach((r) => AK.regionMissions(data, r.id).forEach((m) => ms.push(m)));
      const solved = ms.filter((m) => S.solved[m.id]).length, next = ms.find((m) => !S.solved[m.id] && AK.isUnlocked(S, data, m)) || null;
      return { id: t.id, title: t.title, blurb: t.blurb, total: ms.length, solved: solved, pct: ms.length ? Math.round((100 * solved) / ms.length) : 0, next: next, mins: Math.max(5, Math.round((ms.length * 6) / 5) * 5) };
    });
  };

  /* ---------------------------------------------------------------- mastery map */
  AK.CONCEPTS = [
    { id: "basics", icon: "🔤", en: "Variables and printing", regions: ["first-steps"], skills: ["print", "variables", "input", "f-strings", "arithmetic", "math"] },
    { id: "decisions", icon: "🔀", en: "Decisions (if / else)", regions: ["decisions"], skills: ["if", "elif", "conditions"] },
    { id: "loops", icon: "🔁", en: "Loops", regions: ["loops"], skills: ["loops", "for", "while", "range"] },
    { id: "strings", icon: "🧵", en: "Strings and text", regions: ["strings"], skills: ["strings", "split", "join", "slicing", "formatting"] },
    { id: "collections", icon: "🧺", en: "Lists, dicts and sets", regions: ["collections"], skills: ["lists", "dicts", "dictionaries", "sets", "tuples"] },
    { id: "functions", icon: "🧩", en: "Functions", regions: ["functions"], skills: ["functions", "return", "defaults", "default-args"] },
    { id: "classes", icon: "🏛", en: "Classes and objects", regions: ["objects"], skills: ["classes", "methods"] },
    { id: "errors", icon: "🐛", en: "Errors and debugging", regions: ["modules-debug", "pair-parrot"], skills: ["debugging", "try/except", "raise", "troubleshooting", "investigation"] },
    { id: "files", icon: "📂", en: "Files, JSON and data", regions: ["files-errors"], skills: ["files", "json", "stdin"] },
    { id: "style", icon: "✨", en: "Clean code", regions: ["clean-code"], skills: ["style", "naming", "docstring"] },
    { id: "reading", icon: "📖", en: "Reading code", regions: ["read-code"], skills: ["reading code"] },
    { id: "algo", icon: "🧭", en: "Searching, sorting and interviews", regions: ["problem-solving", "interview-prep"], skills: ["sorting", "search", "order", "interview"] },
    { id: "sql", icon: "🗄", en: "SQL and databases", regions: ["sql-select", "sql-aggregate", "sql-joins", "sql-modify", "sql-advanced", "sql-capstone"], skills: ["sql", "group-by"] },
    { id: "git", icon: "🌿", en: "Git", regions: ["git-basics", "git-branches", "git-undo"], skills: ["git"] },
    { id: "shell", icon: "💻", en: "Linux and the shell", regions: ["debug-the-outage", "mystery-cases", "pipe-plumber"], skills: ["linux", "shell", "permissions", "processes", "pipes", "logs"] },
    { id: "go", icon: "🐹", en: "Go", regions: ["go-basics", "go-data", "go-flow", "go-write", "go-project"], skills: ["go-basics", "go-data", "go-flow"] },
    { id: "web", icon: "🌐", en: "Web basics", regions: ["web-html", "web-css", "web-js", "web-project"], skills: ["html", "css", "js"] },
    { id: "http", icon: "🌐", en: "HTTP and APIs", regions: ["http-curl", "api-python"], skills: ["http"] },
    { id: "security", icon: "🔐", en: "Security", regions: ["sec-spot", "sec-patch", "sec-ops"], skills: ["security"] },
    { id: "projects", icon: "🏗", en: "Projects and real jobs", regions: ["real-world", "python-devops", "proj-logs", "proj-kv", "proj-shortener", "micro-jobs"], skills: ["project", "real-world", "devops"] },
    { id: "games", icon: "🕹", en: "Games and puzzles", regions: ["game-workshop", "game-adventure", "golf-shrine", "maze-basics"], skills: ["games", "robot", "golf"] },
  ];
  const inConcept = (c, m) => c.regions.indexOf(m.region) >= 0 || (m.skills || []).some((s) => c.skills.indexOf(s) >= 0);
  /* Quality of one solved mission: a first-try, no-hint solve is 1.0. Retries and hints lower it a little, never below 0.4,
     because a solve you struggled for still counts. Unsolved is 0. */
  AK.missionQuality = function (S, m) {
    const rec = S.solved[m.id]; if (!rec) return 0;
    const fails = ((S.v4 && S.v4.tries) || {})[m.id] || 0, hints = rec.hints || 0;
    return Math.max(0.4, 1 - 0.15 * Math.min(fails, 3) - 0.1 * Math.min(hints, 3));
  };
  AK.LEVELS = [{ id: 0, en: "Not started", icon: "·" }, { id: 1, en: "Seedling", icon: "🌱" }, { id: 2, en: "Sprout", icon: "🌿" }, { id: 3, en: "Growing", icon: "🌳" }, { id: 4, en: "Strong", icon: "🏆" }];
  AK.mastery = function (S, data) {
    return AK.CONCEPTS.map((c) => {
      const ms = data.missions.filter((m) => inConcept(c, m));
      const done = ms.filter((m) => S.solved[m.id]), q = done.reduce((n, m) => n + AK.missionQuality(S, m), 0);
      const cover = ms.length ? done.length / ms.length : 0, avgQ = done.length ? q / done.length : 0, score = ms.length ? q / ms.length : 0;
      const level = !done.length ? 0 : score >= 0.75 && done.length >= 3 ? 4 : score >= 0.5 ? 3 : score >= 0.25 ? 2 : 1;
      const shaky = done.filter((m) => AK.missionQuality(S, m) < 0.75).sort((a, b) => AK.missionQuality(S, a) - AK.missionQuality(S, b)).slice(0, 3);
      const next = ms.find((m) => !S.solved[m.id] && AK.isUnlocked(S, data, m)) || null;
      return { id: c.id, icon: c.icon, en: c.en, total: ms.length, solved: done.length, cover: cover, quality: avgQ, score: score, pct: Math.round(score * 100), level: level, shaky: shaky, next: next };
    }).filter((x) => x.total > 0);
  };
  /* One calm suggestion: the concept you started but that is still shaky, else the one you have not touched yet. */
  AK.masteryFocus = function (S, data) {
    const list = AK.mastery(S, data), started = list.filter((x) => x.solved > 0 && x.shaky.length);
    if (started.length) { const w = started.sort((a, b) => a.quality - b.quality)[0]; return { kind: "revisit", concept: w, mission: w.shaky[0] }; }
    const open = list.filter((x) => x.next && x.solved > 0 && x.solved < x.total).sort((a, b) => b.cover - a.cover)[0];
    return open ? { kind: "next", concept: open, mission: open.next } : null;
  };

  /* ---------------------------------------------------------------- Maze Dash (second Arena game) */
  const baseCfg = AK.arenaCfg;
  AK.arenaCfg = function (A, L, seed) { const c = baseCfg(A, L, seed); if (A.respawn) { c.respawn = true; c.min_dist = A.min_dist || 0; c.share_turns = !!A.share_turns; } return c; };
  AK.dashOpen = (S, A, id) => { const i = A.leagues.findIndex((l) => l.id === id); return i <= 0 || !!AK.v5(S).dash.done[A.leagues[i - 1].id]; };
  AK.dashLeagueIndex = (S, A) => { const d = AK.v5(S).dash.done; let i = 0; while (i < A.leagues.length && d[A.leagues[i].id]) i++; return Math.min(i, A.leagues.length - 1); };
  AK.dashRecord = function (S, L, series, code, now) {
    const a = AK.v5(S).dash; a.tried += 1; a.wins[L.id] = Math.max(a.wins[L.id] || 0, series.wins);
    if (code) { if (a.code && a.code !== code) a.prev = a.code; a.code = code; }
    let promoted = false, gained = 0;
    if (series.passed && !a.done[L.id]) { a.done[L.id] = ymd(now); promoted = true; gained = 20; seeds(S).earned += 8; S.arenaXp = (S.arenaXp || 0) + gained; AK.recomputeXp && AK.recomputeXp(S); }
    return { promoted: promoted, seeds: promoted ? 8 : 0, xp: gained };
  };

  /* ---------------------------------------------------------------- boss battles */
  AK.bossScene = (B, id) => (B && B.scenes && B.scenes[id]) || null;
  AK.bossNeedsIntro = (S, B, m) => !!(m.boss && AK.bossScene(B, m.id) && !S.solved[m.id] && !AK.v5(S).bossSeen[m.id]);
  AK.bossChoose = function (S, m, perkId) { const v = AK.v5(S); v.bossSeen[m.id] = 1; v.bossPerk[m.id] = perkId || "none"; return v.bossPerk[m.id]; };
  /* Foe health from check results: each passing check hurts it. */
  AK.bossHp = function (results) { const r = (results || []).filter((x) => !x.star), total = r.length || 1, ok = r.filter((x) => x.ok).length; return { total: total, hit: ok, left: total - ok, pct: Math.round((100 * (total - ok)) / total), down: ok === total }; };
  const baseHintCost = AK.hintCost;
  AK.hintCost = function (S, id, now) {
    const v = S.v5; if (v && v.bossPerk && v.bossPerk[id] === "scout" && !((S.hintLvl || {})[id] > 0) && !S.solved[id]) return { cost: 0, free: false, scout: true };
    return baseHintCost(S, id, now);
  };
  const prevSolve = AK.applySolve;
  AK.applySolve = function (S, data, m, opts) {
    const res = prevSolve(S, data, m, opts); if (res.repeat) return res;
    const v = AK.v5(S);
    if (m.boss && !v.bossDone[m.id]) {
      v.bossDone[m.id] = 1;
      if (v.bossPerk[m.id] === "bold" && !((opts || {}).hintsUsed > 0)) { seeds(S).earned += 3; res.seeds = (res.seeds || 0) + 3; res.bold = true; if (Array.isArray(res.breakdown)) res.breakdown.push({ label: "Charged in alone: +3 seeds", xp: 0 }); }
      res.bossWin = true;
    }
    res.titles = (res.titles || []).concat(AK.newTitles(S, data).filter((t) => !(res.titles || []).some((x) => x.id === t.id)));
    return res;
  };

  /* ---------------------------------------------------------------- parrot growth */
  AK.GROW_STEPS = [
    { key: "path", need: 10, q: "Chilaka is ready to grow. Which path feels like you?", opts: [
      { id: "builder", icon: "⛑️", en: "Builder", desc: "A hard hat and a steady wing tap." },
      { id: "detective", icon: "🔍", en: "Detective", desc: "A magnifier and a curious head tilt." },
      { id: "sage", icon: "📜", en: "Sage", desc: "A scroll and a slow, calm glow." }] },
    { key: "trait", need: 40, q: "Chilaka has learned a lot. Pick a trait.", opts: [
      { id: "swift", icon: "⚡", en: "Swift", desc: "A quick, lively flutter." },
      { id: "calm", icon: "🌿", en: "Calm", desc: "A slow, gentle sway." },
      { id: "bold", icon: "🔥", en: "Bold", desc: "A warm glow around the tail." }] },
    { key: "crest", need: 100, q: "A crest for a veteran. Choose its colour.", opts: [
      { id: "gold", icon: "🟡", en: "Gold", desc: "Warm and bright." },
      { id: "emerald", icon: "🟢", en: "Emerald", desc: "Fresh and green." },
      { id: "violet", icon: "🟣", en: "Violet", desc: "Deep and rare." }] },
  ];
  AK.growStage = (S) => { const n = Object.keys(S.solved).length; return AK.GROW_STEPS.filter((s) => n >= s.need).length; };
  AK.growPending = function (S) { const p = AK.v5(S).parrot, n = Object.keys(S.solved).length; return AK.GROW_STEPS.find((s) => n >= s.need && !p[s.key]) || null; };
  AK.growNext = function (S) { const n = Object.keys(S.solved).length, s = AK.GROW_STEPS.find((x) => n < x.need); return s ? { need: s.need, left: s.need - n } : null; };
  /* Any unlocked step can be changed again whenever the learner likes: no choice is permanent. */
  AK.growPick = function (S, key, id) {
    const st = AK.GROW_STEPS.find((s) => s.key === key), n = Object.keys(S.solved).length;
    if (!st || n < st.need || !st.opts.some((o) => o.id === id)) return false; AK.v5(S).parrot[key] = id; return true;
  };
  AK.growLook = function (S) {
    const p = AK.v5(S).parrot, st = AK.growStage(S);
    const path = AK.GROW_STEPS[0].opts.find((o) => o.id === p.path) || null;
    return { stage: st, name: ["Chick", "Fledgling", "Flyer", "Elder"][st], path: p.path, trait: p.trait, crest: p.crest, badge: path ? path.icon : "", cls: ["pg", "pg-s" + st, p.path && "pg-" + p.path, p.trait && "pg-t-" + p.trait, p.crest && "pg-c-" + p.crest].filter(Boolean).join(" ") };
  };

  /* ---------------------------------------------------------------- misconception detector */
  /* ctx: {lang, code, results}. Returns the first rule whose every condition holds on the first failed visible check. */
  AK.misMatch = function (rules, ctx) {
    const bad = (ctx.results || []).filter((r) => !r.ok); if (!bad.length) return null;
    const errR = bad.find((r) => r.err), err = errR ? errR.err : null, first = bad.find((r) => r.got != null || r.expect != null) || bad[0];
    const re = (s, f) => new RegExp(s, f || "");
    for (const r of rules || []) {
      if ((r.lang || "python") !== ctx.lang) continue;
      const c = r.match || {};
      if (c.err && !(err && re("^(?:" + c.err + ")$").test(err.type))) continue;
      if (c.msg && !(err && re(c.msg).test(err.msg || ""))) continue;
      if (c.code && !re(c.code, "m").test(ctx.code || "")) continue;
      if (c.codeNot && re(c.codeNot, "m").test(ctx.code || "")) continue;
      if (c.got && !re(c.got).test(String(first.got == null ? "" : first.got))) continue;
      if (c.expect && !re(c.expect).test(String(first.expect == null ? "" : first.expect))) continue;
      return r;
    }
    return null;
  };
  AK.misNote = function (S, rule) { const v = AK.v5(S); v.mis[rule.id] = (v.mis[rule.id] || 0) + 1; return v.mis[rule.id]; };
  AK.misSpotted = (S) => Object.keys(AK.v5(S).mis).length;

  /* ---------------------------------------------------------------- new titles */
  [{ id: "maze-master", icon: "🧭", en: "Maze Master", desc: "Cleared every Maze Dash league.", test: (S) => Object.keys(AK.v5(S).dash.done).length >= 4 },
   { id: "game-maker", icon: "🕹", en: "Game Maker", desc: "Finished the Escape the Village text adventure.", test: (S) => !!S.solved["adv-04"] },
   { id: "job-done", icon: "💼", en: "Job Done", desc: "Cleared the Micro-Jobs boss.", test: (S) => !!S.solved["mj-10-boss"] },
   { id: "mix-up-spotter", icon: "🧭", en: "Mix-up Spotter", desc: "Learned from 5 different common mix-ups.", test: (S) => AK.misSpotted(S) >= 5 },
   { id: "boss-slayer", icon: "⚔️", en: "Boss Slayer", desc: "Beat 5 story bosses.", test: (S) => Object.keys(AK.v5(S).bossDone).length >= 5 }]
    .forEach((t) => { if (!AK.TITLES.some((x) => x.id === t.id)) AK.TITLES.push(t); });
  if (typeof module !== "undefined" && module.exports) module.exports = AK;
})(typeof self !== "undefined" ? self : globalThis);

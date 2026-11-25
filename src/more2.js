/* AataKode v4 logic (no DOM): Bot Arena series, Clash of Code scoring, streak safety nets, weekly goal, mastery titles,
   identity roles, golden mission, mystery packet, adaptive offers, free daily hint, story chapters, health stats,
   Explain-panel helpers. The browser and the Node verifier both load this file. */
(function (root) {
  "use strict";
  const AK = typeof module !== "undefined" && module.exports ? require("./engine.js") : root.AK;
  const hash = (str) => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0; return h; };
  const nowOf = (x) => (x instanceof Date ? x : new Date());
  const ymd = (d) => AK.dateKey(nowOf(d));
  const seeds = (S) => (S.seeds = S.seeds || { earned: 0, spent: 0 });

  /* ---------------------------------------------------------------- state */
  const blank = () => ({
    arena: { done: {}, wins: {}, tried: 0, code: "", prev: "", beatPrev: 0 },
    clash: { best: {}, solved: {}, codes: [] },
    weekly: { wk: -1, n: 0, goal: 5, paid: false },
    role: "", tries: {}, fails: {}, clean: 0,
    stats: { first: 0, retry: 0, fixes: 0, reads: 0, explains: 0, hintsFree: 0 },
    free: "", golden: {}, packet: { n: 0, last: "" }, ritual: "", story: 0, rest: false, learnSeen: {},
  });
  AK.v4 = (S) => { const b = blank(); const v = S.v4 || (S.v4 = b); for (const k in b) if (v[k] == null) v[k] = b[k]; for (const g of ["arena", "clash", "weekly", "stats", "packet"]) for (const k in b[g]) if (v[g][k] == null) v[g][k] = b[g][k]; return v; };
  const baseNew = AK.newState;
  AK.newState = function () { const s = baseNew(); s.v4 = blank(); return s; };
  const baseMerge = AK.mergeState;
  const maxObj = (a, b) => { const o = Object.assign({}, a || {}); for (const k in b || {}) o[k] = Math.max(o[k] || 0, b[k]); return o; };
  AK.mergeState = function (cur, inc) {
    const out = baseMerge(cur, inc);
    const a = AK.v4(Object.assign({}, { v4: cur.v4 })), b = AK.v4(Object.assign({}, { v4: inc.v4 }));
    out.arenaXp = Math.max(cur.arenaXp || 0, inc.arenaXp || 0);
    const o = AK.v4(out);
    o.arena.done = Object.assign({}, b.arena.done, a.arena.done); o.arena.wins = maxObj(a.arena.wins, b.arena.wins);
    o.arena.tried = Math.max(a.arena.tried, b.arena.tried); o.arena.beatPrev = Math.max(a.arena.beatPrev, b.arena.beatPrev);
    o.arena.code = a.arena.code || b.arena.code; o.arena.prev = a.arena.prev || b.arena.prev;
    o.clash.solved = Object.assign({}, b.clash.solved, a.clash.solved);
    o.clash.best = Object.assign({}, b.clash.best); for (const k in a.clash.best) o.clash.best[k] = b.clash.best[k] ? { ms: Math.min(a.clash.best[k].ms, b.clash.best[k].ms), chars: Math.min(a.clash.best[k].chars, b.clash.best[k].chars) } : a.clash.best[k];
    o.stats = maxObj(a.stats, b.stats); o.story = Math.max(a.story, b.story); o.packet = a.packet.n >= b.packet.n ? a.packet : b.packet;
    o.weekly = a.weekly.wk >= b.weekly.wk ? a.weekly : b.weekly; o.role = a.role || b.role; o.golden = Object.assign({}, b.golden, a.golden);
    o.ritual = a.ritual > b.ritual ? a.ritual : b.ritual; o.learnSeen = Object.assign({}, b.learnSeen, a.learnSeen);
    return out;
  };

  /* ---------------------------------------------------------------- more companions (adopted with seeds you earned) */
  [{ id: "gopal", icon: "🐹", en: "Gopal the gopher", te: "గోపాల్", cost: 20, desc: "Loves Go and tidy error handling." },
   { id: "billi", icon: "🐈", en: "Billi the cat", te: "పిల్లి", cost: 18, desc: "Curious about every bug." },
   { id: "nakka", icon: "🦊", en: "Nakka the fox", te: "నక్క", cost: 28, desc: "Clever with puzzles." },
   { id: "kaki", icon: "🐦‍⬛", en: "Kaki the crow", te: "కాకి", cost: 12, desc: "Collects shiny seeds." }]
    .forEach((c) => { if (AK.SHOP && !AK.SHOP.some((x) => x.id === c.id)) AK.SHOP.push(Object.assign({ kind: "companion" }, c)); });

  /* ---------------------------------------------------------------- Bot Arena */
  AK.arenaCfg = (A, L, seed) => ({ seed: seed, swap: seed % 2 === 0, size: A.size, turns: A.turns, every: A.every, start_seeds: A.start_seeds, walls: L.walls });
  AK.arenaLeagueIndex = (S, A) => { const d = AK.v4(S).arena.done; let i = 0; while (i < A.leagues.length && d[A.leagues[i].id]) i++; return Math.min(i, A.leagues.length - 1); };
  AK.arenaOpen = (S, A, id) => { const i = A.leagues.findIndex((l) => l.id === id); return i <= 0 || !!AK.v4(S).arena.done[A.leagues[i - 1].id]; };
  /* Run the fixed five-match series against a league opponent. `run(code, opp, cfg)` is AK.py.arenaRun (or a stand-in). */
  AK.arenaSeries = function (A, L, code, run, opp) {
    const res = L.seeds.map((seed) => { const m = run(code, opp || L.opp_code, AK.arenaCfg(A, L, seed)); return { seed: seed, winner: m.winner, score: m.score, err: m.err, frames: m.frames, walls: m.walls, size: m.size }; });
    const wins = res.filter((r) => r.winner === 0).length;
    return { results: res, wins: wins, need: L.need, passed: wins >= L.need, err: (res.find((r) => r.err && r.err.who !== 1) || {}).err || null };
  };
  AK.arenaRecord = function (S, L, series, code, now) {
    const a = AK.v4(S).arena; a.tried += 1;
    a.wins[L.id] = Math.max(a.wins[L.id] || 0, series.wins);
    if (code) { if (a.code && a.code !== code) a.prev = a.code; a.code = code; }
    let promoted = false, gained = 0;
    if (series.passed && !a.done[L.id]) { a.done[L.id] = ymd(now); promoted = true; gained = 20; seeds(S).earned += 8; S.arenaXp = (S.arenaXp || 0) + gained; AK.recomputeXp && AK.recomputeXp(S); }
    return { promoted: promoted, seeds: promoted ? 8 : 0, xp: gained };
  };
  AK.arenaBadge = (S) => Object.keys(AK.v4(S).arena.done).length;

  /* ---------------------------------------------------------------- Clash of Code */
  const chk = (s) => (hash("clash|" + s) % 46656).toString(36).padStart(3, "0");
  AK.clashCode = (id, ms, chars) => "AK1-" + id + "-" + Math.round(ms / 1000) + "-" + chars + "-" + chk(id + ":" + Math.round(ms / 1000) + ":" + chars);
  AK.clashParse = function (code) {
    const m = String(code || "").trim().match(/^AK1-([a-z0-9]+)-(\d+)-(\d+)-([a-z0-9]{3})$/);
    if (!m || chk(m[1] + ":" + m[2] + ":" + m[3]) !== m[4]) return null;
    return { id: m[1], sec: +m[2], chars: +m[3] };
  };
  AK.clashPick = (C, seedStr) => C.puzzles[hash(String(seedStr)) % C.puzzles.length];
  AK.clashDaily = (C, now) => AK.clashPick(C, "clash" + ymd(now));
  AK.clashCompare = function (mine, theirs, mode) {
    if (!mine || !theirs || mine.id !== theirs.id) return "These scores are for different puzzles.";
    const a = mode === "shortest" ? mine.chars : mine.sec, b = mode === "shortest" ? theirs.chars : theirs.sec;
    return a < b ? "You win" : a > b ? "They win" : "A tie";
  };
  AK.clashGhost = function (p, ms) { const sorted = p.ghosts.slice().sort((a, b) => a - b); const beaten = sorted.filter((g) => ms / 1000 < g).length; return { beaten: beaten, of: sorted.length, rank: sorted.length - beaten + 1 }; };
  AK.clashRecord = function (S, p, ms, chars) {
    const c = AK.v4(S).clash, old = c.best[p.id]; const first = !c.solved[p.id]; c.solved[p.id] = 1;
    c.best[p.id] = old ? { ms: Math.min(old.ms, ms), chars: Math.min(old.chars, chars) } : { ms: ms, chars: chars };
    if (first) seeds(S).earned += 2;
    return { first: first, newBest: !old || ms < old.ms || chars < old.chars };
  };

  /* ---------------------------------------------------------------- streak safety nets */
  const wday = (key) => new Date(key + "T12:00:00").getDay();
  const addDays = (key, n) => { const d = new Date(key + "T12:00:00"); d.setDate(d.getDate() + n); return AK.dateKey(d); };
  /* Days strictly between `last` and `today` that would break a streak: weekends are free when the weekend pass is on. */
  AK.missedDays = function (S, last, today) {
    const pass = (S.settings || {}).weekendPass !== false; let n = 0;
    for (let k = addDays(last, 1); k < today; k = addDays(k, 1)) { const w = wday(k); if (!(pass && (w === 0 || w === 6))) n++; }
    return n;
  };
  AK.streakStatus = function (S, now) {
    const st = S.streak, today = AK.dateKey(now);
    if (!st.last) return { count: 0, atRisk: false, rec: null };
    const gap = AK.daysBetween(today, st.last);
    if (gap <= 0) return { count: st.count, atRisk: false, rec: st.rec || null };
    const missed = AK.missedDays(S, st.last, today);
    if (missed === 0) return { count: st.count, atRisk: gap >= 1 && wday(today) !== 0 && wday(today) !== 6 && gap === 1, rest: gap > 1, rec: null };
    if (missed <= st.freezes) return { count: st.count, atRisk: true, rec: null };
    return { count: 0, atRisk: false, rec: st.rec && st.rec.count ? st.rec : st.count >= 3 ? { count: st.count, need: 3, done: 0, day: today, offer: true } : null };
  };
  AK.touchStreak = function (S, now) {
    const st = S.streak, today = AK.dateKey(now);
    if (st.last === today) return;
    if (!st.last) st.count = 1;
    else {
      const missed = AK.missedDays(S, st.last, today);
      if (missed === 0) st.count += 1;
      else if (missed <= st.freezes) { st.freezes -= missed; st.count += 1; }
      else { if (st.count >= 3) st.rec = { count: st.count, need: 3, done: 0, day: today }; st.count = 1; }
    }
    st.last = today; st.best = Math.max(st.best, st.count);
    if (st.count > 0 && st.count % 7 === 0) { st.freezes = Math.min(2, st.freezes + 1); seeds(S).earned += 10; }
  };
  /* Recovery quest: three solves on the comeback day restore the earlier streak. Never shames, expires quietly. */
  AK.recoveryTick = function (S, now) {
    const st = S.streak, r = st.rec, today = AK.dateKey(now);
    if (!r) return null;
    if (r.day !== today && AK.daysBetween(today, r.day) > 0) { delete st.rec; return null; }
    r.done += 1;
    if (r.done >= r.need) { st.count = r.count + 1; st.best = Math.max(st.best, st.count); delete st.rec; return { restored: st.count }; }
    return { progress: r.done, need: r.need };
  };

  /* ---------------------------------------------------------------- core-loop wrappers on applySolve */
  const trackOf = (data, m) => { const r = data.regions.find((x) => x.id === m.region); return r ? r.track : ""; };
  const bossIds = (data) => data.missions.filter((m) => m.boss).map((m) => m.id);
  AK.noteFail = function (S, m) { const v = AK.v4(S); v.tries[m.id] = (v.tries[m.id] || 0) + 1; v.fails[m.id] = (v.fails[m.id] || 0) + 1; v.clean = 0; return v.fails[m.id]; };
  AK.hintCost = function (S, id, now) { const v = AK.v4(S), t = ymd(now); if (v.free !== t) return { cost: 0, free: true }; return { cost: (seeds(S).earned - seeds(S).spent) >= 1 ? 1 : 0, free: false }; };
  AK.takeHint = function (S, id, now) { const v = AK.v4(S), t = ymd(now), c = AK.hintCost(S, id, now); if (c.free) { v.free = t; v.stats.hintsFree += 1; } else if (c.cost) seeds(S).spent += c.cost; return c; };
  const baseSolve = AK.applySolve;
  AK.applySolve = function (S, data, m, opts) {
    opts = opts || {}; const now = nowOf(opts.now), v = AK.v4(S);
    const gold0 = AK.golden(S, data, now);
    const res = baseSolve(S, data, m, opts);
    if (res.repeat) return res;
    /* hints cost seeds, not XP: give back the XP the base engine took off */
    const hints = opts.hintsUsed || 0, base = m.xp || 20;
    if (hints > 0) { const lost = base - Math.max(Math.round(base / 2), base - hints * 5); if (lost > 0) { res.gained += lost; if (S.solved[m.id]) S.solved[m.id].xp += lost; AK.recomputeXp(S); } if (Array.isArray(res.breakdown)) res.breakdown.forEach((b) => { if (/^Hints used/.test(b.label)) { b.label = "Hints used: " + hints + " (they cost seeds, never XP)"; } }); }
    const fails = v.fails[m.id] || 0, firstTry = fails === 0;
    if (firstTry) v.stats.first += 1; else { v.stats.retry += 1; res.effort = { tries: fails + 1 }; }
    if (m.type === "fix-the-bug" || m.type === "hunt" || m.type === "pair") v.stats.fixes += 1;
    if (m.type === "read") v.stats.reads += 1;
    v.clean = firstTry && hints === 0 ? v.clean + 1 : 0; delete v.fails[m.id];
    /* weekly goal */
    const wk = AK.weekIndex(now), w = v.weekly; if (w.wk !== wk) { w.wk = wk; w.n = 0; w.paid = false; } w.n += 1;
    if (w.n >= w.goal && !w.paid) { w.paid = true; seeds(S).earned += 5; res.weeklyGoal = true; res.seeds = (res.seeds || 0) + 5; }
    /* golden mission + mystery packet */
    const g = gold0 || AK.golden(S, data, now);
    if (g && g.id === m.id && !v.golden[ymd(now)]) { v.golden[ymd(now)] = m.id; seeds(S).earned += 4; res.golden = true; res.seeds = (res.seeds || 0) + 4; if (Array.isArray(res.breakdown)) res.breakdown.push({ label: "Golden mission: +4 seeds", xp: 0 }); }
    v.packet.n += 1;
    if (v.packet.n % 7 === 0) { const n = 1 + (hash(ymd(now) + v.packet.n) % 5); seeds(S).earned += n; res.packet = n; v.packet.last = ymd(now); res.seeds = (res.seeds || 0) + n; }
    /* streak recovery */
    const rec = AK.recoveryTick(S, now); if (rec) res.recovery = rec;
    /* story chapter */
    const b = bossIds(data).filter((id) => S.solved[id]).length, ch = AK.chaptersUnlocked(S, data, b);
    if (ch > v.story + 0 && m.boss) { res.chapter = v.story + 1; }
    res.titles = AK.newTitles(S, data);
    return res;
  };

  /* ---------------------------------------------------------------- golden mission, adaptive offers */
  AK.golden = function (S, data, now) {
    const open = data.missions.filter((m) => !S.solved[m.id] && !m.boss && AK.isUnlocked(S, data, m));
    if (!open.length) return null; const t = ymd(now), done = AK.v4(S).golden[t];
    if (done) return data.missions.find((m) => m.id === done);
    return open[hash("gold" + t) % open.length];
  };
  AK.flowOffer = function (S, data, m) {
    const v = AK.v4(S), list = AK.regionMissions(data, m.region), i = list.findIndex((x) => x.id === m.id);
    if ((v.fails[m.id] || 0) >= 3 && i > 0) { const sib = list.slice(0, i).reverse().find((x) => x.type === m.type) || list[i - 1]; return { kind: "easier", mission: sib }; }
    if (v.clean >= 3) { const nxt = data.missions.find((x) => !S.solved[x.id] && x.id !== m.id && x.region !== m.region && AK.isUnlocked(S, data, x) && !x.boss); if (nxt) return { kind: "skip", mission: nxt }; }
    return null;
  };

  /* ---------------------------------------------------------------- titles and roles */
  AK.TITLES = [
    { id: "bug-whisperer", icon: "🔧", en: "Bug Whisperer", desc: "Solved 5 missions after more than one try. Persistence is the skill.", test: (S, v) => v.stats.retry >= 5 },
    { id: "clean-hands", icon: "✨", en: "Clean Hands", desc: "10 missions solved on the first try.", test: (S, v) => v.stats.first >= 10 },
    { id: "detective", icon: "🕵️", en: "Detective", desc: "Solved 8 find-the-bug missions.", test: (S, v) => v.stats.fixes >= 8 },
    { id: "code-reader", icon: "📖", en: "Code Reader", desc: "Solved 5 read-the-code missions.", test: (S, v) => v.stats.reads >= 5 },
    { id: "curious", icon: "💡", en: "Curious Mind", desc: "Opened the Explain panel 10 times.", test: (S, v) => v.stats.explains >= 10 },
    { id: "arena-bronze", icon: "🥉", en: "Arena Climber", desc: "Cleared two Bot Arena leagues.", test: (S, v) => Object.keys(v.arena.done).length >= 2 },
    { id: "arena-legend", icon: "🏆", en: "Arena Legend", desc: "Cleared every Bot Arena league.", test: (S, v) => Object.keys(v.arena.done).length >= 5 },
    { id: "clasher", icon: "⚡", en: "Clasher", desc: "Solved 5 different Clash puzzles.", test: (S, v) => Object.keys(v.clash.solved).length >= 5 },
    { id: "steady", icon: "🌱", en: "Steady Gardener", desc: "A best streak of 7 days.", test: (S) => (S.streak || {}).best >= 7 },
  ];
  AK.titlesFor = (S) => { const v = AK.v4(S); return AK.TITLES.filter((t) => t.test(S, v)); };
  AK.newTitles = function (S) { const v = AK.v4(S); v.titles = v.titles || {}; const out = []; AK.titlesFor(S).forEach((t) => { if (!v.titles[t.id]) { v.titles[t.id] = 1; out.push(t); } }); return out; };
  AK.ROLES = [
    { id: "builder", icon: "🛠", en: "Builder", line: "You like making things work.", types: ["write-code", "sql", "go", "pipe", "grid", "terminal"] },
    { id: "detective", icon: "🕵️", en: "Detective", line: "You like finding what is wrong.", types: ["fix-the-bug", "hunt", "pair", "read", "predict"] },
    { id: "gardener", icon: "🌱", en: "Gardener", line: "You like steady growth.", types: [] },
    { id: "explorer", icon: "🧭", en: "Explorer", line: "You like trying new places.", types: [] },
  ];
  AK.roleScores = function (S, data) {
    const sc = { builder: 0, detective: 0, gardener: 0, explorer: 0 }; const tracks = {};
    data.missions.forEach((m) => { if (!S.solved[m.id]) return; AK.ROLES.forEach((r) => { if (r.types.indexOf(m.type) >= 0) sc[r.id]++; }); tracks[trackOf(data, m)] = 1; });
    sc.explorer = Object.keys(tracks).length * 3; sc.gardener = Math.floor(((S.streak || {}).best || 0) * 1.5) + Math.floor(seeds(S).spent / 4);
    return sc;
  };
  AK.roleOf = (S, data) => { const v = AK.v4(S); if (v.role) return AK.ROLES.find((r) => r.id === v.role); const sc = AK.roleScores(S, data); const best = Object.keys(sc).sort((a, b) => sc[b] - sc[a])[0]; return sc[best] > 0 ? AK.ROLES.find((r) => r.id === best) : null; };

  /* ---------------------------------------------------------------- story */
  AK.chaptersUnlocked = function (S, data, bossCount) {
    const B = bossIds(data).length || 1, n = bossCount != null ? bossCount : bossIds(data).filter((id) => S.solved[id]).length;
    return Math.min(12, Math.floor((n * 12) / B + 1e-9));
  };

  /* ---------------------------------------------------------------- daily ritual, weekly goal */
  AK.ritualPick = function (data, now) { const pool = data.missions.filter((m) => m.type === "predict" && m.code && m.code.split("\n").length <= 4 && m.options); return pool.length ? pool[hash("ritual" + ymd(now)) % pool.length] : null; };
  AK.ritualDone = (S, now) => AK.v4(S).ritual === ymd(now);
  AK.ritualFinish = function (S, now) { const v = AK.v4(S); if (v.ritual === ymd(now)) return 0; v.ritual = ymd(now); seeds(S).earned += 1; return 1; };
  AK.weeklyState = function (S, now) { const v = AK.v4(S), w = v.weekly, wk = AK.weekIndex(nowOf(now)); return { n: w.wk === wk ? w.n : 0, goal: w.goal, paid: w.wk === wk && w.paid }; };

  /* ---------------------------------------------------------------- Explain panel helpers */
  AK.learnOf = function (m, data) { const l = m.learn; if (!l) return null; return typeof l === "string" ? (data.learn || {})[l] || null : l; };
  /* Line diff (LCS) between learner code and the reference: [{t:"same"|"del"|"add", s}] */
  AK.diffLines = function (a, b) {
    const x = String(a || "").replace(/\s+$/, "").split("\n"), y = String(b || "").replace(/\s+$/, "").split("\n"), n = x.length, m = y.length;
    const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i].trim() === y[j].trim() ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const out = []; let i = 0, j = 0;
    while (i < n && j < m) { if (x[i].trim() === y[j].trim()) { out.push({ t: "same", s: y[j] }); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) out.push({ t: "del", s: x[i++] }); else out.push({ t: "add", s: y[j++] }); }
    while (i < n) out.push({ t: "del", s: x[i++] }); while (j < m) out.push({ t: "add", s: y[j++] });
    return out;
  };
  /* Near miss: "5 of 6 checks pass" and which one is left. */
  AK.nearMiss = function (results) { const total = results.length, ok = results.filter((r) => r.ok).length; return { ok: ok, total: total, close: total > 1 && ok >= Math.ceil(total * 0.6) && ok < total, first: results.find((r) => !r.ok) || null }; };

  /* ---------------------------------------------------------------- mission health (local only) */
  AK.health = function (S, data, now) {
    const v = AK.v4(S), ids = Object.keys(S.solved), tracks = {}, days = {};
    data.tracks.forEach((t) => (tracks[t.id] = { solved: 0, total: 0 }));
    data.missions.forEach((m) => { const t = trackOf(data, m); if (!tracks[t]) tracks[t] = { solved: 0, total: 0 }; tracks[t].total++; if (S.solved[m.id]) tracks[t].solved++; });
    ids.forEach((id) => { const a = (S.solved[id] || {}).at; if (a) days[a] = (days[a] || 0) + 1; });
    const hintsTotal = ids.reduce((n, id) => n + ((S.solved[id] || {}).hints || 0), 0);
    const hardest = Object.keys(v.tries).sort((a, b) => v.tries[b] - v.tries[a]).slice(0, 5).map((id) => ({ id: id, tries: v.tries[id] }));
    return { generated: ymd(now), solved: ids.length, total: data.missions.length, xp: S.xp, firstTry: v.stats.first, retried: v.stats.retry, hints: hintsTotal, avgHints: ids.length ? +(hintsTotal / ids.length).toFixed(2) : 0, activeDays: Object.keys(days).length, perDay: days, streak: S.streak, tracks: tracks, hardest: hardest, arena: v.arena.done, clash: Object.keys(v.clash.solved).length, titles: Object.keys(v.titles || {}), seeds: { earned: seeds(S).earned, spent: seeds(S).spent } };
  };

  /* ---------------------------------------------------------------- printables */
  AK.certificate = function (S, data, scope) {
    const id = AK.proofId ? AK.proofId(S) : "";
    return { name: S.name || "Learner", scope: scope, solved: Object.keys(S.solved).length, rank: (AK.rankFor(S.xp).current || {}).en || "", date: ymd(new Date()), id: id };
  };
  if (typeof module !== "undefined" && module.exports) module.exports = AK;
})(typeof self !== "undefined" ? self : globalThis);

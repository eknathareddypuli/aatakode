/* AataKode engine: shared by the browser app and the lesson verifier (Node).
 * No DOM access in this file. Contents:
 *   1. ranks, badges, dates          4. terminal simulator + grader
 *   2. progress / XP / streak logic  5. Python bridge (Pyodide)
 *   3. friendly errors, blocks view  6. teacher cards
 */
(function (root) {
  "use strict";
  const AK = {};

  /* ---------------------------------------------------------------- 1. ranks, dates */
  AK.RANKS = [
    { xp: 0, en: "Seedling", te: "విత్తు" },
    { xp: 100, en: "Sprout", te: "మొలక" },
    { xp: 300, en: "Sapling", te: "మొక్క" },
    { xp: 700, en: "Branch", te: "కొమ్మ" },
    { xp: 1300, en: "Tree", te: "చెట్టు" },
    { xp: 2200, en: "Forest", te: "వనం" },
    { xp: 3400, en: "Grove", te: "తోపు" },
    { xp: 5000, en: "Banyan", te: "మర్రి" },
  ];

  AK.rankFor = function (xp) {
    let i = 0;
    for (let k = 0; k < AK.RANKS.length; k++) if (xp >= AK.RANKS[k].xp) i = k;
    const cur = AK.RANKS[i], next = AK.RANKS[i + 1] || null;
    const pct = next ? Math.round(((xp - cur.xp) / (next.xp - cur.xp)) * 100) : 100;
    return { index: i, current: cur, next: next, pct: pct };
  };

  AK.dateKey = function (d) {
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  };
  function dayNumber(key) {
    const [y, m, d] = key.split("-").map(Number);
    return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  }
  AK.daysBetween = function (a, b) { return dayNumber(a) - dayNumber(b); };

  /* Week index counts weeks since 2024-01-01 (a Monday), in the learner's local time. */
  AK.weekIndex = function (d) {
    return Math.floor((dayNumber(AK.dateKey(d)) - dayNumber("2024-01-01")) / 7);
  };
  AK.daysUntilNextWeek = function (d) {
    const since = dayNumber(AK.dateKey(d)) - dayNumber("2024-01-01");
    return 7 - (((since % 7) + 7) % 7);
  };
  AK.featuredOutage = function (missions, d) {
    const ops = missions.filter((m) => m.type === "terminal" && m.region === "debug-the-outage").sort((a, b) => a.order - b.order);
    if (!ops.length) return null;
    return ops[((AK.weekIndex(d) % ops.length) + ops.length) % ops.length];
  };
  /* Outage of the Day: a different incident every date, never the same as the weekly one. */
  AK.outageOfDay = function (missions, d) {
    const ops = missions.filter((m) => m.type === "terminal" && m.region === "debug-the-outage").sort((a, b) => a.order - b.order);
    if (!ops.length) return null;
    const wk = AK.featuredOutage(missions, d);
    let k = hash("outage-day-" + AK.dateKey(d)) % ops.length;
    if (ops.length > 1 && wk && ops[k].id === wk.id) k = (k + 1) % ops.length;
    return ops[k];
  };

  /* ---------------------------------------------------------------- 2. progress */
  AK.newState = function () {
    return {
      v: 1, name: "", classCode: "", xp: 0, solved: {}, drafts: {}, hintLvl: {},
      testOut: {}, explains: {}, votes: {},
      streak: { count: 0, best: 0, last: "", freezes: 0 },
      badges: {}, weekly: {}, askLvl: {},
      dailyXp: 0, dailyDone: 0, daily: { date: "", done: {}, pts: 0, bonus: false },
      seeds: { earned: 0, spent: 0 }, shop: {}, village: { plots: [], seen: {} }, companion: "",
      placed: null, speed: {}, blitz: { best: 0, runs: 0 }, golf: {}, dungeon: { best: 0, runs: 0 }, outageDays: {}, fade: {}, pairDiag: {},
      settings: { lang: "en", theme: "dark", motion: "auto", socratic: false, outfit: "none", editor: "classic", sound: "on", haptics: "on", buddy: "on" },
      created: new Date().toISOString(),
    };
  };

  AK.recomputeXp = function (S) {
    let xp = 0;
    for (const id in S.solved) xp += S.solved[id].xp || 0;
    for (const id in S.explains) if (S.explains[id].bonus) xp += 5;
    xp += S.dailyXp || 0;
    S.xp = xp;
    return xp;
  };

  AK.regionMissions = function (data, regionId) {
    return data.missions.filter((m) => m.region === regionId).sort((a, b) => a.order - b.order);
  };

  AK.regionComplete = function (S, data, regionId) {
    const ms = AK.regionMissions(data, regionId);
    if (!ms.length) return false;
    const boss = ms.find((m) => m.boss);
    if (boss) return !!S.solved[boss.id];
    return ms.every((m) => S.solved[m.id]);
  };

  AK.isUnlocked = function (S, data, m, featuredId) {
    if (S.solved[m.id]) return true;
    if ((m.requires || []).every((r) => S.solved[r])) return true;
    if (m.boss && S.testOut[m.region]) return true;
    if (featuredId && [].concat(featuredId).indexOf(m.id) >= 0) return true;
    if (AK.regionComplete(S, data, m.region)) return true;
    if (S.placed && AK.placedUnlock && AK.placedUnlock(S, data, m)) return true;
    return false;
  };

  AK.streakStatus = function (S, now) {
    const st = S.streak, today = AK.dateKey(now);
    if (!st.last) return { count: 0, atRisk: false };
    const gap = AK.daysBetween(today, st.last);
    if (gap <= 0) return { count: st.count, atRisk: false };
    if (gap === 1) return { count: st.count, atRisk: true };
    if (gap === 2 && st.freezes > 0) return { count: st.count, atRisk: true };
    return { count: 0, atRisk: false };
  };

  function touchStreak(S, now) {
    const st = S.streak, today = AK.dateKey(now);
    if (st.last === today) return;
    if (!st.last) st.count = 1;
    else {
      const gap = AK.daysBetween(today, st.last);
      if (gap === 1) st.count += 1;
      else if (gap === 2 && st.freezes > 0) { st.freezes -= 1; st.count += 1; }
      else st.count = 1;
    }
    st.last = today;
    st.best = Math.max(st.best, st.count);
    if (st.count > 0 && st.count % 7 === 0) { st.freezes = Math.min(2, st.freezes + 1); S.seeds = S.seeds || { earned: 0, spent: 0 }; S.seeds.earned += 10; }
  }

  AK.touchStreak = touchStreak;
  AK.starsOf = function (S, id) { const r = S.solved[id]; return r ? (r.stars != null ? r.stars : r.hints === 0 ? 2 : 1) : 0; };
  AK.totalStars = function (S) { let n = 0; for (const id in S.solved) n += AK.starsOf(S, id); return n; };
  AK.BADGES = [
    { id: "first-spark", icon: "✨", en: "First Spark", te: "మొదటి మెరుపు", desc: "Solve your first mission." },
    { id: "no-hints", icon: "🧠", en: "Own Brain", te: "స్వంత బుద్ధి", desc: "Solve a mission without any hints." },
    { id: "bug-squasher", icon: "🐛", en: "Bug Squasher", te: "బగ్ వేటగాడు", desc: "Fix a broken program in a bug-fix mission." },
    { id: "explainer", icon: "💬", en: "Explainer", te: "వివరణకారుడు", desc: "Explain your fix in your own words 3 times." },
    { id: "comparer", icon: "⚖️", en: "Code Critic", te: "కోడ్ విమర్శకుడు", desc: "Vote on a solution in the comparison view." },
    { id: "streak-3", icon: "🔥", en: "3-Day Streak", te: "3 రోజుల వరుస", desc: "Learn on 3 days in a row." },
    { id: "streak-7", icon: "🌋", en: "7-Day Streak", te: "7 రోజుల వరుస", desc: "Learn on 7 days in a row." },
    { id: "outage-survivor", icon: "🚨", en: "Outage Survivor", te: "అంతరాయ విజేత", desc: "Fix a server outage in the simulated terminal." },
    { id: "weekly-hero", icon: "🏅", en: "Weekly Hero", te: "వారపు వీరుడు", desc: "Solve the Outage of the Week during its week." },
    { id: "three-stars", icon: "⭐", en: "Triple Star", te: "మూడు నక్షత్రాలు", desc: "Earn 3 stars on a mission: no hints and a clean solution." },
    { id: "star-collector", icon: "🌟", en: "Star Collector", te: "నక్షత్ర సేకర్త", desc: "Collect 40 stars across missions." },
    { id: "predictor", icon: "🔮", en: "Mind Compiler", te: "మనసు కంపైలర్", desc: "Predict the output correctly in 10 missions." },
    { id: "pest-control", icon: "🪲", en: "Pest Control", te: "పురుగుల వేట", desc: "Finish a Daily Quest." },
    { id: "daily-7", icon: "📅", en: "Daily Habit", te: "రోజువారీ అలవాటు", desc: "Finish 7 Daily Quests." },
    { id: "python-graduate", icon: "🎓", en: "Python Graduate", te: "పైథాన్ పట్టభద్రుడు", desc: "Complete every Python Quest region." },
    { id: "sql-sage", icon: "🗃️", en: "SQL Sage", te: "SQL పండితుడు", desc: "Clear every SQL region." },
    { id: "git-guardian", icon: "🌿", en: "Git Guardian", te: "గిట్ రక్షకుడు", desc: "Clear every Git region." },
    { id: "career-ready", icon: "💼", en: "Career Ready", te: "ఉద్యోగ సిద్ధం", desc: "Clear Python for DevOps and Interview Prep." },
    { id: "case-closed", icon: "🕵️", en: "Case Closed", te: "కేసు ముగిసింది", desc: "Solve a Mystery Case." },
    { id: "detective", icon: "🔎", en: "Chief Detective", te: "ప్రధాన డిటెక్టివ్", desc: "Solve every Mystery Case." },
    { id: "speedster", icon: "⏱️", en: "Speedster", te: "వేగవీరుడు", desc: "Set a Speed Run record on 3 missions." },
    { id: "blitzer", icon: "⚡", en: "Blitz Brain", te: "మెరుపు మెదడు", desc: "Finish a Prediction Blitz with 5 of 5 right." },
    { id: "birdie", icon: "⛳", en: "Birdie", te: "బర్డీ", desc: "Beat par on a Code Golf hole." },
    { id: "golf-pro", icon: "🏌️", en: "Golf Pro", te: "గోల్ఫ్ ప్రో", desc: "Beat par on 5 Code Golf holes." },
    { id: "pair-pro", icon: "🦜", en: "Pair Programmer", te: "జంట ప్రోగ్రామర్", desc: "Help Chilaka fix 5 bugs in Pair Parrot." },
    { id: "dungeon-5", icon: "🕳️", en: "Dungeon Delver", te: "గుహ అన్వేషి", desc: "Reach floor 5 of the Endless Dungeon." },
    { id: "dungeon-15", icon: "🐉", en: "Dungeon Master", te: "గుహ నాయకుడు", desc: "Reach floor 15 of the Endless Dungeon." },
    { id: "placed", icon: "🧭", en: "Pathfinder", te: "మార్గదర్శి", desc: "Take the placement quiz." },
    { id: "builder", icon: "🏗️", en: "Village Builder", te: "గ్రామ నిర్మాత", desc: "Place 6 buildings in Aata-gram." },
    { id: "pal", icon: "🐿️", en: "Chilaka's Pal", te: "చిలుక స్నేహితుడు", desc: "Adopt a companion for Chilaka." },
    { id: "day-outage", icon: "🌅", en: "On Call Today", te: "ఈ రోజు ఆన్-కాల్", desc: "Solve an Outage of the Day." },
  ];
  AK.regionBadge = function (region) {
    return { id: "region-" + region.id, icon: region.icon || "🏁", en: region.title + " cleared", te: (region.title_te || region.title) + " పూర్తి", desc: "Beat the boss of " + region.title + "." };
  };
  AK.allBadges = function (data) {
    return AK.BADGES.concat(data.regions.map(AK.regionBadge));
  };

  AK.checkBadges = function (S, data, now) {
    const earned = [];
    const give = (id) => { if (!S.badges[id]) { S.badges[id] = AK.dateKey(now); earned.push(id); } };
    const solvedMs = data.missions.filter((m) => S.solved[m.id]);
    if (solvedMs.length >= 1) give("first-spark");
    if (solvedMs.some((m) => S.solved[m.id].hints === 0)) give("no-hints");
    if (solvedMs.some((m) => m.boss || m.type === "fix-the-bug")) give("bug-squasher");
    if (Object.values(S.explains).filter((e) => e.bonus).length >= 3) give("explainer");
    if (Object.keys(S.votes).some((k) => Object.keys(S.votes[k]).length)) give("comparer");
    if (S.streak.count >= 3) give("streak-3");
    if (S.streak.count >= 7) give("streak-7");
    if (solvedMs.some((m) => m.type === "terminal")) give("outage-survivor");
    if (Object.keys(S.weekly).length) give("weekly-hero");
    if (solvedMs.some((m) => AK.starsOf(S, m.id) >= 3)) give("three-stars");
    if (AK.totalStars(S) >= 40) give("star-collector");
    if (solvedMs.filter((m) => m.type === "predict").length >= 10) give("predictor");
    if (S.dailyDone >= 1) give("pest-control");
    if (S.dailyDone >= 7) give("daily-7");
    const pyRegions = data.regions.filter((r) => r.track === "python");
    for (const r of data.regions) if (AK.regionComplete(S, data, r.id)) give("region-" + r.id);
    if (pyRegions.length && pyRegions.every((r) => AK.regionComplete(S, data, r.id))) give("python-graduate");
    const trackDone = (id) => { const rs = data.regions.filter((r) => r.track === id); return rs.length > 0 && rs.every((r) => AK.regionComplete(S, data, r.id)); };
    if (trackDone("sql")) give("sql-sage");
    if (trackDone("git")) give("git-guardian");
    if (trackDone("career")) give("career-ready");
    const mys = data.missions.filter((m) => m.region === "mystery-cases");
    if (mys.some((m) => S.solved[m.id])) give("case-closed");
    if (mys.length && mys.every((m) => S.solved[m.id])) give("detective");
    if (Object.keys(S.speed || {}).length >= 3) give("speedster");
    if ((S.blitz || {}).perfect) give("blitzer");
    const golfUnder = data.missions.filter((m) => m.golf && S.golf && S.golf[m.id] && S.golf[m.id].best < m.golf.par);
    if (golfUnder.length >= 1) give("birdie");
    if (golfUnder.length >= 5) give("golf-pro");
    if (data.missions.filter((m) => m.type === "pair" && S.solved[m.id]).length >= 5) give("pair-pro");
    if (((S.dungeon || {}).best || 0) >= 5) give("dungeon-5");
    if (((S.dungeon || {}).best || 0) >= 15) give("dungeon-15");
    if (S.placed) give("placed");
    if (((S.village || {}).plots || []).filter(Boolean).length >= 6) give("builder");
    if (S.companion) give("pal");
    if (Object.keys(S.outageDays || {}).length) give("day-outage");
    return earned;
  };

  /* Awards XP for a first solve. Hints cost 5 XP each (never below half the base). */
  AK.applySolve = function (S, data, m, opts) {
    const now = opts.now || new Date();
    if (S.solved[m.id]) return { repeat: true, gained: 0, breakdown: [], newBadges: [], rankUp: false };
    const hints = opts.hintsUsed || 0;
    const before = AK.rankFor(S.xp).index;
    const base = m.xp || 20;
    const main = Math.max(Math.round(base / 2), base - hints * 5);
    const breakdown = [{ label: "Mission", xp: main }];
    if (hints > 0) breakdown.push({ label: "Hints used: " + hints, xp: 0 });
    let total = main;
    if (hints === 0) { breakdown.push({ label: "No-hints bonus", xp: 10 }); total += 10; }
    const stars = starsFor(m, hints, opts);
    if (stars === 3) { breakdown.push({ label: "Mastery star bonus", xp: 5 }); total += 5; }
    let seeds = 2 + stars + (m.boss ? 3 : 0);
    if (m.type === "pair" && opts.diagFirst) { breakdown.push({ label: "Spotted the misconception first try", xp: 5 }); total += 5; }
    if (opts.weeklyId && opts.weeklyId === m.id) {
      breakdown.push({ label: "Outage of the Week", xp: 30 }); total += 30; seeds += 5;
      S.weekly[String(AK.weekIndex(now))] = m.id;
    }
    if (opts.dayId && opts.dayId === m.id) {
      breakdown.push({ label: "Outage of the Day", xp: 15 }); total += 15; seeds += 5;
      S.outageDays = S.outageDays || {}; S.outageDays[AK.dateKey(now)] = m.id;
    }
    S.solved[m.id] = { xp: total, hints: hints, at: AK.dateKey(now), code: opts.code || "", stars: stars };
    touchStreak(S, now);
    S.seeds = S.seeds || { earned: 0, spent: 0 }; S.seeds.earned += seeds;
    AK.recomputeXp(S);
    const newBadges = AK.checkBadges(S, data, now);
    return { repeat: false, gained: total, seeds: seeds, stars: stars, breakdown: breakdown, newBadges: newBadges, rankUp: AK.rankFor(S.xp).index > before };
  };

  /* 1 star = solved; 2 = no hints; 3 = no hints and (clean-up challenge passed, or solved on the first check). */
  function starsFor(m, hints, opts) {
    if (hints > 0) return 1;
    const third = m.clean ? opts.cleanPass === true : opts.firstTry !== false;
    return third ? 3 : 2;
  }
  /* Re-checking a solved mission can upgrade its stars (e.g. after finishing the clean-up challenge). */
  AK.restar = function (S, data, m, opts) {
    const r = S.solved[m.id]; if (!r) return { upgraded: false, newBadges: [] };
    const now = opts.now || new Date(), cur = AK.starsOf(S, m.id), want = starsFor(m, r.hints || 0, opts);
    if (want <= cur) return { upgraded: false, stars: cur, newBadges: [] };
    r.stars = want;
    if (want === 3) r.xp = (r.xp || 0) + 5;
    AK.recomputeXp(S);
    return { upgraded: true, stars: want, bonus: want === 3 ? 5 : 0, newBadges: AK.checkBadges(S, data, now) };
  };

  /* Daily Quest: three quick predict-the-output cards, picked per day. */
  function hash(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0; return h; }
  AK.dailySet = function (S, data, now) {
    const key = AK.dateKey(now);
    const preds = data.missions.filter((m) => m.type === "predict");
    const openRegions = new Set(data.regions.filter((r) => { const f = AK.regionMissions(data, r.id)[0]; return f && AK.isUnlocked(S, data, f, null); }).map((r) => r.id));
    let pool = preds.filter((m) => openRegions.has(m.region));
    if (pool.length < 3) pool = preds;
    return pool.slice().sort((a, b) => hash(key + a.id) - hash(key + b.id)).slice(0, 3);
  };
  AK.dailyAnswer = function (S, data, id, firstTry, now) {
    now = now || new Date();
    const key = AK.dateKey(now), set = AK.dailySet(S, data, now).map((m) => m.id);
    if (S.daily.date !== key) S.daily = { date: key, done: {}, pts: 0, bonus: false };
    if (!set.includes(id) || S.daily.done[id]) return { gained: 0, complete: false, newBadges: [] };
    const pts = firstTry ? 5 : 2;
    S.daily.done[id] = true; S.daily.pts += pts; S.dailyXp += pts;
    let gained = pts, complete = false;
    S.seeds = S.seeds || { earned: 0, spent: 0 }; S.seeds.earned += 1;
    if (set.every((x) => S.daily.done[x]) && !S.daily.bonus) { complete = true; S.daily.bonus = true; S.dailyXp += 10; gained += 10; S.dailyDone += 1; S.seeds.earned += 3; }
    touchStreak(S, now);
    AK.recomputeXp(S);
    return { gained: gained, complete: complete, newBadges: AK.checkBadges(S, data, now) };
  };

  AK.addExplanation = function (S, data, id, text, now) {
    text = (text || "").trim();
    const first = !S.explains[id];
    const bonus = text.length >= 12 && (first || !S.explains[id].bonus);
    S.explains[id] = { text: text, bonus: !!(S.explains[id] && S.explains[id].bonus) || bonus };
    AK.recomputeXp(S);
    return { bonus: bonus, newBadges: AK.checkBadges(S, data, now || new Date()) };
  };

  AK.mergeState = function (cur, inc) {
    const out = JSON.parse(JSON.stringify(cur));
    for (const id in inc.solved || {}) {
      if (!out.solved[id] || (inc.solved[id].xp || 0) > (out.solved[id].xp || 0)) out.solved[id] = inc.solved[id];
    }
    for (const id in inc.explains || {}) if (!out.explains[id] || inc.explains[id].bonus) out.explains[id] = inc.explains[id];
    for (const id in inc.badges || {}) if (!out.badges[id]) out.badges[id] = inc.badges[id];
    for (const id in inc.drafts || {}) if (!(id in out.drafts)) out.drafts[id] = inc.drafts[id];
    for (const id in inc.testOut || {}) if (inc.testOut[id]) out.testOut[id] = true;
    for (const id in inc.votes || {}) out.votes[id] = Object.assign({}, inc.votes[id], out.votes[id] || {});
    for (const id in inc.weekly || {}) out.weekly[id] = inc.weekly[id];
    out.dailyXp = Math.max(out.dailyXp || 0, inc.dailyXp || 0); out.dailyDone = Math.max(out.dailyDone || 0, inc.dailyDone || 0);
    if (inc.daily && inc.daily.date > (out.daily.date || "")) out.daily = inc.daily;
    for (const id in inc.askLvl || {}) out.askLvl[id] = Math.max((out.askLvl || {})[id] || 0, inc.askLvl[id]);
    for (const id in inc.hintLvl || {}) out.hintLvl[id] = Math.max(out.hintLvl[id] || 0, inc.hintLvl[id]);
    if ((inc.streak || {}).best > out.streak.best) out.streak.best = inc.streak.best;
    if ((inc.streak || {}).last > out.streak.last) out.streak = Object.assign({}, inc.streak);
    out.seeds = { earned: Math.max((out.seeds || {}).earned || 0, (inc.seeds || {}).earned || 0), spent: Math.max((out.seeds || {}).spent || 0, (inc.seeds || {}).spent || 0) };
    out.shop = out.shop || {}; for (const id in inc.shop || {}) out.shop[id] = Math.max(out.shop[id] || 0, inc.shop[id]);
    out.village = out.village || { plots: [], seen: {} };
    if (((inc.village || {}).plots || []).filter(Boolean).length > (out.village.plots || []).filter(Boolean).length) out.village.plots = inc.village.plots.slice();
    out.village.seen = Object.assign({}, (inc.village || {}).seen || {}, out.village.seen || {});
    if (!out.companion && inc.companion) out.companion = inc.companion;
    if (!out.placed && inc.placed) out.placed = inc.placed;
    out.speed = out.speed || {}; for (const id in inc.speed || {}) if (!out.speed[id] || inc.speed[id].best < out.speed[id].best) out.speed[id] = inc.speed[id];
    out.golf = out.golf || {}; for (const id in inc.golf || {}) if (!out.golf[id] || inc.golf[id].best < out.golf[id].best) out.golf[id] = inc.golf[id];
    out.blitz = out.blitz || { best: 0, runs: 0 }; if (((inc.blitz || {}).best || 0) > out.blitz.best) out.blitz = Object.assign({}, inc.blitz);
    out.dungeon = out.dungeon || { best: 0, runs: 0 }; if (((inc.dungeon || {}).best || 0) > out.dungeon.best) out.dungeon = Object.assign({}, inc.dungeon);
    out.outageDays = Object.assign({}, inc.outageDays || {}, out.outageDays || {});
    out.fade = Object.assign({}, inc.fade || {}, out.fade || {});
    out.pairDiag = Object.assign({}, inc.pairDiag || {}, out.pairDiag || {});
    if (!out.name && inc.name) out.name = inc.name;
    if (!out.classCode && inc.classCode) out.classCode = inc.classCode;
    AK.recomputeXp(out);
    return out;
  };

  /* ---------------------------------------------------------------- 3. friendly errors, blocks */
  AK.friendlyError = function (err) {
    if (!err) return null;
    const line = err.line ? " (line " + err.line + ")" : "";
    const raw = err.type + ": " + err.msg + line;
    let hint = "Read the message and check the line it points to.";
    const m = err.msg || "";
    switch (err.type) {
      case "SyntaxError": hint = "Python cannot read this line. Check brackets, quotes and colons at the end of if/for/while/def lines."; break;
      case "IndentationError": hint = "The spaces at the start of a line do not match. Lines inside if/for/def must be indented by the same amount."; break;
      case "NameError": { const n = (m.match(/'(.+?)'/) || [])[1]; hint = "Python does not know the name " + (n ? "'" + n + "'" : "you used") + ". Did you define it first, or misspell it?"; break; }
      case "TypeError": hint = "You are mixing types, like text and numbers. Convert one side with int() or str()."; break;
      case "ValueError": hint = "A value had the right type but the wrong content, like int() on text that is not a whole number."; break;
      case "IndexError": hint = "That position does not exist in the list. Counting starts at 0 and the last valid index is len(list) - 1."; break;
      case "KeyError": hint = "That key is not in the dictionary. Try .get(key, default)."; break;
      case "ZeroDivisionError": hint = "You divided by zero. Handle that case before dividing."; break;
      case "EOFError": hint = "Your program asked for input but none was left. Put test input in the Input box, one line per input()."; break;
      case "AttributeError": hint = "That object does not have that method or attribute. Check the spelling."; break;
      case "Timeout": hint = "Your program ran for too long. Is there a loop that never ends?"; break;
    }
    return { title: err.type === "Timeout" ? "Stopped: too long" : err.type, hint: hint, raw: raw, line: err.line || null };
  };

  AK.toBlocks = function (code) {
    const rows = [];
    String(code).split("\n").forEach(function (ln, i) {
      if (!ln.trim()) return;
      const indent = ln.match(/^ */)[0].length;
      const t = ln.trim();
      let kind = "do", label = t, m;
      if (t[0] === "#") { kind = "note"; label = t.slice(1).trim(); }
      else if ((m = t.match(/^print\((.*)\)$/))) { kind = "say"; label = "say " + m[1]; }
      else if ((m = t.match(/^for\s+(\w+)\s+in\s+range\((.*)\):$/))) { kind = "loop"; label = "repeat for " + m[1] + " in range(" + m[2] + ")"; }
      else if ((m = t.match(/^for\s+(.+)\s+in\s+(.+):$/))) { kind = "loop"; label = "repeat for each " + m[1] + " in " + m[2]; }
      else if ((m = t.match(/^while\s+(.+):$/))) { kind = "loop"; label = "repeat while " + m[1]; }
      else if ((m = t.match(/^if\s+(.+):$/))) { kind = "choose"; label = "if " + m[1]; }
      else if ((m = t.match(/^elif\s+(.+):$/))) { kind = "choose"; label = "else if " + m[1]; }
      else if (/^else:$/.test(t)) { kind = "choose"; label = "otherwise"; }
      else if ((m = t.match(/^def\s+(\w+)\((.*)\):$/))) { kind = "func"; label = "define " + m[1] + "(" + m[2] + ")"; }
      else if ((m = t.match(/^return\b\s*(.*)$/))) { kind = "func"; label = "give back " + (m[1] || "nothing"); }
      else if ((m = t.match(/^(\w+)\s*([+\-*\/]?=)\s*(.+)$/)) && m[2] !== "==") { kind = "set"; label = (m[2] === "=" ? "set " + m[1] + " to " + m[3] : "change " + m[1] + " (" + m[2] + ") " + m[3]); }
      else if (/^(break|continue|pass)$/.test(t)) { kind = "loop"; label = t; }
      rows.push({ line: i + 1, depth: Math.floor(indent / 4), kind: kind, label: label });
    });
    return rows;
  };

  /* ---------------------------------------------------------------- 4. terminal simulator */
  function tokenize(line) {
    const toks = []; let cur = "", q = null, has = false;
    const push = () => { if (has) { toks.push({ t: "w", v: cur }); cur = ""; has = false; } };
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === q) q = null; else cur += c; has = true; continue; }
      if (c === '"' || c === "'") { q = c; has = true; continue; }
      if (/\s/.test(c)) { push(); continue; }
      if (c === "|") { push(); toks.push({ t: "op", v: "|" }); continue; }
      if (c === ";") { push(); toks.push({ t: "op", v: ";" }); continue; }
      if (c === "&" && line[i + 1] === "&") { push(); toks.push({ t: "op", v: "&&" }); i++; continue; }
      if (c === ">") {
        push();
        if (line[i + 1] === ">") { toks.push({ t: "op", v: ">>" }); i++; } else toks.push({ t: "op", v: ">" });
        continue;
      }
      cur += c; has = true;
    }
    push();
    return toks;
  }

  AK.createTerminal = function (starter) {
    const s = JSON.parse(JSON.stringify(starter || {}));
    const T = {
      cwd: s.cwd || "/", files: s.files || {}, procs: s.processes || [],
      disks: s.disks || [], sizes: s.sizes || {}, history: [], cmds: [],
      dirs: (s.dirs || []).slice(), modes: s.modes || {}, owners: s.owners || {}, services: s.services || {}, journal: s.journal || {},
      http: s.http || {}, env: s.env || {}, date: s.date || "Mon Nov 24 02:07:31 UTC 2026", mem: s.mem || null, load: s.load || "0.15, 0.10, 0.05", user: s.user || "oncall",
      gitSpec: s.git || null,
    };
    const abs = (p) => {
      const parts = [];
      (p[0] === "/" ? p : T.cwd + "/" + p).split("/").forEach((seg) => {
        if (!seg || seg === ".") return;
        if (seg === "..") parts.pop(); else parts.push(seg);
      });
      return "/" + parts.join("/");
    };
    const allPaths = () => Object.keys(T.files).concat(Object.keys(T.sizes), T.dirs.map((d) => d + "/."));
    const children = (dir) => {
      const pre = dir === "/" ? "/" : dir + "/", set = {};
      allPaths().forEach((p) => { if (p.startsWith(pre) && p.length > pre.length) { const nm = p.slice(pre.length).split("/")[0]; if (nm !== ".") set[nm] = 1; } });
      return Object.keys(set).sort();
    };
    const isDir = (p) => p === "/" || allPaths().some((x) => x.startsWith(p + "/"));
    const glob = (arg) => {
      if (arg.indexOf("*") < 0 && arg.indexOf("?") < 0) return [arg];
      const ap = abs(arg), dir = ap.slice(0, ap.lastIndexOf("/")) || "/", pat = ap.slice(ap.lastIndexOf("/") + 1);
      const re = new RegExp("^" + pat.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
      const hit = children(dir).filter((c) => re.test(c)).map((c) => (dir === "/" ? "" : dir) + "/" + c);
      if (!hit.length) return [arg];
      return arg[0] === "/" ? hit : hit.map((h) => h.slice(T.cwd === "/" ? 1 : T.cwd.length + 1));
    };
    const expand = (arg) => {
      if (!arg.endsWith("/*")) return [arg];
      const dir = abs(arg.slice(0, -2));
      return children(dir).map((c) => (dir === "/" ? "" : dir) + "/" + c);
    };
    const lines = (s) => (s === "" ? [] : s.replace(/\n$/, "").split("\n"));
    const pad = (v, n) => String(v).padEnd(n);

    const cmds = {
      help: () => "Commands: ls cd pwd cat head tail grep wc echo ps top ss netstat lsof df du kill sed history clear\nPipes (|) and redirects (> >>) work.",
      pwd: () => T.cwd,
      cd: (a) => {
        const p = abs(a[0] || "/");
        if (!isDir(p)) return "cd: no such directory: " + (a[0] || "");
        T.cwd = p; return "";
      },
      ls: (a) => {
        const args = a.filter((x) => x[0] !== "-"), p = abs(args[0] || ".");
        if (T.files[p] !== undefined) return args[0];
        if (!isDir(p)) return "ls: cannot access '" + (args[0] || "") + "': No such file or directory";
        return children(p).map((c) => (isDir((p === "/" ? "" : p) + "/" + c) ? c + "/" : c)).join("\n");
      },
      cat: (a, inp) => {
        if (!a.length) return inp || "";
        return a.map((f) => (T.files[abs(f)] !== undefined ? T.files[abs(f)].replace(/\n$/, "") : "cat: " + f + ": No such file or directory")).join("\n");
      },
      echo: (a) => a.join(" "),
      head: (a, inp) => ht(a, inp, true),
      tail: (a, inp) => ht(a, inp, false),
      grep: (a, inp) => {
        const flags = a.filter((x) => x[0] === "-" && x.length > 1).join(""), rest = a.filter((x) => !(x[0] === "-" && x.length > 1));
        const pat = rest[0]; if (pat === undefined) return "grep: missing pattern";
        let re; try { re = new RegExp(pat, flags.includes("i") ? "i" : ""); } catch (e) { re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")); }
        let text = inp;
        if (rest.length > 1) text = rest.slice(1).map((f) => (T.files[abs(f)] !== undefined ? T.files[abs(f)] : "")).join("\n");
        const inv = flags.includes("v");
        return lines(text || "").filter((l) => re.test(l) !== inv).join("\n");
      },
      wc: (a, inp) => {
        let text = inp; const f = a.filter((x) => x[0] !== "-")[0];
        if (f) text = T.files[abs(f)] || "";
        return String(lines(text || "").length);
      },
      ps: () => procTable(T.procs.slice().sort((x, y) => x.pid - y.pid)),
      top: () => procTable(T.procs.slice().sort((x, y) => y.cpu - x.cpu)),
      ss: () => "State   Recv-Q  Send-Q  Local Address:Port  Peer Address:Port  Process\n" +
        T.procs.filter((p) => p.port).map((p) => "LISTEN  0       128     " + pad("0.0.0.0:" + p.port, 20) + "0.0.0.0:*          users:((\"" + p.name + "\",pid=" + p.pid + ",fd=3))").join("\n"),
      netstat: () => "Proto Recv-Q Send-Q Local Address    Foreign Address  State   PID/Program name\n" +
        T.procs.filter((p) => p.port).map((p) => "tcp   0      0      " + pad("0.0.0.0:" + p.port, 17) + "0.0.0.0:*        LISTEN  " + p.pid + "/" + p.name).join("\n"),
      lsof: (a) => {
        const spec = a.join(" ").match(/:(\d+)/); const port = spec ? Number(spec[1]) : null;
        const hit = T.procs.filter((p) => p.port && (port === null || p.port === port));
        return "COMMAND      PID USER  FD  TYPE NAME\n" + hit.map((p) => pad(p.name, 12) + " " + pad(p.pid, 4) + " " + pad(p.user || "root", 5) + " 3u  IPv4 *:" + p.port + " (LISTEN)").join("\n");
      },
      df: () => T.disks.length ? "Filesystem  Size  Used  Avail  Use%  Mounted on\n" + T.disks.map((d) => pad(d.fs, 11) + " " + pad(d.size, 5) + " " + pad(d.used, 5) + " " + pad(d.avail, 6) + " " + pad(d.pct, 5) + " " + d.mount).join("\n") : "df: no filesystems",
      du: (a) => {
        const targets = [];
        a.filter((x) => x[0] !== "-").forEach((x) => expand(x).forEach((y) => targets.push(y)));
        if (!targets.length) targets.push(T.cwd);
        return targets.map((t) => { const p = abs(t); return (T.sizes[p] || "4.0K") + "\t" + p; }).join("\n");
      },
      kill: (a) => {
        const pid = Number(a.filter((x) => x[0] !== "-")[0]);
        const i = T.procs.findIndex((p) => p.pid === pid);
        if (!pid) return "kill: usage: kill [-9] PID";
        if (i < 0) return "kill: (" + pid + ") - No such process";
        T.procs.splice(i, 1); return "";
      },
      sed: (a, inp) => {
        const inplace = a.includes("-i"), rest = a.filter((x) => x !== "-i");
        const expr = rest[0] || "", file = rest[1];
        if (expr[0] !== "s" || expr.length < 4) return "sed: only s/old/new/ is supported here";
        const d = expr[1], parts = expr.slice(2).split(d);
        if (parts.length < 2) return "sed: bad expression";
        let re; try { re = new RegExp(parts[0], (parts[2] || "").includes("g") ? "g" : ""); } catch (e) { return "sed: bad pattern"; }
        const text = file ? T.files[abs(file)] : inp;
        if (text === undefined) return "sed: can't read " + file + ": No such file or directory";
        const out = text.split("\n").map((l) => l.replace(re, parts[1])).join("\n");
        if (inplace && file) { T.files[abs(file)] = out; return ""; }
        return out.replace(/\n$/, "");
      },
      history: () => T.history.map((h, i) => pad(i + 1, 4) + h).join("\n"),
    };
    function ht(a, inp, head) {
      let n = 10; const rest = [];
      for (let i = 0; i < a.length; i++) { if (a[i] === "-n") { n = Number(a[++i]) || 10; } else rest.push(a[i]); }
      const text = rest.length ? (T.files[abs(rest[0])] || "") : inp || "";
      const ls = lines(text); return (head ? ls.slice(0, n) : ls.slice(-n)).join("\n");
    }
    function procTable(ps) {
      return "USER       PID  %CPU  %MEM  COMMAND\n" + ps.map((p) => pad(p.user || "root", 10) + " " + pad(p.pid, 4) + " " + pad((p.cpu || 0).toFixed(1), 5) + " " + pad((p.mem || 0).toFixed(1), 5) + " " + p.name).join("\n");
    }

    T.exec = function (line) {
      line = String(line).trim();
      if (!line) return { out: "" };
      T.history.push(line);
      if (line === "clear") { T.cmds.push("clear"); return { out: "", clear: true }; }
      const toks = tokenize(line), seqs = [[]];
      toks.forEach((t) => { if (t.t === "op" && (t.v === ";" || t.v === "&&")) seqs.push([]); else seqs[seqs.length - 1].push(t); });
      const outs = [];
      for (let q = 0; q < seqs.length; q++) {
        const r = runPipeline(seqs[q]);
        if (r.err) return { out: r.err };
        if (r.out !== "") outs.push(r.out);
      }
      return { out: outs.join("\n") };
    };
    function runPipeline(toks) {
      const stages = [[]];
      toks.forEach((t) => { if (t.t === "op" && t.v === "|") stages.push([]); else stages[stages.length - 1].push(t); });
      let data = "";
      for (let i = 0; i < stages.length; i++) {
        const st = stages[i]; let redirect = null; let words = [];
        for (let j = 0; j < st.length; j++) {
          if (st[j].t === "op") { redirect = { mode: st[j].v, file: (st[j + 1] || {}).v }; break; }
          words.push(st[j].v);
        }
        if (!words.length) {
          if (redirect && redirect.file) { const p0 = abs(redirect.file); T.files[p0] = redirect.mode === ">>" ? (T.files[p0] || "") : ""; data = ""; }
          continue;
        }
        const name = words[0]; T.cmds.push(name); T._noNl = false;
        words = [name].concat(words.slice(1).reduce((acc, w) => acc.concat(name === "grep" && acc.length === 0 ? [w] : glob(w)), []));
        const fn = cmds[name];
        data = fn ? fn(words.slice(1), data) : name + ": command not found";
        if (typeof data !== "string") data = String(data == null ? "" : data);
        if (redirect) {
          if (!redirect.file) return { err: "syntax error: missing file after " + redirect.mode };
          const p = abs(redirect.file), add = data === "" && T._noNl ? "" : data + "\n";
          T.files[p] = redirect.mode === ">>" ? (T.files[p] || "") + add : add;
          data = "";
        }
      }
      return { out: data };
    }
    T.abs = abs; T.isDir = isDir; T.children = children; T.glob = glob; T.lines = lines; T.pad = pad;
    (AK._termExt || []).forEach((f) => f(T, cmds));
    return T;
  };

  const normAns = (s) => String(s == null ? "" : s).trim().toLowerCase().replace(/\/+$/, "");

  AK.gradeTerminal = function (mission, T, answer) {
    return mission.tests.map(function (t) {
      let ok = false;
      switch (t.kind) {
        case "answer": { const exp = [].concat(t.expect).map(normAns); ok = exp.includes(normAns(answer)); break; }
        case "command-used": ok = t.anyOf.some((c) => T.cmds.includes(c)); break;
        case "file-contains": ok = (T.files[t.path] || "").includes(t.text); break;
        case "file-not-contains": ok = t.path in T.files && !(T.files[t.path] || "").includes(t.text); break;
        case "process-gone": ok = !T.procs.some((p) => p.pid === t.pid); break;
        case "process-alive": ok = T.procs.some((p) => p.pid === t.pid); break;
        default: ok = AK.termTest ? !!AK.termTest(t, T) : false;
      }
      return { label: t.label || t.note || t.kind, ok: ok, hidden: !!t.hidden };
    });
  };

  AK.runTerminalSolution = function (mission, sol) {
    const T = AK.createTerminal(mission.starter);
    (sol.commands || []).forEach((c) => T.exec(c));
    return { results: AK.gradeTerminal(mission, T, sol.answer || ""), terminal: T };
  };

  /* ---------------------------------------------------------------- 5. Python bridge */
  const PY = { runner: "", fns: null };
  AK.py = {
    setRunnerSource: function (src) { PY.runner = src; },
    init: function (pyodide) {
      pyodide.runPython(PY.runner);
      PY.fns = { run: pyodide.globals.get("_run"), grade: pyodide.globals.get("_grade"), sqlGrade: pyodide.globals.get("_sql_grade"), sqlRun: pyodide.globals.get("_sql_run"), sqlSchema: pyodide.globals.get("_sql_schema") };
    },
    run: function (code, stdin, trace) { return JSON.parse(PY.fns.run(code, JSON.stringify(stdin || []), !!trace)); },
    grade: function (code, tests) { return JSON.parse(PY.fns.grade(code, JSON.stringify(tests))); },
    sqlGrade: function (query, setup, tests) { return JSON.parse(PY.fns.sqlGrade(query, setup, JSON.stringify(tests))); },
    sqlRun: function (query, setup) { return JSON.parse(PY.fns.sqlRun(query, setup)); },
    sqlSchema: function (setup) { return JSON.parse(PY.fns.sqlSchema(setup)); },
  };

  /* ---------------------------------------------------------------- 6. teacher cards */
  const b64 = {
    enc: (s) => (typeof Buffer !== "undefined" ? Buffer.from(s, "utf8").toString("base64") : btoa(unescape(encodeURIComponent(s)))),
    dec: (s) => (typeof Buffer !== "undefined" ? Buffer.from(s, "base64").toString("utf8") : decodeURIComponent(escape(atob(s)))),
  };
  AK.encodeCard = function (S) {
    const card = { v: 1, n: S.name || "", c: S.classCode || "", x: S.xp, s: Object.keys(S.solved), b: Object.keys(S.badges), k: S.streak.count, t: new Date().toISOString() };
    return "AK1:" + b64.enc(JSON.stringify(card));
  };
  AK.decodeCard = function (str) {
    try {
      str = String(str).trim();
      if (!str.startsWith("AK1:")) return null;
      const c = JSON.parse(b64.dec(str.slice(4)));
      if (c.v !== 1 || !Array.isArray(c.s)) return null;
      return c;
    } catch (e) { return null; }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = AK;
  root.AK = AK;
})(typeof self !== "undefined" ? self : globalThis);

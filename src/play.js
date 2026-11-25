/* AataKode play layer: seeds, shop, village, placement, faded scaffolds, Speed Run, Code Golf,
   Prediction Blitz, Endless Dungeon. Pure logic (no DOM) so the verifier can test it in Node. */
(function (root) {
  "use strict";
  const AK = typeof module !== "undefined" && module.exports ? require("./engine.js") : root.AK;
  const touch = (S) => { S.seeds = S.seeds || { earned: 0, spent: 0 }; return S.seeds; };

  /* ---------------------------------------------------------------- seeds and shop */
  AK.seedBalance = (S) => { const s = touch(S); return Math.max(0, s.earned - s.spent); };
  AK.earnSeeds = (S, n) => { touch(S).earned += n; return n; };

  AK.VILLAGE_PLOTS = 12;
  AK.SHOP = [
    { id: "freeze", kind: "freeze", icon: "❄️", en: "Streak freeze", te: "స్ట్రీక్ ఫ్రీజ్", cost: 20, desc: "Saves your streak if you miss a day. You can hold 2." },
    { id: "hut", kind: "building", icon: "🛖", en: "Hut", te: "కుటీరం", cost: 8, desc: "A cosy hut for the village." },
    { id: "house", kind: "building", icon: "🏠", en: "House", te: "ఇల్లు", cost: 12, desc: "A proper house with a tiled roof." },
    { id: "tree", kind: "building", icon: "🌳", en: "Neem tree", te: "వేప చెట్టు", cost: 4, desc: "Shade for the village square." },
    { id: "palm", kind: "building", icon: "🌴", en: "Coconut palm", te: "కొబ్బరి చెట్టు", cost: 6, desc: "Swaying coconuts." },
    { id: "garden", kind: "building", icon: "🌻", en: "Flower garden", te: "పూల తోట", cost: 5, desc: "Marigolds and sunflowers." },
    { id: "lamp", kind: "building", icon: "🪔", en: "Diya lamp", te: "దీపం", cost: 4, desc: "Glows at night." },
    { id: "temple", kind: "building", icon: "🛕", en: "Temple", te: "గుడి", cost: 20, desc: "A small temple with a bell." },
    { id: "fountain", kind: "building", icon: "⛲", en: "Fountain", te: "ఫౌంటెన్", cost: 12, desc: "Cool water in the square." },
    { id: "market", kind: "building", icon: "🏪", en: "Market stall", te: "సంత దుకాణం", cost: 14, desc: "Fresh fruit and gossip." },
    { id: "field", kind: "building", icon: "🌾", en: "Paddy field", te: "వరి పొలం", cost: 8, desc: "Green rice paddies." },
    { id: "cow", kind: "building", icon: "🐄", en: "Cow", te: "ఆవు", cost: 10, desc: "Moo." },
    { id: "kite", kind: "building", icon: "🪁", en: "Kite", te: "గాలిపటం", cost: 5, desc: "Flies on a breezy day." },
    { id: "udata", kind: "companion", icon: "🐿️", en: "Udata the squirrel", te: "ఉడత", cost: 15, desc: "Quick and curious." },
    { id: "nemali", kind: "companion", icon: "🦚", en: "Nemali the peacock", te: "నెమలి", cost: 25, desc: "Struts when you solve things." },
    { id: "tabelu", kind: "companion", icon: "🐢", en: "Tabelu the tortoise", te: "తాబేలు", cost: 20, desc: "Slow and steady wins." },
    { id: "kothi", kind: "companion", icon: "🐒", en: "Kothi the monkey", te: "కోతి", cost: 30, desc: "Loves a good bug hunt." },
    { id: "enugu", kind: "companion", icon: "🐘", en: "Enugu the elephant", te: "ఏనుగు", cost: 40, desc: "Never forgets a loop." },
  ];
  const item = (id) => AK.SHOP.find((x) => x.id === id) || null;
  AK.shopItem = item;
  AK.ownedCount = (S, id) => (S.shop || {})[id] || 0;
  AK.placedCount = (S, id) => ((S.village || {}).plots || []).filter((x) => x === id).length;
  AK.stockLeft = (S, id) => AK.ownedCount(S, id) - AK.placedCount(S, id);

  AK.buy = function (S, id, now) {
    const it = item(id); if (!it) return { ok: false, reason: "Unknown item." };
    if (AK.seedBalance(S) < it.cost) return { ok: false, reason: "Not enough seeds yet. Solve missions to grow more." };
    S.shop = S.shop || {};
    if (it.kind === "freeze") { if ((S.streak.freezes || 0) >= 2) return { ok: false, reason: "You already hold 2 streak freezes." }; S.streak.freezes = (S.streak.freezes || 0) + 1; }
    else if (it.kind === "companion") { if (S.shop[id]) return { ok: false, reason: "Already adopted." }; S.shop[id] = 1; if (!S.companion) S.companion = id; }
    else { if ((S.shop[id] || 0) >= 3) return { ok: false, reason: "You can own up to 3 of these." }; S.shop[id] = (S.shop[id] || 0) + 1; }
    touch(S).spent += it.cost;
    return { ok: true, newBadges: AK.checkBadges(S, root.AK_DATA || { regions: [], missions: [] }, now || new Date()) };
  };
  AK.setCompanion = function (S, id) { if (id && !(S.shop || {})[id]) return false; S.companion = id || ""; return true; };
  AK.placeBuilding = function (S, plot, id) {
    const it = item(id); S.village = S.village || { plots: [], seen: {} };
    if (!it || it.kind !== "building" || plot < 0 || plot >= AK.VILLAGE_PLOTS) return { ok: false, reason: "Cannot place that there." };
    const cur = S.village.plots[plot]; if (cur === id) return { ok: true };
    if (AK.ownedCount(S, id) - AK.placedCount(S, id) <= 0) return { ok: false, reason: "None left in your stock. Buy another with seeds." };
    S.village.plots[plot] = id; for (let i = 0; i < AK.VILLAGE_PLOTS; i++) if (S.village.plots[i] === undefined) S.village.plots[i] = null;
    return { ok: true };
  };
  AK.removeBuilding = function (S, plot) { S.village = S.village || { plots: [], seen: {} }; S.village.plots[plot] = null; return true; };
  AK.companionStage = (S) => { const i = AK.rankFor(S.xp).index; return i >= 6 ? 3 : i >= 3 ? 2 : 1; };

  /* ---------------------------------------------------------------- day and night */
  AK.dayPhase = function (d) { const h = d.getHours(); return h >= 5 && h < 7 ? "dawn" : h >= 7 && h < 17 ? "day" : h >= 17 && h < 19 ? "dusk" : "night"; };

  /* ---------------------------------------------------------------- placement quiz */
  AK.placeFromAnswers = function (qs, ok) {
    const sorted = qs.slice().sort((a, b) => a.level - b.level);
    let miss = 0, firstMiss = null, last = -1;
    for (const q of sorted) {
      if (ok[q.id]) last = q.level;
      else { miss++; if (firstMiss === null) firstMiss = q.level; if (miss >= 2) break; }
    }
    const top = Math.max.apply(null, sorted.map((q) => q.level));
    return firstMiss !== null ? firstMiss : Math.min(last + 1, top + 1);
  };
  AK.applyPlacement = function (S, data, ok, now) {
    const qs = data.placement || [], py = data.regions.filter((r) => r.track === "python");
    const idx = Math.max(0, Math.min(py.length - 1, AK.placeFromAnswers(qs, ok)));
    S.placed = { index: idx, region: py[idx].id, score: qs.filter((q) => ok[q.id]).length, total: qs.length, date: AK.dateKey(now || new Date()) };
    return { index: idx, region: py[idx], newBadges: AK.checkBadges(S, data, now || new Date()) };
  };
  AK.placedUnlock = function (S, data, m) {
    const py = data.regions.filter((r) => r.track === "python"), ri = py.findIndex((r) => r.id === m.region);
    if (ri < 0 || !S.placed) return false;
    return ri < S.placed.index || (ri === S.placed.index && m.order === 1);
  };

  /* ---------------------------------------------------------------- faded scaffolds */
  /* Missions with a `fade` block get less help as the learner masters the same skill:
     level 3 = worked example + partly filled code, 2 = partly filled code, 1 = blank editor. */
  AK.scaffoldLevel = function (S, data, m) {
    if (!m.fade) return 0;
    if ((S.fade || {})[m.id]) return S.fade[m.id];
    const sk = (m.skills || [])[0];
    const n = data.missions.filter((x) => x.id !== m.id && S.solved[x.id] && (x.skills || [])[0] === sk).length;
    return n === 0 ? 3 : n === 1 ? 2 : 1;
  };
  AK.setScaffold = function (S, id, level) { S.fade = S.fade || {}; S.fade[id] = Math.max(1, Math.min(3, level)); };

  /* ---------------------------------------------------------------- Speed Run and Blitz */
  AK.speedRecord = function (S, data, id, ms, now) {
    S.speed = S.speed || {}; const prev = S.speed[id], pb = !prev || ms < prev.best;
    S.speed[id] = { best: pb ? ms : prev.best, runs: (prev ? prev.runs : 0) + 1, at: AK.dateKey(now || new Date()) };
    const seeds = 1 + (pb ? (prev ? 3 : 2) : 0); AK.earnSeeds(S, seeds);
    return { pb: pb, best: S.speed[id].best, prev: prev ? prev.best : null, seeds: seeds, newBadges: AK.checkBadges(S, data, now || new Date()) };
  };
  AK.fmtMs = (ms) => { const s = ms / 1000; return s < 60 ? s.toFixed(1) + "s" : Math.floor(s / 60) + "m " + String(Math.floor(s % 60)).padStart(2, "0") + "s"; };
  AK.blitzScore = (correct, wrong, ms) => Math.max(0, correct * 100 - wrong * 50 - Math.floor(ms / 1000) * 2);
  AK.blitzRecord = function (S, data, correct, wrong, total, ms, now) {
    S.blitz = S.blitz || { best: 0, runs: 0 };
    const score = AK.blitzScore(correct, wrong, ms), pb = score > S.blitz.best;
    S.blitz.runs++; if (pb) S.blitz.best = score; if (correct === total && wrong === 0) S.blitz.perfect = true;
    const seeds = 1 + correct; AK.earnSeeds(S, seeds);
    return { score: score, pb: pb, seeds: seeds, newBadges: AK.checkBadges(S, data, now || new Date()) };
  };

  /* ---------------------------------------------------------------- Code Golf */
  AK.golfStrokes = (code) => String(code).split("\n").filter((l) => l.trim() && l.trim()[0] !== "#").map((l) => l.replace(/\s+$/, "")).join("\n").length;
  AK.golfRank = function (strokes, par) {
    const d = strokes - par;
    if (d <= -10) return { id: "albatross", label: "Albatross 🦅", delta: d };
    if (d <= -5) return { id: "eagle", label: "Eagle 🦅", delta: d };
    if (d <= -1) return { id: "birdie", label: "Birdie 🐦", delta: d };
    if (d === 0) return { id: "par", label: "Par", delta: d };
    if (d <= 10) return { id: "bogey", label: "Bogey", delta: d };
    return { id: "over", label: "Over par", delta: d };
  };
  AK.golfRecord = function (S, data, m, strokes, now) {
    S.golf = S.golf || {}; const prev = S.golf[m.id], par = m.golf.par, improved = !prev || strokes < prev.best;
    const first = strokes < par && !(prev && prev.best < par);
    if (improved) S.golf[m.id] = { best: strokes, at: AK.dateKey(now || new Date()) };
    const seeds = (improved ? 1 : 0) + (first ? 5 : 0); AK.earnSeeds(S, seeds);
    return { improved: improved, best: S.golf[m.id].best, rank: AK.golfRank(strokes, par), seeds: seeds, newBadges: AK.checkBadges(S, data, now || new Date()) };
  };

  /* ---------------------------------------------------------------- Endless Dungeon */
  function rng(seed) { let a = seed >>> 0; return function () { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const mk = (r) => ({ int: (a, b) => a + Math.floor(r() * (b - a + 1)), pick: (arr) => arr[Math.floor(r() * arr.length)] });
  const J = (a) => a.join("\n");
  const WORDS = ["python", "parrot", "village", "chilaka", "bangalore", "telugu", "kitchen", "banyan", "market", "harvest", "lantern", "monsoon"];

  const DUNGEON = [
    { id: "arith", min: 1, make: (R) => { const a = R.int(2, 9), b = R.int(2, 9), c = R.int(2, 9), h = ["a = " + a, "b = " + b, "c = " + c], w = (e) => J(h.concat(["print(" + e + ")"])); return { title: "Precedence", code: w("a + b * c"), variants: [w("(a + b) * c"), w("a * b + c"), w("a + b + c"), w("a - b * c")] }; } },
    { id: "divmod", min: 1, make: (R) => { const x = R.int(20, 99), y = R.int(3, 9), h = ["x = " + x, "y = " + y], w = (e) => J(h.concat(["print(" + e + ")"])); return { title: "Division and remainder", code: w("x // y, x % y"), variants: [w("x / y, x % y"), w("x % y, x // y"), w("x // y, y % x"), w("x // y + x % y")] }; } },
    { id: "slice", min: 1, make: (R) => { const wd = R.pick(WORDS), i = R.int(0, 2), j = R.int(i + 3, wd.length - 1), h = ['s = "' + wd + '"'], w = (e) => J(h.concat(["print(" + e + ")"])); return { title: "Slicing", code: w("s[" + i + ":" + j + "]"), variants: [w("s[" + i + ":" + (j - 1) + "]"), w("s[" + i + ":" + (j + 1) + "]"), w("s[" + (i + 1) + ":" + j + "]"), w("s[-" + j + ":]"), w("s[::-1][" + i + ":" + j + "]")] }; } },
    { id: "listops", min: 2, make: (R) => { const n = [R.int(1, 9), R.int(1, 9), R.int(1, 9)], k = R.int(10, 19), w = (pop) => J(["nums = [" + n.join(", ") + "]", "nums.append(" + k + ")", pop, "print(nums)"]); return { title: "List methods", code: w("nums.pop(0)"), variants: [w("nums.pop()"), w("nums.insert(0, " + k + ")"), w("nums.remove(" + n[0] + ")"), w("nums.reverse()")] }; } },
    { id: "rangesum", min: 2, make: (R) => { const a = R.int(1, 3), b = R.int(5, 9), k = R.int(2, 4), w = (r2, body) => J(["total = 0", "for i in range(" + r2 + "):", "    " + body, "print(total)"]); return { title: "Loop and total", code: w(a + ", " + b, "total += i * " + k), variants: [w(a + ", " + (b + 1), "total += i * " + k), w((a - 1) + ", " + b, "total += i * " + k), w(a + ", " + b, "total += i + " + k), w(String(b), "total += i * " + k)] }; } },
    { id: "while", min: 3, make: (R) => { const n = R.int(8, 15), s = R.int(2, 4), t = R.int(0, 3), w = (cmp, step, pr) => J(["n = " + n, "while n " + cmp + " " + t + ":", "    n -= " + step, "print(" + pr + ")"]); return { title: "While loop", code: w(">", s, "n"), variants: [w(">=", s, "n"), w(">", s + 1, "n"), w(">", s > 1 ? s - 1 : 1, "n"), w(">", s, "n + " + s), w(">", s, "n - 1")] }; } },
    { id: "ifchain", min: 3, make: (R) => { const code = (v) => J(["v = " + v, "if v % 15 == 0:", '    print("both")', "elif v % 5 == 0:", '    print("five")', "elif v % 3 == 0:", '    print("three")', "else:", "    print(v)"]); const v = R.pick([15, 30, 5, 10, 20, 3, 6, 9, 12, 7, 11, 13]); return { title: "Which branch?", code: code(v), variants: [code(15), code(10), code(9), code(7), code(14)] }; } },
    { id: "strmeth", min: 3, make: (R) => { const w1 = R.pick(WORDS), w2 = R.pick(WORDS), k = R.int(0, 1), h = ['s = "' + w1 + " " + w2 + '"'], w = (e) => J(h.concat(["print(" + e + ")"])); return { title: "String methods", code: w("s.upper().split()[" + k + "]"), variants: [w("s.split()[" + (1 - k) + "]"), w("s.title()"), w("len(s.split()[" + k + "])"), w('s.replace(" ", "-")'), w("s.split()[" + k + "].capitalize()")] }; } },
    { id: "dictcount", min: 4, make: (R) => { const wd = R.pick(["banana", "parrot", "mississippi", "village", "harvest", "lantern"]), ch = R.pick(wd.split("")), w = (e) => J(["d = {}", 'for ch in "' + wd + '":', "    d[ch] = d.get(ch, 0) + 1", "print(" + e + ")"]); return { title: "Counting with a dict", code: w('d["' + ch + '"]'), variants: [w("len(d)"), w('d.get("z", 0)'), w("sum(d.values())"), w("max(d.values())")] }; } },
    { id: "comp", min: 4, make: (R) => { const n = R.int(8, 14), m = R.int(2, 4), k = R.int(2, 5), w = (e) => "print(" + e + ")"; return { title: "List comprehension", code: w("[x * " + k + " for x in range(" + n + ") if x % " + m + " == 0]"), variants: [w("[x * " + k + " for x in range(" + n + ") if x % " + m + " == 1]"), w("[x * " + k + " for x in range(" + (n + 1) + ") if x % " + m + " == 0]"), w("[x + " + k + " for x in range(" + n + ") if x % " + m + " == 0]"), w("[x for x in range(" + n + ") if x % " + m + " == 0]")] }; } },
    { id: "defaults", min: 5, make: (R) => { const a = R.int(2, 6), b = R.int(2, 6), c = R.int(1, 5), def = (ret) => J(["def f(x, y=" + b + "):", "    return " + ret, ""]), w = (ret, call) => def(ret) + "\nprint(" + call + ")"; return { title: "Default arguments", code: w("x * y + " + c, "f(" + a + "), f(" + a + ", 1)"), variants: [w("x * y + " + c, "f(" + a + ", " + b + "), f(" + a + ")"), w("x + y * " + c, "f(" + a + "), f(" + a + ", 1)"), w("x * y - " + c, "f(" + a + "), f(" + a + ", 1)"), w("x * y + " + c, "f(" + a + ", 1), f(" + a + ")")] }; } },
    { id: "enum", min: 5, make: (R) => { const sc = [R.int(10, 50), R.int(10, 50), R.int(10, 50)], names = ["Asha", "Ravi", "Meena"], w = (e, cmp) => J(["names = " + JSON.stringify(names).replace(/"/g, '"'), "scores = [" + sc.join(", ") + "]", "best = 0", "for i, s in enumerate(scores):", "    if s " + cmp + " scores[best]:", "        best = i", "print(" + e + ")"]); return { title: "Who is best?", code: w("names[best]", ">"), variants: [w("names[best]", "<"), w("best", ">"), w("scores[best]", ">"), w("names[0]", ">"), w("names[-1]", ">")] }; } },
    { id: "grid", min: 6, make: (R) => { const i = R.int(0, 2), j = R.int(0, 2) === i ? (i + 1) % 3 : R.int(0, 2), h = "grid = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]", w = (e) => J([h, "print(" + e + ")"]); return { title: "Grid lookup", code: w("grid[" + i + "][" + j + "] + grid[" + j + "][" + i + "]"), variants: [w("grid[" + i + "][" + j + "]"), w("grid[" + j + "][" + i + "]"), w("grid[" + i + "][" + j + "] * grid[" + j + "][" + i + "]"), w("grid[" + i + "][" + j + "] - grid[" + j + "][" + i + "]")] }; } },
    { id: "try", min: 7, make: (R) => { const a = R.int(2, 9), b = R.int(1, 4), def = (v) => J(["def safe(a, b):", "    try:", "        return a // b", "    except ZeroDivisionError:", "        return " + v, ""]); return { title: "Catching an error", code: def("-1") + "\nprint(safe(" + a + ", " + b + "), safe(" + a + ", 0))", variants: [def("0") + "\nprint(safe(" + a + ", " + b + "), safe(" + a + ", 0))", def("-1") + "\nprint(safe(" + a + ", 0), safe(" + a + ", " + b + "))", def("-1") + "\nprint(safe(" + a + ", " + b + "))", def("None") + "\nprint(safe(" + a + ", " + b + "), safe(" + a + ", 0))"] }; } },
    { id: "sets", min: 8, make: (R) => { const A = [1, 2, 3, 4, 5, 6, 7, 8].filter(() => R.int(0, 9) > 3), B = [1, 2, 3, 4, 5, 6, 7, 8].filter(() => R.int(0, 9) > 3), w = (op) => J(["a = {" + (A.length ? A.join(", ") : "1") + "}", "b = {" + (B.length ? B.join(", ") : "2") + "}", "print(sorted(a " + op + " b))"]); return { title: "Set operators", code: w("&"), variants: [w("|"), w("-"), w("^")] }; } },
    { id: "recur", min: 9, make: (R) => { const n = R.int(3, 6), def = (base) => J(["def f(n):", "    if n <= " + base + ":", "        return 1", "    return n * f(n - 1)", ""]); return { title: "Recursion", code: def(1) + "\nprint(f(" + n + "))", variants: [def(0) + "\nprint(f(" + n + "))", def(1) + "\nprint(f(" + (n - 1) + "))", def(1) + "\nprint(f(" + n + ") + 1)", def(2) + "\nprint(f(" + n + "))"] }; } },
    { id: "fmt", min: 10, make: (R) => { const n = R.int(2, 9), wd = R.pick(WORDS), w = (e) => J(['name = "' + wd + '"', "n = " + n, "print(" + e + ")"]); return { title: "f-strings", code: w('f"{name[:3]}-{n * 2:03d}"'), variants: [w('f"{name[:3]}-{n * 2}"'), w('f"{name[-3:]}-{n * 2:03d}"'), w('f"{name[:2]}-{n:03d}"'), w('f"{name[:3]}-{n * 2:3d}"')] }; } },
  ];
  AK.DUNGEON_TEMPLATES = DUNGEON.map((t) => t.id);

  AK.dungeonFloor = function (seed, floor) {
    let prev = null, pick = null;
    for (let f = 1; f <= floor; f++) {
      const r = rng((seed * 7919 + f * 104729) >>> 0), pool = DUNGEON.filter((t) => t.min <= Math.min(f, 12) && t.id !== prev);
      pick = pool[Math.floor(r() * pool.length)]; prev = pick.id;
    }
    const R = mk(rng((seed * 31337 + floor * 977) >>> 0)), made = pick.make(R);
    return { floor: floor, template: pick.id, title: made.title, code: made.code, variants: made.variants };
  };
  AK.dungeonBuild = function (def, run) {
    const show = (c) => { const r = run(c); return r.err ? "Error: " + r.err.type : String(r.out || "").replace(/\s+$/, ""); };
    const right = show(def.code); if (right === "" || right.indexOf("Error") === 0) return null;
    const opts = [right]; def.variants.forEach((v) => { const o = show(v); if (o !== "" && opts.indexOf(o) < 0) opts.push(o); });
    if (opts.length < 3) return null;
    const four = opts.slice(0, 4), k = (parseInt(def.floor, 10) * 7 + def.code.length) % four.length, others = four.slice(1);
    const list = others.slice(0, k).concat([right], others.slice(k));
    return { floor: def.floor, title: def.title, code: def.code, options: list, answer: k, template: def.template };
  };
  AK.dungeonCleared = function (S, floor) { const n = 1 + (floor % 5 === 0 ? 2 : 0); AK.earnSeeds(S, n); return n; };
  AK.dungeonEnd = function (S, data, floors, now) {
    S.dungeon = S.dungeon || { best: 0, runs: 0 }; S.dungeon.runs++; const pb = floors > S.dungeon.best; if (pb) S.dungeon.best = floors;
    return { pb: pb, best: S.dungeon.best, newBadges: AK.checkBadges(S, data, now || new Date()) };
  };
})(typeof self !== "undefined" ? self : globalThis);

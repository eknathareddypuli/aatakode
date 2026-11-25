// Verifies every mission: structure, reference solution, alternative solution, and starter.
// Run:  cd tests && npm ci && node verify.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { loadPyodide } from "pyodide";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const require = createRequire(import.meta.url);
const AK = require(join(root, "src", "engine.js"));
for (const f of ["term_extra.js", "git.js", "play.js"]) require(join(root, "src", f));

const regionsFile = JSON.parse(readFileSync(join(root, "missions", "regions.json"), "utf8"));
const regionIds = regionsFile.regions.map((r) => r.id);
const missions = [];
for (const dir of readdirSync(join(root, "missions"))) {
  const p = join(root, "missions", dir);
  if (!statSync(p).isDirectory()) continue;
  for (const f of readdirSync(p).filter((x) => x.endsWith(".json")).sort()) {
    missions.push({ file: `missions/${dir}/${f}`, dir, ...JSON.parse(readFileSync(join(p, f), "utf8")) });
  }
}

let failures = 0, checks = 0;
const bad = (m, msg) => { failures++; console.log(`  ✗ ${m.id || m.file}: ${msg}`); };
const ok = () => { checks++; };

// ---- structure
const ids = new Set(missions.map((m) => m.id));
const REQUIRED = ["id", "region", "order", "title", "story", "goal", "type", "starter", "tests", "hints", "socratic", "explain", "xp", "skills", "requires", "solution"];
const TYPES = ["write-code", "fix-the-bug", "terminal", "predict", "fill", "order", "sql", "pair"];
const seen = new Set();
for (const m of missions) {
  for (const k of REQUIRED) if (!(k in m)) bad(m, `missing field "${k}"`); else ok();
  if (seen.has(m.id)) bad(m, "duplicate id"); seen.add(m.id);
  if (m.region !== m.dir) bad(m, `region "${m.region}" does not match folder "${m.dir}"`);
  if (!regionIds.includes(m.region)) bad(m, "region not listed in regions.json");
  if (!TYPES.includes(m.type)) bad(m, `unknown type "${m.type}"`);
  if (!Array.isArray(m.hints) || m.hints.length !== 3) bad(m, "needs exactly 3 hints");
  if (!Array.isArray(m.socratic) || m.socratic.length !== 3) bad(m, "needs exactly 3 socratic questions");
  for (const r of m.requires || []) if (!ids.has(r)) bad(m, `requires unknown mission "${r}"`);
  if (!Array.isArray(m.tests) || !m.tests.length) bad(m, "needs tests");
  if (m.type === "predict") {
    if (typeof m.code !== "string" || !Array.isArray(m.options) || m.options.length < 3 || m.options.length > 4) bad(m, "predict needs code and 3-4 options");
    else if (new Set(m.options.map((o) => o.trim())).size !== m.options.length) bad(m, "predict options must be distinct");
    if (!Number.isInteger(m.answer) || m.answer < 0 || m.answer >= (m.options || []).length) bad(m, "predict answer must index options");
    if (!m.why) bad(m, "predict needs a why explanation");
  }
  if (m.type === "fill" && (m.starter.match(/___/g) || []).length < 1) bad(m, "fill starter needs ___ blanks");
  if (m.type === "fill" && /___/.test(m.solution)) bad(m, "fill solution still has blanks");
  if (m.type === "order") {
    if (!Array.isArray(m.lines) || m.lines.length < 3) bad(m, "order needs a lines array");
    else if (m.lines.slice().sort().join("\n") !== String(m.solution).replace(/\n$/, "").split("\n").sort().join("\n")) bad(m, "order lines must be a permutation of the solution lines");
    else if (m.lines.join("\n") === String(m.solution).replace(/\n$/, "")) bad(m, "order lines must start shuffled");
  }
  if (!(m.xp > 0)) bad(m, "xp must be positive");
  if (m.file.split("/")[2] !== m.id + ".json") bad(m, "file name must be <id>.json");
}
for (const r of regionsFile.regions) {
  const ms = missions.filter((m) => m.region === r.id);
  if (!ms.length) bad({ id: r.id }, "region has no missions");
  if (r.track === "python" && !ms.some((m) => m.boss)) bad({ id: r.id }, "python region needs a bug-fix boss mission");
}

// ---- python missions
function AK_DATA_SET(d) { globalThis.AK_DATA = d; }
const py = await loadPyodide();
AK.py.setRunnerSource(readFileSync(join(root, "src", "runner.py"), "utf8"));
AK.py.init(py);

const summarize = (res) => res.filter((r) => !r.ok).map((r) => r.label).join("; ");

// predict missions: the marked option must equal what the code really prints
for (const m of missions.filter((x) => x.type === "predict")) {
  const r = AK.py.run(m.code, m.stdin || [], false);
  const actual = (r.out.replace(/\s+$/, "") + (r.err ? (r.out.trim() ? "\n" : "") + "Error: " + r.err.type : "")).trim();
  const want = m.options[m.answer].trim();
  if (actual.trim() === want) ok(); else bad(m, `marked answer "${want}" but the code really gives "${actual}"`);
  m.options.forEach((o, i) => { if (i !== m.answer && o.trim() === actual.trim()) bad(m, `option ${i} is also correct`); });
  if (m.solution !== m.options[m.answer]) bad(m, "solution must equal the correct option text");
}

// ---- SQL missions (graded in real SQLite inside Pyodide)
for (const m of missions.filter((x) => x.type === "sql")) {
  if (typeof m.setup !== "string" || typeof m.solution !== "string") { bad(m, "sql needs setup and solution strings"); continue; }
  let res = AK.py.sqlGrade(m.solution, m.setup, m.tests);
  if (res.every((r) => r.ok)) ok(); else bad(m, `reference solution fails: ${summarize(res)}`);
  if (!m.alt) bad(m, "missing alternative solution"); else { res = AK.py.sqlGrade(m.alt, m.setup, m.tests); if (res.every((r) => r.ok)) ok(); else bad(m, `alternative solution fails: ${summarize(res)}`); }
  res = AK.py.sqlGrade(m.starter, m.setup, m.tests);
  if (res.every((r) => r.ok)) bad(m, "starter already passes"); else ok();
  if (!/^\s*(INSERT|UPDATE|DELETE|CREATE)/i.test(m.solution) && !m.tests.some((t) => t.hidden)) bad(m, "sql query missions need at least one hidden test on different data"); else ok();
}
// ---- Pair Parrot structure
for (const m of missions.filter((x) => x.type === "pair")) {
  const d = m.diagnose || {};
  if (!d.question || !Array.isArray(d.options) || d.options.length !== 4 || !Number.isInteger(d.answer) || d.answer < 0 || d.answer > 3 || !d.why || !(m.parrot || {}).says) bad(m, "pair needs parrot.says and diagnose {question, 4 options, answer, why}"); else ok();
}
// ---- Golf: par and best are real character counts of solutions that pass
for (const m of missions.filter((x) => x.golf)) {
  const g = m.golf;
  for (const k of ["parCode", "bestCode"]) {
    const res = AK.py.grade(g[k], m.tests);
    if (res.every((r) => r.ok)) ok(); else bad(m, `golf ${k} fails: ${summarize(res)}`);
  }
  if (AK.golfStrokes(g.parCode) !== g.par) bad(m, "golf par does not match parCode length"); else ok();
  if (AK.golfStrokes(g.bestCode) !== g.best) bad(m, "golf best does not match bestCode length"); else ok();
  if (!(g.best < g.par)) bad(m, "golf best must beat par"); else ok();
}
// ---- Worked-example fading
for (const m of missions.filter((x) => x.fade)) {
  const f = m.fade;
  if (!f.example || !f.example.code || !f.partial || !Array.isArray(f.blanks)) { bad(m, "fade needs example{code}, partial and blanks"); continue; }
  const ex = AK.py.run(f.example.code, [], false); if (ex.err) bad(m, "fade example crashes: " + ex.err.type); else ok();
  if ((f.partial.match(/____/g) || []).length !== f.blanks.length) bad(m, "fade partial blank count != blanks"); else ok();
  let filled = f.partial; f.blanks.forEach((b) => { filled = filled.replace("____", () => b); });
  const res = AK.py.grade(filled, m.tests);
  if (res.every((r) => r.ok)) ok(); else bad(m, `fade partial does not pass once blanks are filled: ${summarize(res)}`);
  if (AK.py.grade(f.partial, m.tests).every((r) => r.ok)) bad(m, "fade partial already passes with blanks empty"); else ok();
}
// ---- Placement quiz: marked answers match real output, levels cover 0..9
const place = JSON.parse(readFileSync(join(root, "missions", "placement.json"), "utf8"));
{
  const lv = place.map((q) => q.level).sort((a, b) => a - b).join(",");
  if (lv !== "0,1,2,3,4,5,6,7,8,9") bad({ id: "placement" }, "placement needs one question for each level 0-9"); else ok();
  for (const q of place) {
    const r = AK.py.run(q.code, [], false), actual = r.out.replace(/\s+$/, "");
    if (r.err) bad({ id: q.id }, "placement code crashes"); else if (q.options[q.answer] !== actual) bad({ id: q.id }, `marked "${q.options[q.answer]}" but code prints "${actual}"`); else ok();
    if (new Set(q.options).size !== q.options.length) bad({ id: q.id }, "options not distinct");
  }
}

for (const m of missions.filter((x) => x.type !== "terminal" && x.type !== "predict" && x.type !== "sql")) {
  if (typeof m.solution !== "string") { bad(m, "solution must be a string of code"); continue; }
  let res = AK.py.grade(m.solution, m.tests);
  if (res.every((r) => r.ok)) ok(); else bad(m, `reference solution fails: ${summarize(res)}`);
  if (m.alt) {
    res = AK.py.grade(m.alt, m.tests);
    if (res.every((r) => r.ok)) ok(); else bad(m, `alternative solution fails: ${summarize(res)}`);
  } else if (["write-code", "fix-the-bug", "pair"].includes(m.type)) bad(m, "missing alternative solution");
  res = AK.py.grade(m.starter, m.tests);
  if (res.every((r) => r.ok)) bad(m, "starter already passes (nothing to learn)"); else ok();
  // fix-the-bug missions must start with a failing program, not an empty one
  if (m.clean) {
    res = AK.py.grade(m.solution, m.clean.tests);
    const resAlt = m.alt ? AK.py.grade(m.alt, m.clean.tests) : [{ ok: false }];
    if (res.every((r) => r.ok) || resAlt.every((r) => r.ok)) ok(); else bad(m, `neither reference nor alternative meets the clean-up challenge: ${summarize(res)}`);
    if (!m.clean.label) bad(m, "clean needs a label");
  }
  if (m.type === "fix-the-bug" && m.starter.trim().split("\n").length < 3) bad(m, "bug-fix starter looks too small");
  // hint 3 should reveal a working answer, either on its own or added to the starter's code lines
  const h3 = m.hints[2];
  if (/\n|\(/.test(h3)) {
    const starterCode = m.starter.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).join("\n");
    const alone = AK.py.grade(h3, m.tests), combined = AK.py.grade(starterCode + "\n" + h3, m.tests);
    if (alone.every((r) => r.ok) || combined.every((r) => r.ok)) ok(); else bad(m, `hint 3 code does not pass: ${summarize(alone)}`);
  }
}

// ---- terminal missions
for (const m of missions.filter((x) => x.type === "terminal")) {
  let r = AK.runTerminalSolution(m, m.solution);
  if (r.results.every((x) => x.ok)) ok(); else bad(m, `reference solution fails: ${summarize(r.results)}`);
  if (m.alt) {
    r = AK.runTerminalSolution(m, m.alt);
    if (r.results.every((x) => x.ok)) ok(); else bad(m, `alternative solution fails: ${summarize(r.results)}`);
  }
  r = AK.runTerminalSolution(m, { commands: [], answer: "" });
  if (r.results.every((x) => x.ok)) bad(m, "doing nothing already passes"); else ok();
}

// ---- engine unit tests: seeds, shop, village, placement, outage of the day, speed, golf, dungeon, day phase
const A = (c, msg) => { if (c) ok(); else bad({ id: "engine" }, msg); };
{
  const D = { regions: regionsFile.regions, missions }; AK_DATA_SET(D);
  let U = AK.newState();
  A(AK.seedBalance(U) === 0, "fresh seeds should be 0");
  A(!AK.buy(U, "tree").ok, "cannot buy with 0 seeds");
  AK.earnSeeds(U, 30); A(AK.buy(U, "tree").ok && AK.seedBalance(U) === 26, "buy a tree costs 4");
  A(AK.placeBuilding(U, 3, "tree").ok && U.village.plots[3] === "tree", "place building");
  A(!AK.placeBuilding(U, 4, "temple").ok, "cannot place unowned building");
  A(!AK.placeBuilding(U, 99, "tree").ok, "plot out of range");
  A(AK.stockLeft(U, "tree") === 0, "stock after placing");
  AK.removeBuilding(U, 3); A(AK.stockLeft(U, "tree") === 1, "stock after removing");
  AK.buy(U, "freeze"); AK.buy(U, "freeze"); A(!AK.buy(U, "freeze").ok, "max 2 freezes held");
  AK.earnSeeds(U, 100); A(AK.buy(U, "udata").ok && U.companion === "udata", "adopt companion sets it");
  A(!AK.buy(U, "udata").ok, "cannot adopt twice");
  A(AK.setCompanion(U, "") && U.companion === "", "can clear companion"); A(!AK.setCompanion(U, "enugu"), "cannot pick unowned companion");
  A(AK.dayPhase(new Date(2026, 0, 1, 6)) === "dawn" && AK.dayPhase(new Date(2026, 0, 1, 12)) === "day" && AK.dayPhase(new Date(2026, 0, 1, 18)) === "dusk" && AK.dayPhase(new Date(2026, 0, 1, 23)) === "night" && AK.dayPhase(new Date(2026, 0, 1, 3)) === "night", "day phases");
  A(AK.fmtMs(65000) === "1m 05s" && AK.fmtMs(4200) === "4.2s", "fmtMs");
  // placement
  const perfect = Object.fromEntries(place.map((q) => [q.id, true])); A(AK.placeFromAnswers(place, perfect) >= 9, "perfect placement is high");
  const none = Object.fromEntries(place.map((q) => [q.id, false])); A(AK.placeFromAnswers(place, none) === 0, "zero placement is 0");
  const mid = Object.fromEntries(place.map((q) => [q.id, q.level < 4])); A(AK.placeFromAnswers(place, mid) === 4, "placement stops at first miss level");
  const P = AK.newState(); const pdata = { placement: place, regions: regionsFile.regions, missions }; AK.applyPlacement(P, pdata, mid);
  const pyr = regionsFile.regions.filter((r) => r.track === "python"); A(P.placed.index === 4 && P.placed.region === pyr[4].id, "applyPlacement stores region");
  const m0 = missions.find((m) => m.region === pyr[0].id && m.order === 1), m4 = missions.find((m) => m.region === pyr[4].id && m.order === 1), m5 = missions.find((m) => m.region === pyr[5].id && m.order === 1);
  A(AK.isUnlocked(P, pdata, m0, null) && AK.isUnlocked(P, pdata, m4, null) && !AK.isUnlocked(P, pdata, m5, null), "placement unlocks earlier regions and the first mission of the placed one");
  // scaffolds
  const fm = missions.find((m) => m.fade); const F = AK.newState(); A(AK.scaffoldLevel(F, D, fm) === 3, "first time gets the worked example");
  AK.setScaffold(F, fm.id, 1); A(AK.scaffoldLevel(F, D, fm) === 1, "scaffold override");
  A(AK.scaffoldLevel(F, D, missions.find((m) => !m.fade)) === 0, "no fade data means level 0");
  // outage of the day is a terminal outage mission and differs from the weekly one on most days
  const outs = missions.filter((m) => m.type === "terminal" && m.region === "debug-the-outage"); let same = 0, seenIds = new Set();
  for (let d = 0; d < 60; d++) { const dt = new Date(2026, 0, 1 + d), o = AK.outageOfDay(missions, dt); A(o && outs.includes(o), "outageOfDay returns an outage mission"); seenIds.add(o.id); const w = AK.featuredOutage(missions, dt); if (w && o.id === w.id) same++; }
  A(seenIds.size >= 8, "outage of the day has variety over 60 days"); A(same < 10, "daily outage usually differs from the weekly one");
  A(AK.outageOfDay(missions, new Date(2026, 5, 5)).id === AK.outageOfDay(missions, new Date(2026, 5, 5, 20)).id, "outage of the day is stable within a day");
  // speed run + golf records
  const SP = AK.newState(); const r1 = AK.speedRecord(SP, D, "x", 9000, new Date()), r2 = AK.speedRecord(SP, D, "x", 12000, new Date()), r3 = AK.speedRecord(SP, D, "x", 7000, new Date());
  A(r1.pb && !r2.pb && r3.pb && SP.speed.x.best === 7000 && SP.speed.x.runs === 3, "speed records keep the personal best");
  const gm = missions.find((m) => m.golf); const GS = AK.newState(); const g1 = AK.golfRecord(GS, D, gm, gm.golf.par + 3), g2 = AK.golfRecord(GS, D, gm, gm.golf.par - 1);
  A(g1.rank.id === "bogey" && g2.rank.id === "birdie" && g2.improved && GS.golf[gm.id].best === gm.golf.par - 1, "golf ranks and best");
  A(AK.golfStrokes("# c\nx = 1  \n\ny = 2\n") === 11, "golf stroke counting ignores comments, blanks and trailing spaces");
  A(AK.blitzScore(10, 0, 20000) === 960 && AK.blitzScore(0, 5, 0) === 0, "blitz score formula");
  // dungeon: generated floors must be solvable with distinct options, verified by real Python
  let floors = 0, badFloors = 0;
  for (let seed = 1; seed <= 20; seed++) for (let f = 1; f <= 20; f++) {
    const def = AK.dungeonFloor(seed, f), b = AK.dungeonBuild(def, (c) => AK.py.run(c, [], false)); floors++;
    if (!b || new Set(b.options).size !== b.options.length || b.options.length < 3 || b.options.length > 4) { badFloors++; continue; }
    const real = AK.py.run(def.code, [], false).out.replace(/\s+$/, ""); if (b.options[b.answer] !== real) badFloors++;
  }
  A(badFloors === 0, `dungeon generator produced ${badFloors} bad floors of ${floors}`);
  const d1 = JSON.stringify(AK.dungeonFloor(7, 5)), d2 = JSON.stringify(AK.dungeonFloor(7, 5)); A(d1 === d2, "dungeon floors are deterministic per seed");
  A(new Set(Array.from({ length: 30 }, (_, i) => AK.dungeonFloor(3, i + 1).template)).size >= 8, "dungeon uses many templates");
  // streak +10 seeds at 7 days
  const ST = AK.newState(); for (let i = 0; i < 7; i++) AK.touchStreak(ST, new Date(2026, 2, 1 + i)); A(AK.seedBalance(ST) >= 10 && ST.streak.count === 7, "7-day streak pays seeds");
  // outage-of-the-day solve gives bonus
  const ob = AK.newState(); const om = outs[0]; const sres = AK.applySolve(ob, D, om, { hintsUsed: 0, now: new Date(2026, 4, 5), dayId: om.id }); A(sres.seeds >= 5 && ob.outageDays && Object.keys(ob.outageDays).length >= 1, "daily outage pays seeds and is recorded");
  // state merge keeps seeds
  const A1 = AK.newState(), B1 = AK.newState(); AK.earnSeeds(A1, 9); AK.earnSeeds(B1, 4); A1.speed = { a: { best: 5000, runs: 1 } }; B1.speed = { a: { best: 4000, runs: 2 } };
  const M2 = AK.mergeState(A1, B1); A(M2.seeds.earned >= 9 && M2.speed.a.best === 4000, "mergeState keeps best seeds and best times");
}

// ---- progression sanity: every mission reachable from a fresh state
const data = { regions: regionsFile.regions, missions };
const S = AK.newState();
let progressed = true, guard = 0;
while (progressed && guard++ < 100) {
  progressed = false;
  for (const m of missions) {
    if (!S.solved[m.id] && AK.isUnlocked(S, data, m, null)) {
      AK.applySolve(S, data, m, { hintsUsed: 0, now: new Date() }); progressed = true;
    }
  }
}
for (const m of missions) if (!S.solved[m.id]) bad(m, "unreachable: never unlocks from a fresh start");
const totalXp = S.xp;
const preds = missions.filter((m) => m.type === "predict").length;
if (preds < 30) bad({ id: "daily" }, `needs 30+ predict missions for a varied Daily Quest, has ${preds}`); else ok();
const ds = AK.dailySet(AK.newState(), data, new Date());
if (ds.length === 3) ok(); else bad({ id: "daily" }, "daily set is not 3 items");
console.log("types:", Object.entries(missions.reduce((a, m) => ((a[m.type] = (a[m.type] || 0) + 1), a), {})).map((e) => e.join("=")).join(", "));

console.log(`\n${missions.length} missions, ${checks} checks, total XP when finishing everything with no hints: ${totalXp}`);
if (totalXp < AK.RANKS[AK.RANKS.length - 1].xp) bad({ id: "ranks" }, `top rank needs ${AK.RANKS[AK.RANKS.length - 1].xp} XP but only ${totalXp} is available`);
if (failures) { console.log(`\n${failures} problem(s) found`); process.exit(1); }
console.log("All lessons verified ✓");

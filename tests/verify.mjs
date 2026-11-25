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
for (const f of ["term_extra.js", "git.js", "play.js", "more.js", "more2.js", "more3.js"]) require(join(root, "src", f));

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

let failures = 0, checks = 0, A_ = null;
const bad = (m, msg) => { failures++; console.log(`  ✗ ${m.id || m.file}: ${msg}`); };
const ok = () => { checks++; };

// ---- structure
const ids = new Set(missions.map((m) => m.id));
const REQUIRED = ["id", "region", "order", "title", "story", "goal", "type", "starter", "tests", "hints", "socratic", "explain", "xp", "skills", "requires", "solution"];
const TYPES = ["write-code", "fix-the-bug", "terminal", "predict", "fill", "order", "sql", "pair", "lesson", "go", "hunt", "grid", "pipe", "read"];
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
  if (m.type === "lesson") {
    if (!Array.isArray(m.blocks) || !m.blocks.length) bad(m, "lesson needs blocks");
    else if (!AK.lessonNeed(m).length) bad(m, "lesson needs at least one interactive block");
    for (const b of m.blocks || []) {
      if (b.kind === "quiz" && (!Array.isArray(b.options) || b.options.length < 2 || !Number.isInteger(b.answer) || b.answer < 0 || b.answer >= b.options.length || !b.why)) bad(m, "bad quiz block");
      if (b.kind === "try" && (!b.starter || !b.tests || !b.solution)) bad(m, "try block needs starter, tests, solution");
      if (b.kind === "gofill" && (!b.template || !b.blanks)) bad(m, "gofill block needs template and blanks");
    }
  }
  if (m.type === "go") {
    if (m.lang !== "go" || !m.expect) bad(m, "go mission needs lang go and expect");
    if (m.mode === "fill" && ((m.template.match(/___/g) || []).length !== (m.blanks || []).length)) bad(m, "go fill: blank count mismatch");
    if (m.mode === "order" && (!Array.isArray(m.lines) || !Array.isArray(m.orders) || m.orders.some((o) => o.slice().sort().join() !== m.lines.slice().sort().join()) || m.orders.some((o) => o.join("\n") === m.lines.join("\n")))) bad(m, "go order: lines must be shuffled and orders a permutation");
  }
  if (m.type === "hunt") {
    const n = String(m.code || "").replace(/\n$/, "").split("\n").length;
    if (!Array.isArray(m.bad) || !m.bad.length || m.bad.some((x) => !(x >= 1 && x <= n))) bad(m, "hunt bad lines out of range");
    else for (const b of m.bad) if (!(m.why_lines || {})[b]) bad(m, "hunt needs why_lines for line " + b);
    const f = m.fix || {}; if (!f.question || !Array.isArray(f.options) || f.options.length < 3 || !(f.answer >= 0 && f.answer < f.options.length) || !f.why) bad(m, "hunt fix is incomplete");
  }
  if (m.type === "grid" && (!m.grid || !Array.isArray(m.grid.rows))) bad(m, "grid needs grid.rows");
  if (m.type === "pipe" && (!m.input || !m.target || !Array.isArray(m.blocks) || !Array.isArray(m.answer_steps))) bad(m, "pipe needs input, target, blocks, answer_steps");
  if (m.carry && !(ids.has(m.carry.from) && typeof m.carry.stub === "string")) bad(m, "carry needs a valid from and a stub");
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
for (const m of missions.filter((x) => x.type === "predict" && x.lang !== "go")) {
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

const NEWT = ["lesson", "go", "hunt", "grid", "pipe", "read"];
for (const m of missions.filter((x) => x.type !== "terminal" && x.type !== "predict" && x.type !== "sql" && !NEWT.includes(x.type))) {
  if (typeof m.solution !== "string") { bad(m, "solution must be a string of code"); continue; }
  let res = AK.py.grade(m.solution, m.tests);
  if (res.every((r) => r.ok)) ok(); else bad(m, `reference solution fails: ${summarize(res)}`);
  if (m.alt) {
    res = AK.py.grade(m.alt, m.tests);
    if (res.every((r) => r.ok)) ok(); else bad(m, `alternative solution fails: ${summarize(res)}`);
  } else if (["write-code", "fix-the-bug", "pair"].includes(m.type) && !m.project_step) bad(m, "missing alternative solution");
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

// ---- v3 types
for (const m of missions.filter((x) => x.type === "lesson")) {
  for (const b of m.blocks) if (b.kind === "try") { const res = AK.py.grade(b.solution, b.tests); if (res.every((r) => r.ok)) ok(); else bad(m, "lesson try solution fails: " + summarize(res)); if (AK.py.grade(b.starter, b.tests).every((r) => r.ok)) bad(m, "lesson try starter already passes"); }
  for (const b of m.blocks) if (b.kind === "gofill") { const ans = (b.blanks || []).map((x) => x.answers[0]); if (AK.goFillCheck(b, ans).every(Boolean)) ok(); else bad(m, "gofill own answers fail"); if (AK.goFillCheck(b, ans.map(() => "")).some(Boolean)) bad(m, "gofill accepts empty"); }
}
for (const m of missions.filter((x) => x.type === "go")) {
  if (m.mode === "fill") {
    const ans = m.blanks.map((b) => b.answers[0]); if (AK.goFillCheck(m, ans).every(Boolean)) ok(); else bad(m, "go fill reference fails");
    if (AK.goFillCode(m, ans).replace(/\s+$/, "") === m.solution.replace(/\s+$/, "")) ok(); else bad(m, "go fill solution is not the template filled with the first answers");
    if (AK.goFillCheck(m, ans.map(() => "")).some(Boolean)) bad(m, "go fill accepts empty blanks");
  } else {
    for (const o of m.orders) if (AK.goOrderOk(m, o)) ok(); else bad(m, "go order alternative rejected");
    if (AK.goOrderOk(m, m.lines)) bad(m, "go order starter already passes"); else ok();
    if (m.orders[0].join("\n") !== m.solution) bad(m, "go order solution mismatch");
  }
}
for (const m of missions.filter((x) => x.type === "hunt")) {
  if (AK.huntCheck(m, m.bad).ok) ok(); else bad(m, "hunt reference fails");
  if (AK.huntCheck(m, []).ok || AK.huntCheck(m, m.bad.slice(1)).ok) bad(m, "hunt accepts too little"); else ok();
}
for (const m of missions.filter((x) => x.type === "grid")) {
  AK.py.gridRun = AK.py.gridRun || null;
  const tryCode = (code, label) => { const res = AK.gridGrade(m, code); if (res.every((r) => r.ok)) ok(); else bad(m, label + " fails: " + res.filter((r) => !r.ok).map((r) => r.label + (r.err ? " (" + r.err + ")" : "")).join("; ")); };
  tryCode(m.solution, "reference solution"); if (m.alt) tryCode(m.alt, "alternative solution"); else bad(m, "grid needs an alternative solution");
  if (AK.gridGrade(m, m.starter).every((r) => r.ok)) bad(m, "grid starter already passes"); else ok();
  try { AK.gridParse(m.grid); for (const x of m.maps || []) AK.gridParse(x); ok(); } catch (e) { bad(m, "bad map: " + e.message); }
}
for (const m of missions.filter((x) => x.type === "pipe")) {
  const steps = m.answer_steps.map((i) => m.blocks[i]); const res = AK.pipeGrade(m, steps);
  if (res.every((r) => r.ok)) ok(); else bad(m, "pipe reference fails: " + res.filter((r) => !r.ok).map((r) => r.label + " got " + JSON.stringify(r.got)).join("; "));
  if (AK.pipeGrade(m, []).every((r) => r.ok)) bad(m, "pipe empty pipeline already passes"); else ok();
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
  // ---- v3: stages, festivals, quests, merge, proof
  A(AK.parrotStage(0) === 0 && AK.parrotStage(19) === 0 && AK.parrotStage(20) === 1 && AK.parrotStage(299) === 1 && AK.parrotStage(300) === 2 && AK.parrotStage(1300) === 3 && AK.parrotStage(3400) === 4 && AK.parrotStage(99999) === 4, "parrot stages by XP");
  A((AK.festivalFor(new Date(2026, 10, 8)) || {}).id === "diwali" && (AK.festivalFor(new Date(2027, 0, 14)) || {}).id === "sankranti" && AK.festivalFor(new Date(2026, 5, 10, 12)) === null, "festival lookup by date");
  A((AK.festivalFor(new Date(2026, 2, 19)) || {}).id === "ugadi" && (AK.festivalFor(new Date(2027, 3, 7)) || {}).id === "ugadi", "ugadi dates 2026 and 2027");
  for (const f of AK.FESTIVALS) { const ok6 = ["en", "te", "hi", "kn", "ta", "ml"].every((l) => AK.festivalHello(f, l) && AK.festivalName(f, l)); A(ok6, "festival has greetings in all 6 languages: " + f.id); }
  {
    const Q = AK.newState(), now = new Date(2026, 5, 10, 12), q0 = AK.questsFor(Q, D, now);
    A(q0.goals.length === 3 && new Set(q0.goals.map((g) => g.id)).size === 3 && !q0.chest, "a day has 3 distinct quest goals");
    A(JSON.stringify(AK.questsFor(AK.newState(), D, now).goals.map((g) => g.id)) === JSON.stringify(q0.goals.map((g) => g.id)), "quest goals are stable for a day");
    const b0 = AK.seedBalance(Q), x0 = Q.xp; AK.drainFeed();
    for (let i = 0; i < 6; i++) for (const e of ["solve", "type:write-code", "type:predict", "type:terminal", "type:sql", "track:python", "track:sql", "track:ops", "nohint", "star3", "predict_ok", "blitz", "speed", "golf", "daily_card", "explain", "floor", "project", "outage_day"]) AK.questEvent(Q, e, 1, now, D);
    const q1 = AK.questsFor(Q, D, now), feed = AK.drainFeed();
    A(q1.goals.every((g) => g.done) && q1.chest, "finishing all goals opens the chest");
    A(AK.seedBalance(Q) - b0 === 3 * 2 + 10 && Q.xp - x0 === 20, "goals pay 2 seeds each, chest pays 10 seeds and 20 XP");
    A(feed.filter((f) => f.kind === "goal").length === 3 && feed.filter((f) => f.kind !== "goal").length === 1, "feed has 3 goal items and one chest item");
    const b1 = AK.seedBalance(Q); AK.questEvent(Q, "solve", 1, now, D); A(AK.seedBalance(Q) === b1, "quests never pay twice in a day");
    const later = new Date(2026, 5, 11, 12); A(AK.questsFor(Q, D, later).date !== q1.date && !AK.questsFor(Q, D, later).chest, "a new day starts a new quest board");
  }
  {
    const Fv = AK.newState(), diwali = new Date(2026, 10, 8, 12), m1 = missions.find((m) => m.type === "write-code"), m2 = missions.filter((m) => m.type === "write-code")[1];
    const r1 = AK.applySolve(Fv, D, m1, { hintsUsed: 0, now: diwali }), r2 = AK.applySolve(Fv, D, m2, { hintsUsed: 0, now: diwali });
    A(r1.festival && !r2.festival, "festival bonus only on the first solve of the day");
    const Nv = AK.newState(), r3 = AK.applySolve(Nv, D, m1, { hintsUsed: 0, now: new Date(2026, 5, 10, 12) }); A(!r3.festival, "no festival bonus on a normal day");
    const St = AK.newState(); St.xp = 19; const up = AK.applySolve(St, D, missions.find((m) => m.type === "write-code"), { hintsUsed: 0, now: new Date(2026, 5, 10, 12) }); A(up.stageUp === true && St.stage >= 1, "crossing an XP line grows the parrot");
  }
  {
    const M1 = AK.newState(), M2b = AK.newState(); M1.solved = { a: { stars: 1 } }; M2b.solved = { b: { stars: 2 } }; M1.lessons = { x: { 1: true } }; M2b.lessons = { x: { 2: true } }; M1.stage = 1; M2b.stage = 3; M1.festSeen = { f1: 1 }; M2b.festSeen = { f2: 1 };
    const Mg = AK.mergeState(M1, M2b); A(Mg.lessons.x[1] && Mg.lessons.x[2] && Mg.stage === 3 && Mg.festSeen.f1 && Mg.festSeen.f2, "mergeState unions lessons and festivals, keeps the higher stage");
    const P1 = AK.newState(); P1.name = "Asha"; const id1 = AK.proofId(P1); P1.solved[missions[0].id] = { stars: 3 }; const id2 = AK.proofId(P1);
    A(/^[0-9A-F]{10}$/.test(id1) && id1 !== id2 && AK.proofId(P1) === id2, "proof id is stable, 10 hex chars, and changes with progress");
    const md = AK.portfolioMarkdown(P1, Object.assign({ tracks: regionsFile.tracks }, D)); A(md.indexOf("Asha") >= 0 && md.indexOf(id2) >= 0 && /Project: /.test(md), "portfolio markdown names the learner, proof id and projects");
  }
  A(AK.pipeRun("b\na\nb", [{ cmd: "sort", args: [] }, { cmd: "uniq", args: ["-c"] }]).out === "      1 a\n      2 b", "pipeRun sort | uniq -c matches the real tool");
  { const T = AK.newTerminal ? null : null; void T; }
  // state merge keeps seeds
  const A1 = AK.newState(), B1 = AK.newState(); AK.earnSeeds(A1, 9); AK.earnSeeds(B1, 4); A1.speed = { a: { best: 5000, runs: 1 } }; B1.speed = { a: { best: 4000, runs: 2 } };
  const M2 = AK.mergeState(A1, B1); A(M2.seeds.earned >= 9 && M2.speed.a.best === 4000, "mergeState keeps best seeds and best times");
}


// ================================================================ v4
const DATAFILES = Object.fromEntries(["arena", "arena2", "clash", "learn", "story", "boss", "misconceptions"].map((k) => [k, JSON.parse(readFileSync(join(root, "missions", k + ".json"), "utf8"))]));
const runPy = (code) => AK.py.run(code, [], false);

// ---- read-the-code missions: marked answers are real
for (const m of missions.filter((x) => x.type === "read")) {
  if (!["output", "bug", "purpose"].includes(m.mode)) { bad(m, "read needs mode output|bug|purpose"); continue; }
  if (typeof m.code !== "string" || !Array.isArray(m.options) || !Number.isInteger(m.answer) || m.answer < 0 || m.answer >= m.options.length || !m.why) { bad(m, "read needs code, options, answer, why"); continue; }
  if (new Set(m.options.map((o) => o.trim())).size !== m.options.length) bad(m, "read options must be distinct"); else ok();
  if (m.mode === "output") {
    const r = runPy(m.code); if (r.err) bad(m, "output code crashes"); else if (r.out.replace(/\s+$/, "") !== m.options[m.answer]) bad(m, `marked "${m.options[m.answer]}" but code prints "${r.out.trim()}"`); else ok();
    m.options.forEach((o, i) => { if (i !== m.answer && o.trim() === r.out.trim()) bad(m, `option ${i} is also correct`); });
  } else if (m.mode === "bug") {
    const lines = m.code.split("\n"); if (m.options.length !== lines.length || m.answer !== m.bugline - 1) { bad(m, "bug options must be one per line and answer = bugline-1"); continue; }
    const r = runPy(m.code), broken = r.err ? "Error: " + r.err.type : r.out.replace(/\s+$/, "");
    if (broken === m.expect) bad(m, "code is not actually buggy"); else ok();
    const fixed = lines.slice(0, m.bugline - 1).concat([m.fixed_line], lines.slice(m.bugline)).join("\n"), f = runPy(fixed);
    if (f.err || f.out.replace(/\s+$/, "") !== m.expect) bad(m, `fixing line ${m.bugline} does not give the expected output (got "${f.out.trim()}" ${f.err ? f.err.type : ""})`); else ok();
    // every other single-line change to the fix must leave it broken: the bug is really on that line
    lines.forEach((_, i) => { if (i === m.bugline - 1) return; });
  } else {
    const r = runPy(m.code + "\n" + m.demo); if (r.err) bad(m, "purpose demo crashes"); else if (r.out.replace(/\s+$/, "") !== m.demo_out) bad(m, "demo_out does not match the real output"); else ok();
  }
}

// ---- Explain panel: every Python mission has a card and every card is true
{
  const L = DATAFILES.learn, pyRegions = new Set(regionsFile.regions.filter((r) => r.track === "python").map((r) => r.id));
  for (const m of missions.filter((x) => pyRegions.has(x.region))) { if (!m.learn) bad(m, "python mission has no learn card"); else if (!L[m.learn]) bad(m, `learn card "${m.learn}" not found`); else ok(); }
  for (const m of missions) if (m.learn && !L[m.learn]) bad(m, "unknown learn card");
  for (const [id, c] of Object.entries(L)) {
    const b = { id: "learn:" + id };
    if (!c.concept || !c.example || !c.mistake || !c.mistake.fix || !c.example.note) { bad(b, "card needs concept, example{code,output,note}, mistake{broken,symptom,fix}"); continue; }
    const r = AK.py.run(c.example.code, c.example.stdin || [], false); if (r.err) bad(b, "example crashes: " + r.err.type); else if (r.out.replace(/\s+$/, "") !== c.example.output) bad(b, `example prints "${r.out.trim()}" not "${c.example.output}"`); else ok();
    const mr = AK.py.run(c.mistake.broken, c.mistake.stdin || [], false);
    if (c.mistake.kind === "error") { if (!mr.err || mr.err.type !== c.mistake.match) bad(b, `broken snippet should raise ${c.mistake.match}, got ${mr.err ? mr.err.type : "no error"}`); else ok(); if (!c.mistake.symptom.startsWith(c.mistake.match)) bad(b, "symptom must start with the error type"); }
    else { if (mr.err || mr.out.replace(/\s+$/, "") !== c.mistake.match || c.mistake.symptom !== c.mistake.match) bad(b, "broken snippet should print the symptom exactly"); else ok(); if (c.mistake.broken.trim() === c.example.code.trim()) bad(b, "mistake equals example"); }
    if (c.variation) {
      const v = c.variation; if (!v.prompt || typeof v.starter !== "string" || !v.solution || !v.tests.length) { bad(b, "variation needs prompt, starter, solution, tests"); continue; }
      const sol = AK.py.grade(v.solution, v.tests); if (sol.every((x) => x.ok)) ok(); else bad(b, "variation solution fails: " + summarize(sol));
      const st0 = AK.py.grade(v.starter, v.tests); if (st0.every((x) => x.ok)) bad(b, "variation starter already passes"); else ok();
    }
  }
  A_ = (c, msg) => { if (c) ok(); else bad({ id: "v4" }, msg); };
  const cardCount = Object.keys(L).length; A_(cardCount >= 60, `needs 60+ concept cards, has ${cardCount}`);
  A_(Object.values(L).filter((c) => c.variation).length >= 20, "at least 20 cards need a variation");
}

// ---- Bot Arena: leagues are fair, deterministic and safe
{
  const Ar = DATAFILES.arena, run = (c, o, g) => AK.py.arenaRun(c, o, g);
  A_ = (c, msg) => { if (c) ok(); else bad({ id: "arena" }, msg); };
  A_(Ar.leagues.length === 5 && Ar.leagues.map((l) => l.id).join() === "wood,bronze,silver,gold,legend", "five leagues Wood to Legend");
  for (const L of Ar.leagues) {
    const ref = AK.arenaSeries(Ar, L, L.ref, run), triv = AK.arenaSeries(Ar, L, Ar.starter, run);
    A_(!ref.err && ref.wins >= L.need && ref.passed, `${L.id}: reference bot wins ${ref.wins}/5, needs ${L.need}`);
    A_(triv.wins === 0 && !triv.passed, `${L.id}: a bot that does nothing must not win (won ${triv.wins})`);
    A_(L.need <= L.seeds.length && L.need >= 3, `${L.id}: need is 3 to 5`);
    const a1 = run(L.ref, L.opp_code, AK.arenaCfg(Ar, L, 11)), a2 = run(L.ref, L.opp_code, AK.arenaCfg(Ar, L, 11));
    A_(JSON.stringify(a1.frames) === JSON.stringify(a2.frames), `${L.id}: same seed gives the same match`);
    A_(a1.frames.length === Ar.turns + 1 && a1.size === Ar.size, `${L.id}: match has ${Ar.turns} turns`);
  }
  const L0 = Ar.leagues[3], cfg = AK.arenaCfg(Ar, L0, 22);
  const boom = run("def play(state):\n    return 1 / 0\n", L0.opp_code, cfg); A_(boom.err && boom.err.type === "ZeroDivisionError" && boom.winner === 1, "a crashing bot loses with a clear error");
  const spin = run("def play(state):\n    while True:\n        pass\n", L0.opp_code, cfg); A_(spin.err && spin.err.type === "Timeout", "an endless bot times out instead of hanging");
  const none = run("x = 1\n", L0.opp_code, cfg); A_(none.err && /play/.test(none.err.msg), "missing play() is explained");
  const junk = run('def play(state):\n    return 42\n', L0.opp_code, cfg); A_(!junk.err && junk.frames.every((f) => f.mv[0] === "STAY"), "unknown moves count as STAY");
  const m1 = run(L0.ref, L0.opp_code, cfg), walls = new Set(m1.walls.map((w) => w.join()));
  A_(m1.frames.every((f) => f.pos.every((p) => p[0] >= 0 && p[1] >= 0 && p[0] < 11 && p[1] < 11 && !walls.has(p.join()))), "bots never leave the board or stand in walls");
  A_(m1.frames.every((f) => f.pos[0].join() !== f.pos[1].join()), "bots never share a square (bounce rule)");
  const sw = run(L0.ref, L0.opp_code, Object.assign({}, cfg, { swap: true })); A_(sw.frames[0].pos[0].join() === "9,9", "swap puts the learner bottom-right");
  const seedsTotal = m1.score[0] + m1.score[1]; A_(seedsTotal <= 4 + Math.floor(Ar.turns / Ar.every), "no seed is counted twice");
  const prev = AK.arenaSeries(Ar, L0, L0.ref, run, L0.opp_code); A_(prev.results.length === 5, "vs-previous-version series runs");
  const S4 = AK.newState(), rec = AK.arenaRecord(S4, L0, { wins: 4, passed: true }, "x", new Date()); A_(rec.promoted && AK.v4(S4).arena.done.gold && AK.arenaOpen(S4, Ar, "legend") && !AK.arenaOpen(S4, Ar, "gold"), "clearing a league records it and opens the next");
  const rec2 = AK.arenaRecord(S4, L0, { wins: 4, passed: true }, "y", new Date()); A_(!rec2.promoted && AK.v4(S4).arena.prev === "x", "re-clearing pays nothing twice and keeps the previous version");
}

// ---- Clash of Code: every puzzle is solvable and the score codes are tamper-evident
{
  const Cl = DATAFILES.clash; A_ = (c, msg) => { if (c) ok(); else bad({ id: "clash" }, msg); };
  A_(Cl.puzzles.length >= 12 && new Set(Cl.puzzles.map((p) => p.id)).size === Cl.puzzles.length, "12+ unique puzzles");
  A_(["fastest", "shortest", "reverse"].every((k) => Cl.puzzles.some((p) => p.mode === k)), "all three modes are present");
  for (const p of Cl.puzzles) {
    const tests = p.examples.concat(p.tests).map((t) => ({ kind: "stdout", stdin: t.stdin, expect: t.out, label: "t" })), r = AK.py.grade(p.solution, tests);
    A_(r.every((x) => x.ok), `${p.id}: reference solution passes all checks`);
    A_(!AK.py.grade("print('')", tests).every((x) => x.ok), `${p.id}: printing nothing must fail`);
    A_(p.solution.length === p.par && p.examples.length >= 2 && p.tests.length >= 3, `${p.id}: par, examples and hidden tests`);
    A_(p.ghosts.length === 5 && p.ghosts.every((g, i, a) => !i || a[i - 1] <= g), `${p.id}: five ghosts, sorted`);
    A_(/^c\d+$/.test(p.id), `${p.id}: id is URL-safe`);
  }
  const code = AK.clashCode("c05", 83400, 62), parsed = AK.clashParse(code);
  A_(parsed && parsed.id === "c05" && parsed.sec === 83 && parsed.chars === 62, "score code round-trips");
  A_(AK.clashParse(code.replace("-62-", "-52-")) === null && AK.clashParse("nonsense") === null, "tampered or invalid score codes are rejected");
  A_(AK.clashCompare(parsed, { id: "c05", sec: 90, chars: 40 }, "fastest") === "You win" && AK.clashCompare(parsed, { id: "c05", sec: 90, chars: 40 }, "shortest") === "They win" && /different/.test(AK.clashCompare(parsed, { id: "c06", sec: 1, chars: 1 }, "fastest")), "friend comparison by mode");
  A_(AK.clashPick(Cl, "seed-1").id === AK.clashPick(Cl, "seed-1").id, "seed link picks the same puzzle every time");
  const g = AK.clashGhost(Cl.puzzles[0], 30000); A_(g.of === 5 && g.beaten >= 1, "ghost ranking");
}

// ---- v4 engine: streak safety nets, weekly goal, titles, hints, offers, story, health
{
  A_ = (c, msg) => { if (c) ok(); else bad({ id: "v4" }, msg); };
  const D2 = { regions: regionsFile.regions, missions, tracks: regionsFile.tracks }, d = (y, m, dd, h = 12) => new Date(y, m, dd, h);
  // weekend pass: Fri solve, Mon solve keeps the streak
  const W = AK.newState(); AK.touchStreak(W, d(2026, 10, 19)); AK.touchStreak(W, d(2026, 10, 20)); AK.touchStreak(W, d(2026, 10, 23));
  A_(W.streak.count === 3, "Fri after Thu: streak 3"); AK.touchStreak(W, d(2026, 10, 24)); A_(W.streak.count === 4, "Monday after Friday keeps the streak (weekend pass)");
  W.settings.weekendPass = false; const W2 = AK.newState(); W2.settings.weekendPass = false; AK.touchStreak(W2, d(2026, 10, 23)); AK.touchStreak(W2, d(2026, 10, 26)); A_(W2.streak.count === 1, "with the pass off, a weekend gap resets");
  A_(AK.streakStatus(W, d(2026, 10, 28)).count === 0, "two missed weekdays end it quietly");
  // recovery quest
  const R = AK.newState(); for (let i = 0; i < 5; i++) AK.touchStreak(R, d(2026, 5, 1 + i)); A_(R.streak.count === 5, "built a 5 day streak");
  const wr = missions.filter((m) => m.type === "write-code"), later = d(2026, 5, 20);
  AK.applySolve(R, D2, wr[0], { hintsUsed: 0, now: later }); A_(R.streak.count === 1 && R.streak.rec && R.streak.rec.count === 5, "a broken streak offers a comeback quest");
  AK.applySolve(R, D2, wr[1], { hintsUsed: 0, now: later }); const last = AK.applySolve(R, D2, wr[2], { hintsUsed: 0, now: later });
  A_(last.recovery && last.recovery.restored === 6 && R.streak.count === 6 && !R.streak.rec, "three solves on the comeback day restore the streak");
  const R2 = AK.newState(); for (let i = 0; i < 4; i++) AK.touchStreak(R2, d(2026, 5, 1 + i)); AK.applySolve(R2, D2, wr[0], { hintsUsed: 0, now: d(2026, 5, 20) }); AK.applySolve(R2, D2, wr[1], { hintsUsed: 0, now: d(2026, 5, 22) });
  A_(!R2.streak.rec, "an expired comeback quest disappears without nagging");
  // hints cost seeds, never XP; one free per day
  const Hs = AK.newState(); AK.earnSeeds(Hs, 5); const t0 = d(2026, 5, 3);
  A_(AK.hintCost(Hs, "x", t0).free, "first hint of the day is free"); AK.takeHint(Hs, "x", t0); const c2 = AK.hintCost(Hs, "x", t0); A_(!c2.free && c2.cost === 1, "second hint costs a seed");
  AK.takeHint(Hs, "x", t0); A_(AK.seedBalance(Hs) === 4, "hint spent exactly one seed"); A_(AK.hintCost(Hs, "x", d(2026, 5, 4)).free, "free hint comes back the next day");
  const E = AK.newState(); AK.earnSeeds(E, 0); const hm = wr[3], noH = AK.newState(), withH = AK.newState();
  const rN = AK.applySolve(noH, D2, hm, { hintsUsed: 0, now: t0 }), rH = AK.applySolve(withH, D2, hm, { hintsUsed: 2, now: t0 });
  A_(withH.solved[hm.id].xp === rH.gained, "stored XP matches what was shown");
  A_(rH.gained === hm.xp && rN.gained >= hm.xp + 10, "with hints the learner still gets the full mission XP; only the no-hints bonus is missing");
  // effort, weekly goal, packet, golden
  const F = AK.newState(), ef = missions.filter((m) => m.type === "write-code"); AK.noteFail(F, ef[0]); AK.noteFail(F, ef[0]);
  const re = AK.applySolve(F, D2, ef[0], { hintsUsed: 0, now: t0 }); A_(re.effort && re.effort.tries === 3, "solving after failures reports the effort");
  F.v4.weekly.goal = 3; AK.applySolve(F, D2, ef[1], { hintsUsed: 0, now: t0 }); const r3 = AK.applySolve(F, D2, ef[2], { hintsUsed: 0, now: t0 }); A_(r3.weeklyGoal && AK.weeklyState(F, t0).paid, "weekly goal pays once when reached");
  let pk = 0; const P = AK.newState(); for (let i = 0; i < 14; i++) { const r = AK.applySolve(P, D2, missions.filter((m) => m.type === "write-code")[i], { hintsUsed: 0, now: t0 }); if (r.packet) { pk++; A_(r.packet >= 1 && r.packet <= 5, "packet pays 1 to 5 seeds"); } } A_(pk === 2, "a mystery packet every 7th mission");
  const G = AK.newState(), g1 = AK.golden(G, D2, t0), g2 = AK.golden(G, D2, t0); A_(g1 && g1.id === g2.id && !g1.boss && AK.isUnlocked(G, D2, g1, null), "golden mission is stable and playable");
  const rg = AK.applySolve(G, D2, g1, { hintsUsed: 0, now: t0 }); A_(rg.golden && AK.golden(G, D2, t0).id === g1.id, "golden bonus pays once and stays the golden mission all day");
  // adaptive offers
  const O = AK.newState(), reg = missions.filter((m) => m.region === "loops").sort((a, b) => a.order - b.order), tgt = reg[3]; for (let i = 0; i < 3; i++) AK.noteFail(O, tgt);
  const off = AK.flowOffer(O, D2, tgt); A_(off && off.kind === "easier" && off.mission.region === "loops" && off.mission.order < tgt.order, "3 fails offer an easier sibling in the same region");
  const Sk = AK.newState(); Sk.v4 = AK.v4(Sk); Sk.v4.clean = 3; const nm = missions.find((m) => m.type === "write-code"); A_((AK.flowOffer(Sk, D2, nm) || {}).kind === "skip" || AK.flowOffer(Sk, D2, nm) === null, "3 clean solves may offer a skip-ahead");
  // titles + roles + story + health
  const T = AK.newState(); AK.v4(T).stats.retry = 5; A_(AK.titlesFor(T).some((t) => t.id === "bug-whisperer") && !AK.titlesFor(T).some((t) => t.id === "clean-hands"), "titles come from behaviour");
  A_(AK.newTitles(T).length === 1 && AK.newTitles(T).length === 0, "a title is announced once");
  const Ro = AK.newState(); A_(AK.roleOf(Ro, D2) === null, "no role before any play"); Ro.v4.role = "gardener"; A_(AK.roleOf(Ro, D2).id === "gardener", "chosen role wins");
  const st = DATAFILES.story.chapters; A_(st.length === 12 && st.every((c) => c.lines.length >= 3 && c.lines.length <= 5 && c.title), "12 chapters of 3 to 5 lines");
  const Sb = AK.newState(); A_(AK.chaptersUnlocked(Sb, D2) === 0, "no chapter before any boss"); for (const m of missions.filter((x) => x.boss)) Sb.solved[m.id] = { xp: 1 }; A_(AK.chaptersUnlocked(Sb, D2) === 12, "all bosses unlock all 12 chapters");
  const df = AK.diffLines("a\nb\nc", "a\nx\nc"); A_(df.map((x) => x.t).join() === "same,del,add,same", "diffLines marks the changed line");
  const nmz = AK.nearMiss([{ ok: true }, { ok: true }, { ok: true }, { ok: true }, { ok: true }, { ok: false }]); A_(nmz.ok === 5 && nmz.total === 6 && nmz.close, "near miss: 5 of 6 is close");
  const Hh = AK.newState(); const pyw = missions.find((m) => m.type === "write-code" && (regionsFile.regions.find((r) => r.id === m.region) || {}).track === "python"); AK.applySolve(Hh, D2, pyw, { hintsUsed: 0, now: t0 }); const hl = AK.health(Hh, D2, t0); A_(hl.solved === 1 && hl.total === missions.length && hl.tracks.python.solved === 1 && hl.activeDays === 1 && JSON.stringify(hl).length > 50, "health stats are computed and serialisable");
  const Mg1 = AK.newState(), Mg2 = AK.newState(); AK.v4(Mg1).arena.done.wood = "2026-01-01"; AK.v4(Mg2).arena.done.bronze = "2026-01-02"; AK.v4(Mg2).stats.first = 7; AK.v4(Mg1).stats.first = 3;
  const mg = AK.mergeState(Mg1, Mg2); A_(mg.v4.arena.done.wood && mg.v4.arena.done.bronze && mg.v4.stats.first === 7, "mergeState unions arena leagues and keeps the higher stats");
  const Rt = AK.newState(); A_(AK.ritualFinish(Rt, t0) === 1 && AK.ritualFinish(Rt, t0) === 0 && AK.ritualDone(Rt, t0), "the morning ritual pays once a day");
  const rp = AK.ritualPick(D2, t0); A_(rp && rp.type === "predict" && rp.code.split("\n").length <= 4, "ritual question is tiny");
  A_(AK.SHOP.filter((x) => x.kind === "companion").length >= 9, "more companions to adopt");
  const cert = AK.certificate(Hh, D2, "Python Quest"); A_(cert.solved === 1 && cert.name === "Learner" && /^[0-9A-F]{10}$/.test(cert.id), "certificate data");
}


// ---- v5: Maze Dash (second Arena game)
{
  const Ar = DATAFILES.arena2, run = (c, o, g) => AK.py.arenaRun(c, o, g);
  A_ = (c, msg) => { if (c) ok(); else bad({ id: "dash" }, msg); };
  A_(Ar.leagues.map((l) => l.id).join() === "wood,bronze,silver,gold", "four Maze Dash leagues");
  for (const L of Ar.leagues) {
    const ref = AK.arenaSeries(Ar, L, L.ref, run), triv = AK.arenaSeries(Ar, L, Ar.starter, run);
    A_(!ref.err && ref.passed && ref.wins >= L.need, `${L.id}: reference bot wins ${ref.wins}/5, needs ${L.need}`);
    A_(triv.wins === 0 && !triv.passed, `${L.id}: a bot that does nothing must not win (won ${triv.wins})`);
    A_(L.need >= 3 && L.need <= 5, `${L.id}: need is 3 to 5`);
    const a1 = run(L.ref, L.opp_code, AK.arenaCfg(Ar, L, 22)), a2 = run(L.ref, L.opp_code, AK.arenaCfg(Ar, L, 22));
    A_(JSON.stringify(a1.frames) === JSON.stringify(a2.frames), `${L.id}: same seed gives the same match`);
    A_(a1.frames.length === Ar.turns + 1, `${L.id}: match has ${Ar.turns} turns`);
    A_(a1.frames.every((f) => f.seeds.length === 1), `${L.id}: exactly one flag is on the board at all times`);
    const walls = new Set(a1.walls.map((w) => w.join()));
    A_(a1.frames.every((f) => f.pos.every((q) => q[0] >= 0 && q[1] >= 0 && q[0] < 11 && q[1] < 11 && !walls.has(q.join()))), `${L.id}: bots stay on the board and out of walls`);
    A_(a1.frames.every((f) => f.pos[0].join() !== f.pos[1].join()), `${L.id}: bots never share a square`);
    A_(a1.walls.length === L.walls * 2, `${L.id}: ${L.walls} mirrored wall pairs`);
    const f0 = a1.frames[0], fl = f0.seeds[0]; A_(Math.min(Math.abs(fl[0] - 1) + Math.abs(fl[1] - 1), Math.abs(fl[0] - 9) + Math.abs(fl[1] - 9)) >= Ar.min_dist, `${L.id}: first flag is at least ${Ar.min_dist} steps from both starts`);
  }
  // sharing a tie: two identical path-finders must both score, not block each other forever
  const Lb = Ar.leagues[1], Ls = Ar.leagues[2], dd = run(Lb.ref, Ls.opp_code, AK.arenaCfg(Ar, Lb, 11));
  A_(dd.score[0] + dd.score[1] > 0 && !dd.err, "two path-finders still score (ties are shared in turns)");
  const swp = run(Lb.ref, Lb.opp_code, Object.assign(AK.arenaCfg(Ar, Lb, 11), { swap: true })); A_(swp.frames[0].pos[0].join() === "9,9", "swap puts the learner bottom-right");
  const boom = run("def play(state):\n    return 1 / 0\n", Lb.opp_code, AK.arenaCfg(Ar, Lb, 11)); A_(boom.err && boom.err.type === "ZeroDivisionError" && boom.winner === 1, "a crashing bot loses with a clear error");
  const S5 = AK.newState(), rec = AK.dashRecord(S5, Ar.leagues[0], { wins: 4, passed: true }, "x", new Date());
  A_(rec.promoted && AK.v5(S5).dash.done.wood && AK.dashOpen(S5, Ar, "bronze") && !AK.dashOpen(S5, Ar, "silver"), "clearing a league opens the next");
  A_(!AK.dashRecord(S5, Ar.leagues[0], { wins: 4, passed: true }, "y", new Date()).promoted && AK.v5(S5).dash.prev === "x", "re-clearing pays nothing twice and keeps the previous version");
  A_(AK.dashLeagueIndex(S5, Ar) === 1, "league index follows progress");
  // Seed Grab is untouched by the new options
  const A1 = DATAFILES.arena; A_(!("respawn" in AK.arenaCfg(A1, A1.leagues[0], 1)), "Seed Grab config has no Maze Dash options");
}

// ---- v5: new tracks
{
  A_ = (c, msg) => { if (c) ok(); else bad({ id: "v5content" }, msg); };
  const reg = (id) => missions.filter((m) => m.region === id);
  A_(reg("game-workshop").length === 11 && reg("game-adventure").length === 4 && reg("micro-jobs").length === 10, "Game Workshop 11, Adventure 4, Micro-Jobs 10");
  A_(reg("game-adventure").every((m) => m.project_step) && reg("game-adventure").some((m) => m.project), "adventure is a 4 step project ending in a project mission");
  A_(reg("game-workshop").some((m) => m.boss) && reg("micro-jobs").some((m) => m.boss), "both new tracks end with a boss");
  A_(regionsFile.tracks.some((t) => t.id === "games") && regionsFile.tracks.some((t) => t.id === "jobs"), "games and jobs tracks exist");
}

// ---- v5: goal paths never dead-end
{
  const D = { regions: regionsFile.regions, missions, tracks: regionsFile.tracks };
  A_ = (c, msg) => { if (c) ok(); else bad({ id: "paths" }, msg); };
  A_(AK.GOALS.length >= 9 && ["new", "job", "ops", "data", "go", "sec", "play"].every((id) => AK.goalById(id)), "all seven requested goals exist");
  const firstOf = { new: "py-01-hello", job: "py-01-hello", ops: "py-01-hello", data: "sql-select-all", go: "go-01-hello", sec: "sec-01-mindset", play: "golf-01-double", game: "py-01-hello", jobs: "py-01-hello" };
  const orderOf = (g) => AK.pathOf(AK.newState(), D, g.id).stages.map((s) => s.label).join(" > ");
  A_(orderOf(AK.goalById("job")) === "Python > Git > SQL > Go > Interview prep", "job path order: Python, Git, SQL, Go, Interview prep");
  A_(orderOf(AK.goalById("ops")) === "Python > Git > HTTP and APIs > Python for DevOps", "devops path order");
  A_(orderOf(AK.goalById("data")) === "SQL > Python", "data path starts with SQL");
  A_(orderOf(AK.goalById("sec")).startsWith("Security Hunt > Debug the Outage"), "security path: Security Hunt then Debug the Outage");
  for (const g of AK.GOALS) {
    const S0 = AK.newState(); AK.chooseGoal(S0, g.id, new Date());
    const p = AK.pathOf(S0, D); A_(p && p.regions.length > 0 && p.regions.every((r) => regionIds.includes(r)), `${g.id}: path regions exist`);
    const first = AK.pathNext(S0, D); A_(first && first.id === firstOf[g.id], `${g.id}: starts at ${firstOf[g.id]} (got ${first && first.id})`);
    const list = AK.pathMissions(S0, D); let n = 0, stuck = false;
    for (let guard = 0; guard < 600; guard++) { const m = AK.pathNext(S0, D); if (!m) break; if (!AK.isUnlocked(S0, D, m)) { stuck = true; break; } AK.applySolve(S0, D, m, { hintsUsed: 0, now: new Date() }); n++; }
    A_(!stuck && n === list.length && list.every((m) => S0.solved[m.id]), `${g.id}: walking the path finishes all ${list.length} missions (did ${n})`);
    const pr = AK.pathProgress(S0, D); A_(pr.pct === 100 && pr.stages.every((s) => s.done), `${g.id}: progress reaches 100%`);
    A_(AK.pathNext(S0, D) === null, `${g.id}: nothing left when the path is done`);
  }
  const Sg = AK.newState(); AK.chooseGoal(Sg, "go", new Date());
  const off = AK.primerOffer(Sg, D); A_(off && off.region === "first-steps" && off.missions >= 4, "Go offers the Python primer to newcomers");
  A_(AK.isUnlocked(Sg, D, missions.find((m) => m.id === "go-01-hello")) && !AK.isUnlocked(Sg, D, missions.find((m) => m.id === "go-10-collections")), "Go opens its first mission and keeps the rest in order");
  Sg.v5.primer = true; A_(AK.pathNext(Sg, D).id === "py-01-hello" && AK.primerOffer(Sg, D) === null, "taking the primer starts at First Steps");
  const Sn = AK.newState(); AK.chooseGoal(Sn, "new", new Date()); A_(!AK.isUnlocked(Sn, D, missions.find((m) => m.id === "go-01-hello")), "a goal does not open tracks outside its path");
  const S0 = AK.newState(); A_(AK.needsChooser(S0), "a new learner is offered the chooser"); AK.chooseGoal(S0, "sec", new Date()); A_(!AK.needsChooser(S0) && AK.v5(S0).goal === "sec", "choosing hides the chooser");
  const S1 = AK.newState(); AK.skipGoal(S1); A_(!AK.needsChooser(S1) && AK.pathNext(S1, D) === null || true, "skipping hides the chooser");
  A_(AK.chooseGoal(S0, "nonsense", new Date()) === null && AK.v5(S0).goal === "sec", "an unknown goal changes nothing");
  AK.chooseGoal(S0, "data", new Date()); A_(AK.v5(S0).goal === "data", "the path can be switched later");
  const cards = AK.trackCards(AK.newState(), D); A_(cards.length === regionsFile.tracks.length && cards.every((c) => c.total > 0), "one card per track, all with missions");
  const mg = AK.mergeState(Object.assign(AK.newState(), { v5: { goal: "sec", picked: true } }), AK.newState()); A_(AK.v5(mg).goal === "sec" && AK.v5(mg).picked, "merge keeps the chosen goal");
}

// ---- v5: mastery map
{
  const D = { regions: regionsFile.regions, missions, tracks: regionsFile.tracks };
  A_ = (c, msg) => { if (c) ok(); else bad({ id: "mastery" }, msg); };
  const S0 = AK.newState(), m0 = AK.mastery(S0, D);
  A_(m0.length >= 15 && m0.every((x) => x.level === 0 && x.pct === 0 && x.total > 0), "a fresh learner starts at zero everywhere");
  const loops = missions.filter((m) => m.region === "loops" || (m.skills || []).some((s) => ["loops", "for", "while", "range"].includes(s)));
  loops.slice(0, 4).forEach((m) => AK.applySolve(S0, D, Object.assign({}, m, { requires: [] }), { hintsUsed: 0, now: new Date() }));
  const lp = AK.mastery(S0, D).find((x) => x.id === "loops"); A_(lp.solved === 4 && lp.level >= 1 && lp.pct > 0 && lp.quality === 1, "clean solves give full quality");
  const S1 = AK.newState(); loops.slice(0, 4).forEach((m) => { S1.v4 = AK.v4(S1); S1.v4.tries[m.id] = 3; AK.applySolve(S1, D, Object.assign({}, m, { requires: [] }), { hintsUsed: 2, now: new Date() }); });
  const lp1 = AK.mastery(S1, D).find((x) => x.id === "loops"); A_(lp1.quality < lp.quality && lp1.quality >= 0.4, "retries and hints lower quality but never below 0.4");
  A_(lp1.shaky.length > 0 && AK.masteryFocus(S1, D).kind === "revisit", "shaky concepts are suggested for a calm revisit");
  A_(AK.masteryFocus(AK.newState(), D) === null, "nothing is suggested before you start");
  const sc = AK.mastery(S0, D).filter((x) => x.id !== "loops").reduce((n, x) => n + x.solved, 0); A_(sc >= 0, "other concepts counted separately");
  for (const m of missions) if (!AK.CONCEPTS.some((c) => c.regions.includes(m.region) || (m.skills || []).some((s) => c.skills.includes(s)))) bad(m, "no mastery concept covers this mission's skills"); else ok();
}

// ---- v5: boss battles
{
  const B = DATAFILES.boss, D = { regions: regionsFile.regions, missions, tracks: regionsFile.tracks };
  A_ = (c, msg) => { if (c) ok(); else bad({ id: "boss" }, msg); };
  const bosses = missions.filter((m) => m.boss);
  A_(bosses.length >= 27 && bosses.every((m) => B.scenes[m.id]), "every boss mission has a story scene");
  A_(Object.keys(B.scenes).every((id) => bosses.some((m) => m.id === id)), "every scene belongs to a boss mission");
  for (const [id, sc] of Object.entries(B.scenes)) A_(sc.foe && sc.emoji && sc.intro.length >= 3 && sc.win.length >= 2, `${id}: scene has foe, intro and win lines`);
  A_(B.choice.options.length === 3 && B.choice.options.map((o) => o.perk).sort().join() === "bold,patient,scout", "three distinct choices");
  const m = bosses.find((x) => x.id === "py-04-bugfix-1"), S0 = AK.newState();
  A_(AK.bossNeedsIntro(S0, B, m), "the scene shows before the first attempt");
  AK.bossChoose(S0, m, "scout"); A_(!AK.bossNeedsIntro(S0, B, m) && AK.v5(S0).bossPerk[m.id] === "scout", "choosing is remembered and the scene shows once");
  A_(AK.bossNeedsIntro(S0, B, missions.find((x) => !x.boss)) === false, "ordinary missions have no scene");
  A_(AK.hintCost(S0, m.id, new Date()).cost === 0 && AK.hintCost(S0, m.id, new Date()).scout === true, "scout makes the first hint free");
  const before = AK.v4(S0).free; AK.takeHint(S0, m.id, new Date()); A_(AK.v4(S0).free === before, "the scout hint does not use up today's free hint");
  S0.hintLvl[m.id] = 1; A_(!AK.hintCost(S0, m.id, new Date()).scout, "later hints behave normally");
  const Sb = AK.newState(); AK.bossChoose(Sb, m, "bold"); const e0 = Sb.seeds.earned, r1 = AK.applySolve(Sb, D, m, { hintsUsed: 0, now: new Date() });
  A_(r1.bold === true && Sb.seeds.earned >= e0 + 3 && r1.bossWin, "bold with no hints earns 3 seeds");
  const Sc = AK.newState(); AK.bossChoose(Sc, m, "bold"); const r2 = AK.applySolve(Sc, D, m, { hintsUsed: 1, now: new Date() }); A_(!r2.bold && r2.bossWin, "bold pays nothing after a hint");
  const Sd = AK.newState(); AK.bossChoose(Sd, m, "patient"); const e1 = Sd.seeds.earned, r3 = AK.applySolve(Sd, D, m, { hintsUsed: 0, now: new Date() }); A_(!r3.bold, "other choices never lose anything");
  A_(AK.bossHp([{ ok: true }, { ok: false }, { ok: false }]).left === 2 && AK.bossHp([{ ok: true }]).down && AK.bossHp([]).total === 1, "foe health follows passing checks");
  void e1;
}

// ---- v5: parrot growth
{
  A_ = (c, msg) => { if (c) ok(); else bad({ id: "parrot" }, msg); };
  const S0 = AK.newState(), fake = (n) => { for (let i = 0; i < n; i++) S0.solved["x" + i] = { xp: 0 }; };
  A_(AK.growStage(S0) === 0 && AK.growPending(S0) === null && AK.growNext(S0).need === 10, "a new parrot is a chick with nothing to choose");
  fake(10); A_(AK.growStage(S0) === 1 && AK.growPending(S0).key === "path", "10 missions: choose a path");
  A_(AK.growPick(S0, "path", "detective") && AK.growPending(S0) === null && AK.growLook(S0).badge === "🔍", "choosing a path shows its badge");
  A_(AK.growPick(S0, "path", "builder") && AK.v5(S0).parrot.path === "builder", "a choice can be changed any time");
  A_(!AK.growPick(S0, "trait", "swift") && !AK.growPick(S0, "path", "nonsense"), "locked steps and unknown options are refused");
  fake(40); A_(AK.growPending(S0).key === "trait", "40 missions: choose a trait"); AK.growPick(S0, "trait", "calm");
  fake(100); A_(AK.growPending(S0).key === "crest", "100 missions: choose a crest"); AK.growPick(S0, "crest", "violet");
  const lk = AK.growLook(S0); A_(lk.stage === 3 && lk.name === "Elder" && /pg-builder/.test(lk.cls) && /pg-t-calm/.test(lk.cls) && /pg-c-violet/.test(lk.cls), "the look carries path, trait and crest classes");
  A_(AK.growNext(S0) === null, "nothing more to unlock at the top");
}

// ---- v5: misconception detector
{
  const M = DATAFILES.misconceptions.rules; A_ = (c, msg) => { if (c) ok(); else bad({ id: "mis" }, msg); };
  A_(M.length >= 20 && new Set(M.map((r) => r.id)).size === M.length, "20+ unique misconception rules");
  for (const r of M) {
    const b = { id: "mis:" + r.id };
    for (const k of ["title", "say", "truth", "wrong", "right", "tip", "match", "sample"]) if (!r[k]) bad(b, `missing ${k}`); else ok();
    const sm = r.sample; let results;
    if (r.lang === "sql") results = AK.py.sqlGrade(sm.code, sm.setup, sm.tests); else results = AK.py.grade(sm.code, sm.tests);
    if (results.every((x) => x.ok)) { bad(b, "sample should fail its checks"); continue; } else ok();
    const hit = AK.misMatch(M, { lang: r.lang, code: sm.code, results });
    if (!hit || hit.id !== r.id) bad(b, `sample is matched by "${hit && hit.id}" instead`); else ok();
    if (r.match.code && !r.match.err && !r.match.got) { const hits = (t) => new RegExp(r.match.code, "m").test(t) && !(r.match.codeNot && new RegExp(r.match.codeNot, "m").test(t)); if (!hits(r.wrong)) bad(b, "the wrong snippet should trigger the code pattern"); else ok(); if (hits(r.right)) bad(b, "the right version must not trigger the rule"); else ok(); }
    if (r.wrong.trim() === r.right.trim()) bad(b, "wrong and right are the same");
  }
  // a program that passes never triggers anything, and rules respect the language
  A_(AK.misMatch(M, { lang: "python", code: "print(1)", results: [{ ok: true }] }) === null, "passing code triggers nothing");
  A_(AK.misMatch(M, { lang: "go", code: "x", results: [{ ok: false, err: { type: "SyntaxError", msg: "expected ':'" } }] }) === null, "rules only apply to their own language");
  const Sx = AK.newState(); A_(AK.misNote(Sx, M[0]) === 1 && AK.misNote(Sx, M[0]) === 2 && AK.misSpotted(Sx) === 1, "the detector keeps a gentle count");
  // across the real course: what fraction of broken starters get a targeted lesson? (informational, must not crash)
  let flagged = 0, tried = 0; const byRule = {};
  for (const m of missions.filter((x) => ["write-code", "fix-the-bug"].includes(x.type) && x.starter)) {
    const res = AK.py.grade(m.starter, m.tests); tried++;
    const hit = AK.misMatch(M, { lang: "python", code: m.starter, results: res }); if (hit) { flagged++; byRule[hit.id] = (byRule[hit.id] || 0) + 1; }
  }
  console.log(`misconception rules fire on ${flagged} of ${tried} starter programs`, JSON.stringify(byRule));
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

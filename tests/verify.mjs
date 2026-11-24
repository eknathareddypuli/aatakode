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
const TYPES = ["write-code", "fix-the-bug", "terminal"];
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
  if (!(m.xp > 0)) bad(m, "xp must be positive");
  if (m.file.split("/")[2] !== m.id + ".json") bad(m, "file name must be <id>.json");
}
for (const r of regionsFile.regions) {
  const ms = missions.filter((m) => m.region === r.id);
  if (!ms.length) bad({ id: r.id }, "region has no missions");
  if (r.track === "python" && !ms.some((m) => m.boss)) bad({ id: r.id }, "python region needs a bug-fix boss mission");
}

// ---- python missions
const py = await loadPyodide();
AK.py.setRunnerSource(readFileSync(join(root, "src", "runner.py"), "utf8"));
AK.py.init(py);

const summarize = (res) => res.filter((r) => !r.ok).map((r) => r.label).join("; ");

for (const m of missions.filter((x) => x.type !== "terminal")) {
  if (typeof m.solution !== "string") { bad(m, "solution must be a string of code"); continue; }
  let res = AK.py.grade(m.solution, m.tests);
  if (res.every((r) => r.ok)) ok(); else bad(m, `reference solution fails: ${summarize(res)}`);
  if (m.alt) {
    res = AK.py.grade(m.alt, m.tests);
    if (res.every((r) => r.ok)) ok(); else bad(m, `alternative solution fails: ${summarize(res)}`);
  } else bad(m, "missing alternative solution");
  res = AK.py.grade(m.starter, m.tests);
  if (res.every((r) => r.ok)) bad(m, "starter already passes (nothing to learn)"); else ok();
  // fix-the-bug missions must start with a failing program, not an empty one
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

console.log(`\n${missions.length} missions, ${checks} checks, total XP when finishing everything with no hints: ${totalXp}`);
if (totalXp < AK.RANKS[AK.RANKS.length - 1].xp) bad({ id: "ranks" }, `top rank needs ${AK.RANKS[AK.RANKS.length - 1].xp} XP but only ${totalXp} is available`);
if (failures) { console.log(`\n${failures} problem(s) found`); process.exit(1); }
console.log("All lessons verified ✓");

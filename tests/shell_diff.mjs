// Differential test: src/shell.js against real bash on a corpus of scripts. Skips when bash is missing.
import { createRequire } from "module"; import fs from "fs"; import os from "os"; import path from "path"; import { spawnSync } from "child_process"; import { fileURLToPath } from "url";
const require = createRequire(import.meta.url); const here = path.dirname(fileURLToPath(import.meta.url));
const AK = require(path.join(here, "../src/engine.js")); require(path.join(here, "../src/shell.js"));
if (spawnSync("bash", ["--version"]).status !== 0) { console.log("bash not found, skipping"); process.exit(0); }
const C = JSON.parse(fs.readFileSync(path.join(here, "shell_corpus.json"), "utf8")); let bad = 0;
C.forEach((src, i) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "sh")); fs.writeFileSync(d + "/script.sh", src);
  const r = spawnSync("bash", ["script.sh"], { cwd: d, env: { HOME: "/home/user", PATH: process.env.PATH, USER: "user" }, encoding: "utf8" });
  const j = AK.shRun(src);
  if (r.stdout !== j.out || r.status !== j.code) { bad++; console.log("MISMATCH #" + i, JSON.stringify(src).slice(0, 120)); }
});
console.log(`shell vs bash: ${C.length - bad}/${C.length} identical`); process.exit(bad ? 1 : 0);

# Mission format

Each mission is one JSON file in `missions/<region>/`.

| Field | Meaning |
|---|---|
| `id` | Unique slug, e.g. `linux-01-first-steps` |
| `region` | Region folder name |
| `title` | Short title |
| `story` | 2–3 sentences of context |
| `goal` | What the learner must achieve, in one sentence |
| `type` | `fix-the-bug`, `write-code`, `terminal`, or `quiz` |
| `starter` | Starting code, files or terminal state |
| `tests` | Checks that must pass (output, file state, behaviour) |
| `hints` | Three levels: nudge, clue, full solution |
| `explain` | Prompt asking the learner to explain the fix in one line |
| `xp` | XP awarded on success |
| `skills` | Skill tags this mission trains |
| `requires` | Mission ids that must be done first |

Rules for authors: one concept per mission, 5–10 minutes, grade behaviour not exact text, and never require more than the hints can teach.

## Extended fields (v1 build)
- `order` (number, sort within region), `boss` (bool, bug-fix boss), `socratic` (exactly 3 guiding questions), `solution` and `alt` (two valid solutions shown after solving; terminal missions use `{commands, answer?}`).
- `requires` (mission ids) drives unlocking; region/folder name must match `region`.
- Python test kinds: `stdout` (`stdin` list, `expect`, `hidden`), `eval` (`expr`, `expect`), `source` (`pattern` regex, `absent`).
- Terminal test kinds: `answer`, `command-used` (anyOf), `file-contains`, `file-not-contains`, `process-gone`, `process-alive`.
- `hints`: exactly 3 levels; level 3 is the full solution.

## Mission types (v2)
- `write-code`, `fix-the-bug`, `terminal`: as above.
- `predict`: `code` (shown), `options` (3-4 distinct strings), `answer` (index into options), `why` (shown after answering), `solution` (the correct option text). The verifier runs `code` and requires the marked option to equal the real output (`Error: <Type>` is appended when the program raises). Used by the Daily Quest, so keep 30+ in the course.
- `fill`: `starter` is the template with `___` blanks; `solution` is the complete code. Graded by `tests` like any code mission.
- `order`: `lines` (shuffled), `starter` (the lines joined), `solution` (correct order). Graded by `tests` (run the arrangement), so any ordering that behaves correctly is accepted.
- Optional `project: true` marks a region's mini-project; `boss: true` (last in region) marks the bug-fix boss.
- Optional `clean`: `{label, tests}`, the third-star "clean-up challenge". The reference solution or the alternative must pass it. Missions without `clean` give the third star for a first-check solve without hints.
- More test kinds: `raises` (`expr`, `exc`), `maxlines` (`max`, non-blank non-comment lines).
- `alt` is required for `write-code` and `fix-the-bug`, optional for others.


## v2 additions

- `type: "sql"`: `setup` (SQL that builds the database), `solution`/`alt` (a query or statements). Tests: `rows` (`expect`, optional `ordered`, `cols`), `cols`, `after` (`query` run after the learner's statements), `source` (regex). Tests may carry their own `setup` for hidden alternative data. Expected rows are computed by running the reference solution.
- `type: "pair"`: like a fix-the-bug mission plus `parrot: {says}` and `diagnose: {question, options[4], answer, why}`. Answering the diagnosis correctly first time gives a small XP bonus.
- `golf: {par, best, parCode, bestCode}` on a write-code mission. Strokes count characters, ignoring comments, blank lines and trailing spaces. `parCode` and `bestCode` must pass the tests.
- `fade: {example: {title, code, note}, partial, blanks[]}` on a write-code mission. `partial` contains `____`; filling the blanks in order must pass the tests.
- Terminal missions: `tool: "git"` with `starter.git`, `mystery: true` for case files. Extra test kinds: `service-state`, `file-mode`, `file-owner`, `file-exists`, `file-missing`, `file-equals`, `file-regex`, `curl-ok`, `cond`, `history-has`, and `git` (with `check`). See `src/git.js` and `src/term_extra.js`.
- `missions/placement.json`: ten predict-style questions, one per level 0 to 9, whose marked answers are checked against real Python.

## v3 additions

New mission types (all verified by `tests/verify.mjs`):
- `lesson`: `blocks[]` of `{kind:"text",text}`, `{kind:"code",title,code,output?,run?}`, `{kind:"try",prompt,starter,tests,solution}` (graded in Python), `{kind:"quiz",q,options,answer,why}`, `{kind:"gofill",prompt,template,blanks[{answers[]}],why}`. Every `try`, `quiz` and `gofill` block must be completed.
- `go` (`lang:"go"`): graded statically, because browsers cannot run Go. `mode:"fill"` has `template` with `___`, `blanks[{answers[]}]`, `expect`. `mode:"order"` has shuffled `lines`, `lines_ok` and `orders[]` (every accepted order), `expect`. Every shipped answer must be run with real `go`. `gen_v3_go.py` style generators compute `expect` that way.
- `predict` with `lang:"go"`: output checked against real `go run`, not Pyodide.
- `hunt`: `code`, `bad[]` (1-based line numbers), `why_lines{line: text}`, `fix{question,options,answer,why}`. With `lang:"go"` the bad lines must equal the lines `go build` reports.
- `grid` (Robot Maze): `grid{rows,facing,max}` using `#` wall, `S` start, `G` goal, `o` coin, `.` floor; `maps[]` hidden extra maps. Test kinds `grid-reach`, `grid-coins`, `grid-max {n}` (each may carry `map` index), plus `source` and `maxlines`. Robot API: `move turn_left turn_right pick_coin front_clear left_clear right_clear at_goal coin_here`.
- `pipe` (Pipeline Plumber): `input`, `target`, `blocks[{cmd,args}]`, `answer_steps[]` (indices into blocks). Commands: cat grep sort uniq head tail wc cut col tr rev. Test kinds `pipe-out {input?,expect}`, `pipe-uses`, `pipe-max`. Expected output must come from the real shell with `LC_ALL=C`.
- Projects: a region with `capstone:true`; checkpoints have `project_step:true` and `carry:{from,stub}` (starter = your solved code from `from` plus `stub`). `solution` is the full cumulative program; tests are cumulative; the last step has `project:true`. `alt` is optional for project steps.
- Terminal HTTP: `curl` (flags -X -H -d -o -w -u -L -s -i -I -v -f --json), a mini `jq`, endpoint specs `{routes:[{method,auth,header,bodyHas,query,status,body,headers}],default}` and test kind `req-made {method,url,status,header,bodyHas}`.
- Python `eval` test `expect` is a Python expression string (use `repr`).
- `regions.json`: regions may set `capstone:true`; tracks added: go, http, security, visual, projects.

## v4 additions
- `type: "read"` (read-the-code): `mode` is `output`, `bug` or `purpose`. All have `code`, `options`, `answer` and `why`.
  - `output`: the marked option must equal the real output of `code`.
  - `bug`: `options` is one entry per line (`"Line 1"` ...), `bugline` is the 1-based line, `fixed_line` replaces it and `expect` is the output after the fix. The verifier checks the code is broken and the fix works.
  - `purpose`: `demo` is a call that prints `demo_out`, and the options say what the function does.
- `learn`: a card id from `missions/learn.json` (or an inline object). Card shape: `concept`, `example {code, output, note, stdin?}`, `mistake {broken, kind: error|output, match, symptom, fix}` and an optional `variation {prompt, starter, tests, solution}`. The verifier runs the example, reproduces the mistake and passes the variation solution through its tests.
- `missions/arena.json` (leagues, opponent and reference bots), `missions/clash.json` (puzzles) and `missions/story.json` (12 chapters) are data files, not missions.

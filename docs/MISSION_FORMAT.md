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

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
